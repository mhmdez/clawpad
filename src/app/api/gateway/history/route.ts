/**
 * GET /api/gateway/history?limit=50&sessionKey=agent:main:main
 *
 * Fetches cross-channel chat history from the OpenClaw gateway
 * via WebSocket RPC (sessions.history method).
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
  const sessionKey = req.nextUrl.searchParams.get("sessionKey") ?? "agent:main:main";
  const limit = Math.min(Math.max(parseInt(limitParam ?? "500", 10) || 500, 1), 1000);

  try {
    const result = await gatewayRequest<{ messages?: HistoryMessage[] }>({
      method: "chat.history",
      params: { sessionKey, limit },
      timeoutMs: 8_000,
    });

    const messages: HistoryMessage[] = result?.messages ?? [];

    return NextResponse.json({ messages });
  } catch (error) {
    // If gateway is unreachable or doesn't support sessions.history, return empty
    console.warn("[api/gateway/history] Failed to fetch history:", String(error));
    return NextResponse.json({ messages: [] });
  }
}
