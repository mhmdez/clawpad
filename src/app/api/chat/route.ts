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
 * Proxies chat messages to the OpenClaw gateway's OpenResponses API.
 * Converts the AI SDK message format to OpenResponses input format,
 * then streams the response back as plain text SSE (data-stream format).
 */
export async function POST(req: Request) {
  const body = await req.json();
  const { messages } = body as { messages: ChatMessage[] };

  const config = await detectGateway();
  if (!config?.token) {
    return Response.json(
      { error: "OpenClaw gateway not configured. Check ~/.openclaw/openclaw.json" },
      { status: 500 },
    );
  }

  // Convert messages to OpenResponses input format
  // System messages go as instructions, user/assistant go as input items
  const systemMessages = messages.filter((m) => m.role === "system");
  const chatMessages = messages.filter((m) => m.role !== "system");

  const input = chatMessages.map((m) => ({
    type: "message" as const,
    role: m.role as "user" | "assistant",
    content: extractContent(m),
  }));

  const instructions = systemMessages.length > 0
    ? systemMessages.map((m) => extractContent(m)).join("\n")
    : "You are a helpful assistant in ClawPad, a workspace app for OpenClaw users. Help the user with their documents and writing. Be concise, friendly, and useful. Format responses with markdown when helpful.";

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

  // Transform OpenResponses SSE events into AI SDK data-stream format
  // The AI SDK useChat expects: "0:text\n" format (data stream protocol)
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const transformStream = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      const text = decoder.decode(chunk, { stream: true });
      const lines = text.split("\n");

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6);
        if (data === "[DONE]") {
          // End of stream
          return;
        }

        try {
          const event = JSON.parse(data);
          if (event.type === "response.output_text.delta" && event.delta) {
            // AI SDK data stream protocol: text parts are "0:string\n"
            controller.enqueue(
              encoder.encode(`0:${JSON.stringify(event.delta)}\n`)
            );
          } else if (event.type === "response.completed") {
            // Send finish reason
            controller.enqueue(
              encoder.encode(`d:{"finishReason":"stop","usage":{"promptTokens":0,"completionTokens":0}}\n`)
            );
          }
        } catch {
          // Ignore parse errors
        }
      }
    },
  });

  const responseBody = gatewayRes.body;
  if (!responseBody) {
    return Response.json({ error: "No response body" }, { status: 500 });
  }

  return new Response(responseBody.pipeThrough(transformStream), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Vercel-AI-Data-Stream": "v1",
    },
  });
}
