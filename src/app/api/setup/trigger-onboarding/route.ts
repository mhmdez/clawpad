/**
 * POST /api/setup/trigger-onboarding
 *
 * Triggers the OpenClaw agent to initiate the workspace onboarding conversation.
 * Uses the /hooks/wake webhook endpoint to make the agent send the first message.
 */

import { NextResponse } from "next/server";
import { detectGateway } from "@/lib/gateway/detect";

const ONBOARDING_PROMPT = `A user just set up ClawPad workspace for the first time.

Your task: Greet them warmly and help them customize their workspace structure.

Follow this conversation flow:
1. Welcome them to ClawPad
2. Ask what they'll primarily use it for:
   - Engineering & DevOps
   - Research & Academia
   - Business & Consulting
   - Creative & Writing
   - Personal Knowledge Management
   - Or describe their own use case
3. Based on their answer, create an appropriate folder structure with spaces
4. Explain the structure and offer to help them get started

Be friendly, concise, and helpful. This is their first interaction with you through ClawPad.`;

export async function POST() {
  try {
    const config = await detectGateway();

    if (!config) {
      return NextResponse.json(
        { error: "No gateway configuration found" },
        { status: 500 }
      );
    }

    // The webhook endpoint is at /hooks/wake
    // It requires hooks.enabled=true in OpenClaw config
    const webhookUrl = `${config.url}/hooks/wake`;

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Token can be passed via Authorization header or x-openclaw-token
        ...(config.token && { Authorization: `Bearer ${config.token}` }),
      },
      body: JSON.stringify({
        text: ONBOARDING_PROMPT,
        mode: "now", // Trigger immediately
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error("[trigger-onboarding] Webhook failed:", res.status, errorText);

      // If hooks are not enabled, fall back gracefully
      if (res.status === 404 || res.status === 403) {
        return NextResponse.json({
          success: false,
          message: "Webhook not available. User can start conversation manually.",
          hint: "Enable hooks in OpenClaw config: hooks.enabled=true",
        });
      }

      return NextResponse.json(
        { error: `Webhook failed: ${res.status}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[trigger-onboarding] Error:", error);
    return NextResponse.json(
      { error: "Failed to trigger onboarding" },
      { status: 500 }
    );
  }
}
