import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

export async function POST(req: Request) {
  const { messages } = await req.json();

  // For now, use OpenAI directly (gateway integration later)
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json(
      {
        error:
          "No OpenAI API key configured. Set OPENAI_API_KEY in your environment.",
      },
      { status: 500 },
    );
  }

  const openai = createOpenAI({ apiKey });

  const result = streamText({
    model: openai("gpt-4o-mini"),
    messages,
    system: `You are a helpful assistant in ClawPad, a workspace app for OpenClaw users. Help the user with their documents and writing. Be concise, friendly, and useful. Format responses with markdown when helpful.`,
  });

  return result.toTextStreamResponse();
}
