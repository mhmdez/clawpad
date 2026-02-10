import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createSpace, ensureDirectories, writePage } from "@/lib/files";
import { GET as getSpacePagesRoute } from "@/app/api/files/spaces/[space]/pages/route";

test("space pages route supports encoded space params", async () => {
  const previousPagesDir = process.env.CLAWPAD_PAGES_DIR;
  const previousOpenClawDir = process.env.CLAWPAD_OPENCLAW_DIR;
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "clawpad-space-pages-encoded-"));

  process.env.CLAWPAD_OPENCLAW_DIR = tempRoot;
  process.env.CLAWPAD_PAGES_DIR = path.join(tempRoot, "pages");

  try {
    await ensureDirectories();
    await createSpace("Client Docs", { name: "Client Docs" });
    await writePage("Client Docs/Welcome", "# Welcome\n");

    const request = new Request("http://localhost/api/files/spaces/Client%20Docs/pages?recursive=true");
    const response = await getSpacePagesRoute(request, {
      params: Promise.resolve({ space: "Client%20Docs" }),
    });

    assert.equal(response.status, 200);
    const pages = (await response.json()) as Array<{ path: string }>;
    assert.ok(pages.some((page) => page.path === "Client Docs/Welcome.md"));
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

test("space pages route resolves display name to canonical path", async () => {
  const previousPagesDir = process.env.CLAWPAD_PAGES_DIR;
  const previousOpenClawDir = process.env.CLAWPAD_OPENCLAW_DIR;
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "clawpad-space-pages-display-name-"));

  process.env.CLAWPAD_OPENCLAW_DIR = tempRoot;
  process.env.CLAWPAD_PAGES_DIR = path.join(tempRoot, "pages");

  try {
    await ensureDirectories();
    await createSpace("client-docs", { name: "Client Docs" });
    await writePage("client-docs/overview", "# Overview\n");

    const request = new Request("http://localhost/api/files/spaces/Client%20Docs/pages?recursive=true");
    const response = await getSpacePagesRoute(request, {
      params: Promise.resolve({ space: "Client Docs" }),
    });

    assert.equal(response.status, 200);
    const pages = (await response.json()) as Array<{ path: string }>;
    assert.ok(pages.some((page) => page.path === "client-docs/overview.md"));
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
