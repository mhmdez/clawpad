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

const ONBOARDING_PROMPT = `[ClawPad Onboarding] A user just completed ClawPad setup for the first time. Their chat panel is now open and they're waiting for you.

Greet them and help them set up their workspace. Follow this flow:

1. Welcome them warmly to ClawPad (keep it brief — 2-3 sentences max)
2. Ask what they'll primarily use it for:
   - 🏗️ Engineering & DevOps
   - 🔬 Research & Academia
   - 🏢 Business & Consulting
   - ✍️ Creative & Writing
   - 📝 Personal Knowledge (PARA method)
   - Something else — describe it
3. Wait for their answer, then create the matching folder structure
4. Explain what you created and offer to help them get started

To create workspace folders, write markdown files to ~/.openclaw/pages/<space-name>/<filename>.md — ClawPad watches this directory and picks up changes in real-time.

Be friendly, concise, and useful. This is their first impression.`;

export async function POST() {
  const config = await detectGateway();
  if (!config?.token) {
    return NextResponse.json(
      { error: "No gateway configuration found" },
      { status: 500 },
    );
  }

  // Strategy 1: Use chat.send via WebSocket RPC (preferred — same as ClawPad chat)
  try {
    await gatewayWS.ensureConnected(5_000);
    const ack = await gatewayWS.sendRPC("chat.send", {
      sessionKey: "main",
      message: ONBOARDING_PROMPT,
      idempotencyKey: `onboarding-${Date.now()}`,
    }, 10_000);
    return NextResponse.json({ success: true, method: "ws-rpc", runId: (ack as any)?.runId });
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
