import fs from "fs/promises";
import { readPage, writePage, deletePage } from "@/lib/files";
import { resolvePagePath, validatePath } from "@/lib/files/paths";
import { FileSystemError } from "@/lib/files/types";
import type { ChangeFileEntry, ChangeSet } from "./types";
import { computeStats, computeHunks, buildReversePatch, applyReversePatch } from "./diff";
import {
  encodeChangeSetId,
  listChangeSets,
  readChangeSet,
  writeChangeSet,
  toSummary,
  updateSessionIndex,
} from "./storage";
import { getBaseline, MAX_FILE_SIZE } from "./baseline";

export async function ensureChangeSet(
  sessionKey: string,
  runId: string,
  status: ChangeSet["status"] = "active",
  startedAt?: string,
): Promise<ChangeSet> {
  const existing = await readChangeSet(sessionKey, runId);
  if (existing) return existing;
  const now = new Date().toISOString();
  const changeSet: ChangeSet = {
    id: encodeChangeSetId(sessionKey, runId),
    sessionKey,
    runId,
    status,
    startedAt: startedAt ?? now,
    updatedAt: now,
    files: [],
    totals: { additions: 0, deletions: 0, filesChanged: 0 },
  };
  await writeChangeSet(changeSet);
  await updateSessionIndex(toSummary(changeSet));
  return changeSet;
}

export async function finalizeChangeSet(
  sessionKey: string,
  runId: string,
  endedAt?: string,
): Promise<ChangeSet | null> {
  const changeSet = await readChangeSet(sessionKey, runId);
  if (!changeSet) return null;
  const now = new Date().toISOString();
  changeSet.status = "completed";
  changeSet.endedAt = endedAt ?? now;
  changeSet.updatedAt = now;
  changeSet.totals = computeTotals(changeSet.files);
  await writeChangeSet(changeSet);
  await updateSessionIndex(toSummary(changeSet));
  return changeSet;
}

export async function finalizeOrphanedRuns(
  sessionKey: string,
  excludeRunId?: string,
): Promise<string[]> {
  const summaries = await listChangeSets(sessionKey);
  const orphaned = summaries.filter(
    (summary) =>
      summary.status === "active" &&
      summary.runId !== excludeRunId,
  );

  const closed: string[] = [];
  for (const summary of orphaned) {
    const changeSet = await readChangeSet(sessionKey, summary.runId);
    if (!changeSet || changeSet.status !== "active") continue;
    const now = new Date().toISOString();
    changeSet.status = "completed";
    changeSet.endedAt = changeSet.endedAt ?? now;
    changeSet.updatedAt = now;
    changeSet.totals = computeTotals(changeSet.files);
    await writeChangeSet(changeSet);
    await updateSessionIndex(toSummary(changeSet));
    closed.push(summary.runId);
  }

  return closed;
}

export async function recordFileChange(params: {
  sessionKey: string;
  runId: string;
  path: string;
  eventType: "file-added" | "file-changed" | "file-removed";
  timestamp?: number;
}): Promise<ChangeSet> {
  const { sessionKey, runId, path: relPath, eventType } = params;
  if (!validatePath(relPath)) {
    throw new FileSystemError(`Invalid path: "${relPath}"`, "INVALID_PATH", relPath);
  }
  const changeSet = await ensureChangeSet(sessionKey, runId);

  const existing = changeSet.files.find((file) => file.path === relPath);
  let existsBefore = existing?.existsBefore ?? eventType !== "file-added";
  let existsAfter = existing?.existsAfter ?? eventType !== "file-removed";

  if (eventType === "file-added") {
    existsBefore = false;
    existsAfter = true;
  } else if (eventType === "file-removed") {
    existsAfter = false;
  }

  const baseline = getBaseline(sessionKey, runId, relPath);
  const beforeContent = existing?.beforeContent ??
    (existsBefore ? baseline?.content ?? "" : "");
  const tooLarge = baseline?.tooLarge ?? false;

  let afterContent = existing?.afterContent ?? "";
  let afterTooLarge = tooLarge;
  if (existsAfter) {
    const fullPath = resolvePagePath(relPath);
    try {
      const stat = await fs.stat(fullPath);
      if (stat.size > MAX_FILE_SIZE) {
        afterTooLarge = true;
        afterContent = "";
      } else {
        const retryContent = await readPageContentWithRetry(relPath);
        if (retryContent !== null) {
          afterContent = retryContent;
        } else {
          afterContent = existing?.afterContent ?? beforeContent;
        }
      }
    } catch {
      afterContent = existing?.afterContent ?? beforeContent;
    }
  } else {
    afterContent = "";
  }

  const nextEntry: ChangeFileEntry = {
    path: relPath,
    beforeContent,
    afterContent,
    existsBefore,
    existsAfter,
    tooLarge: afterTooLarge,
  };

  if (!afterTooLarge) {
    nextEntry.stats = computeStats(beforeContent, afterContent);
  }

  if (existing) {
    Object.assign(existing, nextEntry);
  } else {
    changeSet.files.push(nextEntry);
  }

  const timestamp =
    typeof params.timestamp === "number" && Number.isFinite(params.timestamp)
      ? params.timestamp
      : Date.now();
  changeSet.updatedAt = new Date(timestamp).toISOString();
  changeSet.totals = computeTotals(changeSet.files);

  await writeChangeSet(changeSet);
  await updateSessionIndex(toSummary(changeSet));
  return changeSet;
}

