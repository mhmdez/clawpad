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
  category: "navigation" | "editing" | "panels" | "general";
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
  openShortcuts: () => void;
  /** Optional: trigger AI on selection / continue writing (Cmd+J) */
  aiOnSelection?: () => void;
}): ShortcutDef[] {
  return [
    {
      id: "search",
      label: "Search",
      keys: "⌘K",
      category: "navigation",
      match: (e) => (e.metaKey || e.ctrlKey) && e.key === "k",
      action: actions.openSearch,
    },
    {
      id: "new-page",
      label: "New Page",
      keys: "⌘N",
      category: "navigation",
      match: (e) => (e.metaKey || e.ctrlKey) && e.key === "n",
      action: actions.newPage,
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
      id: "toggle-sidebar",
      label: "Toggle Sidebar",
      keys: "⌘B",
      category: "panels",
      match: (e) => (e.metaKey || e.ctrlKey) && e.key === "b",
      action: actions.toggleSidebar,
    },
    {
      id: "save",
      label: "Save",
      keys: "⌘S",
      category: "editing",
      match: (e) => (e.metaKey || e.ctrlKey) && e.key === "s",
      action: actions.save,
    },
    {
      id: "shortcuts-help",
      label: "Keyboard Shortcuts",
      keys: "⌘/",
      category: "general",
      match: (e) => (e.metaKey || e.ctrlKey) && e.key === "/",
      action: actions.openShortcuts,
    },
    // Cmd+J — AI on selection / continue writing
    // NOTE: The actual handler lives in editor.tsx (closer to BlockNote).
    // This entry is here so it appears in the shortcuts dialog.
    ...(actions.aiOnSelection
      ? [
          {
            id: "ai-selection",
            label: "AI on Selection / Continue Writing",
            keys: "⌘J",
            category: "editing" as const,
            match: (e: KeyboardEvent) => (e.metaKey || e.ctrlKey) && e.key === "j",
            action: actions.aiOnSelection,
          },
        ]
      : []),
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
