import test from "node:test";
import assert from "node:assert/strict";
import { useChangesStore } from "@/lib/stores/changes";

function resetChangesState() {
  useChangesStore.setState({
    sessionKey: null,
    activeRun: null,
    activeFiles: new Set<string>(),
    lastFileTouchAt: null,
    changeSets: [],
    review: { open: false, changeSetId: null, filePath: null },
    dismissed: new Set<string>(),
    loading: false,
    error: undefined,
  });
}

test("changes store tracks last file touch timestamp", () => {
  resetChangesState();
  const store = useChangesStore.getState();

  store.touchFile("projects/doc.md");
  const state = useChangesStore.getState();

  assert.equal(state.activeFiles.has("projects/doc.md"), true);
  assert.equal(typeof state.lastFileTouchAt, "number");
});

test("changes store clears last file touch timestamp", () => {
  resetChangesState();
  const store = useChangesStore.getState();

  store.touchFile("projects/doc.md");
  assert.equal(typeof useChangesStore.getState().lastFileTouchAt, "number");

  store.clearActiveFiles();
  assert.equal(useChangesStore.getState().lastFileTouchAt, null);
});

test("setActiveRun(null) resets file activity timestamp", () => {
  resetChangesState();
  const store = useChangesStore.getState();

  store.setActiveRun({ runId: "run-1", sessionKey: "main", startedAt: Date.now() });
  store.touchFile("projects/doc.md");
  assert.equal(typeof useChangesStore.getState().lastFileTouchAt, "number");

  store.setActiveRun(null);
  assert.equal(useChangesStore.getState().lastFileTouchAt, null);
});
