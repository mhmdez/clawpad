import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createSpace, deletePage, ensureDirectories, writePage } from "@/lib/files";
import { buildBaseline, clearBaseline } from "@/lib/changes/baseline";
import {
  ensureChangeSet,
  finalizeChangeSet,
  recordFileChange,
} from "@/lib/changes/service";

function restoreEnvVar(name: string, previous: string | undefined): void {
  if (previous === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = previous;
}

test("finalizeChangeSet reconciles filesystem changes even when file events were missed", async () => {
  const previousOpenClawDir = process.env.CLAWPAD_OPENCLAW_DIR;
  const previousPagesDir = process.env.CLAWPAD_PAGES_DIR;
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "clawpad-changes-reconcile-"));
  const sessionKey = "agent:main:reconcile";
  const runId = `run-${Date.now()}-missed`;

  process.env.CLAWPAD_OPENCLAW_DIR = tempRoot;
  process.env.CLAWPAD_PAGES_DIR = path.join(tempRoot, "pages");

  try {
    await ensureDirectories();
    await createSpace("general", { name: "General" });
    await writePage("general/note", "before\n");

    await ensureChangeSet(sessionKey, runId, "active");
    await buildBaseline(sessionKey, runId);

    // Simulate an agent write when the watcher event was lost.
    await writePage("general/note", "after\n");

    const finalized = await finalizeChangeSet(sessionKey, runId);
    assert.ok(finalized);
    assert.equal(finalized?.status, "completed");
    assert.equal(finalized?.files.length, 1);
    assert.equal(finalized?.files[0]?.path, "general/note.md");
    assert.equal(finalized?.files[0]?.beforeContent, "before\n");
    assert.equal(finalized?.files[0]?.afterContent, "after\n");
    assert.ok((finalized?.files[0]?.stats?.additions ?? 0) > 0);
  } finally {
    clearBaseline(sessionKey, runId);
    restoreEnvVar("CLAWPAD_OPENCLAW_DIR", previousOpenClawDir);
    restoreEnvVar("CLAWPAD_PAGES_DIR", previousPagesDir);
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("finalizeChangeSet removes no-op create/delete churn captured by watcher events", async () => {
  const previousOpenClawDir = process.env.CLAWPAD_OPENCLAW_DIR;
  const previousPagesDir = process.env.CLAWPAD_PAGES_DIR;
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "clawpad-changes-noop-"));
  const sessionKey = "agent:main:no-op";
  const runId = `run-${Date.now()}-noop`;

  process.env.CLAWPAD_OPENCLAW_DIR = tempRoot;
  process.env.CLAWPAD_PAGES_DIR = path.join(tempRoot, "pages");

  try {
    await ensureDirectories();
    await createSpace("general", { name: "General" });

    await ensureChangeSet(sessionKey, runId, "active");
    await buildBaseline(sessionKey, runId);

    await writePage("general/temp", "temporary\n");
    await recordFileChange({
      sessionKey,
      runId,
      path: "general/temp.md",
      eventType: "file-added",
    });

    await deletePage("general/temp");
    await recordFileChange({
      sessionKey,
      runId,
      path: "general/temp.md",
      eventType: "file-removed",
    });

    const finalized = await finalizeChangeSet(sessionKey, runId);
    assert.ok(finalized);
    assert.equal(finalized?.files.length, 0);
    assert.deepEqual(finalized?.totals, {
      additions: 0,
      deletions: 0,
      filesChanged: 0,
    });
  } finally {
    clearBaseline(sessionKey, runId);
    restoreEnvVar("CLAWPAD_OPENCLAW_DIR", previousOpenClawDir);
    restoreEnvVar("CLAWPAD_PAGES_DIR", previousPagesDir);
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
