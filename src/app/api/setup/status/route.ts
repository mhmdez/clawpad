import { NextRequest, NextResponse } from "next/server";
import { isWorkspaceBootstrapped, listSpaces, listAllPages } from "@/lib/files";
import { getPagesDir } from "@/lib/files/paths";
import { readOnboardingSentinel } from "@/lib/setup/onboarding-sentinel";
import fs from "fs/promises";
import path from "path";
import os from "os";

async function detectGateway(): Promise<boolean> {
  // Check config files for gateway existence
  const configPaths = [
    path.join(os.homedir(), ".openclaw", "openclaw.json"),
    path.join(os.homedir(), ".clawdbot", "clawdbot.json"),
  ];

  for (const p of configPaths) {
    try {
      await fs.access(p);
      return true;
    } catch {
      // continue
    }
  }

  return false;
}

export async function GET(request: NextRequest) {
  try {
    const includeCounts = request.nextUrl.searchParams.get("includeCounts") === "true";

    const [hasWorkspace, hasGateway, needsSetupSignal] = await Promise.all([
      isWorkspaceBootstrapped(),
      detectGateway(),
      detectSetupSignal(),
    ]);

    let totalPages = 0;
    let totalSpaces = 0;
    if (includeCounts) {
      try {
        const spaces = await listSpaces();
        totalSpaces = spaces.length;
        const pages = await listAllPages();
        totalPages = pages.length;
      } catch {
        // silent
      }
    }

    return NextResponse.json({
      hasWorkspace,
      hasGateway,
      needsSetupSignal,
      ...(includeCounts ? { totalPages, totalSpaces } : {}),
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}

async function detectSetupSignal(): Promise<boolean> {
  const signalPath = path.join(getPagesDir(), ".clawpad-needs-setup");

  try {
    const raw = await fs.readFile(signalPath, "utf-8");
    const payload = JSON.parse(raw) as { reason?: string };

    // Explicit manual setup requests should always open setup.
    if (payload?.reason === "cli-setup-flag") {
      return true;
    }

    const sentinel = await readOnboardingSentinel();
    if (sentinel.exists) {
      // Self-heal stale first-run signals after onboarding is already complete.
      await fs.rm(signalPath, { force: true }).catch(() => {});
      return false;
    }

    return true;
  } catch {
    return false;
  }
}
