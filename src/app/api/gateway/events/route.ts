/**
 * SSE endpoint that bridges gateway WebSocket events to the browser.
 *
 * GET /api/gateway/events
 *
 * On first connection, ensures the server-side WS client is connected
 * to the gateway. Streams all gateway events (agent, chat, presence,
 * tick, health) plus synthetic connection-status events.
 */

import { detectGateway } from "@/lib/gateway/detect";
import {
  gatewayWS,
  type GatewayEventFrame,
  type GatewayConnectionStatus,
} from "@/lib/gateway/ws-client";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  // Ensure the WS client is connected
  if (gatewayWS.status === "disconnected") {
    try {
      const config = await detectGateway();
      if (config) {
        const wsUrl = config.url.replace(/^http/, "ws");
        await gatewayWS.connect(wsUrl, config.token);
      }
    } catch (err) {
      console.error("[sse] Failed to start gateway WS:", err);
    }
  }

  const encoder = new TextEncoder();
  let closed = false;
  let unsubEvent: (() => void) | null = null;
  let unsubStatus: (() => void) | null = null;
  let keepalive: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      function send(eventType: string, data: unknown): void {
        if (closed) return;
        try {
          const payload = JSON.stringify(data);
          controller.enqueue(
            encoder.encode(`event: ${eventType}\ndata: ${payload}\n\n`)
          );
        } catch {
          // stream may have been closed
          cleanup();
        }
      }

      function cleanup(): void {
        if (closed) return;
        closed = true;
        if (keepalive) clearInterval(keepalive);
        if (unsubEvent) unsubEvent();
        if (unsubStatus) unsubStatus();
      }

      // Send initial connection status
      send("status", { status: gatewayWS.status });

      // Forward gateway events
      unsubEvent = gatewayWS.onEvent((evt: GatewayEventFrame) => {
        send("gateway", {
          event: evt.event,
          payload: evt.payload,
          seq: evt.seq,
        });
      });

      // Forward connection status changes
      unsubStatus = gatewayWS.onStatus((status: GatewayConnectionStatus) => {
        send("status", { status });
      });

      // Keepalive ping every 30s (prevents proxy/browser timeout)
      keepalive = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          cleanup();
        }
      }, 30_000);
    },

    cancel() {
      // Called when the client disconnects
      closed = true;
      if (keepalive) clearInterval(keepalive);
      if (unsubEvent) unsubEvent();
      if (unsubStatus) unsubStatus();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
