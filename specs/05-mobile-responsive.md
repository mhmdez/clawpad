# Spec 05: Mobile Responsive Layout

## Status: PENDING

## Goal
ClawPad works well on tablets and phones with bottom tab navigation and touch-friendly interactions.

## Current State
- `use-mobile.ts` hook exists (likely checks viewport width)
- `use-responsive.ts` hook exists
- `mobile-tabs.tsx` component exists (59 lines) — likely a stub
- Sidebar uses shadcn `Sheet` for mobile overlay
- Chat panel slides from right

## Tasks

### 5.1 — Mobile layout with bottom tabs
On screens < 768px, replace sidebar + editor layout with bottom tab navigation.

**Tabs:**
| Tab | Icon | View |
|-----|------|------|
| Pages | FileText | Space/page browser (replaces sidebar) |
| Editor | Edit3 | Current page editor (full width) |
| Chat | MessageCircle | Chat panel (full screen) |
| Activity | Activity | Activity feed (full screen) |

**Implementation:**
- Enhance `mobile-tabs.tsx` to be a full bottom tab bar
- Each tab shows its content full-screen
- Active tab indicator
- Floating action button for "New Page" on Pages tab

**Files:** `src/components/mobile-tabs.tsx`, `src/app/workspace/layout.tsx`

### 5.2 — Touch-friendly editor
Make the BlockNote editor work well on mobile:
- Larger tap targets for block handles
- AI toolbar appears above virtual keyboard
- Slash menu is scrollable and touch-friendly
- Page title input is large enough

**Files:** `src/components/editor/editor.tsx`, CSS overrides

### 5.3 — Sidebar as bottom sheet
On mobile, the sidebar content becomes a swipeable bottom sheet (or full-screen overlay):
- Pull up from bottom to browse pages
- Search at top
- Spaces collapsible
- Tap page to navigate + close sheet

**Files:** `src/components/sidebar/sidebar.tsx`, `src/app/workspace/layout.tsx`

### 5.4 — Chat panel full-screen on mobile
On mobile, the chat panel takes the full screen instead of a side panel:
- Full-width message area
- Keyboard-aware (input stays above virtual keyboard)
- Back button to return to editor

**Files:** `src/components/chat/chat-panel.tsx`

### 5.5 — Responsive breakpoints
Define and apply consistent breakpoints:

| Breakpoint | Layout |
|------------|--------|
| < 640px | Mobile: bottom tabs, single view |
| 640-1024px | Tablet: collapsible sidebar overlay, editor + chat |
| > 1024px | Desktop: sidebar + editor + chat panel |

**Files:** `src/app/workspace/layout.tsx`, `src/hooks/use-responsive.ts`

## Dependencies
- Spec 04 (dark mode) independent but nice to test together
- All other specs are independent

## Test Criteria
- [ ] Bottom tabs show on mobile viewport
- [ ] Tab switching works smoothly
- [ ] Editor is usable on mobile (text input, selection)
- [ ] Chat panel is full-screen on mobile
- [ ] Sidebar content accessible via bottom sheet
- [ ] No horizontal overflow on any mobile view
- [ ] Touch targets ≥ 44px
