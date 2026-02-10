import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ensureDirectories, isWorkspaceBootstrapped } from "@/lib/files";
import { GET as getSetupStatusRoute } from "@/app/api/setup/status/route";
import { POST as postBootstrapRoute } from "@/app/api/setup/bootstrap/route";
import { NextRequest } from "next/server";

test("bootstrap route clears .clawpad-needs-setup signal", async () => {
  const previousPagesDir = process.env.CLAWPAD_PAGES_DIR;
  const previousOpenClawDir = process.env.CLAWPAD_OPENCLAW_DIR;
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "clawpad-bootstrap-test-"));
  const pagesDir = path.join(tempRoot, "pages");
  const signalPath = path.join(pagesDir, ".clawpad-needs-setup");

  process.env.CLAWPAD_OPENCLAW_DIR = tempRoot;
  process.env.CLAWPAD_PAGES_DIR = pagesDir;

  try {
    await ensureDirectories();
    await fs.writeFile(signalPath, JSON.stringify({ created: new Date().toISOString() }), "utf-8");

    const beforeReq = new NextRequest("http://localhost/api/setup/status");
    const beforeRes = await getSetupStatusRoute(beforeReq);
    const before = (await beforeRes.json()) as { needsSetupSignal: boolean; hasWorkspace: boolean };
    assert.equal(before.needsSetupSignal, true);
    assert.equal(before.hasWorkspace, false);

    const bootstrapRes = await postBootstrapRoute();
    assert.equal(bootstrapRes.status, 200);
    assert.equal(await isWorkspaceBootstrapped(), true);

    const afterReq = new NextRequest("http://localhost/api/setup/status");
    const afterRes = await getSetupStatusRoute(afterReq);
    const after = (await afterRes.json()) as { needsSetupSignal: boolean; hasWorkspace: boolean };
    assert.equal(after.hasWorkspace, true);
    assert.equal(after.needsSetupSignal, false);
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
