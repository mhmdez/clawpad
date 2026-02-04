/**
 * ClawPad v2 — File Operations
 *
 * CRUD operations for pages and spaces in ~/.openclaw/pages/.
 * All file paths are relative to PAGES_DIR unless otherwise noted.
 */

import fs from 'fs/promises';
import path from 'path';
import { parseFrontmatter, serializeFrontmatter, extractTitle } from './frontmatter';
import {
  getOpenClawDir,
  getPagesDir,
  getTrashDir,
  resolvePagePath,
  toRelativePath,
  validatePath,
  getSpaceName,
  ensureMdExtension,
} from './paths';
import type { PageMeta, PageContent, Space, SpaceMeta } from './types';
import { FileSystemError } from './types';

// ─── Directory Setup ────────────────────────────────────────────────────────

/**
 * Ensure all required base directories exist.
 * Creates ~/.openclaw/, ~/.openclaw/pages/, and ~/.openclaw/trash/ if missing.
 */
export async function ensureDirectories(): Promise<void> {
  const openclawDir = getOpenClawDir();
  const pagesDir = getPagesDir();
  const trashDir = getTrashDir();
  try {
    await fs.mkdir(openclawDir, { recursive: true });
    await fs.mkdir(pagesDir, { recursive: true });
    await fs.mkdir(trashDir, { recursive: true });
  } catch (err) {
    throw new FileSystemError(
      'Failed to create base directories',
      'IO_ERROR',
      openclawDir,
      err as Error,
    );
  }
}

// ─── Spaces ─────────────────────────────────────────────────────────────────

/**
 * List all spaces (top-level directories in pages/).
 * Reads _space.yml for display metadata if present.
 *
 * @returns Array of Space objects sorted alphabetically by name
 */
