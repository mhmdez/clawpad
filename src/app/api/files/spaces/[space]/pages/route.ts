import { NextResponse } from "next/server";
import { listPages } from "@/lib/files";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ space: string }> },
) {
  try {
    const { space } = await params;
    const url = new URL(request.url);
    const recursive = url.searchParams.get("recursive") === "true";
    const pages = await listPages(space, { recursive });
    return NextResponse.json(pages);
  } catch (err) {
    const message = (err as Error).message;
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
