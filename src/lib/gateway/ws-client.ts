/**
 * Server-side WebSocket client for OpenClaw Gateway Protocol v3.
 *
 * Singleton that maintains a persistent connection to the gateway,
 * handles the challenge/connect handshake, auto-reconnects, and
 * broadcasts events to registered listeners.
 *
 * Runs exclusively on the Next.js server (Node 22 native WebSocket).
 */

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
  id: "clawpad",
  version: "0.1.0",
  platform: "web",
  mode: "operator",
};

class GatewayWSClient {
  private ws: WebSocket | null = null;
  private _status: GatewayConnectionStatus = "disconnected";
  private token: string | undefined;
  private url: string = "ws://127.0.0.1:18789";
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private requestId = 0;

  private eventListeners = new Set<EventListener>();
  private statusListeners = new Set<StatusListener>();

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
      this.ws.onclose = null; // prevent reconnect
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
      this.ws = new WebSocket(wsUrl);
    } catch (err) {
      console.error("[gateway-ws] Failed to create WebSocket:", err);
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      // Wait for challenge event from gateway
    };

    this.ws.onmessage = (event: MessageEvent) => {
      this.handleMessage(String(event.data));
    };

    this.ws.onerror = (event: Event) => {
      console.error("[gateway-ws] WebSocket error:", event);
    };

    this.ws.onclose = () => {
      this.ws = null;
      this.setStatus("disconnected");
      this.scheduleReconnect();
    };
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
      if (res.ok) {
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
        scopes: ["operator.read"],
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
