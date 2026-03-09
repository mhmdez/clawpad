import fs from "fs/promises";
import type { Dirent } from "fs";
import path from "path";
import { getPagesDir } from "@/lib/files/paths";
import { readPage } from "@/lib/files";

const MAX_FILE_SIZE = 1_000_000;

export interface BaselineEntry {
  content: string;
  tooLarge?: boolean;
}

const baselineCache = new Map<string, Map<string, BaselineEntry>>();

function getCacheKey(sessionKey: string, runId: string): string {
  return `${sessionKey}::${runId}`;
}

export async function buildBaseline(sessionKey: string, runId: string): Promise<void> {
  const cacheKey = getCacheKey(sessionKey, runId);
  if (baselineCache.has(cacheKey)) return;
  const entries = await readPagesSnapshot();
  baselineCache.set(cacheKey, entries);
}

export function getBaseline(sessionKey: string, runId: string, relPath: string): BaselineEntry | null {
  const cacheKey = getCacheKey(sessionKey, runId);
  const map = baselineCache.get(cacheKey);
  if (!map) return null;
  return map.get(relPath) ?? null;
}

export function getBaselineSnapshot(sessionKey: string, runId: string): Map<string, BaselineEntry> | null {
  const map = baselineCache.get(getCacheKey(sessionKey, runId));
  if (!map) return null;
  return new Map(map);
}

export function clearBaseline(sessionKey: string, runId: string): void {
  baselineCache.delete(getCacheKey(sessionKey, runId));
}

export async function readPagesSnapshot(): Promise<Map<string, BaselineEntry>> {
  const entries = new Map<string, BaselineEntry>();
  const pagesDir = getPagesDir();
  await walkPages(pagesDir, entries, pagesDir);
  return entries;
}

async function walkPages(dir: string, entries: Map<string, BaselineEntry>, root: string): Promise<void> {
  let list: Dirent[];
  try {
    list = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of list) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "_") continue;
      await walkPages(fullPath, entries, root);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;

    const relPath = path.relative(root, fullPath).replace(/\\/g, "/");
    try {
      const stat = await fs.stat(fullPath);
      if (stat.size > MAX_FILE_SIZE) {
        entries.set(relPath, { content: "", tooLarge: true });
        continue;
      }
      const page = await readPage(relPath);
      entries.set(relPath, { content: page.content });
    } catch {
      // ignore unreadable files
    }
  }
}

export { MAX_FILE_SIZE };
