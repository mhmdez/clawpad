# Spec 09: npm Package (`npx clawpad`)

## Status: PENDING

## Goal
Users can run `npx clawpad` to start ClawPad locally. Zero config, auto-detects gateway, opens browser.

## Current State
- ClawPad is a Next.js app at `/Users/mhmdez/clawd/sites/clawpad-v2/`
- Has `package.json` but not configured as a publishable package
- No bin entry, no CLI script
- Dev server runs via `npm run dev` (Next.js dev mode)

## Tasks

### 9.1 — Build configuration
Set up Next.js production build and standalone output.

**Implementation:**
- Configure `next.config.ts` with `output: 'standalone'`
- Ensure all server-side code (file watchers, WS client) works in production mode
- Test `npm run build && npm start`
- Verify chokidar, ws, gray-matter work in production bundle

**Files:** `next.config.ts`, `package.json`

### 9.2 — CLI entry point
Create a CLI script that starts ClawPad:

```bash
npx clawpad          # Start on default port (3333)
npx clawpad -p 4000  # Custom port
npx clawpad --open   # Auto-open browser (default: true)
```

**Implementation:**
- Create `bin/clawpad.js` CLI entry point
- Parse args (port, open, help)
- Run `next start` with appropriate config
- Auto-open browser after server is ready
- Print: "ClawPad running at http://localhost:3333"
- Print: "Connected to OpenClaw gateway at ..." (if detected)

**Files:** Create `bin/clawpad.js`, update `package.json` `bin` field

### 9.3 — Package.json configuration
Set up for npm publishing:

```json
{
  "name": "clawpad",
  "version": "0.1.0",
  "description": "The workspace for OpenClaw",
  "bin": { "clawpad": "./bin/clawpad.js" },
  "files": ["bin/", ".next/standalone/", ".next/static/", "public/"],
  "engines": { "node": ">=18" }
}
```

**Files:** `package.json`

### 9.4 — Prepublish build script
Create a script that builds and prepares for publishing:

```json
{
  "scripts": {
    "prepublishOnly": "npm run build"
  }
}
```

**Files:** `package.json`

### 9.5 — README
Write a concise README for the npm package:
- What ClawPad is (one paragraph)
- Quick start: `npx clawpad`
- Requirements: Node 18+, OpenClaw gateway running
- Screenshot
- Link to full docs

**Files:** Create/update `README.md`

## Dependencies
- All other specs should be done first (this is the packaging step)
- Needs a production build test

## Test Criteria
- [ ] `npm run build` succeeds
- [ ] `npm start` serves the app correctly
- [ ] `node bin/clawpad.js` starts the server
- [ ] Auto-detects gateway in production mode
- [ ] File watchers work in production
- [ ] WebSocket client connects in production
- [ ] Browser auto-opens on start
- [ ] `npx clawpad` works from a clean environment
