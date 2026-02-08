import { diffLines, structuredPatch, formatPatch, applyPatch } from "diff";
import type { ChangeFileStats, ChangeHunk } from "./types";

type DiffHunk = {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
};

function countLines(value: string): number {
  if (!value) return 0;
  const lines = value.split("\n");
  return lines[lines.length - 1] === "" ? lines.length - 1 : lines.length;
}

export function computeStats(beforeContent: string, afterContent: string): ChangeFileStats {
  const parts = diffLines(beforeContent, afterContent);
  let additions = 0;
  let deletions = 0;
  for (const part of parts) {
    const lineCount = countLines(part.value);
    if (part.added) additions += lineCount;
    if (part.removed) deletions += lineCount;
  }
  return { additions, deletions };
}

export function computeHunks(path: string, beforeContent: string, afterContent: string): ChangeHunk[] {
  const patch = structuredPatch(
    path,
    path,
    beforeContent,
    afterContent,
    "",
    "",
  ) as { hunks: DiffHunk[] };
  return patch.hunks.map((hunk: DiffHunk, index: number) => {
    const adds = hunk.lines.filter((line) => line.startsWith("+")).length;
    const removes = hunk.lines.filter((line) => line.startsWith("-")).length;
    return {
      id: `${path}:${hunk.oldStart}:${hunk.newStart}:${index}`,
      oldStart: hunk.oldStart,
      oldLines: hunk.oldLines,
      newStart: hunk.newStart,
      newLines: hunk.newLines,
      lines: hunk.lines,
      adds,
      removes,
    };
  });
}

export function buildReversePatch(path: string, hunk: ChangeHunk): string {
  const reversed = {
    oldStart: hunk.newStart,
    oldLines: hunk.newLines,
    newStart: hunk.oldStart,
    newLines: hunk.oldLines,
    lines: hunk.lines.map((line) => {
      if (line.startsWith("+")) return `-${line.slice(1)}`;
      if (line.startsWith("-")) return `+${line.slice(1)}`;
      return line;
    }),
  };

  return formatPatch({
    oldFileName: path,
    newFileName: path,
    oldHeader: "",
    newHeader: "",
    hunks: [reversed],
  });
}

export function applyReversePatch(content: string, patchText: string): string | null {
  const result = applyPatch(content, patchText);
  if (result === false) return null;
  return result;
}
