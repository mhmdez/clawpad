"use client";

import { useEffect, useCallback, useRef } from "react";

export interface ShortcutDef {
  /** Unique key for the shortcut */
  id: string;
  /** Display label */
  label: string;
  /** Key combo display (e.g. "⌘K") */
  keys: string;
  /** Category for grouping in the help dialog */
  category: "navigation" | "editing" | "ai" | "panels" | "general";
  /** The keyboard event matcher */
  match: (e: KeyboardEvent) => boolean;
  /** Action to run */
  action: () => void;
}

/**
 * All registered shortcuts for the workspace.
 * The hook below uses these; the shortcuts dialog reads them for display.
 */
export function getDefaultShortcuts(actions: {
  openSearch: () => void;
  newPage: () => void;
  toggleChat: () => void;
  toggleSidebar: () => void;
  save: () => void;
  saveAll: () => void;
  openShortcuts: () => void;
  toggleDarkMode: () => void;
  focusEditor: () => void;
  /** Optional: trigger AI on selection / continue writing (Cmd+J) */
  aiOnSelection?: () => void;
}): ShortcutDef[] {
  return [
    // ── Navigation ──────────────────────────────────────
    {
      id: "search",
      label: "Search",
      keys: "⌘K",
      category: "navigation",
      match: (e) => (e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === "k",
      action: actions.openSearch,
    },
    {
      id: "quick-switcher",
      label: "Quick Page Switcher",
      keys: "⌘P",
      category: "navigation",
      match: (e) => (e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === "p",
      action: actions.openSearch, // Same as Cmd+K
    },
    {
      id: "new-page",
      label: "New Page",
      keys: "⌘N",
      category: "navigation",
      match: (e) => (e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === "n",
      action: actions.newPage,
    },

    // ── Panels ──────────────────────────────────────────
    {
      id: "toggle-sidebar",
      label: "Toggle Sidebar",
      keys: "⌘\\",
      category: "panels",
      match: (e) => (e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === "\\",
      action: actions.toggleSidebar,
    },
    {
      id: "toggle-chat",
      label: "Toggle Chat",
      keys: "⌘⇧L",
      category: "panels",
      match: (e) => (e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "l",
      action: actions.toggleChat,
    },
    {
      id: "focus-editor",
      label: "Focus Editor",
      keys: "⌘⇧E",
      category: "panels",
      match: (e) => (e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "e",
      action: actions.focusEditor,
    },

    // ── Editing ─────────────────────────────────────────
    {
      id: "save",
      label: "Save",
      keys: "⌘S",
      category: "editing",
      match: (e) => (e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === "s",
      action: actions.save,
    },
    {
      id: "save-all",
      label: "Save All",
      keys: "⌘⇧S",
      category: "editing",
      match: (e) => (e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "s",
      action: actions.saveAll,
    },

    // ── AI ───────────────────────────────────────────────
    // Cmd+J — AI on selection / continue writing
    // NOTE: The actual handler lives in editor.tsx (closer to BlockNote).
    // This entry is here so it appears in the shortcuts dialog.
    ...(actions.aiOnSelection
      ? [
          {
            id: "ai-selection",
            label: "AI on Selection",
            keys: "⌘J",
            category: "ai" as const,
            match: (e: KeyboardEvent) => (e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === "j",
            action: actions.aiOnSelection,
          },
        ]
      : [
          // Always show in dialog even if no handler
          {
            id: "ai-selection",
            label: "AI on Selection",
            keys: "⌘J",
            category: "ai" as const,
            match: (e: KeyboardEvent) => (e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === "j",
            action: () => {}, // No-op when no editor context
          },
        ]),

    // ── General ─────────────────────────────────────────
    {
      id: "toggle-dark-mode",
      label: "Toggle Dark Mode",
      keys: "⌘⇧D",
      category: "general",
      match: (e) => (e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "d",
      action: actions.toggleDarkMode,
    },
    {
      id: "shortcuts-help",
      label: "Keyboard Shortcuts",
      keys: "⌘/",
      category: "general",
      match: (e) => (e.metaKey || e.ctrlKey) && e.key === "/",
      action: actions.openShortcuts,
    },
  ];
}

/**
 * Hook that listens for global keyboard shortcuts and dispatches actions.
 * Only shortcuts NOT already handled by other components (like Cmd+K in CommandPalette
 * or Cmd+S in Editor) need to be handled here. This provides a centralized fallback
 * and the canonical list for the shortcuts dialog.
 */
export function useShortcuts(shortcuts: ShortcutDef[]) {
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't intercept when typing in inputs (unless it's a global combo)
    const target = e.target as HTMLElement;
    const isInput =
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable;

    for (const shortcut of shortcutsRef.current) {
      if (shortcut.match(e)) {
        // Always allow meta+key combos even in inputs
        if (!isInput || e.metaKey || e.ctrlKey) {
          e.preventDefault();
          shortcut.action();
          return;
        }
      }
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [handleKeyDown]);
}

/**
 * Hook for Escape key to close modals/panels.
 * Separate from shortcuts because Escape needs special priority handling.
 */
export function useEscapeKey(onEscape: () => void, enabled = true) {
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onEscapeRef.current();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled]);
}
