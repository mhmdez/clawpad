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

## Quick Start

```bash
npx clawpad
```

That's it. ClawPad starts on `http://localhost:3333`, opens your browser, and auto-detects your OpenClaw gateway if it's running.

Your documents are plain markdown files in `~/.openclaw/pages/` — no database, no Docker.

### CLI Options

```bash
clawpad                   # Start on default port (3333)
clawpad -p 4000           # Custom port
clawpad --no-open         # Don't open the browser
clawpad --help            # Show help
```

## Requirements

- **Node.js 18+**
- **OpenClaw agent** (optional) — without it you get a markdown editor; with it, an AI-powered workspace

## Features

| | Feature | Description |
|---|---|---|
| 📝 | **Block Editor** | Notion-style block editing powered by BlockNote |
| 🤖 | **AI Chat** | Chat with your OpenClaw agent inside the workspace |
| ✨ | **AI Writing** | Highlight text → rewrite, expand, summarize, fix |
| 🔍 | **Smart Search** | Full-text search, hybrid BM25 + vector via QMD |
| 📱 | **Mobile Ready** | Responsive layout, swipeable panels, bottom tabs |
| ⌨️ | **Keyboard First** | `⌘K` palette, `⌘N` new page, `⌘/` chat |
| 🎨 | **Themes** | Light, dark, and system themes |

## Architecture

The file system is the database.

```
~/.openclaw/
├── pages/                    # All your documents
│   ├── daily-notes/          # Space (folder = space)
│   │   ├── _space.yml        # Space metadata
│   │   └── 2026-02-04.md     # Page (markdown file)
│   ├── projects/
│   │   └── clawpad/
│   │       ├── overview.md
│   │       └── roadmap.md
│   └── knowledge-base/
│       └── memory.md
└── openclaw.json             # Gateway config
```

Documents are standard markdown with optional YAML frontmatter. Your agent reads and writes the same files. Git-compatible out of the box.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3333` | Server port |
| `OPENAI_API_KEY` | — | Required for AI writing features |
| `OPENCLAW_GATEWAY_URL` | `ws://localhost:18789` | Gateway URL |
| `CLAWPAD_PAGES_DIR` | `~/.openclaw/pages` | Document root |

## Development

```bash
git clone https://github.com/mhmdez/clawpad.git
cd clawpad
pnpm install
pnpm dev          # Dev server with Turbopack
pnpm build        # Production build
pnpm start        # Start production server
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Next.js 15](https://nextjs.org) (App Router) |
| Editor | [BlockNote](https://blocknotejs.org) |
| AI | [Vercel AI SDK](https://sdk.vercel.ai) |
| Styling | [Tailwind CSS v4](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com) |
| State | [Zustand](https://zustand.docs.pmnd.rs) |

## License

MIT

---

<p align="center">
  Built with ☕ for the OpenClaw community
</p>
