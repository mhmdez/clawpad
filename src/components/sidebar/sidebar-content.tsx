"use client";

import { useEffect, useCallback, memo } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronRight,
  FileText,
  Plus,
  FolderPlus,
  Search,
  Settings,
  Sun,
  Moon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { BrandMark } from "@/components/brand/brand-mark";
import { useTheme } from "next-themes";
import { useWorkspaceStore } from "@/lib/stores/workspace";
import { useGatewayStore } from "@/lib/stores/gateway";
import { formatRelativeTime } from "@/lib/utils/time";
import { buildPageTree, type PageTreeNode } from "@/lib/utils/page-tree";
import { toWorkspacePath } from "@/lib/utils/workspace-route";

interface SidebarContentProps {
  /** Called when user navigates (so mobile sheet can close) */
  onNavigate?: () => void;
  /** Whether rendered in a mobile/tablet sheet */
  isSheet?: boolean;
  /** Hide the header row (logo) when rendered elsewhere */
  showHeader?: boolean;
}

export function SidebarHeader({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link
      href="/workspace"
      onClick={() => onNavigate?.()}
      className="flex items-center gap-2 text-[13px] font-semibold leading-none transition-colors hover:text-foreground/80"
    >
      <BrandMark
        variant="wordmark"
        size={26}
        theme="light"
        alt="ClawPad"
        className="-translate-y-[2px]"
      />
      <AgentDot />
    </Link>
  );
}

export function SidebarContent({
  onNavigate,
  isSheet,
  showHeader = true,
}: SidebarContentProps) {
  const pathname = usePathname();
  const router = useRouter();
  const {
    spaces,
    expandedSpaces,
    expandedFolders,
    toggleSpace,
    toggleFolder,
    pagesBySpace,
    spacesStatus,
    pagesStatusBySpace,
    pagesErrorBySpace,
    recentPages,
    recentStatus,
    loadSpaces,
    loadRecentPages,
    loadPages,
    setActivePage,
  } = useWorkspaceStore();

  useEffect(() => {
    loadSpaces();
    loadRecentPages();
  }, [loadSpaces, loadRecentPages]);

  useEffect(() => {
    for (const space of spaces) {
      if (!expandedSpaces.has(space.path)) continue;
      if (space.pageCount <= 0) continue;

      const pages = pagesBySpace.get(space.path);
      if (!pages || pages.length > 0) continue;

      const status = pagesStatusBySpace.get(space.path) ?? "idle";
      if (status === "loading") continue;

      void loadPages(space.path, { force: true, silent: true });
    }
  }, [expandedSpaces, loadPages, pagesBySpace, pagesStatusBySpace, spaces]);

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
      router.push(toWorkspacePath(pagePath));
      onNavigate?.();
    },
    [router, onNavigate],
  );

  const openNewPage = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent("clawpad:open-new-page", {
        detail: { mode: "document" },
      }),
    );
    onNavigate?.();
  }, [onNavigate]);

  const openNewSpace = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent("clawpad:open-new-page", {
        detail: { mode: "space" },
      }),
    );
    onNavigate?.();
  }, [onNavigate]);

  const openSearch = useCallback(() => {
    window.dispatchEvent(new CustomEvent("clawpad:open-command-palette"));
    onNavigate?.();
  }, [onNavigate]);

  const openSettings = useCallback(() => {
    router.push("/settings");
    onNavigate?.();
  }, [onNavigate, router]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {showHeader && (
        <div className="flex h-12 shrink-0 items-center justify-between px-3">
          <SidebarHeader onNavigate={onNavigate} />
        </div>
      )}

      {/* Quick actions */}
      <div className="shrink-0 space-y-0.5 px-2">
        <SidebarButton
          icon={<Search className="h-4 w-4" />}
          label="Search"
          shortcut="⌘K"
          onClick={openSearch}
          touchFriendly={isSheet}
        />
        <SidebarButton
          icon={<Plus className="h-4 w-4" />}
          label="New Document"
          shortcut="⌘N"
          onClick={openNewPage}
          touchFriendly={isSheet}
        />
        <SidebarButton
          icon={<FolderPlus className="h-4 w-4" />}
          label="New Space"
          onClick={openNewSpace}
          touchFriendly={isSheet}
        />
      </div>

      <Separator className="my-2 shrink-0" />

      {/* Spaces */}
      <ScrollArea className="min-h-0 flex-1 w-full min-w-0 px-2">
        <div className="w-full py-1">
          <SectionLabel>Spaces</SectionLabel>

          {spacesStatus === "loading" && spaces.length === 0 ? (
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
                  expandedFolders={expandedFolders}
                  pages={pagesBySpace.get(space.path) ?? []}
                  pageLoadError={pagesErrorBySpace.get(space.path) ?? null}
                  isLoadingPages={
                    (pagesStatusBySpace.get(space.path) ?? "idle") === "loading" &&
                    (pagesBySpace.get(space.path) ?? []).length === 0
                  }
                  pathname={pathname}
                  touchFriendly={isSheet}
                  onToggle={() => toggleSpace(space.path)}
                  onToggleFolder={toggleFolder}
                  onRetryPages={() => loadPages(space.path, { force: true })}
                  onNavigate={navigateToPage}
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
                      pathname === toWorkspacePath(page.path)
                    }
                    touchFriendly={isSheet}
                    onNavigate={() => navigateToPage(page.path)}
                  />
                ))}
              </div>
            </div>
          )}
          {recentStatus === "loading" && recentPages.length === 0 && (
            <div className="mt-4 space-y-1 px-2">
              <SectionLabel>Recent</SectionLabel>
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-5/6" />
            </div>
          )}
        </div>
      </ScrollArea>

      <Separator className="shrink-0" />

      {/* Footer */}
      <div className="shrink-0 space-y-0.5 px-2 py-2">
        <GatewayStatus />
        <ThemeToggleButton touchFriendly={isSheet} />
        <SidebarButton
          icon={<Settings className="h-4 w-4" />}
          label="Settings"
          onClick={openSettings}
          touchFriendly={isSheet}
        />
      </div>
    </div>
  );
}

