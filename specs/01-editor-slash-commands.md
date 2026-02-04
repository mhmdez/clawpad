# Spec 01: Editor Slash Commands & Custom Blocks

## Status: PENDING

## Goal
Enhance the BlockNote editor with AI-powered slash commands and custom block types that make ClawPad feel like a proper workspace app.

## Current State
- BlockNote editor exists at `src/components/editor/editor.tsx` (352 lines)
- Already has 3 custom slash menu items: Ask AI, Extract Tasks, Improve Writing
- Uses `getDefaultReactSlashMenuItems()` + `SuggestionMenuController`
- `filterSuggestionItems` imported from `@blocknote/core/extensions`
- AI toolbar exists at `src/components/editor/ai-toolbar.tsx` — floating toolbar on text selection

## Tasks

### 1.1 — Fix existing slash commands
The 3 custom slash items (Ask AI, Extract Tasks, Improve Writing) need their `execute` handlers connected to the actual AI write API at `/api/ai/write`.

**Files:** `src/components/editor/editor.tsx`

**Acceptance:**
- `/ai` slash command opens an inline text input, user types a prompt, AI response streams into a new block below
- `/tasks` extracts tasks from selected/all content, inserts as checkbox blocks
- `/improve` runs the improve action on the current block's text

### 1.2 — Add new slash commands
Add these slash menu items:

| Command | Description | Implementation |
|---------|-------------|----------------|
| `/summarize` | Summarize page content | Call `/api/ai/write` with action `summarize`, insert below |
| `/translate` | Translate selected text | Prompt for target language, call with action `translate` |
| `/daily-note` | Insert today's date as H2 heading | Insert `## YYYY-MM-DD` block |
| `/callout` | Insert a callout/info block | Custom block type (see 1.3) |
| `/divider` | Insert horizontal rule | Standard BlockNote block |

**Files:** `src/components/editor/editor.tsx`

### 1.3 — Custom block types
Create custom BlockNote blocks:

**Callout Block:**
- Renders as a colored box with icon (info/warning/tip/error)
- Has a dropdown to switch type
- Markdown serialization: `> [!NOTE]` / `> [!WARNING]` / `> [!TIP]` (GitHub-flavored)

**Files:** Create `src/components/editor/blocks/callout-block.tsx`

**Acceptance:**
- Callout renders with appropriate icon and background color
- Type switchable via dropdown
- Serializes to/from GitHub-flavored markdown admonitions
- Works in both light and dark mode

### 1.4 — Slash menu styling
Style the slash menu to match ClawPad's design system (Geist font, proper spacing, grouped items with headers).

**Files:** `src/components/editor/editor.tsx`, potentially CSS overrides

## Dependencies
- BlockNote v0.46.2 already installed
- AI write API at `/api/ai/write` already working via gateway

## Test Criteria
- [ ] All slash commands execute without errors
- [ ] AI commands stream results into the editor
- [ ] Callout block renders correctly
- [ ] Callout serializes to/from markdown
- [ ] Slash menu has proper grouping (AI, Insert, Format)
