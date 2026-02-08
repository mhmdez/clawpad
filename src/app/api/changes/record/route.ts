import { NextResponse } from "next/server";
import { recordFileChange } from "@/lib/changes/service";
import { pruneOldChangeSets } from "@/lib/changes/storage";
import { FileSystemError } from "@/lib/files/types";

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
  if (typeof path !== "string") {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }
  const allowedEvents = new Set(["file-added", "file-changed", "file-removed"]);
  if (!allowedEvents.has(eventType)) {
    return NextResponse.json({ error: "Invalid event type" }, { status: 400 });
  }
  const safeTimestamp =
    typeof timestamp === "number" && Number.isFinite(timestamp)
      ? timestamp
      : undefined;

  try {
    await pruneOldChangeSets(sessionKey);
    const changeSet = await recordFileChange({
      sessionKey,
      runId,
      path,
      eventType,
      timestamp: safeTimestamp,
    });
    return NextResponse.json({ ok: true, changeSet });
  } catch (err) {
    if (
      err instanceof FileSystemError &&
      (err.code === "INVALID_PATH" || err.code === "PATH_TRAVERSAL")
    ) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Failed to record change" },
      { status: 500 },
    );
  }
}
