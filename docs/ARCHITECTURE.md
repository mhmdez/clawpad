# ClawPad Architecture

Technical overview of how ClawPad works under the hood.

## Overview

ClawPad is a Next.js 15 application that uses the local file system as its database. Documents are markdown files stored in `~/.openclaw/pages/`. There is no traditional database — the file system is the single source of truth.

```
┌──────────────────────────────────────────────────────┐
│                  ClawPad (Next.js 15)                 │
│                                                      │
│  ┌─────────────┐  ┌───────────┐  ┌────────────────┐ │
│  │  BlockNote   │  │   Chat    │  │   Search       │ │
│  │  Editor      │  │   Panel   │  │   (QMD)        │ │
│  └──────┬──────┘  └─────┬─────┘  └───────┬────────┘ │
│         │               │                │           │
│  ┌──────┴───────────────┴────────────────┴────────┐  │
│  │            Next.js API Routes                   │  │
│  │  /api/files/*    — File CRUD                    │  │
│  │  /api/chat       — AI streaming                 │  │
│  │  /api/ai/write   — Inline AI writing            │  │
│  │  /api/gateway/*  — OpenClaw gateway proxy       │  │
│  │  /api/setup/*    — Onboarding                   │  │
│  └──────┬───────────────┬────────────────┬────────┘  │
│         │               │                │           │
└─────────┼───────────────┼────────────────┼───────────┘
          │               │                │
          ▼               ▼                ▼
   ~/.openclaw/pages/   OpenClaw Gateway   QMD Index
   (markdown files)     (ws://localhost     (local search
                         :18789)            engine)
```

## Core Principle: File System as Database

Every document in ClawPad is a plain markdown file with optional YAML frontmatter.

### Directory Layout

```
~/.openclaw/pages/
├── daily-notes/           # Space
│   ├── _space.yml         # Space config (name, icon, color)
│   ├── 2026-02-04.md      # Page
│   └── 2026-02-03.md
├── projects/              # Space
│   ├── _space.yml
│   └── clawpad/           # Nested pages (subfolder)
│       ├── overview.md
│       └── roadmap.md
└── knowledge-base/        # Space
    ├── _space.yml
    └── memory.md
```

**Key mappings:**
- **Space** = top-level directory under `pages/`
- **Page** = any `.md` file
- **Nested page** = `.md` file in a subdirectory
- **Space config** = `_space.yml` file in a space directory

### Document Format

```markdown
---
title: My Document
icon: 📄
created: 2026-01-30T14:00:00Z
modified: 2026-02-04T01:00:00Z
tags: [project, planning]
---

# My Document

Content here...
```

Frontmatter is parsed using `gray-matter`. The `title` field takes precedence over the first `# heading` in the body. If no title is in frontmatter, it's extracted from the first heading.

### Why Files?

1. **Agent compatibility** — OpenClaw agents read/write markdown. Same files, no sync layer.
2. **Git-native** — Version control your workspace with `git init`.
3. **Zero setup** — No database to install, migrate, or back up.
4. **Portability** — Copy the folder anywhere. Open files with any editor.
5. **Transparency** — `cat`, `grep`, `find` all work. No black box.

## File Operations Layer

Located in `src/lib/files/`:

| File | Purpose |
|------|---------|
| `paths.ts` | Resolves `CLAWPAD_PAGES_DIR` (default `~/.openclaw/pages`), builds absolute paths |
| `operations.ts` | CRUD: list spaces, list pages, read page, write page, delete, rename |
| `frontmatter.ts` | Parse/serialize YAML frontmatter via `gray-matter` |
| `watcher.ts` | File system watcher (chokidar) for detecting external changes |
| `types.ts` | TypeScript types for pages, spaces, metadata |

### File Watcher

ClawPad watches `~/.openclaw/pages/` with chokidar. When an external process (like the OpenClaw agent) modifies a file:

1. Chokidar emits a change event
2. The watcher broadcasts to connected clients via SSE (`/api/files/watch`)
3. The React client refetches the affected page/space
4. The BlockNote editor updates its content

This creates a live editing experience — your agent writes a file, and you see it update in real-time.

## API Routes

All API routes are in `src/app/api/`:

