"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Search, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspaceStore } from "@/lib/stores/workspace";
import { formatRelativeTime } from "@/lib/utils/time";
import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/brand/brand-mark";
import { ROOT_SPACE_NAME, ROOT_SPACE_PATH } from "@/lib/files/constants";
import { toWorkspacePath } from "@/lib/utils/workspace-route";

/** Reads ?chat=open and auto-opens the chat panel */
function ChatAutoOpen() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const setChatPanelOpen = useWorkspaceStore((s) => s.setChatPanelOpen);

  useEffect(() => {
    if (searchParams.get("chat") === "open") {
      setChatPanelOpen(true);
      router.replace("/workspace", { scroll: false });
    }
  }, [searchParams, setChatPanelOpen, router]);

  return null;
}

export default function WorkspacePage() {
  const router = useRouter();
  const {
    recentPages,
    spaces,
    loadRecentPages,
    loadSpaces,
    spacesStatus,
    recentStatus,
  } = useWorkspaceStore();
  const [setupChecked, setSetupChecked] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [updateInfo, setUpdateInfo] = useState<{
    current?: string;
    latest?: string;
    updateAvailable: boolean;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    fetch("/api/setup/status", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        const shouldSetup = !data?.hasWorkspace || Boolean(data?.needsSetupSignal);
        if (shouldSetup) {
          router.replace("/setup");
          return;
        }
        setSetupChecked(true);
      })
      .catch(() => {
        if (cancelled) return;
        // Fail-open so users are never stuck on an indefinite loading state.
        setSetupChecked(true);
      })
      .finally(() => {
        clearTimeout(timeout);
      });
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timeout);
    };
  }, [router]);

  useEffect(() => {
    if (!setupChecked) return;
    loadRecentPages();
    loadSpaces();
  }, [loadRecentPages, loadSpaces, setupChecked]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    fetch("/api/version", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data && typeof data.updateAvailable === "boolean") {
          setUpdateInfo({
            current: data.current,
            latest: data.latest,
            updateAvailable: data.updateAvailable,
          });
        }
      })
      .catch(() => {
        if (!cancelled) setUpdateInfo(null);
      })
      .finally(() => {
        clearTimeout(timeout);
      });
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timeout);
    };
  }, []);

  if (!setupChecked) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading workspace...
      </div>
    );
  }

  const navigateToPage = (pagePath: string) => {
    router.push(toWorkspacePath(pagePath));
  };

  const openNewPage = () => {
    window.dispatchEvent(
      new CustomEvent("clawpad:open-new-page", {
        detail: { mode: "document" },
      }),
    );
  };

  const openSearch = () => {
    window.dispatchEvent(new CustomEvent("clawpad:open-command-palette"));
  };

  const askAgentToUpdate = () => {
    const isWindows =
      typeof navigator !== "undefined" &&
      /windows/i.test(navigator.userAgent || navigator.platform || "");
    const command = isWindows
      ? "npm install -g clawpad@latest && npm install -g openclaw@latest"
      : "npm install -g clawpad@latest && npm install -g openclaw@latest  # or: brew upgrade clawpad openclaw";
    const message = [
      "Please update ClawPad and the OpenClaw CLI on this machine.",
      "Run the following in a terminal, then confirm when done:",
      command,
    ].join("\n\n");
    window.dispatchEvent(
      new CustomEvent("clawpad:ai-action", {
        detail: { message },
      }),
    );
  };

  const handleBootstrap = async () => {
    setBootstrapping(true);
    setBootstrapError(null);
    try {
      const res = await fetch("/api/setup/bootstrap", { method: "POST" });
      if (!res.ok) {
        const payload = await res.json();
        throw new Error(payload?.error || "Failed to bootstrap workspace");
      }
      await loadSpaces();
      await loadRecentPages();
    } catch (err) {
      setBootstrapError((err as Error).message);
    } finally {
      setBootstrapping(false);
    }
  };

  return (
    <div className="flex h-full flex-col items-center justify-center px-4">
      <Suspense fallback={null}>
        <ChatAutoOpen />
      </Suspense>

      <div className="max-w-lg w-full space-y-8 text-center">
        {/* Hero */}
        <div className="space-y-3">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/60 ring-1 ring-border/50">
            <BrandMark variant="icon" size={36} alt="" />
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
            New Document
          </Button>
          <Button variant="outline" onClick={openSearch}>
            <Search className="mr-2 h-4 w-4" />
            Search
          </Button>
        </div>

        {updateInfo?.updateAvailable && (
          <div className="rounded-lg border border-border/70 bg-amber-50 px-4 py-3 text-left text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-100">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="font-medium">Update available</p>
                <p className="text-xs text-amber-800/90 dark:text-amber-100/80">
                  {updateInfo.current ? `You have ${updateInfo.current}. ` : ""}Latest is {updateInfo.latest}.
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={askAgentToUpdate}>
                  Ask Agent to Update
                </Button>
              </div>
            </div>
          </div>
        )}

        {spaces.length === 0 &&
          recentPages.length === 0 &&
          spacesStatus !== "loading" &&
          recentStatus !== "loading" && (
          <div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
            <div className="mb-3 font-medium text-foreground">
              No workspace yet
            </div>
            <p className="mb-4 text-xs">
              Create a starter workspace with default spaces and a welcome page.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button size="sm" onClick={handleBootstrap} disabled={bootstrapping}>
                {bootstrapping ? "Creating…" : "Create starter workspace"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => router.push("/setup")}
              >
                Open setup
              </Button>
            </div>
            {bootstrapError && (
              <p className="mt-3 text-xs text-rose-500">{bootstrapError}</p>
            )}
          </div>
        )}

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
                      <span>{page.space === ROOT_SPACE_PATH ? ROOT_SPACE_NAME : page.space}</span>
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
