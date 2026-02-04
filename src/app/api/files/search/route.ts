import { NextResponse } from "next/server";
import { searchPages } from "@/lib/files";

/**
 * GET /api/files/search?q=query&space=optional&limit=20
 *
 * Basic text search with relevance scoring.
 * Returns results with title, path, snippet, space, score, modified date, and match type.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = url.searchParams.get("q") ?? "";
    const space = url.searchParams.get("space") ?? undefined;
    const limit = parseInt(url.searchParams.get("limit") ?? "20", 10);

    if (!query.trim()) {
      return NextResponse.json([]);
    }

    const results = await searchPages(query, { space, limit });
    return NextResponse.json(results);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
