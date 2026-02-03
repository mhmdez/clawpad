import { NextResponse } from "next/server";
import { bootstrapWorkspace, isWorkspaceBootstrapped } from "@/lib/files";

export async function POST() {
  try {
    const alreadyBootstrapped = await isWorkspaceBootstrapped();
    if (alreadyBootstrapped) {
      return NextResponse.json({ success: true, message: "Workspace already exists" });
    }

    await bootstrapWorkspace();
    return NextResponse.json({ success: true, message: "Workspace created" });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