export async function loadChangeSetWithHunks(
  sessionKey: string,
  runId: string,
): Promise<ChangeSet | null> {
  const changeSet = await readChangeSet(sessionKey, runId);
  if (!changeSet) return null;

  let changed = false;
  for (const file of changeSet.files) {
    if (file.tooLarge) continue;
    if (file.hunks && file.hunks.length > 0) continue;
    const beforeContent = file.beforeContent ?? "";
    const afterContent = file.afterContent ?? "";
    file.hunks = computeHunks(file.path, beforeContent, afterContent);
    changed = true;
  }

  if (changed) {
    await writeChangeSet(changeSet);
    await updateSessionIndex(toSummary(changeSet));
  }

  return changeSet;
}

export async function revertChangeSet(params: {
  changeSet: ChangeSet;
  mode: "all" | "file" | "hunk";
  path?: string;
  hunkId?: string;
}): Promise<{ changeSet: ChangeSet; applied: boolean }> {
  const { changeSet, mode, path: targetPath, hunkId } = params;

  if (mode === "hunk" && targetPath && hunkId) {
    const file = changeSet.files.find((entry) => entry.path === targetPath);
    if (!file || file.tooLarge) return { changeSet, applied: false };
    const hunk = file.hunks?.find((entry) => entry.id === hunkId);
    if (!hunk) return { changeSet, applied: false };

    const page = await readPage(targetPath);
    const patchText = buildReversePatch(targetPath, hunk);
    const updated = applyReversePatch(page.content, patchText);
    if (updated === null) return { changeSet, applied: false };
    await writePage(targetPath, updated);

    file.afterContent = updated;
    file.stats = computeStats(file.beforeContent ?? "", updated);
    file.hunks = computeHunks(file.path, file.beforeContent ?? "", updated);
    changeSet.totals = computeTotals(changeSet.files);
    changeSet.updatedAt = new Date().toISOString();

    await writeChangeSet(changeSet);
    await updateSessionIndex(toSummary(changeSet));
    return { changeSet, applied: true };
  }

  if (mode === "file" && targetPath) {
    const file = changeSet.files.find((entry) => entry.path === targetPath);
    if (!file) return { changeSet, applied: false };
    await revertFileEntry(file);
    file.afterContent = file.beforeContent ?? "";
    if (!file.tooLarge) {
      file.stats = computeStats(file.beforeContent ?? "", file.afterContent ?? "");
      file.hunks = computeHunks(file.path, file.beforeContent ?? "", file.afterContent ?? "");
    }
    changeSet.totals = computeTotals(changeSet.files);
    changeSet.updatedAt = new Date().toISOString();
    await writeChangeSet(changeSet);
    await updateSessionIndex(toSummary(changeSet));
    return { changeSet, applied: true };
  }

  if (mode === "all") {
    for (const file of changeSet.files) {
      await revertFileEntry(file);
      file.afterContent = file.beforeContent ?? "";
      if (!file.tooLarge) {
        file.stats = computeStats(file.beforeContent ?? "", file.afterContent ?? "");
        file.hunks = computeHunks(file.path, file.beforeContent ?? "", file.afterContent ?? "");
      }
    }
    changeSet.totals = computeTotals(changeSet.files);
    changeSet.updatedAt = new Date().toISOString();
    await writeChangeSet(changeSet);
    await updateSessionIndex(toSummary(changeSet));
    return { changeSet, applied: true };
  }

  return { changeSet, applied: false };
}

async function revertFileEntry(file: ChangeFileEntry): Promise<void> {
  if (!file.existsBefore && file.existsAfter) {
    await deletePage(file.path);
    return;
  }
  if (file.existsBefore) {
    await writePage(file.path, file.beforeContent ?? "");
  }
}

async function readPageContentWithRetry(
  relPath: string,
  maxAttempts = 4,
): Promise<string | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const page = await readPage(relPath);
      return page.content;
    } catch {
      if (attempt >= maxAttempts - 1) {
        return null;
      }
      await new Promise((resolve) => setTimeout(resolve, 80 * (attempt + 1)));
    }
  }
  return null;
}

export function computeTotals(files: ChangeFileEntry[]): ChangeSet["totals"] {
  let additions = 0;
  let deletions = 0;
  let filesChanged = 0;
  for (const file of files) {
    if (file.stats) {
      additions += file.stats.additions;
      deletions += file.stats.deletions;
    }
    filesChanged += 1;
  }
  return { additions, deletions, filesChanged };
}

export async function buildUndoChangeSet(changeSet: ChangeSet): Promise<ChangeSet> {
  const now = new Date().toISOString();
  const runId = `undo-${Date.now()}`;
  const undoSet: ChangeSet = {
    id: encodeChangeSetId(changeSet.sessionKey, runId),
    sessionKey: changeSet.sessionKey,
    runId,
    status: "undo",
    startedAt: now,
    endedAt: now,
    updatedAt: now,
    files: changeSet.files.map((file) => {
      const beforeContent = file.afterContent ?? "";
      const afterContent = file.beforeContent ?? "";
      const entry: ChangeFileEntry = {
        path: file.path,
        beforeContent,
        afterContent,
        existsBefore: file.existsAfter,
        existsAfter: file.existsBefore,
        tooLarge: file.tooLarge,
      };
      if (!file.tooLarge) {
        entry.stats = computeStats(beforeContent, afterContent);
        entry.hunks = computeHunks(file.path, beforeContent, afterContent);
      }
      return entry;
    }),
    totals: { additions: 0, deletions: 0, filesChanged: 0 },
  };
  undoSet.totals = computeTotals(undoSet.files);
  await writeChangeSet(undoSet);
  await updateSessionIndex(toSummary(undoSet));
  return undoSet;
}
