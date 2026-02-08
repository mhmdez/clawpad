import test from "node:test";
import assert from "node:assert/strict";
import { computeStats } from "@/lib/changes/diff";

test("computeStats counts appended lines", () => {
  const before = "alpha\\nbeta\\n";
  const after = "alpha\\nbeta\\ngamma\\n";

  const stats = computeStats(before, after);

  assert.ok(stats.additions > 0, "expected additions to be recorded");
});

test("computeStats counts removed lines", () => {
  const before = "alpha\\nbeta\\ngamma\\n";
  const after = "alpha\\ngamma\\n";

  const stats = computeStats(before, after);

  assert.ok(stats.deletions > 0, "expected deletions to be recorded");
});

test("computeStats returns zero for identical content", () => {
  const content = "line-1\nline-2\n";
  const stats = computeStats(content, content);

  assert.deepEqual(stats, { additions: 0, deletions: 0 });
});
