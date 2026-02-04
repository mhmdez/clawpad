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
  Check,
  Undo2,
  PenLine,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AIAction =
  | "improve"
  | "simplify"
  | "expand"
  | "summarize"
  | "fix-grammar"
  | "continue";

type ToolbarPhase = "actions" | "streaming" | "review";

interface AIToolbarProps {
  /** Called to get the currently selected text from the editor */
  getSelectedText: () => string;
  /** Called to replace the selection with the AI result */
  replaceSelection: (text: string) => void;
  /** Called to restore original text on discard */
  restoreOriginal: () => void;
  /** Whether the toolbar should be visible (text is selected) */
  visible: boolean;
  /** Position of the toolbar */
  position: { top: number; left: number };
  /** Called when the toolbar should be dismissed */
  onDismiss: () => void;
  /** Whether to show the Continue writing action */
  showContinue?: boolean;
  /** Context text for continue action (last ~500 chars before cursor) */
  continueContext?: string;
  /** Called to insert text at cursor (for continue action) */
  insertAtCursor?: (text: string) => void;
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
  restoreOriginal,
  visible,
  position,
  onDismiss,
  showContinue,
  continueContext,
  insertAtCursor,
}: AIToolbarProps) {
  const [phase, setPhase] = useState<ToolbarPhase>("actions");
  const [streamedText, setStreamedText] = useState("");
  const [activeAction, setActiveAction] = useState<AIAction | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  // Reset state when toolbar hides
  useEffect(() => {
    if (!visible) {
      // Small delay so exit animation completes before resetting
      const t = setTimeout(() => {
        setPhase("actions");
        setStreamedText("");
        setActiveAction(null);
        if (abortRef.current) {
          abortRef.current.abort();
          abortRef.current = null;
        }
      }, 200);
      return () => clearTimeout(t);
    }
  }, [visible]);

  // Dismiss on Escape
  useEffect(() => {
    if (!visible) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (phase === "streaming") {
          // Abort the stream
          abortRef.current?.abort();
          restoreOriginal();
          setPhase("actions");
          setStreamedText("");
          setActiveAction(null);
        } else if (phase === "review") {
          // Discard
          restoreOriginal();
          onDismiss();
        } else {
          onDismiss();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [visible, phase, onDismiss, restoreOriginal]);

  // Dismiss on click outside (only in actions phase)
  useEffect(() => {
    if (!visible || phase !== "actions") return;
    const handleClick = (e: MouseEvent) => {
      if (
        toolbarRef.current &&
        !toolbarRef.current.contains(e.target as Node)
      ) {
        onDismiss();
      }
    };
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClick);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [visible, phase, onDismiss]);

  // Auto-scroll preview to bottom as text streams
  useEffect(() => {
    if (previewRef.current && phase === "streaming") {
      previewRef.current.scrollTop = previewRef.current.scrollHeight;
    }
  }, [streamedText, phase]);

  const handleAction = useCallback(
    async (action: AIAction) => {
      const isContinue = action === "continue";
      const text = isContinue ? (continueContext ?? "") : getSelectedText();
      if (!text.trim()) return;

      setPhase("streaming");
      setActiveAction(action);
      setStreamedText("");

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/ai/write", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, action }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(
            (err as { error?: string }).error ?? `Request failed: ${res.status}`,
          );
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let accumulated = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          accumulated += chunk;
          setStreamedText(accumulated);
        }

        // Streaming complete — show preview in editor and enter review phase
        if (accumulated.trim()) {
          if (isContinue) {
            insertAtCursor?.(accumulated.trim());
          } else {
            replaceSelection(accumulated.trim());
          }
          setPhase("review");
        } else {
          // Empty result — go back to actions
          setPhase("actions");
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          // User cancelled — already handled
          return;
        }
        console.error("AI write failed:", err);
        setPhase("actions");
      }
    },
    [getSelectedText, replaceSelection, continueContext, insertAtCursor],
  );

  const handleAccept = useCallback(() => {
    // Text is already replaced in the editor — just dismiss
    onDismiss();
  }, [onDismiss]);

  const handleDiscard = useCallback(() => {
    restoreOriginal();
    onDismiss();
  }, [restoreOriginal, onDismiss]);

  // Keyboard shortcuts for accept/discard in review phase
  useEffect(() => {
    if (!visible || phase !== "review") return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleAccept();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [visible, phase, handleAccept]);

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
            "fixed z-50 rounded-lg border bg-popover shadow-lg",
            phase === "actions" ? "p-1" : "p-2",
          )}
          style={{
            top: position.top,
            left: position.left,
            maxWidth: phase === "actions" ? undefined : 480,
            minWidth: phase === "actions" ? undefined : 320,
          }}
        >
          {/* Phase 1: Action buttons */}
          {phase === "actions" && (
            <div className="flex items-center gap-1">
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
                >
                  <Icon className="h-3 w-3" />
                  {label}
                </Button>
              ))}
              {showContinue && (
                <>
                  <div className="h-4 w-px bg-border" />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={() => handleAction("continue")}
                  >
                    <PenLine className="h-3 w-3" />
                    Continue
                  </Button>
                </>
              )}
              <div className="h-4 w-px bg-border" />
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={onDismiss}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}

          {/* Phase 2: Streaming preview */}
          {phase === "streaming" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span className="capitalize">
                  {activeAction === "fix-grammar"
                    ? "Fixing grammar…"
                    : `${activeAction}ing…`}
                </span>
              </div>
              <div
                ref={previewRef}
                className="max-h-48 overflow-y-auto rounded-md border bg-muted/50 p-3 text-sm leading-relaxed"
              >
                {streamedText || (
                  <span className="text-muted-foreground italic">
                    Generating…
                  </span>
                )}
              </div>
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs"
                  onClick={() => {
                    abortRef.current?.abort();
                    restoreOriginal();
                    setPhase("actions");
                    setStreamedText("");
                    setActiveAction(null);
                  }}
                >
                  <X className="h-3 w-3" />
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Phase 3: Review — Accept / Discard */}
          {phase === "review" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Check className="h-3.5 w-3.5 text-green-500" />
                <span className="capitalize">
                  {activeAction === "continue"
                    ? "Text generated"
                    : `${activeAction} complete`}
                </span>
              </div>
              <div
                className="max-h-48 overflow-y-auto rounded-md border bg-muted/50 p-3 text-sm leading-relaxed"
              >
                {streamedText}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">
                  Enter to accept · Esc to discard
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={handleDiscard}
                  >
                    <Undo2 className="h-3 w-3" />
                    Discard
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={handleAccept}
                  >
                    <Check className="h-3 w-3" />
                    Accept
                  </Button>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
