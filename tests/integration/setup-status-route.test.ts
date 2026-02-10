import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { ensureDirectories, writePage } from "@/lib/files";
import { GET as getSetupStatusRoute } from "@/app/api/setup/status/route";

test("setup status route supports includeCounts and setup signal", async () => {
  const previousPagesDir = process.env.CLAWPAD_PAGES_DIR;
  const previousOpenClawDir = process.env.CLAWPAD_OPENCLAW_DIR;
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "clawpad-setup-status-test-"));
  const pagesDir = path.join(tempRoot, "pages");

  process.env.CLAWPAD_OPENCLAW_DIR = tempRoot;
  process.env.CLAWPAD_PAGES_DIR = pagesDir;

  try {
    await ensureDirectories();
    await writePage("inbox", "# Inbox\n");
    await fs.writeFile(
      path.join(pagesDir, ".clawpad-needs-setup"),
      JSON.stringify({ created: new Date().toISOString() }),
      "utf-8",
    );

    const fastReq = new NextRequest("http://localhost/api/setup/status");
    const fastResponse = await getSetupStatusRoute(fastReq);
    const fast = (await fastResponse.json()) as {
      hasWorkspace: boolean;
      hasGateway: boolean;
      needsSetupSignal: boolean;
      totalPages?: number;
      totalSpaces?: number;
    };

    assert.equal(fast.hasWorkspace, true);
    assert.equal(fast.needsSetupSignal, true);
    assert.equal("totalPages" in fast, false);
    assert.equal("totalSpaces" in fast, false);

    const detailedReq = new NextRequest(
      "http://localhost/api/setup/status?includeCounts=true",
    );
    const detailedResponse = await getSetupStatusRoute(detailedReq);
    const detailed = (await detailedResponse.json()) as {
      hasWorkspace: boolean;
      totalPages?: number;
      totalSpaces?: number;
      needsSetupSignal: boolean;
    };

    assert.equal(detailed.hasWorkspace, true);
    assert.equal(detailed.needsSetupSignal, true);
    assert.equal(typeof detailed.totalPages, "number");
    assert.equal(typeof detailed.totalSpaces, "number");
    assert.ok((detailed.totalPages ?? 0) >= 1);
    assert.ok((detailed.totalSpaces ?? 0) >= 1);
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
