/**
 * ClawPad v2 — Frontmatter Utilities
 *
 * Parse and serialize YAML frontmatter in markdown files using gray-matter.
 */

import matter from "gray-matter";
import type { PageMeta } from "./types";

interface ParsedFrontmatter {
  meta: Partial<PageMeta>;
  content: string;
}

/**
 * Parse YAML frontmatter from a markdown string.
 * Returns the parsed metadata fields and the markdown body.
 *
 * @param raw - Raw file content (frontmatter + markdown body)
 */
export function parseFrontmatter(raw: string): ParsedFrontmatter {
  const { data, content } = matter(raw);

  const meta: Partial<PageMeta> = {};

  if (typeof data.title === "string") meta.title = data.title;
  if (typeof data.icon === "string") meta.icon = data.icon;
  if (data.created) meta.created = new Date(data.created).toISOString();
  if (data.modified) meta.modified = new Date(data.modified).toISOString();
  if (Array.isArray(data.tags)) {
    meta.tags = data.tags.filter((t: unknown) => typeof t === "string");
  }

  return { meta, content };
}

/**
 * Serialize frontmatter + content back into a markdown string.
 *
 * @param content - Markdown body
 * @param meta - Metadata fields to include in frontmatter
 */
export function serializeFrontmatter(
  content: string,
  meta: Partial<PageMeta>
): string {
  // Build a clean frontmatter object (skip undefined/null values)
  const frontmatter: Record<string, unknown> = {};

  if (meta.title) frontmatter.title = meta.title;
  if (meta.icon) frontmatter.icon = meta.icon;
  if (meta.created) frontmatter.created = meta.created;
  if (meta.modified) frontmatter.modified = meta.modified;
  if (meta.tags && meta.tags.length > 0) frontmatter.tags = meta.tags;

  // If no frontmatter fields, return plain markdown
  if (Object.keys(frontmatter).length === 0) {
    return content;
  }

  return matter.stringify(content, frontmatter);
}

/**
 * Extract a title from markdown content.
 * Looks for the first H1 heading. Falls back to formatting the filename.
 *
 * @param content - Markdown body (without frontmatter)
 * @param filename - Filename to fall back to
 */
export function extractTitle(content: string, filename: string): string {
  // Look for first H1 heading
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) {
    return h1Match[1].trim();
  }

  // Fall back to filename without extension
  const name = filename.replace(/\.md$/, "");
  return name
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
