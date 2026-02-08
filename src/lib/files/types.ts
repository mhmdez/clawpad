/**
 * ClawPad v2 — File System Types
 */

/** Sort order for pages within a space */
export type SortOrder = 'date-desc' | 'date-asc' | 'alpha' | 'manual';

/** Error codes for file system operations */
export type FileErrorCode =
  | 'NOT_FOUND'
  | 'ALREADY_EXISTS'
  | 'INVALID_PATH'
  | 'PATH_TRAVERSAL'
  | 'IO_ERROR'
  | 'PERMISSION_DENIED';

/** Metadata for a single page */
export interface PageMeta {
  /** Display title (from frontmatter or first heading) */
  title: string;
  /** Emoji icon */
  icon?: string;
  /** ISO 8601 creation timestamp */
  created: string;
  /** ISO 8601 last-modified timestamp */
  modified: string;
  /** Tags for categorization */
  tags?: string[];
  /** Relative path from PAGES_DIR (e.g., "daily-notes/2026-02-04.md") */
  path: string;
  /** Top-level directory name (space) */
  space: string;
  /** File size in bytes */
  size?: number;
}

/** Full page content including metadata and body */
export interface PageContent {
  /** Parsed metadata */
  meta: PageMeta;
  /** Markdown body (without frontmatter) */
  content: string;
  /** Full raw file content (with frontmatter) */
  raw: string;
}

/** A space (top-level directory in pages/) */
export interface Space {
  /** Display name */
  name: string;
  /** Discriminator for root-level pages vs normal spaces */
  kind?: 'root' | 'space';
  /** Emoji icon */
  icon?: string;
  /** Hex color for UI accent */
  color?: string;
  /** Page sort order */
  sort?: SortOrder;
  /** Directory name (relative path) */
  path: string;
  /** Number of .md files directly in this space */
  pageCount: number;
}

/** Metadata stored in _space.yml */
export interface SpaceMeta {
  name: string;
  icon?: string;
  color?: string;
  sort?: SortOrder;
}

/** Event emitted by the file watcher */
export interface FileChangeEvent {
  type: 'created' | 'modified' | 'deleted' | 'renamed';
  /** Relative path from PAGES_DIR */
  path: string;
  /** Previous path (for renames) */
  oldPath?: string;
  /** Unix timestamp in ms */
  timestamp: number;
}

/** Structured error for file system operations */
export class FileSystemError extends Error {
  constructor(
    message: string,
    public readonly code: FileErrorCode,
    public readonly filePath?: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'FileSystemError';
  }
}
