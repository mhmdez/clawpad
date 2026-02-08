"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  ArrowRight,
  CalendarPlus,
  FileText,
  FolderOpen,
  Keyboard,
  MessageSquare,
  Moon,
  Sun,
  Monitor,
  PanelLeft,
  Pencil,
  Plus,
  Search,
  Settings,
  Sparkles,
  Clock,
  Compass,
  Zap,
  FilePlus,
  Focus,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { useWorkspaceStore } from "@/lib/stores/workspace";
import { ROOT_SPACE_NAME, ROOT_SPACE_PATH } from "@/lib/files/constants";
import { toWorkspacePath } from "@/lib/utils/workspace-route";

// ─── Types ──────────────────────────────────────────────────────────────────

interface SearchResult {
  title: string;
  path: string;
  snippet?: string;
  score?: number;
  space: string;
  icon?: string;
  modified?: string;
}

interface RecentPage {
  title: string;
  path: string;
  space: string;
  icon?: string;
  modified?: string;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [recentFromApi, setRecentFromApi] = useState<RecentPage[]>([]);
  const [searching, setSearching] = useState(false);
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const { recentPages, spaces, toggleChatPanel, toggleSidebar } =
    useWorkspaceStore();
  const abortRef = useRef<AbortController | null>(null);

  // ─── Global Cmd+K ───────────────────────────────────────────────────────

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  // ─── Fetch recent pages when palette opens with empty query ─────────────

