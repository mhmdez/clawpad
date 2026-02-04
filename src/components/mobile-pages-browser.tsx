"use client";

import { useEffect, useCallback, useState, memo } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronRight,
  FileText,
  Search,
  Clock,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorkspaceStore } from "@/lib/stores/workspace";
import { useGatewayStore } from "@/lib/stores/gateway";
import { formatRelativeTime } from "@/lib/utils/time";
import type { Space, PageMeta } from "@/lib/files";

interface MobilePagesBrowserProps {
  onNavigate?: () => void;
}

export function MobilePagesBrowser({ onNavigate }: MobilePagesBrowserProps) {
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

  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    loadSpaces();
    loadRecentPages();
  }, [loadSpaces, loadRecentPages]);

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
      } catch {
        // TODO: toast
      }
    },
    [deletePage],
  );

  const agentName = useGatewayStore((s) => s.agentName);

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-[11px] font-bold text-primary-foreground">
            C
          </span>
          <span className="text-sm font-semibold">
            {agentName ?? "ClawPad"}
          </span>
        </div>
      </div>

      {/* Search bar */}
      <div className="shrink-0 px-4 py-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search pages…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={cn(
              "w-full rounded-lg border bg-secondary/50 py-2.5 pl-9 pr-3 text-sm",
              "placeholder:text-muted-foreground",
              "focus:outline-none focus:ring-2 focus:ring-ring",
              "min-h-[44px]",
            )}
          />
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1 px-4">
        {/* Recent pages */}
        {!searchQuery && recentPages.length > 0 && (
          <div className="mb-4">
            <SectionLabel>Recent</SectionLabel>
            <div className="space-y-0.5">
              {recentPages.slice(0, 5).map((page) => (
                <MobilePageItem
                  key={page.path}
                  page={page}
                  isActive={
                    pathname ===
                    `/workspace/${page.path.replace(/\.md$/, "")}`
                  }
                  onNavigate={() => navigateToPage(page.path)}
                  showTime
                />
              ))}
            </div>
          </div>
        )}

        <Separator className="my-2" />

        {/* Spaces */}
        <div className="pb-4">
          <SectionLabel>Spaces</SectionLabel>

          {loadingSpaces ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full rounded-lg" />
              <Skeleton className="h-12 w-full rounded-lg" />
              <Skeleton className="h-12 w-full rounded-lg" />
            </div>
          ) : spaces.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No spaces yet
            </p>
          ) : (
            <div className="space-y-1">
              {spaces.map((space) => (
                <MobileSpaceItem
                  key={space.path}
                  space={space}
                  isExpanded={expandedSpaces.has(space.path)}
                  pages={pagesBySpace.get(space.path) ?? []}
                  isLoadingPages={loadingPages.get(space.path) ?? false}
                  pathname={pathname}
                  searchQuery={searchQuery}
                  onToggle={() => toggleSpace(space.path)}
                  onNavigate={navigateToPage}
                  onDelete={handleDeletePage}
                />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </h3>
  );
}

const MobileSpaceItem = memo(function MobileSpaceItem({
  space,
  isExpanded,
  pages,
  isLoadingPages,
  pathname,
  searchQuery,
  onToggle,
  onNavigate,
  onDelete,
}: {
  space: Space;
  isExpanded: boolean;
  pages: PageMeta[];
  isLoadingPages: boolean;
  pathname: string;
  searchQuery: string;
  onToggle: () => void;
  onNavigate: (path: string) => void;
  onDelete: (path: string, e: Event) => void;
}) {
  const filteredPages = searchQuery
    ? pages.filter((p) =>
        p.title.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : pages;

  // If searching and no matches in this space, hide it
  if (searchQuery && filteredPages.length === 0) return null;

  return (
    <div>
      <button
        onClick={onToggle}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg px-3 py-3 text-sm transition-colors",
          "hover:bg-secondary active:bg-secondary",
          "min-h-[48px]",
          isExpanded && "font-medium",
        )}
      >
        <ChevronRight
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
            isExpanded && "rotate-90",
          )}
        />
        <span className="shrink-0 text-base">{space.icon ?? "📁"}</span>
        <span className="flex-1 truncate text-left">{space.name}</span>
        <Badge
          variant="secondary"
          className="h-5 shrink-0 px-1.5 text-[11px] font-normal"
        >
          {space.pageCount}
        </Badge>
      </button>

      {isExpanded && (
        <div className="ml-4 border-l border-border/50 pl-3 py-0.5">
          {isLoadingPages ? (
            <div className="space-y-1 py-1">
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-10 w-3/4 rounded-lg" />
            </div>
          ) : filteredPages.length === 0 ? (
            <p className="py-3 px-2 text-xs text-muted-foreground">
              No pages
            </p>
          ) : (
            filteredPages.map((page) => (
              <MobilePageItem
                key={page.path}
                page={page}
                isActive={
                  pathname ===
                  `/workspace/${page.path.replace(/\.md$/, "")}`
                }
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

const MobilePageItem = memo(function MobilePageItem({
  page,
  isActive,
  onNavigate,
  onDelete,
  showTime,
}: {
  page: PageMeta;
  isActive: boolean;
  onNavigate: () => void;
  onDelete?: (e: Event) => void;
  showTime?: boolean;
}) {
  if (onDelete) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            onClick={onNavigate}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm transition-colors",
              "text-muted-foreground hover:bg-secondary active:bg-secondary",
              "min-h-[44px]",
              isActive && "bg-accent-light text-accent-blue font-medium",
            )}
          >
            {page.icon ? (
              <span className="shrink-0 text-sm">{page.icon}</span>
            ) : (
              <FileText className="h-4 w-4 shrink-0" />
            )}
            <span className="flex-1 truncate text-left">{page.title}</span>
            {showTime && (
              <span className="shrink-0 text-[11px] text-muted-foreground/60">
                {formatRelativeTime(page.modified)}
              </span>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
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
  }

  return (
    <button
      onClick={onNavigate}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm transition-colors",
        "text-muted-foreground hover:bg-secondary active:bg-secondary",
        "min-h-[44px]",
        isActive && "bg-accent-light text-accent-blue font-medium",
      )}
    >
      <Clock className="h-3.5 w-3.5 shrink-0 opacity-50" />
      {page.icon ? (
        <span className="shrink-0 text-sm">{page.icon}</span>
      ) : (
        <FileText className="h-4 w-4 shrink-0" />
      )}
      <span className="flex-1 truncate text-left">{page.title}</span>
      {showTime && (
        <span className="shrink-0 text-[11px] text-muted-foreground/60">
          {formatRelativeTime(page.modified)}
        </span>
      )}
    </button>
  );
});
