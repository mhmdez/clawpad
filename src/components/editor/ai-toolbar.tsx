"use client";

import { useCallback, useEffect, useRef } from "react";
import type { Ref } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  FileText,
  BookOpen,
  ClipboardList,
  Wrench,
  X,
  PenLine,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useResponsive } from "@/hooks/use-responsive";
import type { AiActionType } from "@/lib/stores/ai-actions";

interface AIToolbarProps {
  /** Called to get the currently selected text from the editor */
  getSelectedText: () => string;
  /** Called when an action is triggered */
  onAction: (action: AiActionType, selectionText: string) => void;
  /** Whether the toolbar should be visible (text is selected) */
  visible: boolean;
  /** Position of the toolbar */
  position: { top: number; left: number };
  /** Optional ref for measuring the toolbar */
  toolbarRef?: Ref<HTMLDivElement>;
  /** Called when the toolbar should be dismissed */
  onDismiss: () => void;
  /** Whether to show the Continue writing action */
  showContinue?: boolean;
  /** Context text for continue action (last ~500 chars before cursor) */
  continueContext?: string;
}

const actions: { action: AiActionType; icon: typeof Sparkles; label: string }[] = [
  { action: "improve", icon: Sparkles, label: "Improve" },
  { action: "simplify", icon: FileText, label: "Simplify" },
  { action: "expand", icon: BookOpen, label: "Expand" },
  { action: "summarize", icon: ClipboardList, label: "Summarize" },
  { action: "fix-grammar", icon: Wrench, label: "Fix Grammar" },
];

export function AIToolbar({
  getSelectedText,
  onAction,
  visible,
  position,
  toolbarRef,
  onDismiss,
  showContinue,
  continueContext,
}: AIToolbarProps) {
  const { isMobile } = useResponsive();
  const localToolbarRef = useRef<HTMLDivElement>(null);
  const handleToolbarRef = useCallback(
    (node: HTMLDivElement | null) => {
      localToolbarRef.current = node;
      if (!toolbarRef) return;
      if (typeof toolbarRef === "function") {
        toolbarRef(node);
      } else {
        // eslint-disable-next-line react-hooks/immutability -- forwarding ref is intentional
        toolbarRef.current = node;
      }
    },
    [toolbarRef],
  );

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
        localToolbarRef.current &&
        !localToolbarRef.current.contains(e.target as Node)
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
  }, [visible, onDismiss]);

  const handleAction = useCallback(
    (action: AiActionType) => {
      const isContinue = action === "continue";
      const text = isContinue ? (continueContext ?? "") : getSelectedText();
      if (!text.trim()) return;
      onAction(action, text.trim());
      onDismiss();
    },
    [getSelectedText, continueContext, onAction, onDismiss],
  );

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          ref={handleToolbarRef}
          initial={{ opacity: 0, y: 4, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 4, scale: 0.95 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className={cn(
            "fixed z-50 rounded-lg border bg-popover p-1 shadow-lg",
            isMobile && "ai-toolbar-floating",
          )}
          style={isMobile ? undefined : {
            top: position.top,
            left: position.left,
            maxWidth: undefined,
            minWidth: undefined,
          }}
        >
          {/* Phase 1: Action buttons */}
          <div className={cn(
            "flex items-center gap-1",
            isMobile && "overflow-x-auto -webkit-overflow-scrolling-touch flex-nowrap",
          )}>
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
        </motion.div>
      )}
    </AnimatePresence>
  );
}
