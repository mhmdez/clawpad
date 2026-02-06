import { NextResponse } from "next/server";
import { decodeChangeSetId, pruneOldChangeSets } from "@/lib/changes/storage";
import { loadChangeSetWithHunks } from "@/lib/changes/service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  let sessionKey: string;
  let runId: string;
  try {
    const decoded = decodeChangeSetId(id);
    sessionKey = decoded.sessionKey;
    runId = decoded.runId;
  } catch {
    return NextResponse.json({ error: "Invalid change set id" }, { status: 400 });
  }

  await pruneOldChangeSets(sessionKey);
  const changeSet = await loadChangeSetWithHunks(sessionKey, runId);
  if (!changeSet) {
    return NextResponse.json({ error: "Change set not found" }, { status: 404 });
  }
  return NextResponse.json(changeSet);
}
