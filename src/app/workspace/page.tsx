"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { FileText, Plus, Search, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspaceStore } from "@/lib/stores/workspace";
import { formatRelativeTime } from "@/lib/utils/time";
import { cn } from "@/lib/utils";

export default function WorkspacePage() {
  const router = useRouter();
  const { recentPages, loadRecentPages } = useWorkspaceStore();

  useEffect(() => {
    loadRecentPages();
  }, [loadRecentPages]);

  const navigateToPage = (pagePath: string) => {
    const urlPath = pagePath.replace(/\.md$/, "");
    router.push(`/workspace/${urlPath}`);
  };

  const openNewPage = () => {
    window.dispatchEvent(new CustomEvent("clawpad:new-page"));
  };

  const openSearch = () => {
    const event = new KeyboardEvent("keydown", {
      key: "k",
      metaKey: true,
      bubbles: true,
    });
    document.dispatchEvent(event);
  };

  return (
    <div className="flex h-full flex-col items-center justify-center px-4">
      <div className="max-w-lg w-full space-y-8 text-center">
        {/* Hero */}
        <div className="space-y-3">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
            <FileText className="h-8 w-8 text-muted-foreground" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome to ClawPad
          </h1>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Your workspace for OpenClaw. Select a page from the sidebar or
            create a new one to get started.
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-center gap-3">
          <Button onClick={openNewPage}>
            <Plus className="mr-2 h-4 w-4" />
            New Page
          </Button>
          <Button variant="outline" onClick={openSearch}>
            <Search className="mr-2 h-4 w-4" />
            Search
          </Button>
        </div>

        {/* Recent pages grid */}
        {recentPages.length > 0 && (
          <div className="space-y-3 pt-4">
            <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Recent Pages
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {recentPages.slice(0, 6).map((page) => (
                <button
                  key={page.path}
                  onClick={() => navigateToPage(page.path)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border border-border/50 p-3 text-left",
                    "transition-colors duration-200 hover:bg-muted/50 hover:border-border",
                  )}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-sm">
                    {page.icon ?? "📄"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {page.title}
                    </p>
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>{formatRelativeTime(page.modified)}</span>
                      <span className="text-muted-foreground/40">·</span>
                      <span>{page.space}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