### File Routes (`/api/files/`)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/files/spaces` | GET | List all spaces |
| `/api/files/spaces/[space]/pages` | GET | List pages in a space |
| `/api/files/pages/[...path]` | GET | Read a page |
| `/api/files/pages/[...path]` | PUT | Create/update a page |
| `/api/files/pages/[...path]` | DELETE | Delete a page |
| `/api/files/recent` | GET | Recently modified pages |
| `/api/files/search` | GET | Full-text search |
| `/api/files/watch` | GET | SSE stream for file changes |

### AI Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/chat` | POST | Streaming chat with AI (Vercel AI SDK) |
| `/api/ai/write` | POST | Inline AI writing (rewrite, expand, summarize) |

### Gateway Routes (`/api/gateway/`)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/gateway/status` | GET | Check gateway connection |
| `/api/gateway/detect` | GET | Auto-detect gateway URL |
| `/api/gateway/sessions` | GET | List agent sessions |

### Setup Routes (`/api/setup/`)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/setup/status` | GET | Check if onboarding is complete |
| `/api/setup/bootstrap` | POST | Create initial directory structure |

## Component Architecture

### Page Layout

```
┌─────────────────────────────────────────────────┐
│ Sidebar │          Main Content         │ Chat  │
│         │                               │ Panel │
│ Spaces  │   ┌───────────────────────┐   │       │
│ Pages   │   │    Page Header        │   │  AI   │
│ Search  │   │    (title, icon)      │   │  Chat │
│ Recent  │   ├───────────────────────┤   │       │
│         │   │                       │   │       │
│         │   │    BlockNote Editor   │   │       │
│         │   │                       │   │       │
│         │   │                       │   │       │
│         │   └───────────────────────┘   │       │
└─────────────────────────────────────────────────┘
```

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `Sidebar` | `components/sidebar/` | Navigation — spaces, pages, search, recent files |
| `PageEditor` | `components/editor/page-editor.tsx` | Loads page data and renders the editor |
| `Editor` | `components/editor/editor.tsx` | BlockNote editor wrapper |
| `AIToolbar` | `components/editor/ai-toolbar.tsx` | Inline AI writing controls |
| `ChatPanel` | `components/chat/chat-panel.tsx` | Side panel for AI chat |
| `CommandPalette` | `components/command-palette.tsx` | `⌘K` quick actions |
| `MobileTabs` | `components/mobile-tabs.tsx` | Bottom navigation for mobile |
| `Providers` | `components/providers.tsx` | Theme, query client, toast providers |

### State Management (Zustand)

Located in `src/lib/stores/`:

| Store | Purpose |
|-------|---------|
| `workspace.ts` | Current space, page, sidebar state |
| `activity.ts` | Activity feed events |
| `gateway.ts` | Gateway connection state |
| `appearance.ts` | Theme and appearance preferences |

## Gateway Integration

The OpenClaw gateway is a WebSocket server (default port 18789) that connects ClawPad to the running agent.

### Detection Flow

1. ClawPad checks `OPENCLAW_GATEWAY_URL` env var
2. Falls back to reading `~/.openclaw/openclaw.json` for gateway config
3. Attempts connection to `ws://localhost:18789`
4. If connected, enables agent features (chat, activity feed)
5. If not connected, ClawPad works standalone as a markdown editor

### Chat Integration

The chat panel uses Vercel AI SDK's `useChat` hook. Messages are streamed from `/api/chat`, which proxies to either:
- The OpenClaw gateway (if connected) — routes to the running agent
- Direct OpenAI API (if `OPENAI_API_KEY` is set) — standalone AI chat

## Search

ClawPad supports two search modes:

1. **Built-in search** — Simple string matching across filenames and content. Always available.
2. **QMD search** (optional) — If the QMD CLI is installed, ClawPad uses it for hybrid BM25 + vector search with semantic understanding.

The search API (`/api/files/search`) auto-detects which backend is available.

## Mobile Architecture

On screens < 768px, ClawPad switches to a mobile layout:

- Sidebar becomes a slide-out sheet
- Chat panel becomes a slide-up sheet
- Bottom tab bar replaces the sidebar for primary navigation
- Touch targets are enlarged (min 44px)
- Command palette adapts to full-screen on mobile
