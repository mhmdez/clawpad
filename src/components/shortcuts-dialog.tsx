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
  panels: "Panels",
  editing: "Editing",
  ai: "AI",
  general: "General",
};

const CATEGORY_ORDER = ["navigation", "panels", "editing", "ai", "general"];

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
 * Map of modifier/special key symbols to their display glyph.
 */
const KEY_GLYPHS: Record<string, string> = {
  "⌘": "⌘",
  "⇧": "⇧",
  "⌥": "⌥",
  "⌃": "⌃",
  "Cmd": "⌘",
  "Shift": "⇧",
  "Alt": "⌥",
  "Ctrl": "⌃",
  "Esc": "Esc",
  "Enter": "↵",
  "Tab": "⇥",
  "Backspace": "⌫",
  "Delete": "⌦",
  "\\": "\\",
};

/**
 * Renders a keyboard shortcut combo with styled key caps.
 * Handles glyphs like ⌘, ⇧, ⌥, ⌃ and splits them properly.
 */
export function ShortcutKeys({ keys, className }: { keys: string; className?: string }) {
  // Split on known modifier chars to render individual keys
  // e.g. "⌘⇧L" → ["⌘", "⇧", "L"], "⌘\\" → ["⌘", "\\"]
  const segments = parseKeyCombo(keys);

  return (
    <div className={`flex items-center gap-0.5 ${className ?? ""}`}>
      {segments.map((key, i) => (
        <kbd
          key={i}
          className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-muted/60 px-1 text-[11px] font-medium text-muted-foreground"
        >
          {KEY_GLYPHS[key] ?? key}
        </kbd>
      ))}
    </div>
  );
}

/**
 * Parse a key combo string into individual key segments.
 * "⌘⇧L" → ["⌘", "⇧", "L"]
 * "⌘\\" → ["⌘", "\\"]
 * "Esc" → ["Esc"]
 * "⌘K" → ["⌘", "K"]
 */
function parseKeyCombo(keys: string): string[] {
  const modifiers = new Set(["⌘", "⇧", "⌥", "⌃"]);
  const segments: string[] = [];
  let i = 0;

  while (i < keys.length) {
    const char = keys[i];
    if (modifiers.has(char)) {
      segments.push(char);
      i++;
    } else if (char === "+") {
      // Skip "+" separators
      i++;
    } else {
      // Collect the rest as a single key (e.g. "Esc", "\\", "K")
      segments.push(keys.slice(i));
      break;
    }
  }

  // If no segments were created, return the whole string
  if (segments.length === 0) {
    segments.push(keys);
  }

  return segments;
}
