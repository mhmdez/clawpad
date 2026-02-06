import fs from "fs/promises";
import type { Dirent } from "fs";
import path from "path";
import { getOpenClawDir } from "@/lib/files/paths";
import type { ChangeSet, ChangeSetSummary } from "./types";

const RETENTION_DAYS = 30;
const MS_PER_DAY = 86_400_000;

function encodeSegment(value: string): string {
  return encodeURIComponent(value);
}

function decodeSegment(value: string): string {
  return decodeURIComponent(value);
}

export function encodeChangeSetId(sessionKey: string, runId: string): string {
  return Buffer.from(`${sessionKey}::${runId}`).toString("base64url");
}

export function decodeChangeSetId(id: string): { sessionKey: string; runId: string } {
  const raw = Buffer.from(id, "base64url").toString("utf-8");
  const [sessionKey, runId] = raw.split("::");
  if (!sessionKey || !runId) {
    throw new Error("Invalid change set id");
  }
  return { sessionKey, runId };
}

export function getChangesRootDir(): string {
  return path.join(getOpenClawDir(), "clawpad", "changes");
}

export function getSessionDir(sessionKey: string): string {
  return path.join(getChangesRootDir(), encodeSegment(sessionKey));
}

export function getChangeSetPath(sessionKey: string, runId: string): string {
  return path.join(getSessionDir(sessionKey), `${encodeSegment(runId)}.json`);
}

export function getSessionIndexPath(sessionKey: string): string {
  return path.join(getSessionDir(sessionKey), "index.json");
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeJson(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}

export async function readChangeSet(sessionKey: string, runId: string): Promise<ChangeSet | null> {
  const filePath = getChangeSetPath(sessionKey, runId);
  return readJson<ChangeSet>(filePath);
}

export async function writeChangeSet(changeSet: ChangeSet): Promise<void> {
  const filePath = getChangeSetPath(changeSet.sessionKey, changeSet.runId);
  await writeJson(filePath, changeSet);
}

export async function readSessionIndex(sessionKey: string): Promise<ChangeSetSummary[]> {
  const indexPath = getSessionIndexPath(sessionKey);
  const data = await readJson<ChangeSetSummary[]>(indexPath);
  return Array.isArray(data) ? data : [];
}

export async function writeSessionIndex(sessionKey: string, summaries: ChangeSetSummary[]): Promise<void> {
  const indexPath = getSessionIndexPath(sessionKey);
  await writeJson(indexPath, summaries);
}

export async function updateSessionIndex(summary: ChangeSetSummary): Promise<void> {
  const list = await readSessionIndex(summary.sessionKey);
  const next = list.filter((item) => item.id !== summary.id);
  next.unshift(summary);
  await writeSessionIndex(summary.sessionKey, next);
}

export async function listChangeSets(sessionKey: string): Promise<ChangeSetSummary[]> {
  const index = await readSessionIndex(sessionKey);
  if (index.length > 0) return index;

  const sessionDir = getSessionDir(sessionKey);
  try {
    const entries = await fs.readdir(sessionDir, { withFileTypes: true });
    const summaries: ChangeSetSummary[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      if (entry.name === "index.json") continue;
      const runId = decodeSegment(entry.name.replace(/\.json$/, ""));
      const changeSet = await readChangeSet(sessionKey, runId);
      if (changeSet) {
        summaries.push(toSummary(changeSet));
      }
    }
    const sorted = summaries.sort(
      (a, b) =>
        new Date(b.endedAt ?? b.startedAt).getTime() -
        new Date(a.endedAt ?? a.startedAt).getTime(),
    );
    if (sorted.length > 0) {
      await writeSessionIndex(sessionKey, sorted);
    }
    return sorted;
  } catch {
    return [];
  }
}

export function toSummary(changeSet: ChangeSet): ChangeSetSummary {
  return {
    id: changeSet.id,
    sessionKey: changeSet.sessionKey,
    runId: changeSet.runId,
    status: changeSet.status,
    startedAt: changeSet.startedAt,
    endedAt: changeSet.endedAt,
    updatedAt: changeSet.updatedAt,
    totals: changeSet.totals,
    files: changeSet.files.map((file) => ({
      path: file.path,
      additions: file.stats?.additions ?? 0,
      deletions: file.stats?.deletions ?? 0,
      tooLarge: file.tooLarge,
    })),
  };
}

export async function pruneOldChangeSets(sessionKey?: string): Promise<void> {
  const root = getChangesRootDir();
  const now = Date.now();
  const cutoff = now - RETENTION_DAYS * MS_PER_DAY;

  const sessionDirs = sessionKey
    ? [getSessionDir(sessionKey)]
    : await listSessionDirs(root);

  for (const dir of sessionDirs) {
    await pruneSessionDir(dir, cutoff);
  }
}

async function listSessionDirs(root: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => path.join(root, e.name));
  } catch {
    return [];
  }
}

async function pruneSessionDir(sessionDir: string, cutoff: number): Promise<void> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(sessionDir, { withFileTypes: true });
  } catch {
    return;
  }

  const summaries: ChangeSetSummary[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    if (entry.name === "index.json") continue;

    const filePath = path.join(sessionDir, entry.name);
    const data = await readJson<ChangeSet>(filePath);
    if (!data) continue;

    const timestamp = new Date(data.endedAt ?? data.startedAt).getTime();
    if (Number.isFinite(timestamp) && timestamp < cutoff) {
      await fs.unlink(filePath);
      continue;
    }

    summaries.push(toSummary(data));
  }

  if (summaries.length > 0) {
    const sorted = summaries.sort(
      (a, b) =>
        new Date(b.endedAt ?? b.startedAt).getTime() -
        new Date(a.endedAt ?? a.startedAt).getTime(),
    );
    await writeJson(path.join(sessionDir, "index.json"), sorted);
  } else {
    try {
      await fs.unlink(path.join(sessionDir, "index.json"));
    } catch {
      // ignore
    }
  }
}
