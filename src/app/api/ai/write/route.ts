import { detectGateway } from "@/lib/gateway/detect";

const systemPrompts: Record<string, string> = {
  improve:
    "You are a writing assistant. Improve the following text to make it clearer, more engaging, and better written. Keep the same meaning and tone. Return only the improved text, no explanations.",
  simplify:
    "You are a writing assistant. Simplify the following text to make it easier to understand. Use shorter sentences and simpler words. Return only the simplified text, no explanations.",
  expand:
    "You are a writing assistant. Expand the following text with more detail, examples, and depth while maintaining the original meaning and style. Return only the expanded text, no explanations.",
  summarize:
    "You are a writing assistant. Summarize the following text into a concise version that captures the key points. Return only the summary, no explanations.",
  "fix-grammar":
    "You are a writing assistant. Fix any grammar, spelling, and punctuation errors in the following text. Keep the original meaning and style. Return only the corrected text, no explanations.",
  translate:
    "You are a translation assistant. Translate the following text into the specified language. Return only the translation, no explanations.",
  continue:
    "You are a writing assistant. Continue writing from where the following text ends, matching its style and tone. Write 2-3 natural paragraphs. Return only the continuation, no explanations.",
};

export async function POST(req: Request) {
  const body = await req.json();
  const {
    text,
    action,
    language,
  }: {
    text: string;
    action:
      | "improve"
      | "simplify"
      | "expand"
      | "summarize"
      | "fix-grammar"
      | "translate"
      | "continue";
    language?: string;
  } = body;

  if (!text || !action) {
    return Response.json(
      { error: "Missing required fields: text and action" },
      { status: 400 },
    );
  }

  const config = await detectGateway();
  if (!config?.token) {
    return Response.json(
      {
        error:
          "OpenClaw gateway not configured or auth token missing. Check ~/.openclaw/openclaw.json",
      },
      { status: 500 },
    );
  }

  let systemPrompt = systemPrompts[action] ?? systemPrompts.improve;
  if (action === "translate" && language) {
    systemPrompt = `You are a translation assistant. Translate the following text into ${language}. Return only the translation, no explanations.`;
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
      input: [{ role: "user", content: text }],
      instructions: systemPrompt,
      stream: true,
    }),
  });

  if (!gatewayRes.ok) {
    const errorText = await gatewayRes.text();
    console.error("[api/ai/write] Gateway error:", gatewayRes.status, errorText);
    return Response.json(
      { error: `Gateway error: ${gatewayRes.status}` },
      { status: gatewayRes.status },
    );
  }

  const responseBody = gatewayRes.body;
  if (!responseBody) {
    return Response.json({ error: "No response body" }, { status: 500 });
  }

  // Parse SSE events and extract plain text deltas
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  (async () => {
    const reader = responseBody.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

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
              await writer.write(encoder.encode(event.delta));
            }
          } catch {
            // ignore parse errors
          }
        }
      }
    } finally {
      reader.releaseLock();
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
    },
  });
}
