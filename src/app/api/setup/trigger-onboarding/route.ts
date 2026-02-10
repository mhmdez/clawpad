/**
 * POST /api/setup/trigger-onboarding
 *
 * Triggers the OpenClaw agent to initiate workspace onboarding.
 * Uses chat.send WS RPC to send the prompt into the main session,
 * with fallback to /hooks/wake HTTP endpoint.
 */

import { NextResponse } from "next/server";
import { detectGateway } from "@/lib/gateway/detect";
import { gatewayWS } from "@/lib/gateway/ws-client";

const ONBOARDING_PROMPT = `[ClawPad Onboarding] A user completed ClawPad setup and needs workspace onboarding now.

Use the workspace-manager flow and run it conversationally:

1. Welcome briefly (2-3 sentences max).
2. Ask what they primarily use ClawPad for:
   - 🏗️ Engineering & DevOps
   - 🔬 Research & Academia
   - 🏢 Business & Consulting
   - ✍️ Creative & Writing
   - 📝 Personal Knowledge (PARA)
   - Other
3. Wait for their answer, then create the matching workspace structure.
4. Explain what was created and offer one concrete next step.
5. Ask whether they want semantic search help (QMD) after workspace setup is done.

Implementation constraints:
- Write docs directly under ~/.openclaw/pages/<space>/<file>.md (ClawPad watches this path).
- Include _space.yml metadata for each created space when appropriate.
- Keep responses concise and actionable.
- If files/spaces already exist, avoid destructive rewrites and continue incrementally.`;

export async function POST() {
  const config = await detectGateway();
  if (!config?.token) {
    return NextResponse.json({
      success: false,
      message: "Gateway token missing. User can start conversation manually.",
    });
  }

  // Strategy 1: Use chat.send via WebSocket RPC (preferred — same as ClawPad chat)
  try {
    await gatewayWS.ensureConnected(5_000);
    const ack = await gatewayWS.sendRPC<{ runId?: string }>("chat.send", {
      sessionKey: "main",
      message: ONBOARDING_PROMPT,
      idempotencyKey: `onboarding-${Date.now()}`,
    }, 10_000);
    return NextResponse.json({ success: true, method: "ws-rpc", runId: ack?.runId });
  } catch (wsErr) {
    console.warn("[trigger-onboarding] WS RPC failed, trying HTTP fallback:", wsErr);
  }

  // Strategy 2: Fallback to /hooks/wake HTTP endpoint
  try {
    const res = await fetch(`${config.url}/hooks/wake`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.token}`,
      },
      body: JSON.stringify({
        text: ONBOARDING_PROMPT,
        mode: "now",
      }),
    });

    if (res.ok) {
      return NextResponse.json({ success: true, method: "hooks-wake" });
    }

    // Hooks not enabled — not a hard failure, user can chat manually
    if ([404, 403, 405].includes(res.status)) {
      return NextResponse.json({
        success: false,
        message: "Agent trigger not available. User can start conversation manually.",
      });
    }

    return NextResponse.json(
      { error: `Hook failed: ${res.status}` },
      { status: 500 },
    );
  } catch (err) {
    console.error("[trigger-onboarding] All methods failed:", err);
    return NextResponse.json({
      success: false,
      message: "Could not reach agent. User can start conversation manually.",
    });
  }
}