export async function listSpaces(): Promise<Space[]> {
  await ensureDirectories();
  const pagesDir = getPagesDir();

  let entries;
  try {
    entries = await fs.readdir(pagesDir, { withFileTypes: true });
  } catch (err) {
    throw new FileSystemError('Failed to read pages directory', 'IO_ERROR', pagesDir, err as Error);
  }

  const spaces: Space[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;

    const spacePath = path.join(pagesDir, entry.name);
    const spaceMeta = await readSpaceMeta(spacePath);
    const pageCount = await countPagesInDir(spacePath);

    spaces.push({
      name: spaceMeta?.name ?? formatDirName(entry.name),
      icon: spaceMeta?.icon,
      color: spaceMeta?.color,
      sort: spaceMeta?.sort,
      path: entry.name,
      pageCount,
    });
  }

  return spaces.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Get a single space by its directory name.
 *
 * @param name - Directory name (e.g., "daily-notes")
 * @returns Space object, or null if not found
 */
export async function getSpace(name: string): Promise<Space | null> {
  if (!validatePath(name)) return null;

  const spacePath = path.join(getPagesDir(), name);
  try {
    const stat = await fs.stat(spacePath);
    if (!stat.isDirectory()) return null;
  } catch {
    return null;
  }

  const spaceMeta = await readSpaceMeta(spacePath);
  const pageCount = await countPagesInDir(spacePath);

  return {
    name: spaceMeta?.name ?? formatDirName(name),
    icon: spaceMeta?.icon,
    color: spaceMeta?.color,
    sort: spaceMeta?.sort,
    path: name,
    pageCount,
  };
}

/**
 * Create a new space (directory + optional _space.yml).
 *
 * @param name - Directory name for the space
 * @param meta - Optional display metadata
 * @returns Created Space object
 * @throws {FileSystemError} If the space already exists
 */
export async function createSpace(name: string, meta?: Partial<SpaceMeta>): Promise<Space> {
  if (!validatePath(name)) {
    throw new FileSystemError(`Invalid space name: "${name}"`, 'INVALID_PATH', name);
  }

  const spacePath = path.join(getPagesDir(), name);

  try {
    await fs.access(spacePath);
    throw new FileSystemError(`Space "${name}" already exists`, 'ALREADY_EXISTS', name);
  } catch (err) {
    if (err instanceof FileSystemError) throw err;
    // Directory doesn't exist — good
  }

  try {
    await fs.mkdir(spacePath, { recursive: true });
  } catch (err) {
    throw new FileSystemError(`Failed to create space "${name}"`, 'IO_ERROR', name, err as Error);
  }

  if (meta && Object.keys(meta).length > 0) {
    await writeSpaceMeta(spacePath, {
      name: meta.name ?? formatDirName(name),
      icon: meta.icon,
      color: meta.color,
      sort: meta.sort,
    });
  }

  return {
    name: meta?.name ?? formatDirName(name),
    icon: meta?.icon,
    color: meta?.color,
    sort: meta?.sort,
    path: name,
    pageCount: 0,
  };
}

/**
 * Update a space's display metadata (_space.yml).
 *
 * @param name - Directory name of the space
 * @param meta - Fields to update
 * @returns Updated Space object
 * @throws {FileSystemError} If the space doesn't exist
 */
export async function updateSpace(name: string, meta: Partial<SpaceMeta>): Promise<Space> {
  const spacePath = path.join(getPagesDir(), name);

  try {
    const stat = await fs.stat(spacePath);
    if (!stat.isDirectory()) {
      throw new FileSystemError(`"${name}" is not a space directory`, 'NOT_FOUND', name);
    }
  } catch (err) {
    if (err instanceof FileSystemError) throw err;
    throw new FileSystemError(`Space "${name}" not found`, 'NOT_FOUND', name, err as Error);
  }

  const existing = await readSpaceMeta(spacePath);
  const merged: SpaceMeta = {
    name: meta.name ?? existing?.name ?? formatDirName(name),
    icon: meta.icon ?? existing?.icon,
    color: meta.color ?? existing?.color,
    sort: meta.sort ?? existing?.sort,
  };

  await writeSpaceMeta(spacePath, merged);
  const pageCount = await countPagesInDir(spacePath);

  return {
    ...merged,
    path: name,
    pageCount,
  };
}

/**
 * Delete a space by moving it to the trash directory.
 * Appends a timestamp to avoid collisions.
 *
 * @param name - Directory name of the space
 * @throws {FileSystemError} If the space doesn't exist
 */
export async function deleteSpace(name: string): Promise<void> {
  const spacePath = path.join(getPagesDir(), name);

  try {
    const stat = await fs.stat(spacePath);
    if (!stat.isDirectory()) {
      throw new FileSystemError(`"${name}" is not a space directory`, 'NOT_FOUND', name);
    }
  } catch (err) {
    if (err instanceof FileSystemError) throw err;
    throw new FileSystemError(`Space "${name}" not found`, 'NOT_FOUND', name, err as Error);
  }

  await ensureDirectories();
  const trashName = `${name}_${Date.now()}`;
  const trashPath = path.join(getTrashDir(), trashName);

  try {
    await fs.rename(spacePath, trashPath);
  } catch (err) {
    throw new FileSystemError(`Failed to delete space "${name}"`, 'IO_ERROR', name, err as Error);
  }
}

// ─── Pages ──────────────────────────────────────────────────────────────────

/**
 * Read a page by its relative path. Parses frontmatter with gray-matter.
 *
 * @param relativePath - Path relative to PAGES_DIR (e.g., "daily-notes/2026-02-04.md")
 * @returns Parsed page content including metadata, body, and raw source
 * @throws {FileSystemError} If the file doesn't exist or can't be read
 */
export async function readPage(relativePath: string): Promise<PageContent> {
  const normalizedPath = ensureMdExtension(relativePath);
  const filePath = resolvePagePath(normalizedPath);

  let raw: string;
  let stat: Awaited<ReturnType<typeof fs.stat>>;
  try {
    [raw, stat] = await Promise.all([
      fs.readFile(filePath, 'utf-8'),
      fs.stat(filePath),
    ]);
  } catch (err) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr.code === 'ENOENT') {
      throw new FileSystemError(`Page not found: "${normalizedPath}"`, 'NOT_FOUND', normalizedPath);
    }
    throw new FileSystemError(`Failed to read page: "${normalizedPath}"`, 'IO_ERROR', normalizedPath, err as Error);
  }

  const { meta: parsedMeta, content } = parseFrontmatter(raw);

  const meta: PageMeta = {
    title: parsedMeta.title ?? extractTitle(content, path.basename(normalizedPath)),
    icon: parsedMeta.icon,
    created: parsedMeta.created ?? stat.birthtime.toISOString(),
    modified: parsedMeta.modified ?? stat.mtime.toISOString(),
    tags: parsedMeta.tags,
    path: normalizedPath,
    space: getSpaceName(normalizedPath),
    size: stat.size,
  };

  return { meta, content, raw };
}

