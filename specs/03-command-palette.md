# Spec 03: Command Palette Enhancement

## Status: PENDING

## Goal
Upgrade the command palette (Cmd+K) to be a powerful hub: page search, commands, recent files, and AI quick actions.

## Current State
- `CommandPalette` exists at `src/components/command-palette.tsx` (317 lines)
- Uses `cmdk` (already installed)
- Has basic structure but needs real search integration
- Keyboard shortcut `Cmd+K` likely wired in `workspace-shortcuts.tsx`

## Tasks

### 3.1 — Real-time page search
Connect the command palette to the file search API.

**Implementation:**
- On keystroke, debounce (200ms) and call `/api/files/search?q=...`
- Show results with: page title, space badge, icon, modified date
- Enter navigates to the selected page
- Empty state shows recent pages from `/api/files/recent`

**Files:** `src/components/command-palette.tsx`

**Acceptance:**
- Typing filters pages in real-time
- Results show title + space + date
- Enter opens the page
- Empty query shows recent pages
- Loading state while searching

### 3.2 — Command sections
Add grouped command sections below search results:

| Section | Commands |
|---------|----------|
| Pages | New Page, New Daily Note |
| AI | Ask Agent, Summarize Page, Improve Writing |
| Navigation | Go to Settings, Go to Setup |
| Actions | Toggle Chat, Toggle Sidebar, Toggle Dark Mode |

**Implementation:**
- Use cmdk's `<Command.Group>` for sections
- Commands appear below search results
- Each command has an icon, label, and keyboard shortcut hint

**Files:** `src/components/command-palette.tsx`

### 3.3 — Quick page creation
From the command palette, typing a name that doesn't match existing pages shows "Create page: [name]" option.

**Implementation:**
- If no search results, show a "Create new page" option
- Selecting it creates the page and navigates to it
- Uses existing `/api/files/pages/[...path]` PUT endpoint

**Files:** `src/components/command-palette.tsx`

### 3.4 — Keyboard shortcut hints
Show keyboard shortcuts next to commands in the palette.

| Command | Shortcut |
|---------|----------|
| New Page | ⌘N |
| Toggle Chat | ⌘⇧L |
| Search | ⌘K |
| Save | ⌘S |

**Files:** `src/components/command-palette.tsx`

## Dependencies
- File search API exists at `/api/files/search`
- Recent files API exists at `/api/files/recent`

## Test Criteria
- [ ] Cmd+K opens the palette
- [ ] Typing searches pages in real-time
- [ ] Results show proper metadata
- [ ] Commands are grouped and functional
- [ ] Quick page creation works
- [ ] Keyboard shortcuts display correctly
- [ ] Escape closes the palette
