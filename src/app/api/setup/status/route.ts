import { NextRequest, NextResponse } from "next/server";
import { isWorkspaceBootstrapped, listSpaces, listAllPages } from "@/lib/files";
import { getPagesDir } from "@/lib/files/paths";
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
  try {
    const signalPath = path.join(getPagesDir(), ".clawpad-needs-setup");
    await fs.access(signalPath);
    return true;
  } catch {
    return false;
  }
}
