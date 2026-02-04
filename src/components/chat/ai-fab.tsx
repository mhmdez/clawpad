"use client";

import { Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/lib/stores/workspace";
import { useGatewayStore } from "@/lib/stores/gateway";

export function AiFab() {
  const { chatPanelOpen, setChatPanelOpen } = useWorkspaceStore();
  const agentStatus = useGatewayStore((s) => s.agentStatus);
  const connected = useGatewayStore((s) => s.connected);

  const isActive = connected && (agentStatus === "active" || agentStatus === "thinking");

  return (
    <button
      onClick={() => setChatPanelOpen(!chatPanelOpen)}
      aria-label={chatPanelOpen ? "Close chat" : "Open AI chat"}
      className={cn(
        "fixed z-50 flex items-center justify-center",
        "h-12 w-12 rounded-full",
        "bg-primary text-primary-foreground",
        "shadow-lg shadow-primary/25 dark:shadow-primary/15",
        "transition-all duration-300 ease-out",
        "hover:scale-110 hover:shadow-xl hover:shadow-primary/30",
        "active:scale-95",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        // Position: avoid mobile tab bar
        "bottom-6 right-6 md:bottom-6 md:right-6",
        // Hide on mobile (uses tab bar instead)
        "hidden md:flex",
        // Hide when chat is open on desktop (panel has its own close button)
        chatPanelOpen && "md:hidden",
      )}
    >
      {/* Pulse ring when agent is active */}
      {isActive && (
        <span className="absolute inset-0 animate-ping rounded-full bg-primary/40 duration-1000" />
      )}

      {/* Glow ring */}
      <span
        className={cn(
          "absolute inset-0 rounded-full transition-opacity duration-500",
          isActive
            ? "opacity-100 shadow-[0_0_20px_rgba(var(--primary-rgb,99,102,241),0.4)]"
            : "opacity-0",
        )}
      />

      <Sparkles className="relative h-5 w-5" />
    </button>
  );
}
