import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { Type } from "@sinclair/typebox";
import matter from "gray-matter";

const DEFAULT_PAGES_DIRNAME = "pages";

function jsonResult(payload) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    details: payload,
  };
}

function resolveUserPath(input) {
  if (!input || typeof input !== "string") return input;
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("~")) {
    return path.resolve(trimmed.replace(/^~(?=$|[\\/])/, os.homedir()));
  }
  return path.resolve(trimmed);
}

function resolveOpenClawStateDir() {
  const override = process.env.OPENCLAW_STATE_DIR || process.env.CLAWDBOT_STATE_DIR;
  if (override && override.trim()) {
    return resolveUserPath(override);
  }
  return path.join(os.homedir(), ".openclaw");
}

function resolvePagesDir(config, pluginConfig) {
  const explicit = process.env.CLAWPAD_PAGES_DIR;
  if (explicit && explicit.trim()) {
    return resolveUserPath(explicit);
  }
  if (pluginConfig?.pagesDir && String(pluginConfig.pagesDir).trim()) {
    return resolveUserPath(String(pluginConfig.pagesDir));
  }

  const legacyDir = path.join(resolveOpenClawStateDir(), DEFAULT_PAGES_DIRNAME);
  if (fs.existsSync(legacyDir)) {
    return legacyDir;
  }

  const workspace = config?.agents?.defaults?.workspace;
  if (typeof workspace === "string" && workspace.trim()) {
    return path.join(resolveUserPath(workspace), DEFAULT_PAGES_DIRNAME);
  }

  return legacyDir;
}

function ensureSafeRelative(relPath) {
  if (!relPath || typeof relPath !== "string") return false;
  if (relPath.includes("\0")) return false;
  if (path.isAbsolute(relPath)) return false;
  const normalized = path.normalize(relPath);
  if (normalized.startsWith("..") || normalized.includes(`${path.sep}..`)) return false;
  return true;
}

function resolvePagePath(pagesDir, relPath) {
  if (!ensureSafeRelative(relPath)) {
    throw new Error(`Invalid path: ${relPath}`);
  }
  const resolved = path.resolve(pagesDir, relPath);
  const pagesResolved = path.resolve(pagesDir);
  if (!resolved.startsWith(pagesResolved + path.sep) && resolved !== pagesResolved) {
    throw new Error(`Path escapes pages dir: ${relPath}`);
  }
  return resolved;
}

function ensureMdExtension(relPath) {
  return relPath.endsWith(".md") ? relPath : `${relPath}.md`;
}

async function readSpaceMeta(spacePath) {
  const ymlPath = path.join(spacePath, "_space.yml");
  try {
    const raw = await fsp.readFile(ymlPath, "utf-8");
    const meta = { name: path.basename(spacePath) };
    const lines = raw.split("\n");
    for (const line of lines) {
      const match = line.match(/^(\w+):\s*(.+)$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      const value = rawValue.replace(/^["']|["']$/g, "").trim();
      if (key === "name") meta.name = value;
      if (key === "icon") meta.icon = value;
      if (key === "color") meta.color = value;
      if (key === "sort") meta.sort = value;
    }
    return meta;
  } catch {
    return null;
  }
}

async function countPagesInDir(dir) {
  let count = 0;
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      count += await countPagesInDir(full);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".md")) {
      count += 1;
    }
  }
  return count;
}

async function listSpaces(pagesDir) {
  await fsp.mkdir(pagesDir, { recursive: true });
  const entries = await fsp.readdir(pagesDir, { withFileTypes: true });
  const spaces = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const spacePath = path.join(pagesDir, entry.name);
    const meta = await readSpaceMeta(spacePath);
    const pageCount = await countPagesInDir(spacePath);
    spaces.push({
      name: meta?.name ?? entry.name,
      icon: meta?.icon,
      color: meta?.color,
      sort: meta?.sort,
      path: entry.name,
      pageCount,
    });
  }
  return spaces;
}

