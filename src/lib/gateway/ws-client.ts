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
  | "connected";

// ─── Client ─────────────────────────────────────────────────────────────────

const RECONNECT_DELAY = 5_000;
const CLIENT_INFO = {
  id: "cli",
  version: "0.1.0",
  platform: "web",
  mode: "ui",
};

class GatewayWSClient {
  private ws: WS | null = null;
  private _status: GatewayConnectionStatus = "disconnected";
  private token: string | undefined;
  private url: string = "ws://127.0.0.1:18789";
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private requestId = 0;

  private eventListeners = new Set<EventListener>();
  private statusListeners = new Set<StatusListener>();
  private pendingRPC = new Map<string, { resolve: (value: unknown) => void; reject: (err: Error) => void; timer: ReturnType<typeof setTimeout> }>();

  // ── Public API ──────────────────────────────────────────────────────────

  get status(): GatewayConnectionStatus {
    return this._status;
  }

  /**
   * Connect to the gateway WebSocket.
   * If already connected or connecting, this is a no-op.
   */
  async connect(url?: string, token?: string): Promise<void> {
    if (this._status !== "disconnected") return;

    if (url) this.url = url;
    if (token !== undefined) this.token = token;

    this.doConnect();
  }

  /** Disconnect and stop reconnecting. */
  disconnect(): void {
    this.cancelReconnect();
    if (this.ws) {
      this.ws.removeAllListeners(); // prevent reconnect
      this.ws.close();
      this.ws = null;
    }
    this.setStatus("disconnected");
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

  private setStatus(status: GatewayConnectionStatus): void {
    if (this._status === status) return;
    this._status = status;
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
      this.ws = new WS(wsUrl);
    } catch (err) {
      console.error("[gateway-ws] Failed to create WebSocket:", err);
      this.scheduleReconnect();
      return;
    }

    this.ws.on("open", () => {
      console.log("[gateway-ws] WebSocket opened, waiting for challenge...");
    });

    this.ws.on("message", (data: WS.Data) => {
      this.handleMessage(String(data));
    });

    this.ws.on("error", (err: Error) => {
      console.error("[gateway-ws] WebSocket error:", err.message);
    });

    this.ws.on("close", () => {
      this.ws = null;
      // Reject all pending RPCs
      for (const [id, pending] of this.pendingRPC) {
        clearTimeout(pending.timer);
        pending.reject(new Error("WebSocket closed"));
      }
      this.pendingRPC.clear();
      this.setStatus("disconnected");
      this.scheduleReconnect();
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
        this.handleChallenge(payload.nonce);
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
        this.setStatus("connected");
      } else {
        console.error("[gateway-ws] Connect rejected:", res.error);
        this.disconnect();
      }
    }
  }

  private handleChallenge(_nonce: string): void {
    if (!this.ws) return;

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

    try {
      this.ws.send(JSON.stringify(connectReq));
    } catch (err) {
      console.error("[gateway-ws] Failed to send connect:", err);
    }
  }

  private scheduleReconnect(): void {
    this.cancelReconnect();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this._status === "disconnected") {
        this.doConnect();
      }
    }, RECONNECT_DELAY);
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
