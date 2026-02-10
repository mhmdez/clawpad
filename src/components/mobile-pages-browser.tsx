"use client";

import { useEffect, useCallback, useState, memo } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronRight,
  FileText,
  Search,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspaceStore } from "@/lib/stores/workspace";
import { useGatewayStore } from "@/lib/stores/gateway";
import { formatRelativeTime } from "@/lib/utils/time";
import type { Space, PageMeta } from "@/lib/files";
import { buildPageTree, type PageTreeNode } from "@/lib/utils/page-tree";
import { toWorkspacePath } from "@/lib/utils/workspace-route";

interface MobilePagesBrowserProps {
  onNavigate?: () => void;
}

export function MobilePagesBrowser({ onNavigate }: MobilePagesBrowserProps) {
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
    recentPages,
    recentStatus,
    loadSpaces,
    loadRecentPages,
  } = useWorkspaceStore();

  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    loadSpaces();
    loadRecentPages();
  }, [loadSpaces, loadRecentPages]);

  const navigateToPage = useCallback(
    (pagePath: string) => {
      router.push(toWorkspacePath(pagePath));
      onNavigate?.();
    },
    [router, onNavigate],
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
                    pathname === toWorkspacePath(page.path)
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

          {spacesStatus === "loading" && spaces.length === 0 ? (
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
                  isLoadingPages={
                    (pagesStatusBySpace.get(space.path) ?? "idle") === "loading" &&
                    (pagesBySpace.get(space.path) ?? []).length === 0
                  }
                  pathname={pathname}
                  searchQuery={searchQuery}
                  onToggle={() => toggleSpace(space.path)}
                  expandedFolders={expandedFolders}
                  onToggleFolder={toggleFolder}
                  onNavigate={navigateToPage}
                />
              ))}
            </div>
          )}
          {recentStatus === "loading" && recentPages.length === 0 && !searchQuery && (
            <div className="mb-4 space-y-2">
              <SectionLabel>Recent</SectionLabel>
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-10 w-4/5 rounded-lg" />
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
  expandedFolders,
  onToggleFolder,
  onNavigate,
}: {
  space: Space;
  isExpanded: boolean;
  pages: PageMeta[];
  isLoadingPages: boolean;
  pathname: string;
  searchQuery: string;
  onToggle: () => void;
  expandedFolders: Set<string>;
  onToggleFolder: (folderPath: string) => void;
  onNavigate: (path: string) => void;
}) {
  const filteredPages = searchQuery
    ? pages.filter((p) =>
        p.title.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : pages;

  const tree = buildPageTree(filteredPages, space.path);

  // If searching and no matches in this space, hide it
  if (searchQuery && tree.length === 0) return null;

  const renderNodes = (nodes: PageTreeNode[]) =>
    nodes.map((node) => {
      if (node.type === "page") {
        return (
          <MobilePageItem
            key={node.page.path}
            page={node.page}
            isActive={
              pathname === toWorkspacePath(node.page.path)
            }
            onNavigate={() => onNavigate(node.page.path)}
          />
        );
      }

      const folderKey = `${space.path}/${node.path}`;
      const isOpen = expandedFolders.has(folderKey);

      return (
        <div key={folderKey}>
          <button
            onClick={() => onToggleFolder(folderKey)}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] transition-colors",
              "text-muted-foreground hover:bg-secondary active:bg-secondary",
              "min-h-[44px]",
            )}
          >
            <ChevronRight
              className={cn(
                "h-3.5 w-3.5 shrink-0 transition-transform duration-200",
                isOpen && "rotate-90",
              )}
            />
            <span className="shrink-0 text-xs">📂</span>
            <span className="flex-1 truncate text-left">{node.name}</span>
          </button>

          {isOpen && (
            <div className="ml-3 border-l border-border/50 pl-3 py-0.5">
              {renderNodes(node.children)}
            </div>
          )}
        </div>
      );
    });

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
          ) : tree.length === 0 ? (
            <p className="py-3 px-2 text-xs text-muted-foreground">
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

const MobilePageItem = memo(function MobilePageItem({
  page,
  isActive,
  onNavigate,
  showTime,
}: {
  page: PageMeta;
  isActive: boolean;
  onNavigate: () => void;
  showTime?: boolean;
}) {
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
