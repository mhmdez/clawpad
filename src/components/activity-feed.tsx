"use client";

import { useEffect } from "react";
import {
  FileEdit,
  FilePlus,
  FileX,
  MessageSquare,
  Wrench,
  Bot,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useActivityStore, type ActivityType } from "@/lib/stores/activity";
import { ScrollArea } from "@/components/ui/scroll-area";

// ─── Icon map ───────────────────────────────────────────────────────────────

const ACTIVITY_ICONS: Record<ActivityType, { icon: typeof FileEdit; className: string }> = {
  "file-changed": { icon: FileEdit, className: "text-blue-500" },
  "file-added": { icon: FilePlus, className: "text-green-500" },
  "file-removed": { icon: FileX, className: "text-red-400" },
  "chat-message": { icon: MessageSquare, className: "text-violet-500" },
  "tool-used": { icon: Wrench, className: "text-amber-500" },
  "sub-agent": { icon: Bot, className: "text-cyan-500" },
};

// ─── Relative timestamp ─────────────────────────────────────────────────────

function relativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ─── SSE subscriber hook ────────────────────────────────────────────────────

function useFileWatcher() {
  const addItem = useActivityStore((s) => s.addItem);

  useEffect(() => {
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    function connect() {
      es = new EventSource("/api/files/watch");

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "connected" || data.type === "error") return;

          const filename = data.path?.split("/").pop()?.replace(/\.md$/, "") ?? data.path;
          const descriptions: Record<string, string> = {
            "file-changed": `Edited ${filename}`,
            "file-added": `Created ${filename}`,
            "file-removed": `Deleted ${filename}`,
          };

          addItem({
            type: data.type,
            description: descriptions[data.type] ?? `${data.type}: ${filename}`,
            path: data.path,
            timestamp: data.timestamp,
          });
        } catch {
          // Ignore malformed events
        }
      };

      es.onerror = () => {
        es?.close();
        // Reconnect after 5s
        reconnectTimer = setTimeout(connect, 5000);
      };
    }

    connect();

    return () => {
      es?.close();
      clearTimeout(reconnectTimer);
    };
  }, [addItem]);
}

// ─── Activity Item Row ──────────────────────────────────────────────────────

function ActivityItemRow({
  type,
  description,
  timestamp,
}: {
  type: ActivityType;
  description: string;
  timestamp: number;
}) {
  const config = ACTIVITY_ICONS[type] ?? ACTIVITY_ICONS["file-changed"];
  const Icon = config.icon;

  return (
    <div className="flex items-start gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-sidebar-accent group">
      <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", config.className)} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] leading-snug text-foreground/80">
          {description}
        </p>
        <p className="text-[10px] text-muted-foreground/60">
          {relativeTime(timestamp)}
        </p>
      </div>
    </div>
  );
}

// ─── Full Activity Feed (for "View all" / standalone) ───────────────────────

export function ActivityFeed() {
  useFileWatcher();
  const items = useActivityStore((s) => s.items);
  const clear = useActivityStore((s) => s.clear);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Activity className="mb-3 h-8 w-8 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">No recent activity</p>
        <p className="mt-1 text-xs text-muted-foreground/60">
          File changes and events will appear here
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-2 py-1">
        <h3 className="text-xs font-medium text-muted-foreground">Activity</h3>
        <button
          onClick={clear}
          className="text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
        >
          Clear
        </button>
      </div>
      <ScrollArea className="max-h-[400px]">
        <div className="space-y-0.5">
          {items.map((item) => (
            <ActivityItemRow
              key={item.id}
              type={item.type}
              description={item.description}
              timestamp={item.timestamp}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

// ─── Compact Sidebar Activity (last 5 items) ───────────────────────────────

export function SidebarActivity() {
  useFileWatcher();
  const items = useActivityStore((s) => s.items);
  const recent = items.slice(0, 5);

  if (recent.length === 0) {
    return (
      <p className="px-2 py-1.5 text-[11px] text-muted-foreground/60">
        No recent activity
      </p>
    );
  }

  return (
    <div className="space-y-0.5">
      {recent.map((item) => (
        <ActivityItemRow
          key={item.id}
          type={item.type}
          description={item.description}
          timestamp={item.timestamp}
        />
      ))}
    </div>
  );
}