async function listPages(pagesDir, space, recursive) {
  const relSpace = ensureSafeRelative(space) ? space : null;
  if (!relSpace) throw new Error(`Invalid space: ${space}`);
  const spacePath = resolvePagePath(pagesDir, relSpace);
  const pages = [];

  async function walk(dir, prefix) {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      const rel = path.join(prefix, entry.name);
      if (entry.isDirectory()) {
        if (recursive) {
          await walk(full, rel);
        }
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(".md")) {
        try {
          const raw = await fsp.readFile(full, "utf-8");
          const stat = await fsp.stat(full);
          const { meta, content } = parseFrontmatter(raw);
          pages.push({
            path: rel.replace(/\\/g, "/"),
            title: meta.title || extractTitle(content, entry.name),
            icon: meta.icon,
            created: meta.created || stat.birthtime.toISOString(),
            modified: meta.modified || stat.mtime.toISOString(),
            tags: meta.tags,
            size: stat.size,
          });
        } catch {
          pages.push({ path: rel.replace(/\\/g, "/") });
        }
      }
    }
  }

  await walk(spacePath, relSpace);
  return pages;
}

async function readPage(pagesDir, relPath) {
  const full = resolvePagePath(pagesDir, relPath);
  const raw = await fsp.readFile(full, "utf-8");
  const { meta, content } = parseFrontmatter(raw);
  return { path: relPath, content, meta };
}

async function writePage(pagesDir, relPath, content, mode, metaInput) {
  const withExt = ensureMdExtension(relPath);
  const full = resolvePagePath(pagesDir, withExt);
  await fsp.mkdir(path.dirname(full), { recursive: true });
  let existing = { meta: {}, content: "" };
  if (fs.existsSync(full)) {
    try {
      const raw = await fsp.readFile(full, "utf-8");
      existing = parseFrontmatter(raw);
    } catch {
      // ignore
    }
  }

  const nextContent = mode === "append" ? `${existing.content}${content}` : content;
  const now = new Date().toISOString();
  const nextMeta = buildNextMeta({
    existing: existing.meta,
    incoming: metaInput,
    content: nextContent,
    filename: path.basename(withExt),
    now,
  });

  const serialized = serializeFrontmatter(nextContent, nextMeta);
  await fsp.writeFile(full, serialized, "utf-8");
  return { path: withExt, meta: nextMeta };
}

async function searchPages(pagesDir, query, limit) {
  const results = [];
  const normalizedQuery = query.toLowerCase();
  const max = Math.max(1, limit || 10);

  async function walk(dir) {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (results.length >= max) return;
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      const text = await fsp.readFile(full, "utf-8");
      const idx = text.toLowerCase().indexOf(normalizedQuery);
      if (idx === -1) continue;
      const start = Math.max(0, idx - 80);
      const end = Math.min(text.length, idx + 120);
      const snippet = text.slice(start, end).replace(/\s+/g, " ").trim();
      results.push({
        path: path.relative(pagesDir, full).replace(/\\/g, "/"),
        snippet,
      });
    }
  }

  if (fs.existsSync(pagesDir)) {
    await walk(pagesDir);
  }

  return results;
}

function parseFrontmatter(raw) {
  const { data, content } = matter(raw);
  const meta = {};
  if (typeof data.title === "string") meta.title = data.title;
  if (typeof data.icon === "string") meta.icon = data.icon;
  if (data.created) meta.created = new Date(data.created).toISOString();
  if (data.modified) meta.modified = new Date(data.modified).toISOString();
  if (Array.isArray(data.tags)) {
    meta.tags = data.tags.filter((t) => typeof t === "string");
  }
  return { meta, content };
}

function serializeFrontmatter(content, meta) {
  const frontmatter = {};
  if (meta.title) frontmatter.title = meta.title;
  if (meta.icon) frontmatter.icon = meta.icon;
  if (meta.created) frontmatter.created = meta.created;
  if (meta.modified) frontmatter.modified = meta.modified;
  if (Array.isArray(meta.tags) && meta.tags.length > 0) {
    frontmatter.tags = meta.tags;
  }
  if (Object.keys(frontmatter).length === 0) {
    return content;
  }
  return matter.stringify(content, frontmatter);
}

