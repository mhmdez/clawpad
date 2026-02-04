import { NextResponse } from "next/server";
import { gatewayRequest } from "@/lib/gateway/request";

export async function GET() {
  try {
    const result = await gatewayRequest<{ sessions?: unknown[] }>({
      method: "sessions.list",
      params: { limit: 20 },
      timeoutMs: 5_000,
    });

    const sessions = result?.sessions ?? [];
    return NextResponse.json({ sessions });
  } catch (error) {
    // Gateway unreachable or method not available — return empty
    console.warn("[api/gateway/sessions]", String(error));
    return NextResponse.json({ sessions: [] });
  }
}