/**
 * Write a page — serializes frontmatter + content to disk.
 * Creates parent directories if needed.
 * Auto-sets 'modified' timestamp. Sets 'created' if the file is new.
 *
 * @param relativePath - Path relative to PAGES_DIR
 * @param content - Markdown body (without frontmatter)
 * @param meta - Optional metadata fields to set/override
 * @returns Complete PageMeta for the written file
 */
export async function writePage(
  relativePath: string,
  content: string,
  meta?: Partial<PageMeta>,
): Promise<PageMeta> {
  const normalizedPath = ensureMdExtension(relativePath);
  const filePath = resolvePagePath(normalizedPath);
  const now = new Date().toISOString();

  // Check if file already exists to preserve 'created'
  let existingMeta: Partial<PageMeta> = {};
  try {
    const existingRaw = await fs.readFile(filePath, 'utf-8');
    const parsed = parseFrontmatter(existingRaw);
    existingMeta = parsed.meta;
  } catch {
    // File doesn't exist — that's fine, it's a new page
  }

  const finalMeta: Partial<PageMeta> = {
    title: meta?.title ?? existingMeta.title ?? extractTitle(content, path.basename(normalizedPath)),
    icon: meta?.icon ?? existingMeta.icon,
    created: meta?.created ?? existingMeta.created ?? now,
    modified: now,
    tags: meta?.tags ?? existingMeta.tags,
  };

  const fileContent = serializeFrontmatter(content, finalMeta);

  // Ensure parent directory exists
  const parentDir = path.dirname(filePath);
  try {
    await fs.mkdir(parentDir, { recursive: true });
    await fs.writeFile(filePath, fileContent, 'utf-8');
  } catch (err) {
    throw new FileSystemError(
      `Failed to write page: "${normalizedPath}"`,
      'IO_ERROR',
      normalizedPath,
      err as Error,
    );
  }

  const stat = await fs.stat(filePath);

  return {
    title: finalMeta.title!,
    icon: finalMeta.icon,
    created: finalMeta.created!,
    modified: finalMeta.modified!,
    tags: finalMeta.tags,
    path: normalizedPath,
    space: getSpaceName(normalizedPath),
    size: stat.size,
  };
}

/**
 * List pages in a given space.
 *
 * @param space - Space directory name
 * @param options - Optional listing configuration
 * @param options.recursive - If true, include pages in subdirectories
 * @param options.sort - Sort order (overrides space's default)
 * @returns Array of PageMeta objects
 */
export async function listPages(
  space: string,
  options?: { recursive?: boolean; sort?: SpaceMeta['sort'] },
): Promise<PageMeta[]> {
  if (!validatePath(space)) {
    throw new FileSystemError(`Invalid space name: "${space}"`, 'INVALID_PATH', space);
  }

  const spacePath = path.join(getPagesDir(), space);

  try {
    await fs.access(spacePath);
  } catch {
    throw new FileSystemError(`Space "${space}" not found`, 'NOT_FOUND', space);
  }

  const pages = await collectPages(spacePath, space, options?.recursive ?? false);

  const sortOrder = options?.sort ?? (await readSpaceMeta(spacePath))?.sort ?? 'date-desc';
  return sortPages(pages, sortOrder);
}

