import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { detectGateway } from "@/lib/gateway/detect";

export async function POST(req: Request) {
  const { messages } = await req.json();

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

  const gateway = createOpenAI({
    baseURL: `${config.url}/v1`,
    apiKey: config.token,
  });

  const result = streamText({
    model: gateway("openclaw:main"),
    messages,
    system: `You are a helpful assistant in ClawPad, a workspace app for OpenClaw users. Help the user with their documents and writing. Be concise, friendly, and useful. Format responses with markdown when helpful.`,
  });

  return result.toTextStreamResponse();
}
