"use client";

import { useState, useCallback, useEffect } from "react";
import { Keyboard } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { ShortcutDef } from "@/hooks/use-shortcuts";

const CATEGORY_LABELS: Record<string, string> = {
  navigation: "Navigation",
  editing: "Editing",
  panels: "Panels",
  general: "General",
};

const CATEGORY_ORDER = ["navigation", "panels", "editing", "general"];

/**
 * Keyboard shortcuts help dialog.
 * Opens via Cmd+/ or programmatically.
 */
export function ShortcutsDialog({
  shortcuts,
}: {
  shortcuts: ShortcutDef[];
}) {
  const [open, setOpen] = useState(false);

  // Listen for the custom event from the shortcut handler
  useEffect(() => {
    function handleOpen() {
      setOpen(true);
    }
    window.addEventListener("clawpad:shortcuts-dialog", handleOpen);
    return () => window.removeEventListener("clawpad:shortcuts-dialog", handleOpen);
  }, []);

  const handleOpenChange = useCallback((value: boolean) => {
    setOpen(value);
  }, []);

  // Group shortcuts by category
  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    label: CATEGORY_LABELS[cat] ?? cat,
    items: shortcuts.filter((s) => s.category === cat),
  })).filter((g) => g.items.length > 0);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-4 w-4 text-muted-foreground" />
            Keyboard Shortcuts
          </DialogTitle>
          <DialogDescription>
            Quick actions to navigate your workspace
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 py-2">
          {grouped.map((group) => (
            <div key={group.category}>
              <h4 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {group.label}
              </h4>
              <div className="space-y-1">
                {group.items.map((shortcut) => (
                  <div
                    key={shortcut.id}
                    className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/50"
                  >
                    <span className="text-foreground/80">{shortcut.label}</span>
                    <ShortcutKeys keys={shortcut.keys} />
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Escape is always available but not in the shortcuts list */}
          <div>
            <h4 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Other
            </h4>
            <div className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/50">
              <span className="text-foreground/80">Close dialog / panel</span>
              <ShortcutKeys keys="Esc" />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Renders a keyboard shortcut combo with styled key caps.
 */
function ShortcutKeys({ keys }: { keys: string }) {
  // Split on known modifier chars to render individual keys
  const parts = keys.split(/(?=[⌘⇧⌥⌃])|(?<=[⌘⇧⌥⌃])/g).filter(Boolean);

  // If no modifier symbols, split by + or render as-is
  const segments = parts.length > 1 ? parts : [keys];

  return (
    <div className="flex items-center gap-0.5">
      {segments.map((key, i) => (
        <kbd
          key={i}
          className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-muted/60 px-1 text-[11px] font-medium text-muted-foreground"
        >
          {key}
        </kbd>
      ))}
    </div>
  );
}
