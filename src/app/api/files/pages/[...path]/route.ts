import { NextRequest, NextResponse } from "next/server";
import { readPage, writePage, deletePage } from "@/lib/files";
import { FileSystemError } from "@/lib/files/types";

interface RouteContext {
  params: Promise<{ path: string[] }>;
}

/**
 * GET /api/files/pages/:path — Read a page
 */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { path: segments } = await ctx.params;
  const filePath = segments.map(decodeURIComponent).join("/");

  try {
    const page = await readPage(filePath);
    return NextResponse.json(page);
  } catch (err) {
    if (err instanceof FileSystemError && err.code === "NOT_FOUND") {
      return NextResponse.json({ error: "Page not found" }, { status: 404 });
    }
    console.error("GET /api/files/pages error:", err);
    return NextResponse.json(
      { error: "Failed to read page" },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/files/pages/:path — Update (or create) a page
 *
 * Body: { content: string, meta?: Partial<PageMeta> }
 */
export async function PUT(req: NextRequest, ctx: RouteContext) {
  const { path: segments } = await ctx.params;
  const filePath = segments.map(decodeURIComponent).join("/");

  let body: { content: string; meta?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.content !== "string") {
    return NextResponse.json(
      { error: "Missing 'content' field" },
      { status: 400 },
    );
  }

  try {
    const pageMeta = await writePage(filePath, body.content, body.meta);
    return NextResponse.json({ meta: pageMeta });
  } catch (err) {
    if (err instanceof FileSystemError) {
      const status = err.code === "INVALID_PATH" || err.code === "PATH_TRAVERSAL" ? 400 : 500;
      return NextResponse.json({ error: err.message }, { status });
    }
    console.error("PUT /api/files/pages error:", err);
    return NextResponse.json(
      { error: "Failed to write page" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/files/pages/:path — Trash a page
 */
export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const { path: segments } = await ctx.params;
  const filePath = segments.map(decodeURIComponent).join("/");

  try {
    await deletePage(filePath);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof FileSystemError && err.code === "NOT_FOUND") {
      return NextResponse.json({ error: "Page not found" }, { status: 404 });
    }
    console.error("DELETE /api/files/pages error:", err);
    return NextResponse.json(
      { error: "Failed to delete page" },
      { status: 500 },
    );
  }
}