/**
 * List all pages across all spaces.
 *
 * @returns Array of all PageMeta objects sorted by modification date (newest first)
 */
export async function listAllPages(): Promise<PageMeta[]> {
  await ensureDirectories();

  const spaces = await listSpaces();
  const allPages: PageMeta[] = [];

  for (const space of spaces) {
    try {
      const pages = await collectPages(path.join(getPagesDir(), space.path), space.path, true);
      allPages.push(...pages);
    } catch {
      // Skip spaces that fail to read
    }
  }

  return sortPages(allPages, 'date-desc');
}

/**
 * Delete a page by moving it to the trash directory.
 * The trashed file is prefixed with a timestamp to avoid collisions.
 *
 * @param relativePath - Path of the page to delete
 * @throws {FileSystemError} If the page doesn't exist
 */
export async function deletePage(relativePath: string): Promise<void> {
  const normalizedPath = ensureMdExtension(relativePath);
  const filePath = resolvePagePath(normalizedPath);

  try {
    await fs.access(filePath);
  } catch {
    throw new FileSystemError(`Page not found: "${normalizedPath}"`, 'NOT_FOUND', normalizedPath);
  }

  await ensureDirectories();
  const baseName = path.basename(normalizedPath);
  const trashName = `${Date.now()}_${baseName}`;
  const trashPath = path.join(getTrashDir(), trashName);

  try {
    await fs.rename(filePath, trashPath);
  } catch (err) {
    throw new FileSystemError(
      `Failed to delete page: "${normalizedPath}"`,
      'IO_ERROR',
      normalizedPath,
      err as Error,
    );
  }
}

/**
 * Move or rename a page.
 *
 * @param from - Current relative path
 * @param to - New relative path
 * @throws {FileSystemError} If source doesn't exist or target already exists
 */
export async function movePage(from: string, to: string): Promise<void> {
  const fromNormalized = ensureMdExtension(from);
  const toNormalized = ensureMdExtension(to);
  const fromPath = resolvePagePath(fromNormalized);
  const toPath = resolvePagePath(toNormalized);

  try {
    await fs.access(fromPath);
  } catch {
    throw new FileSystemError(`Source page not found: "${fromNormalized}"`, 'NOT_FOUND', fromNormalized);
  }

  try {
    await fs.access(toPath);
    throw new FileSystemError(
      `Target already exists: "${toNormalized}"`,
      'ALREADY_EXISTS',
      toNormalized,
    );
  } catch (err) {
    if (err instanceof FileSystemError) throw err;
    // Target doesn't exist — good
  }

  const targetDir = path.dirname(toPath);
  try {
    await fs.mkdir(targetDir, { recursive: true });
    await fs.rename(fromPath, toPath);
  } catch (err) {
    if (err instanceof FileSystemError) throw err;
    throw new FileSystemError(
      `Failed to move page from "${fromNormalized}" to "${toNormalized}"`,
      'IO_ERROR',
      fromNormalized,
      err as Error,
    );
  }
}

/**
 * Get recently modified pages across all spaces.
 *
 * @param limit - Maximum number of pages to return (default: 10)
 * @returns Pages sorted by modification date, newest first
 */
export async function getRecentPages(limit: number = 10): Promise<PageMeta[]> {
  const allPages = await listAllPages();
  return allPages.slice(0, limit);
}

// ─── Search ─────────────────────────────────────────────────────────────────

/** Search result with relevance scoring */
export interface SearchResult extends PageMeta {
  snippet: string;
  score: number;
  matchType: 'title' | 'content' | 'both';
}

/**
 * Text search across all pages with relevance scoring.
 * Searches frontmatter title, tags, and markdown body.
 * Results sorted by relevance: exact title match > partial title > content match.
 *
 * @param query - Search query string
 * @param options - Optional filters
 * @param options.space - Limit search to a specific space
 * @param options.limit - Maximum results (default: 20)
 * @returns Matching pages with snippet, score, and match type
 */