// ─── Memoized Sub-components ────────────────────────────────────────────────

import type { Space, PageMeta } from "@/lib/files";

const SpaceItem = memo(function SpaceItem({
  space,
  isExpanded,
  expandedFolders,
  pages,
  pageLoadError,
  isLoadingPages,
  pathname,
  touchFriendly,
  onToggle,
  onToggleFolder,
  onRetryPages,
  onNavigate,
}: {
  space: Space;
  isExpanded: boolean;
  expandedFolders: Set<string>;
  pages: PageMeta[];
  pageLoadError: string | null;
  isLoadingPages: boolean;
  pathname: string;
  touchFriendly?: boolean;
  onToggle: () => void;
  onToggleFolder: (folderPath: string) => void;
  onRetryPages: () => void;
  onNavigate: (path: string) => void;
}) {
  const tree = buildPageTree(pages, space.path);

  const renderNodes = (nodes: PageTreeNode[]) => {
    return nodes.map((node) => {
      if (node.type === "page") {
        return (
          <PageItem
            key={node.page.path}
            page={node.page}
            isActive={
              pathname === toWorkspacePath(node.page.path)
            }
            touchFriendly={touchFriendly}
            onNavigate={() => onNavigate(node.page.path)}
          />
        );
      }

      const folderKey = `${space.path}/${node.path}`;
      const isOpen = expandedFolders.has(folderKey);

      return (
        <div key={folderKey}>
          <button
            type="button"
            onClick={() => onToggleFolder(folderKey)}
            className={cn(
              "relative z-[1] flex w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-md px-2 text-[12px] transition-colors",
              "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground",
              touchFriendly ? "py-2 min-h-[44px]" : "py-1",
              isOpen && "text-foreground",
            )}
          >
            <ChevronRight
              className={cn(
                "h-3 w-3 shrink-0 transition-transform duration-200",
                isOpen && "rotate-90",
              )}
            />
            <span className="shrink-0 text-xs">📂</span>
            <span className="flex-1 min-w-0 truncate text-left">{node.name}</span>
          </button>

          {isOpen && (
            <div className="ml-3 min-w-0 border-l border-border/50 pl-2 py-0.5">
              {renderNodes(node.children)}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "relative z-[1] flex w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-md px-2 text-[13px] transition-colors",
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
        <span className="flex-1 min-w-0 truncate text-left">{space.name}</span>
        <Badge
          variant="secondary"
          className="h-4 shrink-0 px-1 text-[10px] font-normal"
        >
          {space.pageCount}
        </Badge>
      </button>

      {isExpanded && (
        <div className="ml-3 min-w-0 border-l border-border/50 pl-2 py-0.5">
          {isLoadingPages ? (
            <div className="space-y-1 py-1">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-3/4" />
            </div>
          ) : pageLoadError && tree.length === 0 ? (
            <div className="px-2 py-1.5">
              <p className="text-[11px] text-muted-foreground">
                Couldn&apos;t load pages.
              </p>
              <button
                type="button"
                onClick={onRetryPages}
                className="mt-1 cursor-pointer text-[11px] text-primary hover:underline"
              >
                Retry
              </button>
            </div>
          ) : tree.length === 0 ? (
            <p className="py-1.5 px-2 text-[11px] text-muted-foreground">
              No pages yet. Create your first page.
            </p>
          ) : (
            renderNodes(tree)
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
}: {
  page: PageMeta;
  isActive: boolean;
  touchFriendly?: boolean;
  onNavigate: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onNavigate}
      className={cn(
        "relative z-[1] flex w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-md px-2 text-[13px] transition-colors pointer-events-auto",
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
      <span className="flex-1 min-w-0 truncate text-left">{page.title}</span>
    </button>
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
      type="button"
      onClick={onNavigate}
      className={cn(
        "relative z-[1] flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 text-[13px] transition-colors overflow-hidden pointer-events-auto",
        "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground",
        touchFriendly ? "py-2 min-h-[44px]" : "py-1",
        isActive && "bg-accent-light text-accent-blue font-medium",
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
        {page.icon ? (
          <span className="shrink-0 text-xs">{page.icon}</span>
        ) : (
          <FileText className="h-3.5 w-3.5 shrink-0" />
        )}
        <span className="truncate text-left">{page.title}</span>
      </div>
      <span className="shrink-0 whitespace-nowrap tabular-nums text-[11px] font-medium text-muted-foreground/85">
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
  label: React.ReactNode;
  shortcut?: string;
  onClick?: () => void;
  touchFriendly?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative z-[1] flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 text-[13px] transition-colors duration-200 pointer-events-auto",
        "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground",
        touchFriendly ? "py-2.5 min-h-[44px]" : "py-1.5",
      )}
    >
      <span className="shrink-0">{icon}</span>
      <span className="flex-1 min-w-0 truncate text-left">{label}</span>
      {shortcut && (
        <kbd className="shrink-0 rounded border border-border/70 bg-muted/70 px-1.5 py-0.5 text-[11px] font-mono font-medium leading-none tracking-tight text-muted-foreground/85">
          {shortcut}
        </kbd>
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

function ThemeToggleButton({ touchFriendly }: { touchFriendly?: boolean }) {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <SidebarButton
      icon={
        <>
          <Sun className="hidden h-4 w-4 dark:inline" />
          <Moon className="inline h-4 w-4 dark:hidden" />
        </>
      }
      label={
        <>
          <span className="hidden dark:inline">Light Mode</span>
          <span className="inline dark:hidden">Dark Mode</span>
        </>
      }
      onClick={() => setTheme(isDark ? "light" : "dark")}
      touchFriendly={touchFriendly}
    />
  );
}

function AgentDot() {
  const wsStatus = useGatewayStore((s) => s.wsStatus);
  const agentStatus = useGatewayStore((s) => s.agentStatus);
  const agentName = useGatewayStore((s) => s.agentName);
  const wsError = useGatewayStore((s) => s.wsError);

  const dotColor =
    wsStatus === "connected"
      ? agentStatus === "thinking" || agentStatus === "active"
        ? "bg-[color:var(--cp-brand-2)]"
        : "bg-green-400"
      : wsStatus === "connecting" || wsStatus === "reconnecting"
        ? "bg-yellow-400"
        : "bg-zinc-400";

  const shouldPing =
    wsStatus === "connecting" ||
    wsStatus === "reconnecting" ||
    agentStatus === "thinking" ||
    agentStatus === "active";

  const tooltipText =
    wsStatus === "connected"
      ? agentStatus === "thinking"
        ? `${agentName ?? "Agent"}: thinking…`
        : agentStatus === "active"
          ? `${agentName ?? "Agent"}: working…`
          : `${agentName ?? "Agent"}: online`
      : wsStatus === "connecting"
        ? `Connecting to gateway…${wsError ? ` — ${wsError}` : ""}`
        : wsStatus === "reconnecting"
          ? `Reconnecting to gateway…${wsError ? ` — ${wsError}` : ""}`
        : `Disconnected${wsError ? ` — ${wsError}` : ""}`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="relative flex h-2.5 w-2.5">
          {shouldPing && (
            <span
              className={cn(
                "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
                dotColor,
              )}
            />
          )}
          <span
            className={cn(
              "relative inline-flex h-2.5 w-2.5 rounded-full ring-1 ring-[color:var(--cp-brand-border)]",
              dotColor,
            )}
          />
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
  const wsError = useGatewayStore((s) => s.wsError);
  const detect = useGatewayStore((s) => s.detect);
  const connect = useGatewayStore((s) => s.connect);

  const dotColor =
    wsStatus === "connected"
      ? "bg-green-400"
      : wsStatus === "connecting" || wsStatus === "reconnecting"
        ? "bg-yellow-400"
        : "bg-red-400";

  const shouldPing = wsStatus === "connecting" || wsStatus === "reconnecting";

  const label =
    wsStatus === "connected"
      ? agentStatus === "thinking"
        ? `${agentName ?? "Agent"} thinking…`
        : agentStatus === "active"
          ? `${agentName ?? "Agent"} working…`
          : `${agentName ?? "Agent"} online`
      : wsStatus === "connecting"
        ? `Connecting…${wsError ? ` — ${wsError}` : ""}`
        : wsStatus === "reconnecting"
          ? `Reconnecting…${wsError ? ` — ${wsError}` : ""}`
        : `Disconnected${wsError ? ` — ${wsError}` : ""}`;

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
