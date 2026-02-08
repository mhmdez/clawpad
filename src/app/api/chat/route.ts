import { createUIMessageStreamResponse, createUIMessageStream } from "ai";
import { detectGateway } from "@/lib/gateway/detect";
import {
  gatewayWS,
  type GatewayEventFrame,
} from "@/lib/gateway/ws-client";
import { resolveSessionKey } from "@/lib/gateway/resolve";
import type { ChatEvent } from "@/lib/gateway/types";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content?: string;
  parts?: Array<{ type: string; text?: string }>;
}

interface ChatContextPayload {
  activePage?: { title?: string; path: string; space?: string };
  attachedPages?: Array<{ title?: string; path: string; space?: string }>;
  scope?: "current" | "custom" | "all";
}

function dataUrlToBase64(dataUrl: string): { content: string; mimeType: string } | null {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    return null;
  }
  return { mimeType: match[1], content: match[2] };
}

function extractChatText(content: unknown): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((b) => b && typeof b === "object")
      .map((b) => {
        const block = b as { type?: string; text?: string };
        return block.type === "text" && block.text ? block.text : "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
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

function buildContextPrefix(
  context?: ChatContextPayload,
  pageContext?: string,
): string | null {
  const ctx: ChatContextPayload = context ? { ...context } : {};
  if (!ctx.activePage && pageContext) {
    ctx.activePage = { path: pageContext };
  }

  const hasActive = Boolean(ctx.activePage?.path);
  const hasAttached = Boolean(ctx.attachedPages && ctx.attachedPages.length > 0);
  if (!hasActive && !hasAttached) return null;

  const lines: string[] = ["[Context]"];
  if (ctx.activePage?.path) {
    const label = ctx.activePage.title
      ? `${ctx.activePage.title} (${ctx.activePage.path})`
      : ctx.activePage.path;
    lines.push(`current_page: ${label}`);
  }
  if (ctx.attachedPages && ctx.attachedPages.length > 0) {
    const titles = ctx.attachedPages
      .map((p) => (p.title ? `${p.title} (${p.path})` : p.path))
      .join("; ");
    lines.push(`attached_pages: ${titles}`);
  }
  if (ctx.scope) {
    lines.push(`scope: ${ctx.scope}`);
  }
  lines.push("[/Context]");
  return lines.join("\n");
}

/**
 * POST /api/chat
 *
 * Sends chat messages to OpenClaw gateway via WebSocket RPC `chat.send`.
 * Streams the response back as AI SDK v6 UIMessageStream format by
 * subscribing to `chat` events on the WS connection.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { messages, images, sessionKey, context, pageContext } = body as {
    messages: ChatMessage[];
    images?: string[];
    sessionKey?: string;
    context?: ChatContextPayload;
    pageContext?: string;
  };

  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: "Missing messages" }, { status: 400 });
  }
  if (images !== undefined && !Array.isArray(images)) {
    return Response.json({ error: "Invalid images" }, { status: 400 });
  }

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
  const contextPrefix = buildContextPrefix(context, pageContext);
  const messageForAgent = contextPrefix
    ? `${contextPrefix}\n\n${messageText}`
    : messageText;

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
  const requestedSessionKey =
    typeof sessionKey === "string" && sessionKey.trim()
      ? sessionKey.trim()
      : "main";
  const resolvedSessionKey = await resolveSessionKey(requestedSessionKey, {
    timeoutMs: 4_000,
  });
  const sendParams: Record<string, unknown> = {
    sessionKey: resolvedSessionKey,
    message: messageForAgent,
    idempotencyKey,
    deliver: false,
  };

  // Attach images if present
  if (images && images.length > 0) {
    const attachments = images
      .map((dataUrl) => {
        const parsed = dataUrlToBase64(dataUrl);
        if (!parsed) return null;
        return {
          type: "image",
          mimeType: parsed.mimeType,
          content: parsed.content,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
    if (attachments.length > 0) {
      sendParams.attachments = attachments;
    }
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
      let lastText = "";

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
            const nextText = extractChatText(msg.content);
            if (!nextText || nextText === lastText) return;
            const delta = nextText.startsWith(lastText)
              ? nextText.slice(lastText.length)
              : nextText;
            if (delta) {
              if (!started) {
                writer.write({ type: "text-start", id: partId });
                started = true;
              }
              writer.write({ type: "text-delta", id: partId, delta });
              lastText = nextText;
            }
          } else if (state === "final" || state === "aborted" || state === "error") {
            // Final message — extract any remaining text
            if (state === "final" && payload.message) {
              const text = extractChatText(payload.message.content);
              if (text && text !== lastText) {
                const delta = text.startsWith(lastText)
                  ? text.slice(lastText.length)
                  : text;
                if (!started) {
                  writer.write({ type: "text-start", id: partId });
                  started = true;
                }
                if (delta) {
                  writer.write({ type: "text-delta", id: partId, delta });
                }
                lastText = text;
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