export async function searchPages(
  query: string,
  options?: { space?: string; limit?: number },
): Promise<SearchResult[]> {
  if (!query.trim()) return [];

  const limit = options?.limit ?? 20;
  const lowerQuery = query.toLowerCase();
  const queryTerms = lowerQuery.split(/\s+/).filter(Boolean);

  let pages: PageMeta[];
  if (options?.space) {
    pages = await listPages(options.space, { recursive: true });
  } else {
    pages = await listAllPages();
  }

  const scored: SearchResult[] = [];

  for (const pageMeta of pages) {
    try {
      const filePath = resolvePagePath(pageMeta.path);
      const raw = await fs.readFile(filePath, 'utf-8');
      const { content } = parseFrontmatter(raw);
      const lowerTitle = pageMeta.title.toLowerCase();
      const lowerContent = content.toLowerCase();

      // Compute relevance score
      let score = 0;
      let matchType: 'title' | 'content' | 'both' = 'content';

      // Exact title match (highest priority)
      if (lowerTitle === lowerQuery) {
        score += 100;
        matchType = 'title';
      }
      // Title starts with query
      else if (lowerTitle.startsWith(lowerQuery)) {
        score += 80;
        matchType = 'title';
      }
      // Title contains full query
      else if (lowerTitle.includes(lowerQuery)) {
        score += 60;
        matchType = 'title';
      }
      // Title contains all terms
      else if (queryTerms.every(t => lowerTitle.includes(t))) {
        score += 50;
        matchType = 'title';
      }
      // Title contains any term
      else if (queryTerms.some(t => lowerTitle.includes(t))) {
        score += 30;
        matchType = 'title';
      }

      // Content matching
      const contentHasFullQuery = lowerContent.includes(lowerQuery);
      const contentTermMatches = queryTerms.filter(t => lowerContent.includes(t)).length;

      if (contentHasFullQuery) {
        score += 20;
        // Count occurrences for density boost (capped)
        const occurrences = countOccurrences(lowerContent, lowerQuery);
        score += Math.min(occurrences * 2, 10);
        if (matchType === 'title') matchType = 'both';
      } else if (contentTermMatches > 0) {
        score += (contentTermMatches / queryTerms.length) * 15;
        if (matchType === 'title') matchType = 'both';
      }

      // Tag match bonus
      if (pageMeta.tags?.some(t => t.toLowerCase().includes(lowerQuery))) {
        score += 15;
      }

      // Recency bonus (small, for breaking ties)
      const ageMs = Date.now() - new Date(pageMeta.modified).getTime();
      const ageDays = ageMs / 86400000;
      if (ageDays < 7) score += 5;
      else if (ageDays < 30) score += 3;
      else if (ageDays < 90) score += 1;

      // Skip if no match at all
      if (score === 0) continue;

      // Extract context snippet
      const snippet = extractSnippet(content, lowerQuery, queryTerms);

      scored.push({
        ...pageMeta,
        snippet,
        score: Math.round(score * 10) / 10,
        matchType,
      });
    } catch {
      // Skip unreadable files
    }
  }

  // Sort by score descending, then by modified date for ties
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return new Date(b.modified).getTime() - new Date(a.modified).getTime();
  });

  return scored.slice(0, limit);
}

/** Count non-overlapping occurrences of needle in haystack */
function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let pos = 0;
  while ((pos = haystack.indexOf(needle, pos)) !== -1) {
    count++;
    pos += needle.length;
  }
  return count;
}

/**
 * Extract a context snippet around the best match location.
 * Strips frontmatter, headings prefixes, and excessive whitespace.
 */
