import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { searchPages } from "@/lib/files";
import { getPagesDir } from "@/lib/files/paths";
import { parseLimit } from "@/lib/utils/params";

const execAsync = promisify(execFile);

interface SearchResult {
  title: string;
  path: string;
  snippet: string;
  score?: number;
  space: string;
  modified?: string;
  matchType?: string;
}

/**
 * GET /api/search?q=query&mode=auto|basic|semantic&limit=20&space=optional
 *
 * Unified search endpoint.
 * - mode=auto (default): tries QMD first, falls back to basic
 * - mode=semantic: QMD only, errors if unavailable
 * - mode=basic: grep-based text search only
 *
 * QMD uses `qmd query` for hybrid BM25 + vector search.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = url.searchParams.get("q") ?? "";
    const mode = url.searchParams.get("mode") ?? "auto";
    const space = url.searchParams.get("space") ?? undefined;
    const limit = parseLimit(url.searchParams.get("limit"), 20, 100);

    if (!query.trim()) {
      return NextResponse.json({ results: [], mode: "basic" });
    }

    // Try QMD for semantic or auto modes
    if (mode === "semantic" || mode === "auto") {
      const qmdResults = await tryQmdSearch(query, limit);
      if (qmdResults) {
        // Filter by space if specified
        const filtered = space
          ? qmdResults.filter((r) => r.space === space)
          : qmdResults;
        return NextResponse.json({
          results: filtered.slice(0, limit),
          mode: "semantic",
        });
      }
      if (mode === "semantic") {
        return NextResponse.json(
          {
            error: "QMD is not available. Install QMD for semantic search.",
            results: [],
            mode: "unavailable",
          },
          { status: 503 },
        );
      }
      // mode=auto falls through to basic
    }

    // Basic search
    const basicResults = await searchPages(query, { space, limit });
    const results: SearchResult[] = basicResults.map((r) => ({
      title: r.title,
      path: r.path,
      snippet: r.snippet,
      score: r.score,
      space: r.space,
      modified: r.modified,
      matchType: r.matchType,
    }));

    return NextResponse.json({ results, mode: "basic" });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message, results: [], mode: "basic" },
      { status: 500 },
    );
  }
}

/**
 * Try to run QMD search. Uses `qmd query` for hybrid BM25 + vector search.
 * Returns null if QMD is not installed or the command fails.
 */
async function tryQmdSearch(query: string, limit: number): Promise<SearchResult[] | null> {
  try {
    const pagesDir = getPagesDir();

    // Use `qmd query` for hybrid search (BM25 + vector)
    const { stdout } = await execAsync("qmd", ["query", query, "--json", "-n", String(limit)], {
      cwd: pagesDir,
      timeout: 15000,
      env: { ...process.env, QMD_DIR: pagesDir },
    });

    const parsed = JSON.parse(stdout);

    // QMD output format varies — handle both array and object with results key
    const items: Array<{
      path?: string;
      file?: string;
      score?: number;
      snippet?: string;
      content?: string;
      title?: string;
      modified?: string;
    }> = Array.isArray(parsed) ? parsed : parsed.results ?? [];

    const results: SearchResult[] = items.map((item) => {
      const filePath = item.path ?? item.file ?? "";
      // Convert absolute path to relative if needed
      const relativePath = filePath.startsWith(pagesDir)
        ? filePath.slice(pagesDir.length + 1)
        : filePath;
      // Extract space from first path segment
      const space = relativePath.split("/")[0] ?? "";

      return {
        title: item.title ?? extractTitleFromPath(relativePath),
        path: relativePath,
        snippet: item.snippet ?? item.content?.slice(0, 200) ?? "",
        score: item.score,
        space,
        modified: item.modified,
      };
    });

    return results;
  } catch {
    // QMD not installed or command failed
    return null;
  }
}

/** Extract a display title from a file path */
function extractTitleFromPath(filePath: string): string {
  const base = filePath.split("/").pop() ?? filePath;
  return base
    .replace(/\.md$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
