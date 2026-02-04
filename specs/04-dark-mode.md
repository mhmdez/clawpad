# Spec 04: Dark Mode

## Status: DONE

## Goal
Full dark mode support with system preference detection and manual toggle.

## Current State
- `next-themes` already installed and likely in providers
- `useTheme` imported in `editor.tsx` (BlockNote supports dark theme)
- `appearance.ts` store exists for font size and editor width
- shadcn/ui components support dark mode via CSS variables
- BlockNote/Mantine has dark theme support via `theme` prop
- Tailwind v4 has `dark:` variant support

## Tasks

### 4.1 — Wire up ThemeProvider
Ensure `next-themes` `ThemeProvider` is in the app layout with `attribute="class"` and `defaultTheme="system"`.

**Files:** `src/components/providers.tsx`, `src/app/layout.tsx`

**Check:** May already be configured. Verify and fix if needed.

### 4.2 — Dark mode CSS variables
Add dark mode color variables matching the spec's design system:

```css
.dark {
  --bg-primary: #191919;
  --bg-secondary: #1e1e1e;
  --bg-sidebar: #1a1a1a;
  --text-primary: #ededed;
  --text-secondary: #999;
  --border: #2e2e2e;
  --accent: #3b82f6;
}
```

Map these to shadcn/ui's CSS variable system (`--background`, `--foreground`, `--card`, etc.)

**Files:** `src/app/globals.css` or Tailwind config

### 4.3 — BlockNote dark theme
Pass the theme to BlockNote:

```tsx
<BlockNoteView editor={editor} theme={resolvedTheme === 'dark' ? 'dark' : 'light'} />
```

**Files:** `src/components/editor/editor.tsx`

### 4.4 — Theme toggle
Add a theme toggle to:
1. Settings page (explicit Light/Dark/System selector)
2. Command palette (quick toggle command)
3. Sidebar footer (small icon toggle)

**Files:** `src/app/settings/page.tsx`, `src/components/command-palette.tsx`, `src/components/sidebar/sidebar-content.tsx`

### 4.5 — Component audit
Audit all components for hardcoded colors that don't respect dark mode:
- Chat panel message bubbles
- Activity feed
- Connection status badges
- AI toolbar
- Sidebar sections

**Files:** Multiple — scan for hardcoded `bg-white`, `bg-zinc-*`, `text-black`, etc. that need `dark:` variants

## Dependencies
- None — can be done independently

## Test Criteria
- [ ] System preference auto-detection works
- [ ] Manual toggle switches between light/dark/system
- [ ] All UI elements readable in dark mode
- [ ] BlockNote editor dark theme applies
- [ ] No hardcoded colors breaking dark mode
- [ ] Chat panel, sidebar, activity feed all dark-mode compatible
- [ ] Settings page has theme selector
