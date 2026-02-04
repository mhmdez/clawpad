# Spec 08: Search Integration (QMD + Fallback)

## Status: PENDING

## Goal
Fast, accurate search across all workspace pages with optional QMD semantic search.

## Current State
- `/api/search` route exists — wraps QMD CLI
- `/api/files/search` route exists — basic text search
- `/api/settings/search-status` route exists — checks if QMD is installed
- Command palette has search UI
- QMD may or may not be installed on the system

## Tasks

### 8.1 — Improve basic text search
Make the grep-based fallback search fast and useful.

**Implementation:**
- Use `grep -ril` for fast case-insensitive search across `~/.openclaw/pages/`
- Parse frontmatter for title, extract surrounding context (snippet)
- Return results with: title, space, path, snippet with highlighted matches, modified date
- Limit to 20 results, sorted by relevance (title match > content match > date)

**Files:** `src/app/api/files/search/route.ts`

### 8.2 — QMD integration (when available)
If QMD is installed, use it for hybrid BM25 + vector search.

**Implementation:**
- Check QMD availability on startup via `qmd --version`
- If available, use `qmd query "<search>" --json -n 20` for search
- Parse QMD JSON output: score, path, snippet
- Fall back to basic search if QMD not installed or errors

**Files:** `src/app/api/search/route.ts`

### 8.3 — Search results UI
Proper search results page/panel:
- Show as a list with: title, space badge, snippet, score (if QMD), date
- Highlight matching terms in snippet
- Click result navigates to page
- Show search mode indicator (🔍 Basic or 🧠 Semantic)

**Files:** Create `src/components/search-results.tsx`, update command palette

### 8.4 — Search from command palette
Integrate search results directly in the command palette:
- Type to search (debounced)
- Results show inline in the palette
- Separate group: "Pages" (with results) and "Commands"
- Badge showing search mode

**Files:** `src/components/command-palette.tsx`

### 8.5 — Full search page
Create a dedicated search page at `/workspace/search?q=...`:
- Full-width results with larger snippets
- Filter by space
- Sort by relevance/date
- Shows which search backend is active

**Files:** Create `src/app/workspace/search/page.tsx`

## Dependencies
- QMD is optional — basic search must work standalone
- Command palette (Spec 03) is related but each can work independently

## Test Criteria
- [ ] Basic search returns results for known content
- [ ] Results include title, space, snippet, date
- [ ] QMD search works when QMD is installed
- [ ] Fallback to basic search when QMD unavailable
- [ ] Command palette shows search results
- [ ] Search page accessible at /workspace/search
- [ ] Search mode indicator shows correctly
