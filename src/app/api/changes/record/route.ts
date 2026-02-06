import { NextResponse } from "next/server";
import { recordFileChange } from "@/lib/changes/service";
import { pruneOldChangeSets } from "@/lib/changes/storage";

export const dynamic = "force-dynamic";

interface RecordBody {
  sessionKey?: string;
  runId?: string;
  path?: string;
  eventType?: "file-added" | "file-changed" | "file-removed";
  timestamp?: number;
}

export async function POST(request: Request) {
  let body: RecordBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { sessionKey, runId, path, eventType, timestamp } = body;
  if (!sessionKey || !runId || !path || !eventType) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  await pruneOldChangeSets(sessionKey);
  const changeSet = await recordFileChange({
    sessionKey,
    runId,
    path,
    eventType,
    timestamp,
  });
  return NextResponse.json({ ok: true, changeSet });
}
