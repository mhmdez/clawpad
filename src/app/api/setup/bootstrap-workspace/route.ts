/**
 * POST /api/setup/bootstrap-workspace
 *
 * Creates a workspace structure in batch — spaces + initial pages.
 * Used by the onboarding flow to scaffold domain-specific workspaces.
 *
 * Body: { spaces: [{ name, icon?, color? }], pages?: [{ path, content }] }
 */

import { NextResponse } from "next/server";
import { createSpace, writePage } from "@/lib/files";
import { getPagesDir } from "@/lib/files/paths";
import fs from "fs/promises";
import path from "path";

interface SpaceInput {
  name: string;
  icon?: string;
  color?: string;
}

interface PageInput {
  /** Path relative to pages root, e.g. "infrastructure/welcome.md" */
  path: string;
  content: string;
}

interface BootstrapRequest {
  spaces: SpaceInput[];
  pages?: PageInput[];
}

export async function POST(request: Request) {
  try {
    const signalPath = path.join(getPagesDir(), ".clawpad-needs-setup");
    const body = (await request.json()) as BootstrapRequest;

    if (!body.spaces || !Array.isArray(body.spaces) || body.spaces.length === 0) {
      return NextResponse.json({ error: "spaces array is required" }, { status: 400 });
    }

    const results = {
      spaces: [] as { name: string; status: "created" | "exists" | "error"; error?: string }[],
      pages: [] as { path: string; status: "created" | "error"; error?: string }[],
    };

    // Create spaces
    for (const space of body.spaces) {
      try {
        await createSpace(space.name, {
          name: space.name,
          icon: space.icon,
          color: space.color,
        });
        results.spaces.push({ name: space.name, status: "created" });
      } catch (err) {
        const msg = (err as Error).message;
        if (msg.includes("already exists") || msg.includes("EEXIST")) {
          results.spaces.push({ name: space.name, status: "exists" });
        } else {
          results.spaces.push({ name: space.name, status: "error", error: msg });
        }
      }
    }

    // Create pages
    if (body.pages && Array.isArray(body.pages)) {
      for (const page of body.pages) {
        try {
          await writePage(page.path, page.content);
          results.pages.push({ path: page.path, status: "created" });
        } catch (err) {
          results.pages.push({
            path: page.path,
            status: "error",
            error: (err as Error).message,
          });
        }
      }
    }

    await fs.rm(signalPath, { force: true }).catch(() => {});
    return NextResponse.json(results, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
