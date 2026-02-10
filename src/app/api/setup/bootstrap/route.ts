import { NextResponse } from "next/server";
import { bootstrapWorkspace, isWorkspaceBootstrapped } from "@/lib/files";
import { getPagesDir } from "@/lib/files/paths";
import { ensureWelcomeToClawPadPage } from "@/lib/setup/workspace-templates";
import fs from "fs/promises";
import path from "path";

export async function POST() {
  try {
    const signalPath = path.join(getPagesDir(), ".clawpad-needs-setup");
    const alreadyBootstrapped = await isWorkspaceBootstrapped();
    if (alreadyBootstrapped) {
      const welcomePage = await ensureWelcomeToClawPadPage();
      await fs.rm(signalPath, { force: true }).catch(() => {});
      return NextResponse.json({ success: true, message: "Workspace already exists", welcomePage });
    }

    await bootstrapWorkspace();
    const welcomePage = await ensureWelcomeToClawPadPage();
    await fs.rm(signalPath, { force: true }).catch(() => {});
    return NextResponse.json({ success: true, message: "Workspace created", welcomePage });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
