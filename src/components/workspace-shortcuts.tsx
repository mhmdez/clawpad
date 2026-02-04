"use client";

import { useMemo, useCallback } from "react";
import { useTheme } from "next-themes";
import { useWorkspaceStore } from "@/lib/stores/workspace";
import {
  useShortcuts,
  getDefaultShortcuts,
  type ShortcutDef,
} from "@/hooks/use-shortcuts";
import { ShortcutsDialog } from "@/components/shortcuts-dialog";

/**
 * Workspace-level keyboard shortcuts provider.
 * Mounts the global shortcut listener and the shortcuts help dialog.
 */
export function WorkspaceShortcuts() {
  const toggleSidebar = useWorkspaceStore((s) => s.toggleSidebar);
  const toggleChatPanel = useWorkspaceStore((s) => s.toggleChatPanel);
  const { resolvedTheme, setTheme } = useTheme();

  const openSearch = useCallback(() => {
    // Dispatch the same event the command palette listens for
    const event = new KeyboardEvent("keydown", {
      key: "k",
      metaKey: true,
      bubbles: true,
    });
    document.dispatchEvent(event);
  }, []);

  const openNewPage = useCallback(() => {
    window.dispatchEvent(new CustomEvent("clawpad:new-page"));
  }, []);

  const openShortcutsDialog = useCallback(() => {
    window.dispatchEvent(new CustomEvent("clawpad:shortcuts-dialog"));
  }, []);

  const triggerSave = useCallback(() => {
    // The editor already handles Cmd+S internally, but we dispatch
    // a custom event as a fallback for non-editor contexts
    window.dispatchEvent(new CustomEvent("clawpad:save"));
  }, []);

  const triggerSaveAll = useCallback(() => {
    // Same as save for now — single-document app
    window.dispatchEvent(new CustomEvent("clawpad:save"));
  }, []);

  const toggleDarkMode = useCallback(() => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  }, [resolvedTheme, setTheme]);

  const focusEditor = useCallback(() => {
    // Focus the BlockNote editor area
    const editorEl =
      document.querySelector<HTMLElement>(".clawpad-editor [contenteditable]") ??
      document.querySelector<HTMLElement>(".clawpad-editor .bn-editor") ??
      document.querySelector<HTMLElement>(".clawpad-editor");
    if (editorEl) {
      editorEl.focus();
    }
  }, []);

  const shortcuts: ShortcutDef[] = useMemo(
    () =>
      getDefaultShortcuts({
        openSearch,
        newPage: openNewPage,
        toggleChat: toggleChatPanel,
        toggleSidebar,
        save: triggerSave,
        saveAll: triggerSaveAll,
        openShortcuts: openShortcutsDialog,
        toggleDarkMode,
        focusEditor,
      }),
    [
      openSearch,
      openNewPage,
      toggleChatPanel,
      toggleSidebar,
      triggerSave,
      triggerSaveAll,
      openShortcutsDialog,
      toggleDarkMode,
      focusEditor,
    ],
  );

  // Register shortcuts that aren't already handled elsewhere.
  // Cmd+K is handled by CommandPalette, Cmd+S by Editor, Cmd+Shift+L by ChatPanel.
  // We handle all other shortcuts here as a centralized fallback.
  // Only register shortcuts that aren't already handled by other components:
  // - Cmd+K: CommandPalette handles it
  // - Cmd+N: NewPageDialog handles it
  // - Cmd+S: Editor handles it
  // - Cmd+Shift+L: ChatPanel handles it
  // - Cmd+J: Editor handles it
  const exclusiveShortcuts = useMemo(
    () =>
      shortcuts.filter((s) =>
        [
          "toggle-sidebar",
          "shortcuts-help",
          "toggle-dark-mode",
          "focus-editor",
          "quick-switcher",
          "save-all",
        ].includes(s.id),
      ),
    [shortcuts],
  );

  useShortcuts(exclusiveShortcuts);

  return <ShortcutsDialog shortcuts={shortcuts} />;
}
