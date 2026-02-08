/**
 * Server-side WebSocket client for OpenClaw Gateway Protocol v3.
 *
 * Singleton that maintains a persistent connection to the gateway,
 * handles the challenge/connect handshake, auto-reconnects, and
 * broadcasts events to registered listeners.
 *
 * Uses the `ws` package for Node.js WebSocket (more reliable than
 * the native WebSocket in Next.js server runtime).
 */

import WS from "ws";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GatewayEventFrame {
  type: "event";
  event: string;
  payload: unknown;
  seq?: number;
  stateVersion?: number;
}

interface GatewayRequest {
  type: "req";
  id: string;
  method: string;
  params: unknown;
}

interface GatewayResponse {
  type: "res";
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

type GatewayFrame = GatewayEventFrame | GatewayRequest | GatewayResponse;

export type EventListener = (event: GatewayEventFrame) => void;
export type StatusListener = (status: GatewayConnectionStatus) => void;

export type GatewayConnectionStatus =
  | "disconnected"
  | "connecting"
  | "reconnecting"
  | "connected";

// ─── Client ─────────────────────────────────────────────────────────────────

const RECONNECT_INITIAL_MS = 2_000;
const RECONNECT_MAX_MS = 30_000;
const RECONNECT_FACTOR = 1.8;
const RECONNECT_JITTER = 0.25;
const PING_INTERVAL_MS = 30_000;
const PING_TIMEOUT_MS = 60_000;
const CLIENT_INFO = {
  id: "webchat-ui",
  version: "clawpad",
  platform: "web",
  mode: "webchat",
};

class GatewayWSClient {
  private ws: WS | null = null;
  private _status: GatewayConnectionStatus = "disconnected";
  private token: string | undefined;
  private url: string = "ws://127.0.0.1:18789";
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private requestId = 0;
  private lastError: string | null = null;
  private lastErrorCode: string | null = null;
  private lastAuthError: string | null = null;
  private lastAuthErrorAt: number | null = null;
  private lastAuthRetryAt: number | null = null;
  private lastConnectToken: string | undefined;
  private configRefreshInFlight: Promise<void> | null = null;
  private lastConfigRefreshAt = 0;
  private reconnectInFlight = false;
  private reconnectAttempts = 0;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private lastPongAt = 0;
  private features: { methods: string[]; events: string[] } | null = null;

  private eventListeners = new Set<EventListener>();
  private statusListeners = new Set<StatusListener>();
  private pendingRPC = new Map<string, { resolve: (value: unknown) => void; reject: (err: Error) => void; timer: ReturnType<typeof setTimeout> }>();

  // ── Public API ──────────────────────────────────────────────────────────

  get status(): GatewayConnectionStatus {
    return this._status;
  }

  getLastError(): string | null {
    return this.lastError;
  }

  getLastErrorCode(): string | null {
    return this.lastErrorCode;
  }

  getFeatures(): { methods: string[]; events: string[] } | null {
    return this.features;
  }

  /**
   * Connect to the gateway WebSocket.
   * If already connected or connecting, this is a no-op.
   */
  async connect(url?: string, token?: string): Promise<void> {
    if (url) this.url = url;
    if (token !== undefined) this.token = this.normalizeToken(token);
    if (this._status === "connected" || this._status === "connecting") return;

    this.doConnect();
  }

  /** Disconnect and stop reconnecting unless explicitly requested. */
  disconnect(opts?: { reconnect?: boolean; reason?: string }): void {
    this.cancelReconnect();
    this.reconnectAttempts = 0;
    if (this.ws) {
      this.ws.removeAllListeners(); // prevent reconnect
      this.ws.close();
      this.ws = null;
    }
    this.setStatus("disconnected");
    if (opts?.reconnect) {
      this.scheduleReconnect(opts.reason);
    }
  }

