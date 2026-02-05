import { NextRequest, NextResponse } from "next/server";
import { resolveSessionKey } from "@/lib/gateway/resolve";

/**
 * GET /api/gateway/resolve?key=main
 *
 * Resolves a session key alias (like "main") to the canonical gateway session key.
 * Falls back to the provided key if resolution is unavailable.
 */
export async function GET(req: NextRequest) {
  const rawKey = req.nextUrl.searchParams.get("key") ?? "main";
  try {
    const resolved = await resolveSessionKey(rawKey, { timeoutMs: 4_000 });
    return NextResponse.json({ key: rawKey, resolved });
  } catch {
    return NextResponse.json({ key: rawKey, resolved: rawKey });
  }
}
