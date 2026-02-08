import { NextResponse } from "next/server";
import { getRecentPages } from "@/lib/files";
import { parseLimit } from "@/lib/utils/params";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = parseLimit(url.searchParams.get("limit"), 10, 50);
    const pages = await getRecentPages(limit);
    return NextResponse.json(pages);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
