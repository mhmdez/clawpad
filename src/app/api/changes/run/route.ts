import { NextResponse } from "next/server";
import { buildBaseline, clearBaseline } from "@/lib/changes/baseline";
import { ensureChangeSet, finalizeChangeSet } from "@/lib/changes/service";
import { pruneOldChangeSets } from "@/lib/changes/storage";

export const dynamic = "force-dynamic";

interface RunBody {
  sessionKey?: string;
  runId?: string;
  status?: "start" | "end";
  startedAt?: string;
  endedAt?: string;
}

export async function POST(request: Request) {
  let body: RunBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { sessionKey, runId, status, startedAt, endedAt } = body;
  if (!sessionKey || !runId || !status) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  await pruneOldChangeSets(sessionKey);

  if (status === "start") {
    await ensureChangeSet(sessionKey, runId, "active", startedAt);
    await buildBaseline(sessionKey, runId);
    return NextResponse.json({ ok: true });
  }

  const changeSet = await finalizeChangeSet(sessionKey, runId, endedAt);
  clearBaseline(sessionKey, runId);
  return NextResponse.json({ ok: true, changeSet });
}
