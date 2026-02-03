import { NextResponse } from "next/server";
import { getRecentPages } from "@/lib/files";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") ?? "10", 10);
    const pages = await getRecentPages(limit);
    return NextResponse.json(pages);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
