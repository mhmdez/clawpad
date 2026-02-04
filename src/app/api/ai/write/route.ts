import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

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

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json(
      {
        error:
          "No OpenAI API key configured. Set OPENAI_API_KEY in your environment to enable AI writing.",
      },
      { status: 500 },
    );
  }

  const openai = createOpenAI({ apiKey });

  let systemPrompt = systemPrompts[action] ?? systemPrompts.improve;
  if (action === "translate" && language) {
    systemPrompt = `You are a translation assistant. Translate the following text into ${language}. Return only the translation, no explanations.`;
  }

  const result = streamText({
    model: openai("gpt-4o-mini"),
    system: systemPrompt,
    prompt: text,
  });

  return result.toTextStreamResponse();
}
