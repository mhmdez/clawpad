import { NextResponse } from "next/server";
import { listChangeSets, pruneOldChangeSets } from "@/lib/changes/storage";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sessionKey = url.searchParams.get("sessionKey");
  if (!sessionKey) {
    return NextResponse.json({ error: "Missing sessionKey" }, { status: 400 });
  }

  await pruneOldChangeSets(sessionKey);
  const changes = await listChangeSets(sessionKey);
  return NextResponse.json(changes);
}
