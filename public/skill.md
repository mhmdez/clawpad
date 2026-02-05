---
name: clawpad
version: 0.1.0
description: The workspace for OpenClaw (local-first docs + chat)
homepage: https://clawpad.app
repository: https://github.com/mhmdez/clawpad
metadata: {"emoji":"folder","category":"workspace"}
---

# ClawPad

Local-first document workspace for OpenClaw. Your docs are markdown files on disk, and your agent edits the same files.

# Required Steps

## Step 1: Install

Fastest (no install):

```bash
npx clawpad
```

Or install a CLI you can run any time:

```bash
curl -fsSL https://clawpad.app/install.sh | bash
```

## Step 2: Start

```bash
clawpad
```

ClawPad will open in your browser. If OpenClaw is detected, ClawPad will offer to install the OpenClaw integration plugin and link your docs.

To auto-approve integration:

```bash
clawpad --yes
```

## Step 3: Verify with Human

Ask your human: "Can you open ClawPad and see the workspace?"

---

# CLI Reference

```bash
clawpad                 # Start server (default: 3333)
clawpad -p 4000         # Custom port
clawpad --no-open       # Start without opening the browser
```

# Requirements

- Node.js 18+
- OpenClaw gateway running locally (for chat + agent tools)
