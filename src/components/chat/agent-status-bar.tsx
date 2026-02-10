"use client";

import { useEffect, useState, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useActivityStore, type ActivityItem } from "@/lib/stores/activity";
import { useGatewayStore } from "@/lib/stores/gateway";
import { cn } from "@/lib/utils";

/**
 * Inline status bar that shows what the agent is currently doing.
 * Can be placed in header or inline within the chat thread.
 *
 * - Idle → hidden
 * - Thinking → "💭 Thinking..."
 * - Tool use → "🔧 Using web_search..." (parsed from activity)
 * - Streaming → "✍️ Writing..."
 * - Sub-agent → "🤖 Working on background task..."
 * - Auto-dismisses 4s after last event
 */

const DISMISS_MS = 4000;

interface StatusLine {
  emoji: string;
  text: string;
}

type StatusMode = "full" | "minimal";

function deriveStatus(
  agentStatus: string,
  latestActivity: ActivityItem | null,
  mode: StatusMode,
): StatusLine | null {
  if (mode === "minimal") {
    if (latestActivity?.type === "sub-agent") {
      return { emoji: "🤖", text: "Working in the background..." };
    }
    if (agentStatus === "thinking") {
      return { emoji: "💭", text: "Thinking..." };
    }
    return null;
  }

  // If agent is idle and no recent activity, hide
  if (agentStatus === "idle") return null;

  // Check the latest activity for specifics
  if (latestActivity) {
    const desc = latestActivity.description;

    if (latestActivity.type === "tool-used") {
      // "Using file reader", "Using web search", etc.
      if (desc.toLowerCase().includes("file reader") || desc.toLowerCase().includes("reading")) {
        return { emoji: "📂", text: desc };
      }
      if (desc.toLowerCase().includes("web search")) {
        return { emoji: "🔍", text: desc };
      }
      if (desc.toLowerCase().includes("browser")) {
        return { emoji: "🌐", text: desc };
      }
      if (desc.toLowerCase().includes("terminal")) {
        return { emoji: "⚡", text: desc };
      }
      if (desc.toLowerCase().includes("file editor") || desc.toLowerCase().includes("file writer")) {
        return { emoji: "📝", text: desc };
      }
      return { emoji: "🔧", text: desc };
    }

    if (latestActivity.type === "sub-agent") {
      if (desc.toLowerCase().includes("started") || desc.toLowerCase().includes("thinking")) {
        return { emoji: "🤖", text: "Working on background task..." };
      }
    }
  }

  // Fallback based on agent status
  if (agentStatus === "thinking") {
    return { emoji: "💭", text: "Thinking..." };
  }

  if (agentStatus === "active") {
    return { emoji: "✍️", text: "Writing..." };
  }

  return null;
}

interface AgentStatusBarProps {
  variant?: "header" | "inline";
  mode?: StatusMode;
  className?: string;
}

export function AgentStatusBar({
  variant = "header",
  mode = "full",
  className,
}: AgentStatusBarProps) {
  const agentStatus = useGatewayStore((s) => s.agentStatus);
  const items = useActivityStore((s) => s.items);
  const latestActivity = items.length > 0 ? items[0] : null;

  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState<StatusLine | null>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const newStatus = deriveStatus(agentStatus, latestActivity, mode);

    if (newStatus) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing external state
      setStatus(newStatus);
      setVisible(true);

      // Reset dismiss timer
      clearTimeout(dismissTimer.current);
      dismissTimer.current = setTimeout(() => {
        // Only dismiss if agent is back to idle
        if (useGatewayStore.getState().agentStatus === "idle") {
          setVisible(false);
        }
      }, DISMISS_MS);
    } else {
      // Agent went idle — start dismiss countdown
      clearTimeout(dismissTimer.current);
      dismissTimer.current = setTimeout(() => {
        setVisible(false);
      }, DISMISS_MS);
    }

    return () => clearTimeout(dismissTimer.current);
  }, [agentStatus, latestActivity, mode]);

  return (
    <AnimatePresence>
      {visible && status && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
          className={cn(
            "overflow-hidden",
            variant === "header" && "border-b",
            variant === "inline" && "rounded-lg border bg-muted/40",
            className,
          )}
        >
          <div
            className={cn(
              "flex items-center gap-2",
              variant === "inline" ? "px-3 py-1.5" : "px-4 py-1.5",
            )}
          >
            <span className="text-sm">{status.emoji}</span>
            <span className="text-xs text-muted-foreground animate-pulse">
              {status.text}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
