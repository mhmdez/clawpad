import { detectGateway } from "@/lib/gateway/detect";
import { gatewayWS } from "@/lib/gateway/ws-client";
import { gatewayRequest } from "@/lib/gateway/request";
import { resolveSessionKey } from "@/lib/gateway/resolve";

/**
 * POST /api/chat/abort
 *
 * Aborts the current chat run for a session via gateway `chat.abort`.
 * Accepts { sessionKey?: string } in the request body.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const requestedSessionKey =
    typeof body?.sessionKey === "string" && body.sessionKey.trim()
      ? body.sessionKey.trim()
      : "main";

  const config = await detectGateway();
  if (!config?.token) {
    return Response.json(
      { error: "OpenClaw gateway not configured. Check ~/.openclaw/openclaw.json" },
      { status: 500 },
    );
  }

  const sessionKey = await resolveSessionKey(requestedSessionKey, { timeoutMs: 4_000 });

  try {
    await gatewayWS.ensureConnected(8_000);
    await gatewayWS.sendRPC("chat.abort", { sessionKey }, 8_000);
    return Response.json({ ok: true });
  } catch (err) {
    // Fallback to one-shot request
    try {
      await gatewayRequest({
        method: "chat.abort",
        params: { sessionKey },
        timeoutMs: 8_000,
      });
      return Response.json({ ok: true });
    } catch (fallbackErr) {
      return Response.json(
        { error: `chat.abort failed: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}` },
        { status: 500 },
      );
    }
  }
}
