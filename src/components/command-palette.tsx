"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  FolderOpen,
  Plus,
  Search,
  Settings,
  Moon,
  Clock,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { useWorkspaceStore } from "@/lib/stores/workspace";
import type { PageMeta } from "@/lib/files";

interface SearchResult extends PageMeta {
  snippet?: string;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const router = useRouter();
  const { recentPages, spaces } = useWorkspaceStore();

  // Global Cmd+K
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

  // Search debounce — 300ms
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/files/search?q=${encodeURIComponent(query)}&limit=10`,
        );
        if (res.ok) {
          const data = await res.json();
          setResults(data);
        }
      } catch {
        // silent
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  const navigate = useCallback(
    (path: string) => {
      // Strip .md for URL
      const urlPath = path.replace(/\.md$/, "");
      router.push(`/workspace/${urlPath}`);
      setOpen(false);
      setQuery("");
    },
    [router],
  );

  const handleOpenChange = useCallback((value: boolean) => {
    setOpen(value);
    if (!value) {
      setQuery("");
      setResults([]);
    }
  }, []);

  return (
    <CommandDialog open={open} onOpenChange={handleOpenChange}>
      <CommandInput
        placeholder="Search pages or type a command…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>
          {searching ? "Searching…" : "No results found."}
        </CommandEmpty>

        {/* Search results */}
        {results.length > 0 && (
          <CommandGroup heading="Search Results">
            {results.map((result) => (
              <CommandItem
                key={result.path}
                value={result.path}
                onSelect={() => navigate(result.path)}
                className="flex flex-col items-start gap-1 py-3"
              >
                <div className="flex w-full items-center gap-2">
                  <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate font-medium">{result.title}</span>
                  <Badge
                    variant="secondary"
                    className="ml-auto shrink-0 text-[10px] px-1.5 py-0"
                  >
                    {result.space}
                  </Badge>
                </div>
                {result.snippet && (
                  <p className="ml-6 text-xs text-muted-foreground line-clamp-1 max-w-full">
                    {cleanSnippet(result.snippet)}
                  </p>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Recent pages (shown when no query) */}
        {!query.trim() && recentPages.length > 0 && (
          <CommandGroup heading="Recent Pages">
            {recentPages.slice(0, 5).map((page) => (
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
                    {page.space}
                  </Badge>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Spaces */}
        {!query.trim() && spaces.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Spaces">
              {spaces.map((space) => (
                <CommandItem
                  key={space.path}
                  value={`space-${space.path}`}
                  onSelect={() => {
                    useWorkspaceStore.getState().toggleSpace(space.path);
                    setOpen(false);
                  }}
                >
                  <FolderOpen className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>
                    {space.icon && `${space.icon} `}
                    {space.name}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {/* Actions */}
        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem
            value="new-page"
            onSelect={() => {
              setOpen(false);
              window.dispatchEvent(new CustomEvent("clawpad:new-page"));
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            <span>New Page</span>
          </CommandItem>
          <CommandItem
            value="settings"
            onSelect={() => {
              router.push("/settings");
              setOpen(false);
            }}
          >
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
          </CommandItem>
          <CommandItem
            value="toggle-theme"
            onSelect={() => {
              document.documentElement.classList.toggle("dark");
              setOpen(false);
            }}
          >
            <Moon className="mr-2 h-4 w-4" />
            <span>Toggle Theme</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

/** Strip frontmatter artifacts and clean up snippet text */
function cleanSnippet(snippet: string): string {
  return snippet
    .replace(/^---[\s\S]*?---\s*/m, "")
    .replace(/^#+\s/gm, "")
    .replace(/\n+/g, " ")
    .trim();
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
