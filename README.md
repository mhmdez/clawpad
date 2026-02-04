<p align="center">
  <img src="docs/logo.png" alt="ClawPad" width="120" />
</p>

<h1 align="center">ClawPad</h1>

<p align="center">
  <strong>The workspace for OpenClaw.</strong><br/>
  A file-based, Notion-style document workspace that connects to your local OpenClaw agent.
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#features">Features</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#development">Development</a> •
  <a href="docs/ARCHITECTURE.md">Docs</a>
</p>

<p align="center">
  <img src="https://img.shields.io/npm/v/clawpad?color=blue" alt="npm version" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="license" />
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="node version" />
</p>

---

![ClawPad Screenshot](docs/screenshot.png)

## Quick Start

```bash
# 1. Install and run
npx clawpad

# 2. That's it. Open http://localhost:3000
```

ClawPad will start a local server and open your browser. Your documents live as plain markdown files in `~/.openclaw/pages/` — no database, no Docker, no fuss.

> **Tip:** If you have OpenClaw running, ClawPad auto-detects your gateway and connects to your agent.

## Features

| | Feature | Description |
|---|---|---|
| 📝 | **Block Editor** | Notion-style block editing powered by BlockNote. Headings, lists, code, images, toggles — all the blocks you'd expect. |
| 🤖 | **AI Chat** | Chat with your OpenClaw agent right inside the workspace. Ask questions, give instructions, get things done. |
| ✨ | **AI Writing** | Highlight text and let AI rewrite, expand, summarize, or fix it. Inline toolbar, no context switching. |
| 🔍 | **Smart Search** | Full-text search across all your documents. Powered by QMD for hybrid BM25 + vector search when available. |
| 📱 | **Mobile Ready** | Responsive layout with swipeable panels, bottom tabs, and touch-friendly controls. Works great on phones and tablets. |
| ⌨️ | **Keyboard Shortcuts** | `⌘K` command palette, `⌘N` new page, `⌘/` chat — power-user friendly. |
| 🎨 | **Themes** | Light, dark, and system themes. Customizable accent colors. |

## Architecture

ClawPad takes a different approach from most workspace apps: **the file system is the database**.

```
~/.openclaw/
├── pages/                    # All your documents
│   ├── daily-notes/          # Space (folder = space)
│   │   ├── _space.yml        # Space metadata
│   │   ├── 2026-02-04.md     # Page (markdown file)
│   │   └── 2026-02-03.md
│   ├── projects/
│   │   ├── _space.yml
│   │   └── clawpad/
│   │       ├── overview.md   # Nested page
│   │       └── roadmap.md
│   └── knowledge-base/
│       └── memory.md
└── openclaw.json             # Gateway config
```

**Why files?**

- Your OpenClaw agent already reads and writes markdown files. ClawPad just gives you a nice UI for the same files.
- Git-compatible out of the box. Version control your entire workspace.
- No database to set up, migrate, or back up. `cp -r` is your backup strategy.
- Grep, sed, awk — your existing tools still work. ClawPad doesn't lock you in.

Documents use YAML frontmatter for metadata:

```markdown
---
title: Project Roadmap
icon: 🗺️
created: 2026-01-30T14:00:00Z
tags: [project, planning]
---

# Project Roadmap

Your content here...
```

### Gateway Integration

When an OpenClaw agent is running, ClawPad connects to the gateway (default `ws://localhost:18789`) to:

- Chat with your agent via the AI chat panel
- Detect file changes made by the agent in real-time
- Access agent sessions and activity

The gateway connection is optional — ClawPad works standalone as a markdown editor too.

> For more technical details, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Requirements

- **Node.js 18+**
- **OpenClaw agent** — optional but recommended. Without it, you get a great markdown editor. With it, you get an AI-powered workspace.

## Configuration

ClawPad works out of the box with zero configuration. For advanced setups:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `OPENAI_API_KEY` | — | Required for AI writing features (inline rewrite, expand, etc.) |
| `OPENCLAW_GATEWAY_URL` | `http://localhost:18789` | OpenClaw gateway URL |
| `CLAWPAD_PAGES_DIR` | `~/.openclaw/pages` | Document root directory |

## Development

```bash
# Clone the repo
git clone https://github.com/mhmdez/clawpad.git
cd clawpad

# Install dependencies
pnpm install

# Start dev server (with Turbopack)
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start
```

### Project Structure

```
src/
├── app/                     # Next.js App Router pages
│   ├── api/                 # API routes
│   │   ├── ai/write/        # AI writing endpoint
│   │   ├── chat/            # AI chat streaming
│   │   ├── files/           # File CRUD operations
│   │   ├── gateway/         # Gateway proxy routes
│   │   └── setup/           # Onboarding/bootstrap
│   ├── workspace/           # Main workspace UI
│   └── settings/            # Settings pages
├── components/
│   ├── editor/              # BlockNote editor components
│   ├── chat/                # Chat panel
│   ├── sidebar/             # Navigation sidebar
│   └── ui/                  # shadcn/ui primitives
├── hooks/                   # Custom React hooks
└── lib/
    ├── files/               # File system operations
    ├── gateway/             # Gateway client
    ├── stores/              # Zustand state stores
    └── utils/               # Shared utilities
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Next.js 15](https://nextjs.org) (App Router) |
| Editor | [BlockNote](https://blocknotejs.org) |
| AI | [Vercel AI SDK](https://sdk.vercel.ai) |
| Styling | [Tailwind CSS v4](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com) |
| State | [Zustand](https://zustand.docs.pmnd.rs) |
| Animation | [Framer Motion](https://motion.dev) |
| Typography | [Geist](https://vercel.com/font) |
| Icons | [Lucide](https://lucide.dev) |

## License

MIT — see [LICENSE](LICENSE) for details.

## Links

- [OpenClaw Documentation](https://docs.openclaw.dev)
- [Discord Community](https://discord.gg/openclaw)
- [GitHub](https://github.com/mhmdez/clawpad)

---

<p align="center">
  Built with ☕ for the OpenClaw community
</p>
