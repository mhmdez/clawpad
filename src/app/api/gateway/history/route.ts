/**
 * GET /api/gateway/history?limit=50
 *
 * Fetches cross-channel chat history from the OpenClaw gateway
 * via WebSocket RPC (chat.history method).
 */

import { NextRequest, NextResponse } from "next/server";
import { gatewayRequest } from "@/lib/gateway/request";

export interface HistoryMessage {
  role: "user" | "assistant" | "system";
  content: string | ContentPart[];
  timestamp?: number;
  channel?: string;
  sessionKey?: string;
}

interface ContentPart {
  type: string;
  text?: string;
  [key: string]: unknown;
}

export async function GET(req: NextRequest) {
  const limitParam = req.nextUrl.searchParams.get("limit");
  const limit = Math.min(Math.max(parseInt(limitParam ?? "50", 10) || 50, 1), 200);

  try {
    const result = await gatewayRequest<{ messages?: HistoryMessage[] } | HistoryMessage[]>({
      method: "chat.history",
      params: { limit },
      timeoutMs: 8_000,
    });

    // Normalize response: could be { messages: [...] } or just [...]
    const messages: HistoryMessage[] = Array.isArray(result)
      ? result
      : (result?.messages ?? []);

    return NextResponse.json({ messages });
  } catch (error) {
    // If gateway is unreachable or doesn't support chat.history, return empty
    console.warn("[api/gateway/history] Failed to fetch history:", String(error));
    return NextResponse.json({ messages: [] });
  }
}
