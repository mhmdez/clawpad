"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  FileText,
  BookOpen,
  ClipboardList,
  Wrench,
  Loader2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AIAction = "improve" | "simplify" | "expand" | "summarize" | "fix-grammar";

interface AIToolbarProps {
  /** Called to get the currently selected text from the editor */
  getSelectedText: () => string;
  /** Called to replace the selection with the AI result */
  replaceSelection: (text: string) => void;
  /** Whether the toolbar should be visible (text is selected) */
  visible: boolean;
  /** Position of the toolbar */
  position: { top: number; left: number };
  /** Called when the toolbar should be dismissed */
  onDismiss: () => void;
}

const actions: { action: AIAction; icon: typeof Sparkles; label: string }[] = [
  { action: "improve", icon: Sparkles, label: "Improve" },
  { action: "simplify", icon: FileText, label: "Simplify" },
  { action: "expand", icon: BookOpen, label: "Expand" },
  { action: "summarize", icon: ClipboardList, label: "Summarize" },
  { action: "fix-grammar", icon: Wrench, label: "Fix Grammar" },
];

export function AIToolbar({
  getSelectedText,
  replaceSelection,
  visible,
  position,
  onDismiss,
}: AIToolbarProps) {
  const [loading, setLoading] = useState(false);
  const [activeAction, setActiveAction] = useState<AIAction | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  // Dismiss on Escape
  useEffect(() => {
    if (!visible) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onDismiss();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [visible, onDismiss]);

  // Dismiss on click outside
  useEffect(() => {
    if (!visible) return;
    const handleClick = (e: MouseEvent) => {
      if (
        toolbarRef.current &&
        !toolbarRef.current.contains(e.target as Node)
      ) {
        onDismiss();
      }
    };
    // Use a small delay so the toolbar click itself doesn't trigger dismiss
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClick);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [visible, onDismiss]);

  const handleAction = useCallback(
    async (action: AIAction) => {
      const text = getSelectedText();
      if (!text.trim()) return;

      setLoading(true);
      setActiveAction(action);

      try {
        const res = await fetch("/api/ai/write", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, action }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(
            (err as { error?: string }).error ?? `Request failed: ${res.status}`,
          );
        }

        // Read the stream
        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let result = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          result += decoder.decode(value, { stream: true });
        }

        if (result.trim()) {
          replaceSelection(result.trim());
        }
      } catch (err) {
        console.error("AI write failed:", err);
      } finally {
        setLoading(false);
        setActiveAction(null);
        onDismiss();
      }
    },
    [getSelectedText, replaceSelection, onDismiss],
  );

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          ref={toolbarRef}
          initial={{ opacity: 0, y: 4, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 4, scale: 0.95 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className={cn(
            "fixed z-50 flex items-center gap-1 rounded-lg border bg-popover p-1 shadow-lg",
          )}
          style={{
            top: position.top,
            left: position.left,
          }}
        >
          {loading ? (
            <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span className="capitalize">{activeAction}ing…</span>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-0.5 px-1 text-xs text-muted-foreground">
                <Sparkles className="mr-1 h-3 w-3" />
                AI
              </div>
              <div className="h-4 w-px bg-border" />
              {actions.map(({ action, icon: Icon, label }) => (
                <Button
                  key={action}
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs"
                  onClick={() => handleAction(action)}
                  disabled={loading}
                >
                  <Icon className="h-3 w-3" />
                  {label}
                </Button>
              ))}
              <div className="h-4 w-px bg-border" />
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={onDismiss}
              >
                <X className="h-3 w-3" />
              </Button>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
