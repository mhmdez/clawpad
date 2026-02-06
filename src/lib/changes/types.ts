export type ChangeSetStatus = "active" | "completed" | "undo";

export interface ChangeHunk {
  id: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
  adds: number;
  removes: number;
}

export interface ChangeFileStats {
  additions: number;
  deletions: number;
}

export interface ChangeFileEntry {
  path: string;
  beforeContent?: string;
  afterContent?: string;
  existsBefore: boolean;
  existsAfter: boolean;
  tooLarge?: boolean;
  stats?: ChangeFileStats;
  hunks?: ChangeHunk[];
}

export interface ChangeSetTotals {
  additions: number;
  deletions: number;
  filesChanged: number;
}

export interface ChangeSet {
  id: string;
  sessionKey: string;
  runId: string;
  status: ChangeSetStatus;
  startedAt: string;
  endedAt?: string;
  updatedAt: string;
  files: ChangeFileEntry[];
  totals: ChangeSetTotals;
}

export interface ChangeSetSummaryFile {
  path: string;
  additions: number;
  deletions: number;
  tooLarge?: boolean;
}

export interface ChangeSetSummary {
  id: string;
  sessionKey: string;
  runId: string;
  status: ChangeSetStatus;
  startedAt: string;
  endedAt?: string;
  updatedAt: string;
  totals: ChangeSetTotals;
  files: ChangeSetSummaryFile[];
}
