# ClawPad v2 — Comprehensive Production Spec

**The workspace for OpenClaw.**  
A file-based, Notion-style document workspace that connects to your local OpenClaw agent.  
Documents are markdown files in `~/.openclaw/pages/`. No database for content. No Docker. Just files.

---

## Table of Contents

1. [Vision & Positioning](#1-vision--positioning)
2. [Architecture Overview](#2-architecture-overview)
3. [Tech Stack](#3-tech-stack)
4. [File-Based Document System](#4-file-based-document-system)
5. [Editor — BlockNote](#5-editor--blocknote)
6. [OpenClaw Gateway Integration](#6-openclaw-gateway-integration)
7. [AI Features (Vercel AI SDK)](#7-ai-features-vercel-ai-sdk)
8. [Chat Panel](#8-chat-panel)
9. [Search (QMD Integration)](#9-search-qmd-integration)
10. [Pairing & Onboarding](#10-pairing--onboarding)
11. [UI Design System](#11-ui-design-system)
12. [Page Structure & Routing](#12-page-structure--routing)
13. [Real-Time & Activity Feed](#13-real-time--activity-feed)
14. [Cloud Architecture (Future)](#14-cloud-architecture-future)
15. [Performance & Best Practices](#15-performance--best-practices)
16. [Implementation Phases](#16-implementation-phases)

---

## 1. Vision & Positioning

### What ClawPad Is
A workspace app for OpenClaw users. Think Notion, but:
- **Files, not databases** — Your documents are markdown files on disk
- **Agent-native** — Your OpenClaw agent reads/writes the same files
- **Zero infrastructure** — No PostgreSQL, no Redis, no Docker. `npx clawpad` and go
- **Modern editor** — Block-based Notion-style editing via BlockNote
- **AI-integrated** — Chat with your agent, get AI writing assistance, all in one place

### What ClawPad Is NOT
- Not a general-purpose note app (it's specifically for OpenClaw users)
- Not a collaborative multi-user editor (it's personal: one human + one agent)
- Not a monitoring tool (that's crabwalk's job)
- Not a database application (files are the source of truth)

### Target User
OpenClaw users who want a better way to:
- See and edit what their agent writes (daily notes, memory, project docs)
- Chat with their agent in a rich interface (not just Telegram)
- Search across their workspace with semantic understanding
- Have a clean, modern home for their AI-assisted workflow

### Competitive Landscape
| Product | What It Does | How ClawPad Differs |
|---------|-------------|-------------------|
| Notion | General workspace | ClawPad is agent-native, files on disk, zero infra |
| Obsidian | Local markdown editor | ClawPad has live agent integration, AI chat, modern web UI |
| Crabwalk | OpenClaw monitor | ClawPad is a workspace, not a monitoring dashboard |
| Docmost (v1) | Self-hosted wiki | ClawPad is file-based, no database required |

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    ClawPad (Next.js)                 │
│                                                     │
│  ┌──────────────┐  ┌────────────┐  ┌─────────────┐ │
│  │  BlockNote    │  │  Chat      │  │  Search     │ │
│  │  Editor       │  │  Panel     │  │  (QMD)      │ │
│  └──────┬───────┘  └─────┬──────┘  └──────┬──────┘ │
│         │                │                 │        │
│  ┌──────┴────────────────┴─────────────────┴──────┐ │
│  │              Next.js API Routes                 │ │
│  │  /api/files/* — CRUD on ~/.openclaw/pages/      │ │
│  │  /api/chat   — AI SDK streaming                 │ │
│  │  /api/search — QMD CLI wrapper                  │ │
│  │  /api/gateway/* — OpenClaw gateway proxy        │ │
│  └──────┬────────────────┬─────────────────┬──────┘ │
└─────────┼────────────────┼─────────────────┼────────┘
          │                │                 │
          ▼                ▼                 ▼
   ~/.openclaw/pages/   OpenClaw Gateway   QMD Index
   (markdown files)     (ws://localhost     (local
                         :18789)            search)
```

### Key Principle: The File System IS the Database

- All documents are `.md` files in `~/.openclaw/pages/`
- Spaces = top-level directories
- Pages = markdown files
- Nested pages = nested directories
- Metadata (title, icon, created, modified) stored in YAML frontmatter
- File watchers detect external changes (agent edits a file → UI updates)
- Git-compatible by default

---

## 3. Tech Stack

### Core
| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Framework | **Next.js 15** (App Router) | Best React framework, Vercel-aligned, SSR + API routes |
| Editor | **BlockNote** (@blocknote/react) | Notion-style blocks, built on ProseMirror/TipTap, great DX |
| Styling | **Tailwind CSS v4** + **shadcn/ui** | Per frontend-design skill, consistent component library |
| AI | **Vercel AI SDK v6** | useChat, streaming, tool approval workflows |
| State | **Zustand** | Lightweight, no boilerplate, works with file watchers |
| Search | **QMD** (optional) | Hybrid BM25 + vector search, all local |
| Real-time | **WebSocket** (native) | Gateway connection for agent events |
| Typography | **Geist** (Sans + Mono) | Vercel's typeface, clean and modern |
| Motion | **Framer Motion** | Orchestrated animations per design skill |
| Icons | **Lucide React** | Consistent, tree-shakeable |

### Dev Tooling
| Tool | Purpose |
|------|---------|
| TypeScript 5.7+ | Strict mode, full type safety |
| ESLint + Prettier | Code quality |
| pnpm | Fast, disk-efficient package manager |
| Turbopack | Next.js dev server (fast HMR) |

### What We DON'T Need
- ❌ PostgreSQL / any database
- ❌ Redis
- ❌ Docker (for dev or production)
- ❌ ORM (Prisma, Drizzle, etc.)
- ❌ Socket.io (native WebSocket is sufficient)
- ❌ tRPC (Next.js API routes + React Query is simpler)

---

## 4. File-Based Document System

### Directory Structure

```
~/.openclaw/
├── openclaw.json          # OpenClaw config (gateway port, token, etc.)
├── pages/                 # ClawPad document root
│   ├── daily-notes/       # Space: Daily Notes
│   │   ├── _space.yml     # Space metadata (name, icon, color)
│   │   ├── 2026-02-04.md
│   │   └── 2026-02-03.md
│   ├── projects/          # Space: Projects
│   │   ├── _space.yml
│   │   ├── voicebench.md
│   │   └── clawpad/
│   │       ├── overview.md
│   │       └── roadmap.md
│   ├── people/            # Space: People
│   │   ├── _space.yml
│   │   └── boris-cherny.md
│   └── knowledge-base/    # Space: Knowledge Base
│       ├── _space.yml
│       └── memory.md
└── agents/                # OpenClaw agent configs (existing)
```

### Document Format

Every `.md` file is a standard markdown file with optional YAML frontmatter:

```markdown
---
title: VoiceBench v3
icon: 🎙️
created: 2026-01-30T14:00:00Z
modified: 2026-02-04T01:00:00Z
tags: [project, portfolio, voice-ai]
---

# VoiceBench v3

Voice AI evaluation workbench for dev teams...
```

**Rules:**
- Title defaults to filename if no frontmatter
- Created/modified timestamps auto-set if missing
- Files without frontmatter are valid (treated as plain markdown)
- The agent can create/edit files with any text editor or CLI — no special format required

### Space Metadata (`_space.yml`)

```yaml
name: Daily Notes
icon: 📝
color: "#4A9EFF"
sort: date-desc    # date-desc | date-asc | alpha | manual
```

### File Operations API

```typescript
// Next.js API routes under /api/files/

// List spaces (top-level dirs in pages/)
GET /api/files/spaces

// List pages in a space
GET /api/files/spaces/:space/pages
GET /api/files/spaces/:space/pages?recursive=true

// Read a page
GET /api/files/pages/*path

// Create/update a page
PUT /api/files/pages/*path
Body: { content: string, frontmatter?: Record<string, any> }

// Delete a page (move to ~/.openclaw/trash/)
DELETE /api/files/pages/*path

// Create a space
POST /api/files/spaces
Body: { name: string, icon?: string, color?: string }

// Move/rename
PATCH /api/files/pages/*path
Body: { newPath: string }

// File watcher events (SSE)
GET /api/files/watch
```

### File Watcher

Uses `chokidar` or `fs.watch` to detect changes:
- Agent writes a file → watcher fires → SSE push to client → UI updates
- User edits in ClawPad → write to disk → watcher sees own write (ignored via debounce)
- Conflict resolution: last-write-wins (simple, no CRDT needed for 1 human + 1 agent)

### BlockNote ↔ Markdown Serialization

BlockNote supports markdown serialization natively:
- `editor.blocksToMarkdownLossy()` — Blocks → Markdown (for saving)
- `editor.tryParseMarkdownToBlocks(md)` — Markdown → Blocks (for loading)

**Key consideration:** Some block types don't have perfect markdown equivalents (e.g., toggle lists, columns). We'll use extended markdown syntax where needed and accept lossy conversion for edge cases. The files remain readable plain markdown.

---

## 5. Editor — BlockNote

### Why BlockNote
- **Notion-style UX out of the box** — Block-based, slash commands, drag handles
- **Built on ProseMirror/TipTap** — Battle-tested foundation
- **React-first** — Native React components, hooks, context
- **Extensible** — Custom block types, custom slash menu items
- **Theming** — CSS variables, dark mode support
- **Markdown round-trip** — Built-in serialization

### Editor Configuration

```typescript
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine"; // or shadcn theme
import "@blocknote/mantine/style.css";

const editor = useCreateBlockNote({
  // Custom slash menu items
  slashMenuItems: [
    ...getDefaultSlashMenuItems(),
    {
      title: "Ask AI",
      subtext: "Ask your agent about this page",
      icon: <SparklesIcon />,
      command: (editor) => { /* open AI panel */ },
      group: "AI",
    },
    {
      title: "Daily Note",
      subtext: "Insert today's date as heading",
      icon: <CalendarIcon />,
      command: (editor) => { /* insert date heading */ },
      group: "Templates",
    },
  ],
  
  // Auto-save on change
  onEditorContentChange: debounce((editor) => {
    const md = editor.blocksToMarkdownLossy();
    saveFile(currentPath, md);
  }, 1000),
});
```

### Custom Block Types (Phase 2+)

1. **Agent Response Block** — Renders an agent's response with attribution
2. **Task Block** — Checkbox with assignee (human or agent)
3. **Embed Block** — Embeds from URLs (GitHub, tweets, etc.)
4. **Code Block** — Syntax highlighting with copy button
5. **Callout Block** — Info/warning/tip boxes

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `/` | Slash command menu |
| `Cmd+K` | Quick search / command palette |
| `Cmd+Shift+L` | Toggle chat panel |
| `Cmd+S` | Force save (auto-save is default) |
| `Cmd+N` | New page |
| `Cmd+P` | Quick page switcher |

---

## 6. OpenClaw Gateway Integration

### Architecture (from Crabwalk Analysis)

ClawPad maintains a persistent WebSocket connection to the local OpenClaw gateway for:
1. **Chat** — Send messages to the agent, receive streaming responses
2. **Events** — Real-time agent activity (thinking, tool calls, sub-agents)
3. **Sessions** — List and monitor active sessions
4. **Presence** — Know when the agent is connected/active

### Gateway Connection Service

```typescript
// lib/gateway/client.ts
// Ported from crabwalk's ClawdbotClient with adaptations

export class GatewayClient {
  private ws: WebSocket | null = null;
  private pendingRequests = new Map<string, { resolve, reject }>();
  private eventListeners = new Set<(event: EventFrame) => void>();
  
  constructor(
    private url: string = 'ws://127.0.0.1:18789',
    private token?: string
  ) {}
  
  async connect(): Promise<HelloOk> { /* ... */ }
  async request<T>(method: string, params?: unknown): Promise<T> { /* ... */ }
  onEvent(callback: (event: EventFrame) => void): () => void { /* ... */ }
  async listSessions(params?: SessionsListParams): Promise<SessionInfo[]> { /* ... */ }
  disconnect(): void { /* ... */ }
}
```

### Protocol Types

Ported directly from crabwalk's `protocol.ts`:
- `GatewayFrame`, `RequestFrame`, `ResponseFrame`, `EventFrame`
- `ChatEvent` (delta/final/aborted/error states)
- `AgentEvent` (lifecycle/assistant/tool streams)
- `ExecStartedEvent`, `ExecOutputEvent`, `ExecCompletedEvent`
- `SessionInfo`, `MonitorSession`
- `parseSessionKey()`, `createConnectParams()`

### Event Processing

Ported from crabwalk's `parser.ts`:
- `parseEventFrame()` — Routes events to appropriate handlers
- `chatEventToAction()` — Extracts content from cumulative deltas
- `agentEventToAction()` — Maps lifecycle/tool/text events

### Auto-Detection

```typescript
// lib/gateway/detect.ts
// Reads ~/.openclaw/openclaw.json or ~/.clawdbot/clawdbot.json

export async function detectGateway(): Promise<{
  url: string;
  token?: string;
  agentName?: string;
  source: 'openclaw.json' | 'clawdbot.json' | 'env' | 'default';
}> {
  // Priority: env vars → openclaw.json → clawdbot.json → defaults
}
```

---

## 7. AI Features (Vercel AI SDK)

### Chat with Agent (useChat)

```typescript
// app/api/chat/route.ts
import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

export async function POST(req: Request) {
  const { messages } = await req.json();
  
  // Route through OpenClaw gateway (or direct to provider)
  const result = streamText({
    model: openai('gpt-4o'), // or route via gateway
    messages,
    system: `You are helping the user with their ClawPad workspace...`,
  });
  
  return result.toDataStreamResponse();
}
```

### AI Writing Assistance (inline)

| Feature | Trigger | Implementation |
|---------|---------|---------------|
| **Continue writing** | Select text + "Continue" | AI SDK streamText, insert below selection |
| **Improve writing** | Select text + "Improve" | AI SDK streamText, replace selection |
| **Summarize** | Select text + "Summarize" | AI SDK streamText, insert summary |
| **Fix grammar** | Select text + "Fix" | AI SDK streamText, replace selection |
| **Translate** | Select text + "Translate" | AI SDK streamText, replace selection |
| **Ask AI** | Slash command `/ai` | Opens inline prompt, streams response |

### Tool Approval (AI SDK v6)

When the agent wants to perform an action (create file, search, etc.), show approval UI:

```tsx
import { useChat } from '@ai-sdk/react';

const { messages, sendMessage, addToolApprovalResponse } = useChat({
  api: '/api/chat',
});

// Render tool approval cards inline in chat
{message.parts.map(part => {
  if (part.type === 'tool-invocation' && part.state === 'awaiting-approval') {
    return <ToolApprovalCard tool={part} onApprove={...} onDeny={...} />;
  }
})}
```

---

## 8. Chat Panel

### Layout
- **Sidebar chat panel** (not full-page) — slides in from right
- Width: 400px on desktop, full-width on mobile
- Resizable drag handle
- Can be toggled with `Cmd+Shift+L`

### Features
1. **Message display** — User and agent messages with proper formatting
2. **Streaming** — Real-time token streaming via AI SDK useChat
3. **Page context** — "Viewing: [Page Title]" chip, sends page content as context
4. **Suggestion chips** — Quick actions: "Summarize", "Extract tasks", "Improve writing"
5. **Image support** — Paste/upload images into chat
6. **Code blocks** — Syntax highlighted, copy button
7. **Tool calls** — Inline display of agent tool usage
8. **Unified history** — Shows messages from all channels (Telegram, web, ClawPad)
9. **Channel badges** — 📱 Telegram, 🌐 Web, 📝 ClawPad

### Message Parts (AI SDK v6)

```tsx
{message.parts.map((part, i) => {
  switch (part.type) {
    case 'text': return <MarkdownRenderer key={i} content={part.text} />;
    case 'tool-invocation': return <ToolCallCard key={i} tool={part} />;
    case 'file': return <FilePreview key={i} file={part} />;
    case 'reasoning': return <ReasoningBlock key={i} content={part} />;
    default: return null;
  }
})}
```

---

## 9. Search (QMD Integration)

### Architecture

QMD runs as a separate local process. ClawPad wraps its CLI:

```typescript
// app/api/search/route.ts
import { exec } from 'child_process';

export async function GET(req: Request) {
  const { query, collection, mode } = parseParams(req);
  
  // mode: 'search' (BM25), 'vsearch' (vector), 'query' (hybrid)
  const cmd = `qmd ${mode} "${query}" --json -n 20`;
  const result = await execAsync(cmd);
  
  return Response.json(JSON.parse(result.stdout));
}
```

### Search UI
- **Command palette** (`Cmd+K`) — Quick search across all pages
- **Search page** — Full search with filters (space, date range, tags)
- **Results** — Title, snippet with highlights, relevance score, space badge
- **Instant preview** — Hover to preview page content

### QMD Setup (optional)
ClawPad works without QMD (falls back to simple text search via `grep`).  
If QMD is installed, ClawPad auto-detects it and uses hybrid search.

```typescript
// lib/search/detect.ts
export async function detectSearch(): Promise<'qmd' | 'basic'> {
  try {
    await execAsync('qmd --version');
    return 'qmd';
  } catch {
    return 'basic';
  }
}
```

---

## 10. Pairing & Onboarding

### First-Run Experience

```
Step 1: "Welcome to ClawPad"
  → Auto-detect OpenClaw gateway (localhost probe)
  → If found: show agent name, "Connect" button
  → If not found: "Install OpenClaw" link + manual URL input

Step 2: "Set up your workspace"
  → Shows ~/.openclaw/pages/ path
  → If empty: offer to create starter spaces (Daily Notes, Projects, Knowledge Base)
  → If has files: show file count, "Open Workspace" button

Step 3: "You're ready"
  → Opens workspace with sidebar + empty editor
  → First page auto-created: "Welcome to ClawPad" with tips
```

### Magic Pairing Flow (Auto-Detect)

```typescript
async function autoDetectGateway() {
  // 1. Check env vars
  if (process.env.OPENCLAW_URL) return { url: process.env.OPENCLAW_URL };
  
  // 2. Read config file
  const configPaths = [
    path.join(os.homedir(), '.openclaw', 'openclaw.json'),
    path.join(os.homedir(), '.clawdbot', 'clawdbot.json'),
  ];
  for (const p of configPaths) {
    if (await exists(p)) {
      const config = JSON.parse(await readFile(p, 'utf-8'));
      return {
        url: `ws://127.0.0.1:${config.gateway?.port || 18789}`,
        token: config.gateway?.auth?.token,
        source: path.basename(p),
      };
    }
  }
  
  // 3. Probe default port
  try {
    const ws = new WebSocket('ws://127.0.0.1:18789');
    await waitForOpen(ws, 3000);
    ws.close();
    return { url: 'ws://127.0.0.1:18789', source: 'probe' };
  } catch {
    return null;
  }
}
```

### Connection Health UI

| State | UI |
|-------|-----|
| Connected | 🟢 Green dot in sidebar, agent name tooltip |
| Connecting | 🟡 Yellow pulsing dot, "Connecting..." |
| Disconnected | 🔴 Red dot, "Agent offline" + retry button |
| Error | ⚠️ Banner with error message + help link |

---

## 11. UI Design System

### Design Direction: **Notion meets Vercel**

**Tone:** Clean, minimal, content-first. Not playful (no crab animations), not corporate. Professional workspace that feels lightweight.

**Key aesthetic choices:**
- Light mode default (dark mode supported)
- Lots of white space — content breathes
- Subtle borders and shadows (not flat, not heavy)
- System-native feel (sidebar, command palette, keyboard shortcuts)

### Typography

| Use | Font | Weight |
|-----|------|--------|
| UI / Body | Geist Sans | 400, 500, 600 |
| Code / Mono | Geist Mono | 400 |
| Page titles | Geist Sans | 600, size: 2rem |
| Section headings | Geist Sans | 600, size: 1.25rem |

### Color Palette

```css
/* Light mode (default) */
:root {
  --bg-primary: #ffffff;
  --bg-secondary: #f7f7f8;
  --bg-tertiary: #efefef;
  --bg-sidebar: #f7f7f8;
  --text-primary: #1a1a1a;
  --text-secondary: #6b6b6b;
  --text-muted: #9b9b9b;
  --border: #e5e5e5;
  --border-subtle: #f0f0f0;
  --accent: #0066ff;       /* Blue — links, active states */
  --accent-light: #e8f0fe;
  --success: #00a67e;      /* Green — connected, saved */
  --warning: #f5a623;
  --error: #e53e3e;
  --surface-hover: #f5f5f5;
}

/* Dark mode */
.dark {
  --bg-primary: #191919;
  --bg-secondary: #1e1e1e;
  --bg-tertiary: #252525;
  --bg-sidebar: #1a1a1a;
  --text-primary: #ededed;
  --text-secondary: #999;
  --text-muted: #666;
  --border: #2e2e2e;
  --border-subtle: #252525;
  --accent: #3b82f6;
  --accent-light: #1e293b;
  --surface-hover: #252525;
}
```

### Layout

```
┌──────────┬─────────────────────────────┬────────────┐
│          │                             │            │
│ Sidebar  │      Editor / Page          │   Chat     │
│  240px   │      (flex-1)               │  Panel     │
│          │                             │  400px     │
│ Spaces   │  ┌─────────────────────┐    │  (toggle)  │
│ Pages    │  │  Page Title         │    │            │
│ Search   │  │                     │    │            │
│ Activity │  │  Block content...   │    │            │
│          │  │                     │    │            │
│ ──────── │  └─────────────────────┘    │            │
│ Status   │                             │            │
│ Settings │                             │            │
└──────────┴─────────────────────────────┴────────────┘
```

### Sidebar

- **Width:** 240px, collapsible to 0
- **Sections:**
  - Workspace name + agent status indicator
  - Quick actions: New Page, Search (`Cmd+K`)
  - Spaces (collapsible, each shows pages)
  - Favorites (starred pages)
  - Recent pages
  - Activity feed (compact)
  - Settings + connection status at bottom

### Components (shadcn/ui)

Using shadcn/ui with Notion-like customizations:

| Component | Use |
|-----------|-----|
| `Button` | Actions, CTAs |
| `Command` (cmdk) | Command palette (`Cmd+K`) |
| `Dialog` | Modals (settings, confirmations) |
| `DropdownMenu` | Context menus, page actions |
| `Input` | Search, rename |
| `ScrollArea` | Sidebar, chat panel |
| `Separator` | Section dividers |
| `Sheet` | Mobile sidebar, mobile chat |
| `Skeleton` | Loading states |
| `Tabs` | Settings sections |
| `Toast` | Notifications (saved, error) |
| `Tooltip` | Hover hints |
| `Popover` | Inline menus, color pickers |

### Motion (Framer Motion)

- **Page transitions** — Fade + slight Y translate (200ms)
- **Sidebar toggle** — Width animation (200ms ease-out)
- **Chat panel** — Slide from right (250ms spring)
- **Toast notifications** — Slide up + fade (150ms)
- **Loading states** — Skeleton pulse (not spinner)
- **Page list items** — Staggered fade-in on section expand

### Mobile Responsiveness

| Breakpoint | Layout |
|------------|--------|
| Desktop (>1024px) | Sidebar + Editor + Chat panel |
| Tablet (768-1024px) | Sidebar overlay + Editor + Chat overlay |
| Mobile (<768px) | Bottom tabs: Pages / Editor / Chat |

---

## 12. Page Structure & Routing

### Routes

```
/                     → Redirect to /workspace
/workspace            → Main workspace (sidebar + editor)
/workspace/[...path]  → Open specific page
/settings             → Settings (connection, appearance, search)
/settings/connection  → Gateway connection config
/setup                → First-run onboarding wizard
```

### File-Based URL Mapping

URL path maps directly to file path:
- `/workspace/daily-notes/2026-02-04` → `~/.openclaw/pages/daily-notes/2026-02-04.md`
- `/workspace/projects/voicebench` → `~/.openclaw/pages/projects/voicebench.md`
- `/workspace/projects/clawpad/roadmap` → `~/.openclaw/pages/projects/clawpad/roadmap.md`

---

## 13. Real-Time & Activity Feed

### File Watcher → SSE

```typescript
// app/api/files/watch/route.ts
import { watch } from 'chokidar';

export async function GET() {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const watcher = watch(PAGES_DIR, {
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 500 },
      });
      
      watcher.on('change', (path) => {
        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({ type: 'file-changed', path })}\n\n`
        ));
      });
      
      watcher.on('add', (path) => { /* ... */ });
      watcher.on('unlink', (path) => { /* ... */ });
    }
  });
  
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream' },
  });
}
```

### Gateway Events → Activity Feed

Ported from crabwalk's event processing:

```typescript
// Zustand store for gateway state
interface GatewayStore {
  connected: boolean;
  sessions: MonitorSession[];
  recentActivity: ActivityItem[];
  agentStatus: 'idle' | 'thinking' | 'active';
  
  // Actions
  connect: () => Promise<void>;
  disconnect: () => void;
  processEvent: (event: EventFrame) => void;
}
```

Activity feed shows:
- 📝 Agent edited a page (file watcher)
- 💬 New message in Telegram session
- 🔧 Agent used a tool (exec, web search, etc.)
- 🤖 Sub-agent spawned/completed
- ✅ Task completed

---

## 14. Cloud Architecture (Future)

### Phase 1: Local Only (Current)
Everything runs locally. `npx clawpad` starts Next.js dev server.

### Phase 2: Cloud UI + Local Agent
```
cloud.clawpad.com (UI + accounts)
    ↕ WebSocket tunnel (outbound from local)
Local OpenClaw Gateway
    ↕ File read/write
~/.openclaw/pages/
```

The gateway connects **outbound** to the cloud service. Bidirectional messages flow through this single connection. No port forwarding, no static IP needed.

**Cloud DB stores only:**
- User accounts (email, auth, billing)
- Workspace registry (user ↔ gateway pairing)
- Connection state (is gateway online)

**Cloud DB does NOT store:**
- Document content
- Chat history
- Search indexes

### Phase 3: Optional Cloud Sync
For users who want backup/multi-device:
- Selective file sync (encrypted at rest)
- Conflict resolution (timestamp-based)
- Still file-based — synced files are real `.md` files

---

## 15. Performance & Best Practices

### From Vercel React Best Practices Skill

**Critical:**
- `async-parallel` — Parallel file reads when loading a space
- `async-suspense-boundaries` — Suspense for editor loading, search results
- `bundle-dynamic-imports` — Dynamic import for BlockNote editor (heavy)
- `bundle-barrel-imports` — Direct imports, no barrel files

**High:**
- `server-cache-react` — Cache file reads per request
- `server-parallel-fetching` — Load sidebar + page content in parallel

**Medium:**
- `rerender-memo` — Memoize page list items, activity feed items
- `rerender-derived-state` — Subscribe to derived values in Zustand
- `rendering-content-visibility` — For long page lists in sidebar

### Performance Targets

| Metric | Target |
|--------|--------|
| First Contentful Paint | <1s |
| Time to Interactive | <2s |
| Editor ready (BlockNote loaded) | <1.5s |
| File save latency | <100ms |
| Search response (QMD) | <500ms |
| Chat streaming TTFB | <200ms |
| Bundle size (initial) | <300KB gzipped |

### Editor Performance
- **Lazy load BlockNote** — Don't load editor JS until a page is opened
- **Debounce saves** — 1s debounce on content changes
- **Virtual scrolling** — For very long documents (1000+ blocks)
- **Image optimization** — Resize/compress before storing

---

## 16. Implementation Phases

### Phase 1: Foundation (MVP)
**Goal:** Working local app with file-based editing

1. **Project scaffolding** — Next.js 15, Tailwind, shadcn/ui, Geist fonts
2. **File system API** — CRUD routes for `~/.openclaw/pages/`
3. **Sidebar** — Space list, page tree, navigation
4. **BlockNote editor** — Load/save markdown files, auto-save
5. **Basic search** — `grep`-based text search via `Cmd+K`
6. **Settings** — Theme toggle, workspace path config
7. **First-run setup** — Detect workspace, create starter spaces

### Phase 2: Agent Integration
**Goal:** Live connection to OpenClaw agent

8. **Gateway connection** — WebSocket client, auto-detect config
9. **Chat panel** — AI SDK useChat, streaming responses
10. **Activity feed** — Gateway events + file watcher
11. **Page context** — Send current page as chat context
12. **Connection status** — Sidebar indicator, health monitoring

### Phase 3: AI Features
**Goal:** AI-powered editing and search

13. **AI writing assistance** — Inline AI commands (improve, summarize, continue)
14. **QMD integration** — Hybrid search, command palette upgrade
15. **Suggestion chips** — Context-aware quick actions
16. **Tool approval** — AI SDK v6 tool approval workflow in chat

### Phase 4: Polish & Launch
**Goal:** Production-ready for OpenClaw users

17. **Mobile responsive** — Bottom tab navigation, mobile editor
18. **Keyboard shortcuts** — Full shortcut system
19. **Onboarding polish** — Animated wizard, help tooltips
20. **Performance** — Lazy loading, virtual scrolling, bundle optimization
21. **Documentation** — README, setup guide, contribution guide
22. **npm package** — `npx clawpad` to start

### Phase 5: Cloud (Future)
23. **Cloud relay service** — WebSocket tunnel from gateway to cloud
24. **User accounts** — Auth, workspace registry
25. **Cloud UI** — Hosted version at cloud.clawpad.com
26. **Optional sync** — Encrypted file backup

---

## Appendix A: File Operations Library

```typescript
// lib/files/index.ts

const OPENCLAW_DIR = path.join(os.homedir(), '.openclaw');
const PAGES_DIR = path.join(OPENCLAW_DIR, 'pages');
const TRASH_DIR = path.join(OPENCLAW_DIR, 'trash');

export interface PageMeta {
  title: string;
  icon?: string;
  created: string;
  modified: string;
  tags?: string[];
  path: string;        // Relative to PAGES_DIR
  space: string;       // Top-level directory name
}

export interface Space {
  name: string;
  icon?: string;
  color?: string;
  sort?: 'date-desc' | 'date-asc' | 'alpha' | 'manual';
  path: string;
  pageCount: number;
}

// Read a page, parse frontmatter + content
export async function readPage(relativePath: string): Promise<{ meta: PageMeta; content: string }>;

// Write a page, serialize frontmatter + content
export async function writePage(relativePath: string, content: string, meta?: Partial<PageMeta>): Promise<void>;

// List all spaces
export async function listSpaces(): Promise<Space[]>;

// List pages in a space (optionally recursive)
export async function listPages(space: string, recursive?: boolean): Promise<PageMeta[]>;

// Delete (move to trash)
export async function deletePage(relativePath: string): Promise<void>;

// Move/rename
export async function movePage(from: string, to: string): Promise<void>;

// Search (basic grep fallback)
export async function searchBasic(query: string): Promise<PageMeta[]>;

// Bootstrap workspace with starter spaces
export async function bootstrapWorkspace(): Promise<void>;
```

## Appendix B: Gateway Protocol Types

See `/sites/clawdspace/.agents/crabwalk-analysis.md` Section 2 for complete type definitions ported from crabwalk.

## Appendix C: BlockNote Markdown Extensions

For blocks without standard markdown equivalents:

```markdown
<!-- blocknote:callout type="info" -->
This is an info callout.
<!-- /blocknote:callout -->

<!-- blocknote:toggle title="Click to expand" -->
Hidden content here.
<!-- /blocknote:toggle -->
```

These comments are invisible in standard markdown viewers but preserved during round-trip editing.
