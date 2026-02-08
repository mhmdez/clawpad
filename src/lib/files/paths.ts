/**
 * ClawPad v2 — Path Utilities
 *
 * Safe path resolution, validation, and manipulation for the pages directory.
 * All paths are relative to the resolved pages directory (default: ~/.openclaw/pages
 * or <openclaw-workspace>/pages when configured).
 *
 * For testing, set CLAWPAD_OPENCLAW_DIR or CLAWPAD_PAGES_DIR to override defaults.
 */

import path from 'path';
import os from 'os';
import fs from 'fs';
import { readOpenClawConfigSync, resolveOpenClawStateDir } from '../openclaw/config';
import { FileSystemError } from './types';
import { ROOT_SPACE_PATH } from './constants';

/**
 * Get the OpenClaw base directory.
 * Respects CLAWPAD_OPENCLAW_DIR for tests or local overrides.
 */
export function getOpenClawDir(): string {
  const override = process.env.CLAWPAD_OPENCLAW_DIR;
  if (override && override.trim()) {
    return path.resolve(override);
  }
  return resolveOpenClawStateDir();
}

function resolveWorkspacePagesDir(): string | null {
  const { config } = readOpenClawConfigSync();
  const workspace = (config as { agents?: { defaults?: { workspace?: string } } } | null)
    ?.agents?.defaults?.workspace;
  if (typeof workspace !== 'string' || !workspace.trim()) {
    return null;
  }
  const resolved = workspace.startsWith('~')
    ? workspace.replace(/^~(?=$|[\\/])/, os.homedir())
    : workspace;
  return path.join(path.resolve(resolved), 'pages');
}

function resolvePluginPagesDir(): string | null {
  const { config } = readOpenClawConfigSync();
  const pluginConfig = (config as {
    plugins?: {
      entries?: Record<string, { config?: { pagesDir?: string } }>;
    };
  } | null)?.plugins?.entries?.clawpad?.config?.pagesDir;
  if (typeof pluginConfig !== 'string' || !pluginConfig.trim()) {
    return null;
  }
  const resolved = pluginConfig.startsWith('~')
    ? pluginConfig.replace(/^~(?=$|[\\/])/, os.homedir())
    : pluginConfig;
  return path.resolve(resolved);
}

/** Get the pages directory path. */
export function getPagesDir(): string {
  const explicit = process.env.CLAWPAD_PAGES_DIR;
  if (explicit && explicit.trim()) {
    return path.resolve(explicit);
  }

  const pluginDir = resolvePluginPagesDir();
  if (pluginDir) {
    return pluginDir;
  }

  const legacyDir = path.join(getOpenClawDir(), 'pages');
  if (fs.existsSync(legacyDir)) {
    return legacyDir;
  }

  const workspacePages = resolveWorkspacePagesDir();
  if (workspacePages) {
    return workspacePages;
  }

  return legacyDir;
}

/** Get the trash directory path. */
export function getTrashDir(): string {
  return path.join(getOpenClawDir(), 'trash');
}

// Static aliases (use getters in operations for dynamic resolution)
export const OPENCLAW_DIR = getOpenClawDir();
export const PAGES_DIR = getPagesDir();
export const TRASH_DIR = getTrashDir();

/**
 * Resolve a relative page path to an absolute filesystem path.
 * Performs path traversal validation to prevent escape from PAGES_DIR.
 *
 * @param relativePath - Path relative to PAGES_DIR (e.g., "daily-notes/2026-02-04.md")
 * @returns Absolute filesystem path
 * @throws {FileSystemError} If the resolved path escapes PAGES_DIR
 */
export function resolvePagePath(relativePath: string): string {
  if (!validatePath(relativePath)) {
    throw new FileSystemError(
      `Invalid path: "${relativePath}" — path traversal detected or invalid characters`,
      'PATH_TRAVERSAL',
      relativePath,
    );
  }
  const pagesDir = getPagesDir();
  return path.join(pagesDir, relativePath);
}

/**
 * Convert an absolute filesystem path to a relative path from PAGES_DIR.
 *
 * @param absolutePath - Absolute filesystem path
 * @returns Relative path from PAGES_DIR
 * @throws {FileSystemError} If the path is not within PAGES_DIR
 */
export function toRelativePath(absolutePath: string): string {
  const resolved = path.resolve(absolutePath);
  const pagesResolved = path.resolve(getPagesDir());

  if (!resolved.startsWith(pagesResolved + path.sep) && resolved !== pagesResolved) {
    throw new FileSystemError(
      `Path "${absolutePath}" is not within PAGES_DIR`,
      'PATH_TRAVERSAL',
      absolutePath,
    );
  }

  return path.relative(pagesResolved, resolved);
}

/**
 * Validate that a relative path is safe and stays within PAGES_DIR.
 * Rejects path traversal attempts (..), absolute paths, and null bytes.
 *
 * @param relativePath - Relative path to validate
 * @returns true if the path is safe
 */
export function validatePath(relativePath: string): boolean {
  if (!relativePath || relativePath.trim() === '') return false;
  if (relativePath.includes('\0')) return false;
  if (path.isAbsolute(relativePath)) return false;

  const normalized = path.normalize(relativePath);
  if (normalized.startsWith('..') || normalized.includes(`${path.sep}..`)) return false;

  // Resolve against pages dir and verify containment
  const pagesDir = getPagesDir();
  const resolved = path.resolve(pagesDir, normalized);
  const pagesResolved = path.resolve(pagesDir);

  return resolved.startsWith(pagesResolved + path.sep) || resolved === pagesResolved;
}

/**
 * Extract the space (top-level directory) name from a page path.
 *
 * @param relativePath - Relative path (e.g., "daily-notes/2026-02-04.md")
 * @returns Space name (e.g., "daily-notes")
 */
export function getSpaceName(relativePath: string): string {
  const normalized = path.normalize(relativePath);
  const parts = normalized.split(path.sep);
  if (parts.length <= 1) return ROOT_SPACE_PATH;
  return parts[0];
}

/**
 * Ensure a file path has the .md extension.
 *
 * @param filePath - File path, possibly without extension
 * @returns File path with .md extension
 */
export function ensureMdExtension(filePath: string): string {
  if (filePath.endsWith('.md')) return filePath;
  return `${filePath}.md`;
}

/**
 * Convert a title string to a URL/filename-safe slug.
 *
 * @param title - Human-readable title
 * @returns Slugified filename (without extension)
 *
 * @example
 * titleToSlug("My Cool Project!") // "my-cool-project"
 * titleToSlug("VoiceBench v3") // "voicebench-v3"
 */
export function titleToSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Strip diacritics
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '') // Remove emoji
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