function extractTitle(content, filename) {
  const h1Match = content.match(/^#\\s+(.+)$/m);
  if (h1Match) {
    return h1Match[1].trim();
  }
  const name = filename.replace(/\\.md$/, "");
  return name
    .replace(/[-_]+/g, " ")
    .replace(/\\b\\w/g, (c) => c.toUpperCase());
}

function normalizeTags(value) {
  if (!value) return undefined;
  if (Array.isArray(value)) {
    const tags = value.filter((t) => typeof t === "string").map((t) => t.trim()).filter(Boolean);
    return tags.length > 0 ? tags : undefined;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : undefined;
  }
  return undefined;
}

function buildNextMeta(params) {
  const existing = params.existing || {};
  const incoming = params.incoming || {};
  const next = { ...existing };

  if (typeof incoming.title === "string" && incoming.title.trim()) {
    next.title = incoming.title.trim();
  } else if (!next.title) {
    next.title = extractTitle(params.content, params.filename);
  }

  if (typeof incoming.icon === "string" && incoming.icon.trim()) {
    next.icon = incoming.icon.trim();
  }

  const tags = normalizeTags(incoming.tags);
  if (tags) {
    next.tags = tags;
  }

  const created = typeof incoming.created === "string" && incoming.created.trim()
    ? incoming.created.trim()
    : next.created;
  next.created = created || params.now;

  const modified = typeof incoming.modified === "string" && incoming.modified.trim()
    ? incoming.modified.trim()
    : params.now;
  next.modified = modified;

  return next;
}

export default {
  id: "clawpad",
  name: "ClawPad",
  description: "ClawPad document tools (read/write/search pages)",
  version: "0.1.0",
  register(api) {
    const pagesDir = resolvePagesDir(api.config, api.pluginConfig);

    api.registerTool({
      name: "clawpad_spaces",
      description: "List ClawPad spaces (top-level folders).",
      parameters: Type.Object({}),
      execute: async () => jsonResult({ pagesDir, spaces: await listSpaces(pagesDir) }),
    });

    api.registerTool({
      name: "clawpad_pages",
      description: "List pages in a ClawPad space.",
      parameters: Type.Object({
        space: Type.String(),
        recursive: Type.Optional(Type.Boolean()),
      }),
      execute: async (_toolCallId, params) => {
        const space = String(params.space || "").trim();
        const recursive = Boolean(params.recursive);
        const pages = await listPages(pagesDir, space, recursive);
        return jsonResult({ pagesDir, space, pages });
      },
    });

    api.registerTool({
      name: "clawpad_read",
      description: "Read a ClawPad markdown page by relative path.",
      parameters: Type.Object({
        path: Type.String(),
      }),
      execute: async (_toolCallId, params) => {
        const relPath = String(params.path || "").trim();
        const data = await readPage(pagesDir, relPath);
        return jsonResult(data);
      },
    });

    api.registerTool({
      name: "clawpad_write",
      description: "Write a ClawPad markdown page by relative path.",
      parameters: Type.Object({
        path: Type.String(),
        content: Type.String(),
        title: Type.Optional(Type.String()),
        icon: Type.Optional(Type.String()),
        tags: Type.Optional(Type.Array(Type.String())),
        created: Type.Optional(Type.String()),
        modified: Type.Optional(Type.String()),
        mode: Type.Optional(Type.String()),
      }),
      execute: async (_toolCallId, params) => {
        const relPath = String(params.path || "").trim();
        const content = String(params.content ?? "");
        const mode = params.mode === "append" ? "append" : "overwrite";
        const metaInput = {
          title: params.title,
          icon: params.icon,
          tags: params.tags,
          created: params.created,
          modified: params.modified,
        };
        const data = await writePage(pagesDir, relPath, content, mode, metaInput);
        return jsonResult(data);
      },
    });

    api.registerTool({
      name: "clawpad_search",
      description: "Search ClawPad pages for a text query.",
      parameters: Type.Object({
        query: Type.String(),
        limit: Type.Optional(Type.Number()),
      }),
      execute: async (_toolCallId, params) => {
        const query = String(params.query || "").trim();
        const limit = typeof params.limit === "number" ? params.limit : undefined;
        const results = await searchPages(pagesDir, query, limit);
        return jsonResult({ query, results });
      },
    });
  },
};
