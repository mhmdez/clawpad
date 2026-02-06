import { NextResponse } from "next/server";
import { decodeChangeSetId, pruneOldChangeSets, readChangeSet } from "@/lib/changes/storage";
import { buildUndoChangeSet, revertChangeSet } from "@/lib/changes/service";

export const dynamic = "force-dynamic";

interface RevertBody {
  changeSetId?: string;
  mode?: "all" | "file" | "hunk";
  path?: string;
  hunkId?: string;
}

export async function POST(request: Request) {
  let body: RevertBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { changeSetId, mode, path, hunkId } = body;
  if (!changeSetId || !mode) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  let sessionKey: string;
  let runId: string;
  try {
    const decoded = decodeChangeSetId(changeSetId);
    sessionKey = decoded.sessionKey;
    runId = decoded.runId;
  } catch {
    return NextResponse.json({ error: "Invalid change set id" }, { status: 400 });
  }

  await pruneOldChangeSets(sessionKey);
  const changeSet = await readChangeSet(sessionKey, runId);
  if (!changeSet) {
    return NextResponse.json({ error: "Change set not found" }, { status: 404 });
  }

  const snapshot = mode === "all" ? JSON.parse(JSON.stringify(changeSet)) : null;

  const { applied, changeSet: updated } = await revertChangeSet({
    changeSet,
    mode,
    path,
    hunkId,
  });

  if (!applied) {
    return NextResponse.json({ error: "Could not apply undo" }, { status: 409 });
  }

  let undoChangeSet = null;
  if (mode === "all") {
    undoChangeSet = await buildUndoChangeSet(snapshot ?? changeSet);
  }

  return NextResponse.json({ ok: true, changeSet: updated, undoChangeSet });
}
