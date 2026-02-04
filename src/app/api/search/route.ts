import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { searchPages } from "@/lib/files";
import { getPagesDir } from "@/lib/files/paths";

const execAsync = promisify(exec);

interface SearchResult {
  title: string;
  path: string;
  snippet: string;
  score?: number;
  space: string;
}

/**
 * GET /api/search?q=query&mode=basic|semantic&limit=20
 *
 * Unified search endpoint. Uses basic grep-based search by default,
 * or QMD semantic search when mode=semantic and QMD is installed.
 * Falls back to basic search if QMD is unavailable.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = url.searchParams.get("q") ?? "";
    const mode = url.searchParams.get("mode") ?? "basic";
    const limit = parseInt(url.searchParams.get("limit") ?? "20", 10);

    if (!query.trim()) {
      return NextResponse.json({ results: [], mode: "basic" });
    }

    if (mode === "semantic") {
      const qmdResults = await tryQmdSearch(query, limit);
      if (qmdResults) {
        return NextResponse.json({ results: qmdResults, mode: "semantic" });
      }
      // Fall through to basic if QMD fails
    }

    // Basic search
    const basicResults = await searchPages(query, { limit });
    const results: SearchResult[] = basicResults.map((r) => ({
      title: r.title,
      path: r.path,
      snippet: r.snippet,
      space: r.space,
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
 * Try to run QMD semantic search. Returns null if QMD is not installed
 * or the command fails.
 */
async function tryQmdSearch(
  query: string,
  limit: number,
): Promise<SearchResult[] | null> {
  try {
    const pagesDir = getPagesDir();
    const safeQuery = query.replace(/"/g, '\\"');

    const { stdout } = await execAsync(
      `qmd search --json --limit ${limit} "${safeQuery}"`,
      {
        cwd: pagesDir,
        timeout: 15000,
        env: { ...process.env, QMD_DIR: pagesDir },
      },
    );

    const parsed = JSON.parse(stdout);

    // QMD returns an array of results with file paths, scores, and snippets
    const items: Array<{
      path?: string;
      file?: string;
      score?: number;
      snippet?: string;
      content?: string;
      title?: string;
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
      };
    });

    return results;
  } catch {
    // QMD not installed or command failed — return null to fall back
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
