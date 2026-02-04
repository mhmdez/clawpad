import { memo } from "react";
import { cn } from "@/lib/utils";

const CHANNEL_MAP: Record<string, { icon: string; label: string; color: string }> = {
  telegram: { icon: "📱", label: "Telegram", color: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300" },
  whatsapp: { icon: "💬", label: "WhatsApp", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  discord: { icon: "🎮", label: "Discord", color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300" },
  slack: { icon: "💼", label: "Slack", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" },
  webchat: { icon: "🌐", label: "Web", color: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400" },
  clawpad: { icon: "🌐", label: "ClawPad", color: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400" },
  system: { icon: "🤖", label: "System", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
};

/**
 * Parse a channel identifier from a sessionKey or channel field.
 * e.g. "agent:main:telegram:1234" → "telegram"
 */
export function parseChannel(sessionKey?: string, channel?: string): string {
  if (channel) return channel.toLowerCase();
  if (!sessionKey) return "unknown";
  const parts = sessionKey.split(":");
  // sessionKey format: agent:scope:platform:channel:recipient
  return (parts[2] ?? "unknown").toLowerCase();
}

export const ChannelBadge = memo(function ChannelBadge({
  channel,
  sessionKey,
  className,
}: {
  channel?: string;
  sessionKey?: string;
  className?: string;
}) {
  const ch = parseChannel(sessionKey, channel);
  const info = CHANNEL_MAP[ch];
  if (!info) return null;
  // Don't show badge for webchat/clawpad (it's the current channel)
  if (ch === "webchat" || ch === "clawpad") return null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none",
        info.color,
        className,
      )}
    >
      <span className="text-[10px]">{info.icon}</span>
      {info.label}
    </span>
  );
});
