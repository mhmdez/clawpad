"use client";

import { useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronRight,
  FileText,
  Plus,
  Search,
  Settings,
  PanelLeftClose,
  PanelLeft,
  Clock,
  Trash2,
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
import { formatRelativeTime } from "@/lib/utils/time";

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const {
    sidebarOpen,
    toggleSidebar,
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

  // Load spaces + recent on mount
  useEffect(() => {
    loadSpaces();
    loadRecentPages();
  }, [loadSpaces, loadRecentPages]);

  // Sync active page from URL
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
    },
    [router],
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
  }, []);

  const openSearch = useCallback(() => {
    const event = new KeyboardEvent("keydown", {
      key: "k",
      metaKey: true,
      bubbles: true,
    });
    document.dispatchEvent(event);
  }, []);

  if (!sidebarOpen) {
    return (
      <div className="flex h-full w-12 flex-col items-center border-r bg-sidebar py-3 gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={toggleSidebar}
            >
              <PanelLeft className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Open sidebar</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={openSearch}
            >
              <Search className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Search (⌘K)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={openNewPage}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">New Page (⌘N)</TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="flex h-full w-60 flex-col border-r bg-sidebar">
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center justify-between px-3">
        <Link
          href="/workspace"
          className="flex items-center gap-2 text-[13px] font-semibold transition-colors hover:text-foreground/80"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded bg-primary text-[10px] font-bold text-primary-foreground">
            C
          </span>
          <span>ClawPad</span>
          <AgentDot />
        </Link>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={toggleSidebar}
            >
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Close sidebar</TooltipContent>
        </Tooltip>
      </div>

      {/* Quick actions */}
      <div className="space-y-0.5 px-2">
        <SidebarButton
          icon={<Search className="h-4 w-4" />}
          label="Search"
          shortcut="⌘K"
          onClick={openSearch}
        />
        <SidebarButton
          icon={<Plus className="h-4 w-4" />}
          label="New Page"
          shortcut="⌘N"
          onClick={openNewPage}
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
              {spaces.map((space) => {
                const isExpanded = expandedSpaces.has(space.path);
                const pages = pagesBySpace.get(space.path) ?? [];
                const isLoadingPages = loadingPages.get(space.path) ?? false;

                return (
                  <div key={space.path}>
                    {/* Space header */}
                    <button
                      onClick={() => toggleSpace(space.path)}
                      className={cn(
                        "flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-[13px] transition-colors",
                        "hover:bg-sidebar-accent",
                        isExpanded && "font-medium",
                      )}
                    >
                      <ChevronRight
                        className={cn(
                          "h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-200",
                          isExpanded && "rotate-90",
                        )}
                      />
                      <span className="shrink-0 text-sm">
                        {space.icon ?? "📁"}
                      </span>
                      <span className="flex-1 truncate text-left">
                        {space.name}
                      </span>
                      <Badge
                        variant="secondary"
                        className="h-4 shrink-0 px-1 text-[10px] font-normal"
                      >
                        {space.pageCount}
                      </Badge>
                    </button>

                    {/* Pages under space */}
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
                          pages.map((page) => {
                            const pageUrl = page.path.replace(/\.md$/, "");
                            const isActive =
                              pathname === `/workspace/${pageUrl}`;

                            return (
                              <DropdownMenu key={page.path}>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    onClick={() => navigateToPage(page.path)}
                                    onContextMenu={(e) => {
                                      e.preventDefault();
                                      // Radix handles context menus via onContextMenu on Trigger
                                    }}
                                    className={cn(
                                      "flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-[13px] transition-colors",
                                      "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground",
                                      isActive &&
                                        "bg-accent-light text-accent-blue font-medium",
                                    )}
                                  >
                                    {page.icon ? (
                                      <span className="shrink-0 text-xs">
                                        {page.icon}
                                      </span>
                                    ) : (
                                      <FileText className="h-3.5 w-3.5 shrink-0" />
                                    )}
                                    <span className="truncate">
                                      {page.title}
                                    </span>
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                  align="start"
                                  side="right"
                                  className="w-48"
                                >
                                  <DropdownMenuItem
                                    onClick={() => navigateToPage(page.path)}
                                  >
                                    <FileText className="mr-2 h-4 w-4" />
                                    Open
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={(e) =>
                                      handleDeletePage(page.path, e.nativeEvent)
                                    }
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Recent pages */}
          {recentPages.length > 0 && (
            <div className="mt-4">
              <SectionLabel>Recent</SectionLabel>
              <div className="space-y-0.5">
                {recentPages.slice(0, 5).map((page) => {
                  const pageUrl = page.path.replace(/\.md$/, "");
                  const isActive = pathname === `/workspace/${pageUrl}`;

                  return (
                    <button
                      key={page.path}
                      onClick={() => navigateToPage(page.path)}
                      className={cn(
                        "flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-[13px] transition-colors",
                        "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground",
                        isActive &&
                          "bg-accent-light text-accent-blue font-medium",
                      )}
                    >
                      <Clock className="h-3 w-3 shrink-0 opacity-50" />
                      {page.icon ? (
                        <span className="shrink-0 text-xs">{page.icon}</span>
                      ) : (
                        <FileText className="h-3.5 w-3.5 shrink-0" />
                      )}
                      <span className="flex-1 truncate text-left">
                        {page.title}
                      </span>
                      <span className="shrink-0 text-[10px] text-muted-foreground/60">
                        {formatRelativeTime(page.modified)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <Separator />

      {/* Footer */}
      <div className="space-y-0.5 px-2 py-2">
        <GatewayStatus />
        <Link href="/settings">
          <SidebarButton
            icon={<Settings className="h-4 w-4" />}
            label="Settings"
          />
        </Link>
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function SidebarButton({
  icon,
  label,
  shortcut,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors duration-200",
        "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground",
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
  // Placeholder — will connect to gateway status later
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-yellow-400" />
        </span>
      </TooltipTrigger>
      <TooltipContent>Agent: connecting…</TooltipContent>
    </Tooltip>
  );
}

function GatewayStatus() {
  // Placeholder — will be wired to real gateway connection
  return (
    <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px]">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-yellow-400" />
      </span>
      <span className="text-[11px] text-muted-foreground">Agent offline</span>
    </div>
  );
}
