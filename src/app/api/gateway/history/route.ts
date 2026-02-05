/**
 * GET /api/gateway/history?limit=50&sessionKey=main
 *
 * Fetches cross-channel chat history from the OpenClaw gateway
 * via WebSocket RPC (chat.history method).
 *
 * Uses the persistent WS client singleton for efficiency.
 * Falls back to one-shot WS request if the singleton isn't connected.
 */

import { NextRequest, NextResponse } from "next/server";
import { gatewayWS } from "@/lib/gateway/ws-client";
import { gatewayRequest } from "@/lib/gateway/request";
import { resolveSessionKey } from "@/lib/gateway/resolve";

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
  const requestedSessionKey = req.nextUrl.searchParams.get("sessionKey") ?? "main";
  const sessionKey = await resolveSessionKey(requestedSessionKey, { timeoutMs: 4_000 });
  const limit = Math.min(Math.max(parseInt(limitParam ?? "500", 10) || 500, 1), 1000);

  try {
    let result: { messages?: HistoryMessage[] } | undefined;

    // Prefer the persistent WS client if connected
    if (gatewayWS.status === "connected") {
      try {
        result = await gatewayWS.sendRPC<{ messages?: HistoryMessage[] }>(
          "chat.history",
          { sessionKey, limit },
          8_000,
        );
      } catch (err) {
        console.warn("[api/gateway/history] WS RPC failed, falling back to one-shot:", String(err));
      }
    }

    // Fallback: one-shot WS request
    if (!result) {
      result = await gatewayRequest<{ messages?: HistoryMessage[] }>({
        method: "chat.history",
        params: { sessionKey, limit },
        timeoutMs: 8_000,
      });
    }

    const messages: HistoryMessage[] = result?.messages ?? [];

    return NextResponse.json({ messages });
  } catch (error) {
    // If gateway is unreachable or doesn't support chat.history, return empty
    console.warn("[api/gateway/history] Failed to fetch history:", String(error));
    return NextResponse.json({ messages: [] });
  }
}
