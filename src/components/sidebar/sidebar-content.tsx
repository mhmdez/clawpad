"use client";

import { useEffect, useCallback, useState, memo } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  ChevronRight,
  FileText,
  Plus,
  Search,
  Settings,
  Clock,
  Trash2,
  Radio,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspaceStore } from "@/lib/stores/workspace";
import { useGatewayStore } from "@/lib/stores/gateway";
import { formatRelativeTime } from "@/lib/utils/time";
import { SidebarActivity } from "@/components/activity-feed";

interface SidebarContentProps {
  /** Called when user navigates (so mobile sheet can close) */
  onNavigate?: () => void;
  /** Whether rendered in a mobile/tablet sheet */
  isSheet?: boolean;
}

export function SidebarContent({ onNavigate, isSheet }: SidebarContentProps) {
  const pathname = usePathname();
  const router = useRouter();
  const {
    spaces,
    expandedSpaces,
    toggleSpace,
    pagesBySpace,
    loadingSpaces,
    loadingPages,
    recentPages,
    loadSpaces,
    loadRecentPages,
    deletePage,
    setActivePage,
  } = useWorkspaceStore();

  useEffect(() => {
    loadSpaces();
    loadRecentPages();
  }, [loadSpaces, loadRecentPages]);

  useEffect(() => {
    if (pathname.startsWith("/workspace/")) {
      const pagePath = pathname.replace("/workspace/", "");
      setActivePage(pagePath);
    } else {
      setActivePage(null);
    }
  }, [pathname, setActivePage]);

  const navigateToPage = useCallback(
    (pagePath: string) => {
      const urlPath = pagePath.replace(/\.md$/, "");
      router.push(`/workspace/${urlPath}`);
      onNavigate?.();
    },
    [router, onNavigate],
  );

  const handleDeletePage = useCallback(
    async (path: string, e: Event) => {
      e.stopPropagation();
      try {
        await deletePage(path);
        if (pathname === `/workspace/${path.replace(/\.md$/, "")}`) {
          router.push("/workspace");
        }
      } catch {
        // TODO: toast
      }
    },
    [deletePage, pathname, router],
  );

  const openNewPage = useCallback(() => {
    window.dispatchEvent(new CustomEvent("clawpad:new-page"));
    onNavigate?.();
  }, [onNavigate]);

  const openSearch = useCallback(() => {
    const event = new KeyboardEvent("keydown", {
      key: "k",
      metaKey: true,
      bubbles: true,
    });
    document.dispatchEvent(event);
    onNavigate?.();
  }, [onNavigate]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center justify-between px-3">
        <Link
          href="/workspace"
          onClick={() => onNavigate?.()}
          className="flex items-center gap-2 text-[13px] font-semibold transition-colors hover:text-foreground/80"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded bg-primary text-[10px] font-bold text-primary-foreground">
            C
          </span>
          <span>ClawPad</span>
          <AgentDot />
        </Link>
      </div>

      {/* Quick actions */}
      <div className="space-y-0.5 px-2">
        <SidebarButton
          icon={<Search className="h-4 w-4" />}
          label="Search"
          shortcut="⌘K"
          onClick={openSearch}
          touchFriendly={isSheet}
        />
        <SidebarButton
          icon={<Plus className="h-4 w-4" />}
          label="New Page"
          shortcut="⌘N"
          onClick={openNewPage}
          touchFriendly={isSheet}
        />
      </div>

      <Separator className="my-2" />

      {/* Spaces */}
      <ScrollArea className="flex-1 px-2">
        <div className="py-1">
          <SectionLabel>Spaces</SectionLabel>

          {loadingSpaces ? (
            <div className="space-y-1 px-2">
              <Skeleton className="h-7 w-full" />
              <Skeleton className="h-7 w-full" />
              <Skeleton className="h-7 w-full" />
            </div>
          ) : spaces.length === 0 ? (
            <p className="px-2 py-2 text-xs text-muted-foreground">
              No spaces yet
            </p>
          ) : (
            <div className="space-y-0.5">
              {spaces.map((space) => (
                <SpaceItem
                  key={space.path}
                  space={space}
                  isExpanded={expandedSpaces.has(space.path)}
                  pages={pagesBySpace.get(space.path) ?? []}
                  isLoadingPages={loadingPages.get(space.path) ?? false}
                  pathname={pathname}
                  touchFriendly={isSheet}
                  onToggle={() => toggleSpace(space.path)}
                  onNavigate={navigateToPage}
                  onDelete={handleDeletePage}
                />
              ))}
            </div>
          )}

          {/* Recent pages */}
          {recentPages.length > 0 && (
            <div className="mt-4">
              <SectionLabel>Recent</SectionLabel>
              <div className="space-y-0.5">
                {recentPages.slice(0, 5).map((page) => (
                  <RecentPageItem
                    key={page.path}
                    page={page}
                    isActive={
                      pathname ===
                      `/workspace/${page.path.replace(/\.md$/, "")}`
                    }
                    touchFriendly={isSheet}
                    onNavigate={() => navigateToPage(page.path)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Sessions */}
          <SessionsSection />

          {/* Activity feed */}
          <ActivitySection />
        </div>
      </ScrollArea>

      <Separator />

      {/* Footer */}
      <div className="space-y-0.5 px-2 py-2">
        <GatewayStatus />
        <Link href="/settings/connection" onClick={() => onNavigate?.()}>
          <SidebarButton
            icon={<Settings className="h-4 w-4" />}
            label="Settings"
            touchFriendly={isSheet}
          />
        </Link>
      </div>
    </div>
  );
}

// ─── Sessions Section (collapsible) ─────────────────────────────────────────

function SessionsSection() {
  const [expanded, setExpanded] = useState(false);
  const sessions = useGatewayStore((s) => s.sessions);

  if (sessions.length === 0) return null;

  return (
    <div className="mt-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="mb-1 flex w-full items-center gap-1 px-2"
      >
        <ChevronRight
          className={cn(
            "h-2.5 w-2.5 text-muted-foreground transition-transform duration-200",
            expanded && "rotate-90",
          )}
        />
        <Radio className="h-3 w-3 text-muted-foreground" />
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Sessions
        </span>
        <Badge
          variant="secondary"
          className="ml-auto h-4 px-1 text-[10px] font-normal"
        >
          {sessions.length}
        </Badge>
      </button>
      {expanded && (
        <div className="mt-0.5 space-y-0.5">
          {sessions.map((session) => (
            <SessionItem key={session.sessionKey} session={session} />
          ))}
        </div>
      )}
    </div>
  );
}

const SessionItem = memo(function SessionItem({
  session,
}: {
  session: import("@/lib/gateway/types").SessionInfo;
}) {
  const [selected, setSelected] = useState(false);
  const statusColor =
    session.status === "active"
      ? "bg-green-400"
      : session.status === "thinking"
        ? "bg-yellow-400"
        : "bg-zinc-400";

  // Derive a readable label from sessionKey
  const label = (() => {
    const parts = session.sessionKey.split(":");
    // e.g. "agent:main:telegram:group:12345" → "telegram · group"
    const platform = parts[2] ?? session.platform ?? "session";
    const channel = parts[3] ?? session.channel ?? "";
    return channel ? `${platform} · ${channel}` : platform;
  })();

  return (
    <button
      onClick={() => setSelected(!selected)}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[12px] transition-colors",
        "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground",
        selected && "bg-accent-light text-accent-blue",
      )}
    >
      <span className="relative flex h-2 w-2 shrink-0">
        {session.status === "active" && (
          <span
            className={cn(
              "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
              statusColor,
            )}
          />
        )}
        <span
          className={cn(
            "relative inline-flex h-2 w-2 rounded-full",
            statusColor,
          )}
        />
      </span>
      <span className="flex-1 truncate text-left">{label}</span>
      <span className="shrink-0 text-[10px] text-muted-foreground/50 capitalize">
        {session.status}
      </span>
    </button>
  );
});

// ─── Activity Section (collapsible) ─────────────────────────────────────────

function ActivitySection() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="mb-1 flex w-full items-center gap-1 px-2"
      >
        <ChevronRight
          className={cn(
            "h-2.5 w-2.5 text-muted-foreground transition-transform duration-200",
            expanded && "rotate-90",
          )}
        />
        <Activity className="h-3 w-3 text-muted-foreground" />
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Activity
        </span>
      </button>
      {expanded && (
        <div className="mt-0.5">
          <SidebarActivity />
        </div>
      )}
    </div>
  );
}

// ─── Memoized Sub-components ────────────────────────────────────────────────

import type { Space, PageMeta } from "@/lib/files";

const SpaceItem = memo(function SpaceItem({
  space,
  isExpanded,
  pages,
  isLoadingPages,
  pathname,
  touchFriendly,
  onToggle,
  onNavigate,
  onDelete,
}: {
  space: Space;
  isExpanded: boolean;
  pages: PageMeta[];
  isLoadingPages: boolean;
  pathname: string;
  touchFriendly?: boolean;
  onToggle: () => void;
  onNavigate: (path: string) => void;
  onDelete: (path: string, e: Event) => void;
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-md px-2 text-[13px] transition-colors",
          "hover:bg-sidebar-accent",
          touchFriendly ? "py-2 min-h-[44px]" : "py-1",
          isExpanded && "font-medium",
        )}
      >
        <ChevronRight
          className={cn(
            "h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-200",
            isExpanded && "rotate-90",
          )}
        />
        <span className="shrink-0 text-sm">{space.icon ?? "📁"}</span>
        <span className="flex-1 truncate text-left">{space.name}</span>
        <Badge
          variant="secondary"
          className="h-4 shrink-0 px-1 text-[10px] font-normal"
        >
          {space.pageCount}
        </Badge>
      </button>

      {isExpanded && (
        <div className="ml-3 border-l border-border/50 pl-2 py-0.5">
          {isLoadingPages ? (
            <div className="space-y-1 py-1">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-3/4" />
            </div>
          ) : pages.length === 0 ? (
            <p className="py-1.5 px-2 text-[11px] text-muted-foreground">
              No pages yet
            </p>
          ) : (
            pages.map((page) => (
              <PageItem
                key={page.path}
                page={page}
                isActive={
                  pathname ===
                  `/workspace/${page.path.replace(/\.md$/, "")}`
                }
                touchFriendly={touchFriendly}
                onNavigate={() => onNavigate(page.path)}
                onDelete={(e) => onDelete(page.path, e)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
});

const PageItem = memo(function PageItem({
  page,
  isActive,
  touchFriendly,
  onNavigate,
  onDelete,
}: {
  page: PageMeta;
  isActive: boolean;
  touchFriendly?: boolean;
  onNavigate: () => void;
  onDelete: (e: Event) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          onClick={onNavigate}
          className={cn(
            "flex w-full items-center gap-1.5 rounded-md px-2 text-[13px] transition-colors",
            "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground",
            touchFriendly ? "py-2 min-h-[44px]" : "py-1",
            isActive && "bg-accent-light text-accent-blue font-medium",
          )}
        >
          {page.icon ? (
            <span className="shrink-0 text-xs">{page.icon}</span>
          ) : (
            <FileText className="h-3.5 w-3.5 shrink-0" />
          )}
          <span className="truncate">{page.title}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="right" className="w-48">
        <DropdownMenuItem onClick={onNavigate}>
          <FileText className="mr-2 h-4 w-4" />
          Open
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onClick={(e) => onDelete(e.nativeEvent)}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
});

const RecentPageItem = memo(function RecentPageItem({
  page,
  isActive,
  touchFriendly,
  onNavigate,
}: {
  page: PageMeta;
  isActive: boolean;
  touchFriendly?: boolean;
  onNavigate: () => void;
}) {
  return (
    <button
      onClick={onNavigate}
      className={cn(
        "flex w-full items-center gap-1.5 rounded-md px-2 text-[13px] transition-colors",
        "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground",
        touchFriendly ? "py-2 min-h-[44px]" : "py-1",
        isActive && "bg-accent-light text-accent-blue font-medium",
      )}
    >
      <Clock className="h-3 w-3 shrink-0 opacity-50" />
      {page.icon ? (
        <span className="shrink-0 text-xs">{page.icon}</span>
      ) : (
        <FileText className="h-3.5 w-3.5 shrink-0" />
      )}
      <span className="flex-1 truncate text-left">{page.title}</span>
      <span className="shrink-0 text-[10px] text-muted-foreground/60">
        {formatRelativeTime(page.modified)}
      </span>
    </button>
  );
});

function SidebarButton({
  icon,
  label,
  shortcut,
  onClick,
  touchFriendly,
}: {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  onClick?: () => void;
  touchFriendly?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 text-[13px] transition-colors duration-200",
        "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground",
        touchFriendly ? "py-2.5 min-h-[44px]" : "py-1.5",
      )}
    >
      {icon}
      <span className="flex-1 text-left">{label}</span>
      {shortcut && (
        <kbd className="text-[10px] text-muted-foreground/60">{shortcut}</kbd>
      )}
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-1 px-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </h3>
  );
}

function AgentDot() {
  const wsStatus = useGatewayStore((s) => s.wsStatus);
  const agentStatus = useGatewayStore((s) => s.agentStatus);
  const agentName = useGatewayStore((s) => s.agentName);

  const dotColor =
    wsStatus === "connected"
      ? agentStatus === "thinking" || agentStatus === "active"
        ? "bg-violet-400"
        : "bg-green-400"
      : wsStatus === "connecting"
        ? "bg-yellow-400"
        : "bg-zinc-400";

  const shouldPing = wsStatus === "connecting" || agentStatus === "thinking" || agentStatus === "active";

  const tooltipText =
    wsStatus === "connected"
      ? agentStatus === "thinking"
        ? `${agentName ?? "Agent"}: thinking…`
        : agentStatus === "active"
          ? `${agentName ?? "Agent"}: working…`
          : `${agentName ?? "Agent"}: online`
      : wsStatus === "connecting"
        ? "Connecting to gateway…"
        : "Disconnected";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="relative flex h-2 w-2">
          {shouldPing && (
            <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-75", dotColor)} />
          )}
          <span className={cn("relative inline-flex h-2 w-2 rounded-full", dotColor)} />
        </span>
      </TooltipTrigger>
      <TooltipContent>{tooltipText}</TooltipContent>
    </Tooltip>
  );
}

function GatewayStatus() {
  const wsStatus = useGatewayStore((s) => s.wsStatus);
  const agentStatus = useGatewayStore((s) => s.agentStatus);
  const agentName = useGatewayStore((s) => s.agentName);
  const detect = useGatewayStore((s) => s.detect);
  const connect = useGatewayStore((s) => s.connect);

  // Auto-detect on mount
  useEffect(() => {
    detect().then(() => connect());
  }, [detect, connect]);

  const dotColor =
    wsStatus === "connected"
      ? "bg-green-400"
      : wsStatus === "connecting"
        ? "bg-yellow-400"
        : "bg-red-400";

  const shouldPing = wsStatus === "connecting";

  const label =
    wsStatus === "connected"
      ? agentStatus === "thinking"
        ? `${agentName ?? "Agent"} thinking…`
        : agentStatus === "active"
          ? `${agentName ?? "Agent"} working…`
          : `${agentName ?? "Agent"} online`
      : wsStatus === "connecting"
        ? "Connecting…"
        : "Disconnected";

  return (
    <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px]">
      <span className="relative flex h-2 w-2">
        {shouldPing && (
          <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-75", dotColor)} />
        )}
        <span className={cn("relative inline-flex h-2 w-2 rounded-full", dotColor)} />
      </span>
      <span className="flex-1 text-[11px] text-muted-foreground">{label}</span>
      {wsStatus === "disconnected" && (
        <button
          onClick={() => { detect().then(() => connect()); }}
          className="text-[10px] text-blue-500 hover:text-blue-400 transition-colors"
        >
          Retry
        </button>
      )}
    </div>
  );
}
