/**
 * ClawPad v2 — File System Library
 *
 * Complete file-based document system for OpenClaw.
 * All documents are markdown files in ~/.openclaw/pages/.
 *
 * @module @clawpad/files
 */

// Types
export type {
  PageMeta,
  PageContent,
  Space,
  SpaceMeta,
  FileChangeEvent,
  SortOrder,
  FileErrorCode,
} from './types';
export { FileSystemError } from './types';

// Path utilities
export {
  OPENCLAW_DIR,
  PAGES_DIR,
  TRASH_DIR,
  resolvePagePath,
  toRelativePath,
  validatePath,
  getSpaceName,
  ensureMdExtension,
  titleToSlug,
} from './paths';

// Frontmatter helpers
export {
  parseFrontmatter,
  serializeFrontmatter,
  extractTitle,
} from './frontmatter';

// File operations
export {
  ensureDirectories,
  listSpaces,
  getSpace,
  createSpace,
  updateSpace,
  deleteSpace,
  readPage,
  writePage,
  listPages,
  listAllPages,
  deletePage,
  movePage,
  getRecentPages,
  searchPages,
  bootstrapWorkspace,
  isWorkspaceBootstrapped,
} from './operations';

// File watcher
export { PageWatcher } from './watcher';
