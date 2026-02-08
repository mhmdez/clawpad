import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createSpace, ensureDirectories, writePage } from "@/lib/files";
import { ROOT_SPACE_PATH } from "@/lib/files/constants";
import { GET as getSpacesRoute } from "@/app/api/files/spaces/route";

test("spaces route includes root-space discriminator and counts", async () => {
  const previousPagesDir = process.env.CLAWPAD_PAGES_DIR;
  const previousOpenClawDir = process.env.CLAWPAD_OPENCLAW_DIR;
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "clawpad-spaces-test-"));

  process.env.CLAWPAD_OPENCLAW_DIR = tempRoot;
  process.env.CLAWPAD_PAGES_DIR = path.join(tempRoot, "pages");

  try {
    await ensureDirectories();
    await writePage("inbox", "# Inbox\n");
    await createSpace("projects", { name: "Projects" });
    await writePage("projects/alpha", "# Alpha\n");

    const response = await getSpacesRoute();
    const spaces = (await response.json()) as Array<{
      path: string;
      kind?: "root" | "space";
      pageCount: number;
    }>;

    const root = spaces.find((space) => space.path === ROOT_SPACE_PATH);
    assert.ok(root, "expected root space entry");
    assert.equal(root?.kind, "root");
    assert.equal(root?.pageCount, 1);

    const projects = spaces.find((space) => space.path === "projects");
    assert.ok(projects, "expected projects space entry");
    assert.equal(projects?.kind, "space");
    assert.equal(projects?.pageCount, 1);
  } finally {
    if (previousPagesDir === undefined) {
      delete process.env.CLAWPAD_PAGES_DIR;
    } else {
      process.env.CLAWPAD_PAGES_DIR = previousPagesDir;
    }

    if (previousOpenClawDir === undefined) {
      delete process.env.CLAWPAD_OPENCLAW_DIR;
    } else {
      process.env.CLAWPAD_OPENCLAW_DIR = previousOpenClawDir;
    }

    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