  useEffect(() => {
    if (!open) return;
    // Fetch from API for freshest data
    fetch("/api/files/recent?limit=8")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: RecentPage[]) => setRecentFromApi(data))
      .catch(() => {});
  }, [open]);

  // ─── Debounced search — 200ms, hits /api/files/search ──────────────────

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);

    const timer = setTimeout(async () => {
      // Cancel previous request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch(
          `/api/files/search?q=${encodeURIComponent(query)}&limit=10`,
          { signal: controller.signal },
        );
        if (res.ok) {
          const data = await res.json();
          // API returns array directly
          setResults(Array.isArray(data) ? data : data.results ?? []);
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          // silent
        }
      } finally {
        if (!controller.signal.aborted) {
          setSearching(false);
        }
      }
    }, 200);

    return () => {
      clearTimeout(timer);
    };
  }, [query]);

  // ─── Navigation helper ─────────────────────────────────────────────────

  const navigate = useCallback(
    (path: string) => {
      router.push(toWorkspacePath(path));
      setOpen(false);
      setQuery("");
    },
    [router],
  );

  // ─── Quick page creation ───────────────────────────────────────────────

  const createPage = useCallback(
    async (title: string) => {
      const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      const path = `${slug}.md`;

      try {
        await fetch(`/api/files/pages/${slug}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: `# ${title}\n`,
            frontmatter: { title },
          }),
        });
        navigate(path);
      } catch {
        // silent
      }
    },
    [navigate],
  );

  // ─── Handlers ──────────────────────────────────────────────────────────

  const handleOpenChange = useCallback((value: boolean) => {
    setOpen(value);
    if (!value) {
      setQuery("");
      setResults([]);
    }
  }, []);

  // Determine what recent pages to show (prefer API data, fall back to store)
  const recentList =
    recentFromApi.length > 0 ? recentFromApi : recentPages.slice(0, 8);

  const hasQuery = query.trim().length > 0;
  const hasResults = results.length > 0;
  const showCreateOption = hasQuery && !hasResults && !searching;

  return (
    <CommandDialog open={open} onOpenChange={handleOpenChange}>
      <CommandInput
        placeholder="Search pages or type a command…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>
          {searching ? (
            <div className="flex items-center justify-center gap-2 py-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
              <span className="text-sm text-muted-foreground">Searching…</span>
            </div>
          ) : hasQuery ? (
            "No results found."
          ) : null}
        </CommandEmpty>

        {/* ─── Search Results ──────────────────────────────────────── */}
        {hasResults && (
          <CommandGroup heading="Pages">
            {results.map((result) => (
              <CommandItem
                key={result.path}
                value={`search-${result.path}`}
                onSelect={() => navigate(result.path)}
                className="flex flex-col items-start gap-1 py-3"
              >
                <div className="flex w-full items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate font-medium">
                    {result.icon && `${result.icon} `}
                    {result.title}
                  </span>
                  <Badge
                    variant="secondary"
                    className="ml-auto shrink-0 text-[10px] px-1.5 py-0"
                  >
                    {result.space}
                  </Badge>
                  {result.modified && (
                    <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                      {formatRelativeDate(result.modified)}
                    </span>
                  )}
                </div>
                {result.snippet && (
                  <p className="ml-6 text-xs text-muted-foreground line-clamp-1 max-w-full">
                    {cleanSnippet(result.snippet)}
                  </p>
                )}
              </CommandItem>
            ))}

            {/* View all results on dedicated search page */}
            <CommandItem
              value={`view-all-search-${query}`}
              onSelect={() => {
                router.push(`/workspace/search?q=${encodeURIComponent(query.trim())}`);
                setOpen(false);
                setQuery("");
              }}
              className="justify-center text-muted-foreground"
            >
              <Search className="mr-2 h-3.5 w-3.5" />
              <span className="text-xs">View all results</span>
              <ArrowRight className="ml-1 h-3 w-3" />
            </CommandItem>
          </CommandGroup>
        )}

        {/* ─── Quick Create (when no results match) ───────────────── */}
        {showCreateOption && (
          <CommandGroup heading="Create">
            <CommandItem
              value={`create-${query}`}
              onSelect={() => createPage(query.trim())}
            >
              <FilePlus className="mr-2 h-4 w-4 text-primary" />
              <span>
                Create page: <strong>{query.trim()}</strong>
              </span>
            </CommandItem>
          </CommandGroup>
        )}

        {/* ─── Recent Pages (shown when no query) ─────────────────── */}
        {!hasQuery && recentList.length > 0 && (
          <CommandGroup heading="Recent Pages">
            {recentList.map((page) => (
              <CommandItem
                key={page.path}
                value={`recent-${page.path}`}
                onSelect={() => navigate(page.path)}
              >
                <Clock className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="flex flex-1 items-center gap-2 overflow-hidden">
                  {page.icon && (
                    <span className="shrink-0 text-sm">{page.icon}</span>
                  )}
                  <span className="truncate">{page.title}</span>
                  <Badge
                    variant="secondary"
                    className="ml-auto shrink-0 text-[10px] px-1.5 py-0"
                  >
                    {page.space === ROOT_SPACE_PATH ? ROOT_SPACE_NAME : page.space}
                  </Badge>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandSeparator />

        {/* ─── Pages Commands ─────────────────────────────────────── */}
        <CommandGroup heading="Pages">
          <CommandItem
            value="new-page"
            onSelect={() => {
              setOpen(false);
              window.dispatchEvent(new CustomEvent("clawpad:new-page"));
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            <span>New Page</span>
            <CommandShortcut>⌘N</CommandShortcut>
          </CommandItem>
          <CommandItem
            value="new-daily-note"
            onSelect={() => {
              setOpen(false);
              const today = new Date().toISOString().slice(0, 10);
              createPage(today);
            }}
          >
            <CalendarPlus className="mr-2 h-4 w-4" />
            <span>New Daily Note</span>
          </CommandItem>
        </CommandGroup>

        {/* ─── AI Commands ────────────────────────────────────────── */}
        <CommandGroup heading="AI">
          <CommandItem
            value="ask-agent"
            onSelect={() => {
              // Open chat panel for AI interaction
              const store = useWorkspaceStore.getState();
              if (!store.chatPanelOpen) store.toggleChatPanel();
              setOpen(false);
            }}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            <span>Ask Agent</span>
            <CommandShortcut>⌘⇧L</CommandShortcut>
          </CommandItem>
          <CommandItem
            value="summarize-page"
            onSelect={() => {
              const store = useWorkspaceStore.getState();
              if (!store.chatPanelOpen) store.toggleChatPanel();
              setOpen(false);
              // Dispatch an event for the chat panel to pick up
              window.dispatchEvent(
                new CustomEvent("clawpad:ai-action", {
                  detail: { action: "summarize" },
                }),
              );
            }}
          >
            <FileText className="mr-2 h-4 w-4" />
            <span>Summarize Page</span>
          </CommandItem>
          <CommandItem
            value="improve-writing"
            onSelect={() => {
              const store = useWorkspaceStore.getState();
              if (!store.chatPanelOpen) store.toggleChatPanel();
              setOpen(false);
              window.dispatchEvent(
                new CustomEvent("clawpad:ai-action", {
                  detail: { action: "improve" },
                }),
              );
            }}
          >
            <Pencil className="mr-2 h-4 w-4" />
            <span>Improve Writing</span>
          </CommandItem>
        </CommandGroup>

        {/* ─── Navigation Commands ────────────────────────────────── */}
        <CommandGroup heading="Navigation">
          <CommandItem
            value="search-workspace"
            onSelect={() => {
              const searchQuery = query.trim();
              router.push(
                searchQuery
                  ? `/workspace/search?q=${encodeURIComponent(searchQuery)}`
                  : "/workspace/search",
              );
              setOpen(false);
              setQuery("");
            }}
          >
            <Search className="mr-2 h-4 w-4" />
            <span>Search Workspace</span>
          </CommandItem>
          <CommandItem
            value="go-to-settings"
            onSelect={() => {
              router.push("/settings");
              setOpen(false);
            }}
          >
            <Settings className="mr-2 h-4 w-4" />
            <span>Go to Settings</span>
          </CommandItem>
          <CommandItem
            value="go-to-setup"
            onSelect={() => {
              router.push("/setup");
              setOpen(false);
            }}
          >
            <Compass className="mr-2 h-4 w-4" />
            <span>Go to Setup</span>
          </CommandItem>
          {/* Spaces quick nav */}
          {spaces.map((space) => (
            <CommandItem
              key={space.path}
              value={`space-${space.path}`}
              onSelect={() => {
                useWorkspaceStore.getState().toggleSpace(space.path);
                setOpen(false);
              }}
            >
              <FolderOpen className="mr-2 h-4 w-4 text-muted-foreground" />
              <span>
                {space.icon && `${space.icon} `}
                {space.name}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>

        {/* ─── Actions ────────────────────────────────────────────── */}
        <CommandGroup heading="Actions">
          <CommandItem
            value="toggle-chat"
            onSelect={() => {
              toggleChatPanel();
              setOpen(false);
            }}
          >
            <MessageSquare className="mr-2 h-4 w-4" />
            <span>Toggle Chat</span>
            <CommandShortcut>⌘⇧L</CommandShortcut>
          </CommandItem>
          <CommandItem
            value="toggle-sidebar"
            onSelect={() => {
              toggleSidebar();
              setOpen(false);
            }}
          >
            <PanelLeft className="mr-2 h-4 w-4" />
            <span>Toggle Sidebar</span>
            <CommandShortcut>⌘\</CommandShortcut>
          </CommandItem>
          <CommandItem
            value="toggle-dark-mode"
            onSelect={() => {
              setTheme(resolvedTheme === "dark" ? "light" : "dark");
              setOpen(false);
            }}
          >
            {resolvedTheme === "dark" ? (
              <Sun className="mr-2 h-4 w-4" />
            ) : (
              <Moon className="mr-2 h-4 w-4" />
            )}
            <span>Toggle Dark Mode</span>
            <CommandShortcut>⌘⇧D</CommandShortcut>
          </CommandItem>
          <CommandItem
            value="theme-light"
            onSelect={() => {
              setTheme("light");
              setOpen(false);
            }}
          >
            <Sun className="mr-2 h-4 w-4" />
            <span>Theme: Light</span>
          </CommandItem>
          <CommandItem
            value="theme-dark"
            onSelect={() => {
              setTheme("dark");
              setOpen(false);
            }}
          >
            <Moon className="mr-2 h-4 w-4" />
            <span>Theme: Dark</span>
          </CommandItem>
          <CommandItem
            value="theme-system"
            onSelect={() => {
              setTheme("system");
              setOpen(false);
            }}
          >
            <Monitor className="mr-2 h-4 w-4" />
            <span>Theme: System</span>
          </CommandItem>
          <CommandItem
            value="focus-editor"
            onSelect={() => {
              const editorEl =
                document.querySelector<HTMLElement>(".clawpad-editor [contenteditable]") ??
                document.querySelector<HTMLElement>(".clawpad-editor");
              editorEl?.focus();
              setOpen(false);
            }}
          >
            <Focus className="mr-2 h-4 w-4" />
            <span>Focus Editor</span>
            <CommandShortcut>⌘⇧E</CommandShortcut>
          </CommandItem>
          <CommandItem
            value="force-save"
            onSelect={() => {
              window.dispatchEvent(
                new CustomEvent("clawpad:force-save"),
              );
              setOpen(false);
            }}
          >
            <Zap className="mr-2 h-4 w-4" />
            <span>Save</span>
            <CommandShortcut>⌘S</CommandShortcut>
          </CommandItem>
          <CommandItem
            value="keyboard-shortcuts"
            onSelect={() => {
              window.dispatchEvent(new CustomEvent("clawpad:shortcuts-dialog"));
              setOpen(false);
            }}
          >
            <Keyboard className="mr-2 h-4 w-4" />
            <span>Keyboard Shortcuts</span>
            <CommandShortcut>⌘/</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

// ─── Utilities ──────────────────────────────────────────────────────────────

/** Strip frontmatter artifacts and clean up snippet text */
function cleanSnippet(snippet: string): string {
  return snippet
    .replace(/^---[\s\S]*?---\s*/m, "")
    .replace(/^#+\s/gm, "")
    .replace(/\n+/g, " ")
    .trim();
}

/** Format an ISO date string into a relative label */
function formatRelativeDate(iso: string): string {
  try {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

/** Hook to open command palette programmatically */
export function useCommandPalette() {
  return {
    open: () => {
      const event = new KeyboardEvent("keydown", {
        key: "k",
        metaKey: true,
        bubbles: true,
      });
      document.dispatchEvent(event);
    },
  };
}