  /** Subscribe to gateway events. Returns unsubscribe function. */
  onEvent(callback: EventListener): () => void {
    this.eventListeners.add(callback);
    return () => {
      this.eventListeners.delete(callback);
    };
  }

  /** Subscribe to connection status changes. Returns unsubscribe function. */
  onStatus(callback: StatusListener): () => void {
    this.statusListeners.add(callback);
    // Immediately notify with current status
    callback(this._status);
    return () => {
      this.statusListeners.delete(callback);
    };
  }

  /** Number of active event listeners (useful for debugging). */
  get listenerCount(): number {
    return this.eventListeners.size;
  }

  /**
   * Send an RPC request over the persistent WS connection.
   * Returns a promise that resolves with the response payload.
   * The connection must be in "connected" state.
   */
  sendRPC<T = unknown>(method: string, params: Record<string, unknown>, timeoutMs = 30_000): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (this._status !== "connected" || !this.ws) {
        reject(new Error(`Cannot send RPC: WS status is "${this._status}"`));
        return;
      }

      const id = String(++this.requestId);
      const timer = setTimeout(() => {
        this.pendingRPC.delete(id);
        reject(new Error(`RPC "${method}" timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingRPC.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      });

      const frame: GatewayRequest = { type: "req", id, method, params };
      try {
        this.ws.send(JSON.stringify(frame));
      } catch (err) {
        this.pendingRPC.delete(id);
        clearTimeout(timer);
        reject(new Error(`Failed to send RPC: ${err}`));
      }
    });
  }

  /**
   * Ensure the WS client is connected, auto-connecting if needed.
   * Returns when the connection is established or throws on timeout.
   */
  async ensureConnected(timeoutMs = 10_000): Promise<void> {
    if (this._status === "connected") return;

    // Auto-connect if disconnected
    if (this._status === "disconnected") {
      const { detectGateway } = await import("./detect");
      const config = await detectGateway();
      if (config) {
        const wsUrl = config.url.replace(/^http/, "ws");
        await this.connect(wsUrl, config.token);
      }
    }

    // Wait for connected status
    return new Promise<void>((resolve, reject) => {
      if (this._status === "connected") { resolve(); return; }

      const timer = setTimeout(() => {
        unsub();
        reject(new Error("WS connect timed out"));
      }, timeoutMs);

      const unsub = this.onStatus((status) => {
        if (status === "connected") {
          clearTimeout(timer);
          unsub();
          resolve();
        }
      });
    });
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private normalizeToken(token?: string): string | undefined {
    const trimmed = token?.trim();
    return trimmed ? trimmed : undefined;
  }

  private buildOrigin(rawUrl: string): string | null {
    if (!rawUrl) return null;
    const httpUrl = rawUrl.replace(/^ws/i, "http");
    try {
      const parsed = new URL(httpUrl);
      return parsed.origin;
    } catch {
      return null;
    }
  }

  private isAuthError(code?: string | null, message?: string | null): boolean {
    const normalized = (code ?? "").toUpperCase();
    if (normalized === "NOT_PAIRED" || normalized === "AUTH_REQUIRED" || normalized === "UNAUTHORIZED") {
      return true;
    }
    const msg = (message ?? "").toLowerCase();
    if (!msg) return false;
    return msg.includes("device identity required") || msg.includes("not paired");
  }

  private async refreshConfig(reason: string): Promise<void> {
    const now = Date.now();
    if (this.configRefreshInFlight) {
      return this.configRefreshInFlight;
    }
    if (now - this.lastConfigRefreshAt < 5000) {
      return;
    }

    this.configRefreshInFlight = (async () => {
      this.lastConfigRefreshAt = Date.now();
      try {
        const { detectGateway } = await import("./detect");
        const config = await detectGateway();
        if (config) {
          this.url = config.url;
          this.token = this.normalizeToken(config.token);
        }
      } catch (err) {
        console.warn("[gateway-ws] Config refresh failed:", reason, err);
      } finally {
        this.configRefreshInFlight = null;
      }
    })();

    return this.configRefreshInFlight;
  }

  private setStatus(status: GatewayConnectionStatus): void {
    if (this._status === status) return;
    this._status = status;
    if (status === "connected") {
      this.reconnectAttempts = 0;
    }
    for (const listener of this.statusListeners) {
      try {
        listener(status);
      } catch {
        // ignore listener errors
      }
    }
  }

  private doConnect(): void {
    this.setStatus("connecting");

    try {
      const wsUrl = this.url.replace(/^http/, "ws");
      const origin = this.buildOrigin(this.url);
      this.ws = new WS(wsUrl, origin ? { origin } : undefined);
    } catch (err) {
      console.error("[gateway-ws] Failed to create WebSocket:", err);
      this.scheduleReconnect();
      return;
    }

    this.ws.on("open", () => {
      console.log("[gateway-ws] WebSocket opened, waiting for challenge...");
      this.lastPongAt = Date.now();
      if (!this.pingInterval) {
        this.pingInterval = setInterval(() => {
          if (!this.ws) return;
          const age = Date.now() - this.lastPongAt;
          if (age > PING_TIMEOUT_MS) {
            try {
              this.ws.terminate();
            } catch {
              // ignore
            }
            return;
          }
          try {
            this.ws.ping();
          } catch {
            // ignore
          }
        }, PING_INTERVAL_MS);
      }
    });

    this.ws.on("message", (data: WS.Data) => {
      this.handleMessage(String(data));
    });

    this.ws.on("error", (err: Error) => {
      console.error("[gateway-ws] WebSocket error:", err.message);
      this.lastError = err.message;
      this.lastErrorCode = null;
    });

    this.ws.on("close", () => {
      this.ws = null;
      if (this.pingInterval) {
        clearInterval(this.pingInterval);
        this.pingInterval = null;
      }
      // Reject all pending RPCs
      for (const [id, pending] of this.pendingRPC) {
        clearTimeout(pending.timer);
        pending.reject(new Error("WebSocket closed"));
      }
      this.pendingRPC.clear();
      this.setStatus("disconnected");
      this.scheduleReconnect();
    });

    this.ws.on("pong", () => {
      this.lastPongAt = Date.now();
    });
  }

  private handleMessage(raw: string): void {
    let frame: GatewayFrame;
    try {
      frame = JSON.parse(raw) as GatewayFrame;
    } catch {
      console.warn("[gateway-ws] Failed to parse frame:", raw.slice(0, 200));
      return;
    }

    if (frame.type === "event") {
      const evt = frame as GatewayEventFrame;

      // Handle connect challenge
      if (evt.event === "connect.challenge") {
        console.log("[gateway-ws] Received challenge, sending connect...");
        const payload = evt.payload as { nonce: string; ts: number };
        void this.handleChallenge(payload.nonce);
        return;
      }
      // Broadcast to listeners
      for (const listener of this.eventListeners) {
        try {
          listener(evt);
        } catch (err) {
          console.error("[gateway-ws] Listener error:", err);
        }
      }
    } else if (frame.type === "res") {
      const res = frame as GatewayResponse;

      // Check if this is a response to a pending RPC
      const pending = this.pendingRPC.get(res.id);
      if (pending) {
        this.pendingRPC.delete(res.id);
        clearTimeout(pending.timer);
        if (res.ok) {
          pending.resolve(res.payload);
        } else {
          pending.reject(new Error(`RPC error: ${JSON.stringify(res.error)}`));
        }
        return;
      }

      // Otherwise it's the connect handshake response
      if (res.ok) {
        console.log("[gateway-ws] Connected to gateway, payload:", JSON.stringify(res.payload));
        this.lastError = null;
        this.lastErrorCode = null;
        this.lastAuthError = null;
        this.lastAuthErrorAt = null;
        this.lastAuthRetryAt = null;
        this.updateFeatures(res.payload);
        this.setStatus("connected");
      } else {
        const codeRaw = (res.error as { code?: unknown } | undefined)?.code;
        const message = (res.error as { message?: string } | undefined)?.message ?? "connect rejected";
        const code =
          typeof codeRaw === "string"
            ? codeRaw
            : typeof codeRaw === "number"
              ? String(codeRaw)
              : null;
        console.error("[gateway-ws] Connect rejected:", res.error);
        this.lastError = message;
        this.lastErrorCode = code;
        if (this.isAuthError(code, message)) {
          this.lastAuthError = message;
          this.lastAuthErrorAt = Date.now();
        }
        this.disconnect({ reconnect: true, reason: "connect-rejected" });
      }
    }
  }

  private async handleChallenge(_nonce: string): Promise<void> {
    if (!this.ws) return;
    if (!this.token) {
      await this.refreshConfig("challenge");
    }
    if (!this.token) {
      this.lastAuthError = "token missing";
      this.lastAuthErrorAt = Date.now();
      this.lastError = "device identity required";
      this.lastErrorCode = "AUTH_REQUIRED";
    }

    const connectReq: GatewayRequest = {
      type: "req",
      id: String(++this.requestId),
      method: "connect",
      params: {
        minProtocol: 3,
        maxProtocol: 3,
        client: CLIENT_INFO,
        role: "operator",
        scopes: ["operator.read", "operator.write", "operator.admin"],
        caps: [],
        commands: [],
        permissions: {},
        auth: this.token ? { token: this.token } : {},
      },
    };
    this.lastConnectToken = this.token;

    try {
      this.ws.send(JSON.stringify(connectReq));
    } catch (err) {
      console.error("[gateway-ws] Failed to send connect:", err);
    }
  }

  private updateFeatures(payload: unknown): void {
    if (!payload || typeof payload !== "object") return;
    const features = (payload as { features?: unknown }).features;
    if (!features || typeof features !== "object") return;

    const rawMethods = (features as { methods?: unknown }).methods;
    const rawEvents = (features as { events?: unknown }).events;
    const methods = Array.isArray(rawMethods)
      ? rawMethods.filter((m): m is string => typeof m === "string")
      : [];
    const events = Array.isArray(rawEvents)
      ? rawEvents.filter((e): e is string => typeof e === "string")
      : [];

    if (methods.length || events.length) {
      this.features = { methods, events };
    }
  }

  private scheduleReconnect(_reason?: string): void {
    if (this._status === "connected" || this._status === "connecting") {
      return;
    }
    this.cancelReconnect();
    this.setStatus("reconnecting");
    const now = Date.now();
    if (this.isAuthError(this.lastErrorCode, this.lastError)) {
      const tokenChanged =
        this.token && this.token !== this.lastConnectToken;
      if (this.lastAuthRetryAt && now - this.lastAuthRetryAt < 30_000 && !tokenChanged) {
        return;
      }
      this.lastAuthRetryAt = now;
    }
    const attempt = this.reconnectAttempts;
    const base = Math.min(
      RECONNECT_MAX_MS,
      RECONNECT_INITIAL_MS * Math.pow(RECONNECT_FACTOR, attempt),
    );
    const jitter = base * RECONNECT_JITTER * (Math.random() * 2 - 1);
    const delay = Math.max(500, Math.round(base + jitter));
    this.reconnectAttempts += 1;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this._status === "disconnected") {
        if (this.reconnectInFlight) {
          return;
        }
        this.reconnectInFlight = true;
        void this.refreshConfig("reconnect")
          .catch(() => {
            // ignore refresh errors
          })
          .finally(() => {
            this.reconnectInFlight = false;
            if (this._status === "disconnected") {
              this.doConnect();
            }
          });
      }
    }, delay);
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

export const gatewayWS = new GatewayWSClient();
