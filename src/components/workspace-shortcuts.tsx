"use client";

import { useMemo, useCallback } from "react";
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

  const shortcuts: ShortcutDef[] = useMemo(
    () =>
      getDefaultShortcuts({
        openSearch,
        newPage: openNewPage,
        toggleChat: toggleChatPanel,
        toggleSidebar,
        save: triggerSave,
        openShortcuts: openShortcutsDialog,
      }),
    [openSearch, openNewPage, toggleChatPanel, toggleSidebar, triggerSave, openShortcutsDialog],
  );

  // Note: We DON'T register Cmd+K, Cmd+N, Cmd+S, Cmd+Shift+L here because
  // those are already handled by CommandPalette, NewPageDialog, Editor, and ChatPanel.
  // We only register shortcuts that aren't handled elsewhere.
  const exclusiveShortcuts = useMemo(
    () => shortcuts.filter((s) => ["toggle-sidebar", "shortcuts-help"].includes(s.id)),
    [shortcuts],
  );

  useShortcuts(exclusiveShortcuts);

  return <ShortcutsDialog shortcuts={shortcuts} />;
}
