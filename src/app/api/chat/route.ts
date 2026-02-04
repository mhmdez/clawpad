import { createUIMessageStreamResponse, createUIMessageStream } from "ai";
import { detectGateway } from "@/lib/gateway/detect";
import {
  gatewayWS,
  type GatewayEventFrame,
} from "@/lib/gateway/ws-client";
import type { ChatEvent } from "@/lib/gateway/types";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content?: string;
  parts?: Array<{ type: string; text?: string }>;
}

/** Extract text content from AI SDK v6 message format */
function extractContent(msg: ChatMessage): string {
  if (msg.content) return msg.content;
  if (msg.parts) {
    return msg.parts
      .filter((p) => p.type === "text" && p.text)
      .map((p) => p.text!)
      .join("\n");
  }
  return "";
}

/**
 * POST /api/chat
 *
 * Sends chat messages to OpenClaw gateway via WebSocket RPC `chat.send`.
 * Streams the response back as AI SDK v6 UIMessageStream format by
 * subscribing to `chat` events on the WS connection.
 */
export async function POST(req: Request) {
  const body = await req.json();
  const { messages, images } = body as {
    messages: ChatMessage[];
    images?: string[]; // base64 data URLs for the current send
  };

  const config = await detectGateway();
  if (!config?.token) {
    return Response.json(
      { error: "OpenClaw gateway not configured. Check ~/.openclaw/openclaw.json" },
      { status: 500 },
    );
  }

  // Get the last user message text
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUserMsg) {
    return Response.json(
      { error: "No user message found" },
      { status: 400 },
    );
  }
  const messageText = extractContent(lastUserMsg);

  // Ensure WS client is connected
  try {
    await gatewayWS.ensureConnected(8_000);
  } catch {
    // Fallback: try connecting directly
    const wsUrl = config.url.replace(/^http/, "ws");
    await gatewayWS.connect(wsUrl, config.token);
    // Wait a bit for connection
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("WS connect timeout")), 8_000);
      if (gatewayWS.status === "connected") { clearTimeout(timer); resolve(); return; }
      const unsub = gatewayWS.onStatus((s) => {
        if (s === "connected") { clearTimeout(timer); unsub(); resolve(); }
      });
    });
  }

  // Build chat.send params
  const idempotencyKey = crypto.randomUUID();
  const sendParams: Record<string, unknown> = {
    sessionKey: "main",
    message: messageText,
    idempotencyKey,
  };

  // Attach images if present
  if (images && images.length > 0) {
    sendParams.attachments = images.map((dataUrl: string) => {
      const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        return {
          type: "image",
          mediaType: match[1],
          data: match[2],
        };
      }
      return { type: "image", url: dataUrl };
    });
  }

  // Send RPC — this acks immediately with { runId, status }
  let runId: string;
  try {
    const ack = await gatewayWS.sendRPC<{ runId: string; status: string }>(
      "chat.send",
      sendParams,
      15_000,
    );
    runId = ack.runId;
  } catch (err) {
    console.error("[api/chat] chat.send RPC error:", err);
    return Response.json(
      { error: `chat.send failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }

  // Now stream the response by listening for chat events with matching runId
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const partId = crypto.randomUUID();
      let started = false;
      let done = false;

      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          if (!done) {
            done = true;
            if (started) {
              writer.write({ type: "text-end", id: partId });
            }
            unsub();
            resolve();
          }
        }, 300_000); // 5 min max timeout

        const unsub = gatewayWS.onEvent((evt: GatewayEventFrame) => {
          if (done) return;
          if (evt.event !== "chat") return;

          const payload = evt.payload as ChatEvent;
          if (!payload) return;

          // Match by runId (preferred) or sessionKey
          if (payload.runId && payload.runId !== runId) return;

          const state = payload.state;

          if (state === "delta") {
            // Extract text from the message content
            const msg = payload.message;
            if (!msg) return;

            let text = "";
            if (typeof msg.content === "string") {
              text = msg.content;
            } else if (Array.isArray(msg.content)) {
              text = msg.content
                .filter((b) => b.type === "text" && b.text)
                .map((b) => b.text!)
                .join("");
            }

            if (text) {
              if (!started) {
                writer.write({ type: "text-start", id: partId });
                started = true;
              }
              writer.write({ type: "text-delta", id: partId, delta: text });
            }
          } else if (state === "final" || state === "aborted" || state === "error") {
            // Final message — extract any remaining text
            if (state === "final" && payload.message) {
              const msg = payload.message;
              let text = "";
              if (typeof msg.content === "string") {
                text = msg.content;
              } else if (Array.isArray(msg.content)) {
                text = msg.content
                  .filter((b) => b.type === "text" && b.text)
                  .map((b) => b.text!)
                  .join("");
              }

              // If we haven't started streaming yet, send the full text
              if (text && !started) {
                writer.write({ type: "text-start", id: partId });
                started = true;
                writer.write({ type: "text-delta", id: partId, delta: text });
              }
            }

            if (state === "error" && payload.error) {
              if (!started) {
                writer.write({ type: "text-start", id: partId });
                started = true;
              }
              writer.write({
                type: "text-delta",
                id: partId,
                delta: `\n\n⚠️ Error: ${payload.error}`,
              });
            }

            if (started) {
              writer.write({ type: "text-end", id: partId });
            }

            done = true;
            clearTimeout(timeout);
            unsub();
            resolve();
          }
        });
      });
    },
  });

  return createUIMessageStreamResponse({ stream });
}
