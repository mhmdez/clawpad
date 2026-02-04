# Spec 02: AI Writing UX — Selection Toolbar & Inline AI

## Status: PENDING

## Goal
Make the AI writing features discoverable and delightful. Users should be able to select text and get AI actions, or invoke AI inline via keyboard shortcut.

## Current State
- `AIToolbar` component exists at `src/components/editor/ai-toolbar.tsx` — fully built floating toolbar
- Actions: Improve, Simplify, Expand, Summarize, Fix Grammar
- Calls `/api/ai/write` which routes through gateway `/v1/responses`
- The toolbar is rendered in `editor.tsx` but needs to be triggered by text selection events
- Editor has a `callAIWrite()` helper function

## Tasks

### 2.1 — Wire up selection-based toolbar trigger
Connect BlockNote's selection change events to show/hide the AI toolbar.

**Implementation:**
- Listen to BlockNote editor selection changes via `editor.onSelectionChange`
- When text is selected, calculate position (use `editor.getSelection()` bounding rect)
- Show `AIToolbar` at the calculated position
- Hide when selection is cleared or user clicks away

**Files:** `src/components/editor/editor.tsx`, `src/components/editor/ai-toolbar.tsx`

**Acceptance:**
- Select any text → AI toolbar floats above/below selection
- Click an action → text is replaced with AI result
- Loading spinner shows during processing
- Toolbar dismisses on Escape, click outside, or selection clear

### 2.2 — Streaming replacement preview
Instead of waiting for the full AI response, show a live preview as text streams in.

**Implementation:**
- Modify `callAIWrite()` to accept a `onChunk` callback
- During streaming, show the partial result in a preview below the selection
- On completion, replace the selection with the final result
- Add an "Accept" / "Discard" button pair after AI result appears

**Files:** `src/components/editor/editor.tsx`, `src/components/editor/ai-toolbar.tsx`

**Acceptance:**
- Text streams visibly as AI generates it
- User can accept or discard the result
- Discard restores original text
- Accept replaces selection and dismisses toolbar

### 2.3 — Keyboard shortcut for inline AI
Add `Cmd+J` (or `Cmd+Shift+A`) to invoke AI on current selection without needing the floating toolbar.

**Implementation:**
- Register keyboard shortcut in the editor or via `workspace-shortcuts.tsx`
- If text is selected: show a mini action picker (improve/simplify/expand)
- If no selection: open inline prompt input (type a freeform instruction)

**Files:** `src/components/editor/editor.tsx`, `src/hooks/use-shortcuts.ts`

### 2.4 — "Continue writing" action
Add a "Continue" action that generates text continuing from the cursor position.

**Implementation:**
- Get the last ~500 chars before cursor as context
- Call `/api/ai/write` with action `continue`
- Stream result directly at cursor position (append, don't replace)

**Files:** `src/components/editor/editor.tsx`, API already supports `continue` action

## Dependencies
- Spec 01 (slash commands) can be done in parallel
- AI write API already working

## Test Criteria
- [ ] Text selection triggers floating AI toolbar
- [ ] All 5 actions (improve, simplify, expand, summarize, fix-grammar) work
- [ ] Streaming preview shows partial results
- [ ] Accept/Discard flow works correctly
- [ ] Keyboard shortcut triggers AI
- [ ] Continue writing appends at cursor
