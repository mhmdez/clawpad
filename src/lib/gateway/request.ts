/**
 * One-shot WebSocket request to the OpenClaw gateway.
 *
 * Opens a temporary WS connection, performs the challenge/connect
 * handshake, sends a single RPC request, returns the result, and
 * closes the connection. Designed for server-side API routes.
 */

import { detectGateway } from "./detect";

interface GatewayRPCOptions {
  method: string;
  params?: unknown;
  timeoutMs?: number;
}

/**
 * Send a single RPC request to the gateway over WebSocket.
 * Returns the response payload or throws on error/timeout.
 */
export async function gatewayRequest<T = unknown>(
  opts: GatewayRPCOptions,
): Promise<T> {
  const config = await detectGateway();
  if (!config) throw new Error("No gateway configuration found");

  const wsUrl = config.url.replace(/^http/, "ws");
  const timeout = opts.timeoutMs ?? 10_000;

  return new Promise<T>((resolve, reject) => {
    let reqId = 0;
    let settled = false;
    let ws: WebSocket;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try { ws?.close(); } catch { /* ignore */ }
        reject(new Error("Gateway request timed out"));
      }
    }, timeout);

    function done(err: Error | null, result?: T) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws?.close(); } catch { /* ignore */ }
      if (err) reject(err);
      else resolve(result as T);
    }

    try {
      ws = new WebSocket(wsUrl);
    } catch (err) {
      clearTimeout(timer);
      reject(new Error(`Failed to create WebSocket: ${err}`));
      return;
    }

    ws.onclose = () => {
      done(new Error("WebSocket closed before response"));
    };

    ws.onerror = (event: Event) => {
      done(new Error(`WebSocket error: ${event}`));
    };

    ws.onmessage = (event: MessageEvent) => {
      let frame: { type: string; event?: string; payload?: unknown; id?: string; ok?: boolean; error?: unknown };
      try {
        frame = JSON.parse(String(event.data));
      } catch {
        return; // ignore unparseable frames
      }

      // Step 1: Handle connect challenge
      if (frame.type === "event" && frame.event === "connect.challenge") {
        const connectReq = {
          type: "req",
          id: String(++reqId),
          method: "connect",
          params: {
            minProtocol: 3,
            maxProtocol: 3,
            client: { id: "clawpad-rpc", version: "0.1.0", platform: "web", mode: "operator" },
            role: "operator",
            scopes: ["operator.read"],
            caps: [],
            commands: [],
            permissions: {},
            auth: config.token ? { token: config.token } : {},
          },
        };
        ws.send(JSON.stringify(connectReq));
        return;
      }

      // Step 2: Handle connect response
      if (frame.type === "res" && frame.id === String(reqId) && reqId === 1) {
        if (!frame.ok) {
          done(new Error(`Gateway connect rejected: ${JSON.stringify(frame.error)}`));
          return;
        }
        // Connected — now send the actual RPC request
        const rpcReq = {
          type: "req",
          id: String(++reqId),
          method: opts.method,
          params: opts.params ?? {},
        };
        ws.send(JSON.stringify(rpcReq));
        return;
      }

      // Step 3: Handle RPC response
      if (frame.type === "res" && frame.id === String(reqId) && reqId === 2) {
        if (!frame.ok) {
          done(new Error(`Gateway RPC error: ${JSON.stringify(frame.error)}`));
          return;
        }
        done(null, frame.payload as T);
        return;
      }

      // Ignore other frames (events, etc.)
    };
  });
}
