import { createUIMessageStreamResponse, createUIMessageStream } from "ai";
import { detectGateway } from "@/lib/gateway/detect";

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
 * Proxies chat to OpenClaw gateway via OpenResponses API.
 * Returns AI SDK v6 UIMessageStream format.
 */
export async function POST(req: Request) {
  const body = await req.json();
  const { messages, pageContext } = body as {
    messages: ChatMessage[];
    pageContext?: string;
  };

  const config = await detectGateway();
  if (!config?.token) {
    return Response.json(
      { error: "OpenClaw gateway not configured. Check ~/.openclaw/openclaw.json" },
      { status: 500 },
    );
  }

  // Convert messages to OpenResponses input format
  const systemMessages = messages.filter((m) => m.role === "system");
  const chatMessages = messages.filter((m) => m.role !== "system");

  const input = chatMessages.map((m) => ({
    type: "message" as const,
    role: m.role as "user" | "assistant",
    content: extractContent(m),
  }));

  let instructions = systemMessages.length > 0
    ? systemMessages.map((m) => extractContent(m)).join("\n")
    : "You are a helpful assistant in ClawPad, a workspace app for OpenClaw users. Help the user with their documents and writing. Be concise, friendly, and useful. Format responses with markdown when helpful.";

  // Include page context if the user is viewing a specific page
  if (pageContext) {
    const pageTitle = pageContext
      .split("/")
      .pop()
      ?.replace(/\.md$/, "")
      .replace(/-/g, " ") ?? pageContext;
    instructions += `\n\nThe user is currently viewing the page "${pageTitle}" (path: ${pageContext}). Consider this context when answering their questions.`;
  }

  // Call gateway OpenResponses API with streaming
  const gatewayRes = await fetch(`${config.url}/v1/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.token}`,
    },
    body: JSON.stringify({
      model: "openclaw:main",
      input,
      instructions,
      stream: true,
    }),
  });

  if (!gatewayRes.ok) {
    const errorText = await gatewayRes.text();
    console.error("[api/chat] Gateway error:", gatewayRes.status, errorText);
    return Response.json(
      { error: `Gateway error: ${gatewayRes.status}` },
      { status: gatewayRes.status },
    );
  }

  const responseBody = gatewayRes.body;
  if (!responseBody) {
    return Response.json({ error: "No response body" }, { status: 500 });
  }

  // Create a UIMessageStream that reads from the gateway SSE and emits text deltas
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const reader = responseBody.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const partId = crypto.randomUUID();
      let started = false;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6);
            if (data === "[DONE]") continue;

            try {
              const event = JSON.parse(data);
              if (event.type === "response.output_text.delta" && event.delta) {
                if (!started) {
                  writer.write({ type: "text-start", id: partId });
                  started = true;
                }
                writer.write({ type: "text-delta", id: partId, delta: event.delta });
              }
            } catch {
              // ignore parse errors
            }
          }
        }

        if (started) {
          writer.write({ type: "text-end", id: partId });
        }
      } finally {
        reader.releaseLock();
      }
    },
  });

  return createUIMessageStreamResponse({ stream });
}
