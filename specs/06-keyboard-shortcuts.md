# Spec 06: Keyboard Shortcuts System

## Status: PENDING

## Goal
Comprehensive keyboard shortcut system with a discoverable shortcuts dialog.

## Current State
- `use-shortcuts.ts` hook exists at `src/hooks/use-shortcuts.ts`
- `workspace-shortcuts.tsx` component exists (68 lines)
- `shortcuts-dialog.tsx` component exists — shows available shortcuts
- `Cmd+Shift+L` toggles chat panel (already working)
- `Cmd+K` opens command palette (already working)

## Tasks

### 6.1 — Implement all shortcut bindings
Register these keyboard shortcuts:

| Shortcut | Action | Context |
|----------|--------|---------|
| ⌘K | Command palette | Global |
| ⌘N | New page | Global |
| ⌘⇧L | Toggle chat panel | Global |
| ⌘S | Force save | Editor |
| ⌘⇧S | Save all | Global |
| ⌘P | Quick page switcher (= Cmd+K) | Global |
| ⌘\\ | Toggle sidebar | Global |
| ⌘⇧D | Toggle dark mode | Global |
| ⌘⇧E | Focus editor | Global |
| ⌘J | AI on selection | Editor |
| ⌘/ | Shortcuts help dialog | Global |
| Escape | Close panel/dialog/palette | Global |

**Files:** `src/hooks/use-shortcuts.ts`, `src/components/workspace-shortcuts.tsx`

### 6.2 — Shortcuts help dialog
Enhance the existing `shortcuts-dialog.tsx` to show all shortcuts in a nicely formatted dialog:
- Grouped by category (Navigation, Editor, AI, Panels)
- Shows the key combo with proper glyph rendering (⌘ ⇧ ⌥ ⌃)
- Triggered by `Cmd+/` or from command palette "Keyboard Shortcuts"

**Files:** `src/components/shortcuts-dialog.tsx`

### 6.3 — Shortcut hints in UI
Show shortcut hints in:
- Command palette (next to each command)
- Tooltip on sidebar buttons
- Chat panel open/close button tooltip

**Files:** Multiple components

### 6.4 — Prevent conflicts
Ensure shortcuts don't conflict with:
- Browser defaults (Cmd+L, Cmd+T, etc.)
- BlockNote's built-in shortcuts (Cmd+B, Cmd+I, etc.)
- OS shortcuts

**Files:** `src/hooks/use-shortcuts.ts`

## Dependencies
- None — independent

## Test Criteria
- [ ] All shortcuts in the table above work
- [ ] Shortcuts dialog shows with Cmd+/
- [ ] No conflicts with browser/editor/OS shortcuts
- [ ] Shortcuts shown in command palette
- [ ] Shortcuts work regardless of focus (editor, chat, sidebar)
- [ ] Escape closes the top-most overlay