function extractSnippet(content: string, lowerQuery: string, terms: string[]): string {
  const clean = content
    .replace(/^---[\s\S]*?---\s*/m, '')  // strip frontmatter
    .replace(/\n{3,}/g, '\n\n')          // collapse blank lines
    .trim();

  if (!clean) return '';

  const lowerClean = clean.toLowerCase();

  // Try to find exact query first
  let matchIdx = lowerClean.indexOf(lowerQuery);

  // Fallback: find first term occurrence
  if (matchIdx === -1) {
    for (const term of terms) {
      matchIdx = lowerClean.indexOf(term);
      if (matchIdx !== -1) break;
    }
  }

  if (matchIdx !== -1) {
    const contextSize = 100;
    const start = Math.max(0, matchIdx - contextSize);
    const end = Math.min(clean.length, matchIdx + lowerQuery.length + contextSize);

    let snippet = clean.slice(start, end).trim();
    // Clean up leading/trailing partial words
    if (start > 0) {
      const firstSpace = snippet.indexOf(' ');
      if (firstSpace > 0 && firstSpace < 20) {
        snippet = snippet.slice(firstSpace + 1);
      }
      snippet = '…' + snippet;
    }
    if (end < clean.length) {
      const lastSpace = snippet.lastIndexOf(' ');
      if (lastSpace > snippet.length - 20) {
        snippet = snippet.slice(0, lastSpace);
      }
      snippet = snippet + '…';
    }

    // Strip markdown heading markers
    return snippet.replace(/^#+\s/gm, '').replace(/\n+/g, ' ').trim();
  }

  // No match in content — return first lines
  return clean
    .split('\n')
    .filter(l => l.trim() && !l.startsWith('#'))
    .slice(0, 2)
    .join(' ')
    .slice(0, 200)
    .trim();
}

// ─── Bootstrap ──────────────────────────────────────────────────────────────

/**
 * Check if the workspace has already been bootstrapped (has any content).
 *
 * @returns true if PAGES_DIR exists and contains at least one space directory
 */
export async function isWorkspaceBootstrapped(): Promise<boolean> {
  try {
    const entries = await fs.readdir(getPagesDir(), { withFileTypes: true });
    return entries.some((e) => e.isDirectory() && !e.name.startsWith('.'));
  } catch {
    return false;
  }
}

/**
 * Create the default workspace structure with starter spaces and a welcome page.
 * Creates: daily-notes, projects, knowledge-base spaces with _space.yml files,
 * a welcome page, and today's daily note.
 */
export async function bootstrapWorkspace(): Promise<void> {
  await ensureDirectories();

  const now = new Date().toISOString();
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
  const prettyDate = today.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Create spaces with _space.yml
  const spacesConfig: Array<{ dir: string; meta: SpaceMeta }> = [
    {
      dir: 'daily-notes',
      meta: { name: 'Daily Notes', icon: '📝', color: '#4A9EFF', sort: 'date-desc' },
    },
    {
      dir: 'projects',
      meta: { name: 'Projects', icon: '🚀', color: '#00A67E', sort: 'alpha' },
    },
    {
      dir: 'knowledge-base',
      meta: { name: 'Knowledge Base', icon: '📚', color: '#9333EA', sort: 'alpha' },
    },
  ];

  const pagesDir = getPagesDir();
  for (const { dir, meta } of spacesConfig) {
    const spacePath = path.join(pagesDir, dir);
    await fs.mkdir(spacePath, { recursive: true });
    await writeSpaceMeta(spacePath, meta);
  }

  // Create welcome page
  await writePage('knowledge-base/welcome.md', `\n# Welcome to ClawPad

Your workspace for OpenClaw. Documents live as markdown files in \`~/.openclaw/pages/\`.

## Quick Start

- **Create a page** — Click + in the sidebar or use \`Cmd+N\`
- **Search** — Press \`Cmd+K\` to search across all pages
- **Chat** — Press \`Cmd+Shift+L\` to open the chat panel
- **Your agent can edit these files too** — They'll update in real-time

## How It Works

- Spaces are folders, pages are \`.md\` files
- Your OpenClaw agent reads and writes the same files
- Everything stays on your machine
- Works with any text editor (VS Code, Obsidian, vim)
`, {
    title: 'Welcome to ClawPad',
    icon: '👋',
    created: now,
    modified: now,
  });

  // Create today's daily note
  await writePage(`daily-notes/${dateStr}.md`, `\n# ${prettyDate}

Start writing...
`, {
    title: prettyDate,
    icon: '📝',
    created: now,
    modified: now,
  });
}

// ─── Internal Helpers ───────────────────────────────────────────────────────

/** Read _space.yml from a space directory. Returns null if not found. */
async function readSpaceMeta(spacePath: string): Promise<SpaceMeta | null> {
  const ymlPath = path.join(spacePath, '_space.yml');
  try {
    const raw = await fs.readFile(ymlPath, 'utf-8');
    const meta: SpaceMeta = { name: path.basename(spacePath) };
    const lines = raw.split('\n');
    for (const line of lines) {
      const match = line.match(/^(\w+):\s*(.+)$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      const value = rawValue.replace(/^["']|["']$/g, '').trim();
      switch (key) {
        case 'name':
          meta.name = value;
          break;
        case 'icon':
          meta.icon = value;
          break;
        case 'color':
          meta.color = value;
          break;
        case 'sort':
          if (['date-desc', 'date-asc', 'alpha', 'manual'].includes(value)) {
            meta.sort = value as SpaceMeta['sort'];
          }
          break;
      }
    }
    return meta;
  } catch {
    return null;
  }
}

/** Write _space.yml to a space directory. */
async function writeSpaceMeta(spacePath: string, meta: SpaceMeta): Promise<void> {
  const ymlPath = path.join(spacePath, '_space.yml');
  const lines: string[] = [];

  if (meta.name) lines.push(`name: ${meta.name}`);
  if (meta.icon) lines.push(`icon: ${meta.icon}`);
  if (meta.color) lines.push(`color: "${meta.color}"`);
  if (meta.sort) lines.push(`sort: ${meta.sort}`);

  try {
    await fs.writeFile(ymlPath, lines.join('\n') + '\n', 'utf-8');
  } catch (err) {
    throw new FileSystemError(
      `Failed to write space metadata`,
      'IO_ERROR',
      ymlPath,
      err as Error,
    );
  }
}

/** Count .md files in a directory (non-recursive). */
async function countPagesInDir(dirPath: string): Promise<number> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries.filter((e) => e.isFile() && e.name.endsWith('.md')).length;
  } catch {
    return 0;
  }
}

/** Recursively collect PageMeta for all .md files under a directory. */
async function collectPages(
  dirPath: string,
  space: string,
  recursive: boolean,
): Promise<PageMeta[]> {
  const pages: PageMeta[] = [];

  let entries;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return pages;
  }

  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);

    if (entry.isFile() && entry.name.endsWith('.md')) {
      try {
        const relativePath = toRelativePath(entryPath);
        const raw = await fs.readFile(entryPath, 'utf-8');
        const stat = await fs.stat(entryPath);
        const { meta: parsedMeta, content } = parseFrontmatter(raw);

        pages.push({
          title: parsedMeta.title ?? extractTitle(content, entry.name),
          icon: parsedMeta.icon,
          created: parsedMeta.created ?? stat.birthtime.toISOString(),
          modified: parsedMeta.modified ?? stat.mtime.toISOString(),
          tags: parsedMeta.tags,
          path: relativePath,
          space,
          size: stat.size,
        });
      } catch {
        // Skip unreadable files
      }
    } else if (recursive && entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== '_') {
      const subPages = await collectPages(entryPath, space, true);
      pages.push(...subPages);
    }
  }

  return pages;
}

/** Sort pages by the given sort order. */
function sortPages(pages: PageMeta[], sort: SpaceMeta['sort']): PageMeta[] {
  switch (sort) {
    case 'date-desc':
      return pages.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());
    case 'date-asc':
      return pages.sort((a, b) => new Date(a.modified).getTime() - new Date(b.modified).getTime());
    case 'alpha':
      return pages.sort((a, b) => a.title.localeCompare(b.title));
    case 'manual':
    default:
      return pages;
  }
}

/** Format a directory name into a display name. */
function formatDirName(dirName: string): string {
  return dirName
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
