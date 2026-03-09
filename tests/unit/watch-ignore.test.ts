import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { shouldIgnoreWatchPath, toRelativeWatchPath } from "@/lib/files/watch-ignore";

test("watch ignore does not treat parent dot-directories as hidden children", () => {
  const root = path.join("/Users", "me", ".openclaw", "workspace", "pages");
  const filePath = path.join(root, "general", "note.md");

  assert.equal(shouldIgnoreWatchPath(root, filePath), false);
  assert.equal(toRelativeWatchPath(root, filePath), "general/note.md");
});

test("watch ignore skips hidden files within pages root", () => {
  const root = path.join("/tmp", "clawpad", "pages");
  const hiddenPath = path.join(root, ".obsidian", "plugins.md");

  assert.equal(shouldIgnoreWatchPath(root, hiddenPath), true);
});

test("watch ignore skips _space.yml metadata files", () => {
  const root = path.join("/tmp", "clawpad", "pages");
  const metadataPath = path.join(root, "general", "_space.yml");

  assert.equal(shouldIgnoreWatchPath(root, metadataPath), true);
});

test("relative watch path returns null for paths outside the watched root", () => {
  const root = path.join("/tmp", "clawpad", "pages");
  const outside = path.join("/tmp", "clawpad", "other", "file.md");

  assert.equal(toRelativeWatchPath(root, outside), null);
});
