# ClawPad UI Audit (Condensed)

## Visual Direction
- Notion × Vercel: clean, minimal, content-first.
- Light mode default, dark mode supported.
- Emoji optional: only show when explicitly set by users.

## Typographic Targets (UI)
- Labels and metadata: `ui-text-xs` or `ui-text-sm`.
- Row titles and primary labels: `ui-text`.
- Section headers and callouts: `ui-text-sm` or `ui-text` with weight.
- Editor text: driven by appearance setting (`--clawpad-font-size`).

## Spacing Targets
- Row height: 40–48px depending on density.
- Sidebar buttons: 8–10px vertical padding.
- Section padding: 16–20px.
- Card padding: 16–20px.

## Icon Rules
- Use Lucide icons by default.
- Emoji only when set in frontmatter or explicit user choice.
- Tool cards should never use emoji icons.

## Surface and Elevation
- Use surface tokens (`--cp-surface-1/2/3`) for cards and panels.
- Use `shadow-elev-1` for subtle elevation, `shadow-elev-2` for overlays.

## Accessibility
- Icon-only buttons must have `aria-label`.
- Focus-visible rings on custom buttons.
- Maintain 44px minimum touch targets on mobile.

## Motion
- 150–250ms transitions for interactive elements.
- Respect `prefers-reduced-motion`.
