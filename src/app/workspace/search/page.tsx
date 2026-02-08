"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SearchResults,
  SearchModeBadge,
  type SearchResultItem,
  type SearchMode,
} from "@/components/search-results";
import { toWorkspacePath } from "@/lib/utils/workspace-route";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Space {
  name: string;
  path: string;
  icon?: string;
}

type SortBy = "relevance" | "date";

// ─── Page ───────────────────────────────────────────────────────────────────

export default function SearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";

  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [mode, setMode] = useState<SearchMode>("basic");
  const [loading, setLoading] = useState(false);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [spaceFilter, setSpaceFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortBy>("relevance");
  const [showFilters, setShowFilters] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ─── Load spaces for filter ─────────────────────────────────────────────

  useEffect(() => {
    fetch("/api/files/spaces")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Space[]) => setSpaces(data))
      .catch(() => {});
  }, []);

  // ─── Focus input on mount ───────────────────────────────────────────────

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // ─── Search on initial query ────────────────────────────────────────────

  useEffect(() => {
    if (initialQuery.trim()) {
      performSearch(initialQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Search function ───────────────────────────────────────────────────

  const performSearch = useCallback(
    async (searchQuery: string) => {
      if (!searchQuery.trim()) {
        setResults([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const params = new URLSearchParams({
          q: searchQuery,
          mode: "auto",
          limit: "50",
        });
        if (spaceFilter && spaceFilter !== "all") {
          params.set("space", spaceFilter);
        }

        const res = await fetch(`/api/search?${params}`, {
          signal: controller.signal,
        });
        if (res.ok) {
          const data = await res.json();
          let items: SearchResultItem[] = data.results ?? [];

          // Client-side sort
          if (sortBy === "date") {
            items = items.sort(
              (a, b) =>
                new Date(b.modified ?? 0).getTime() -
                new Date(a.modified ?? 0).getTime(),
            );
          }

          setResults(items);
          setMode(data.mode ?? "basic");
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.error("Search error:", err);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    },
    [spaceFilter, sortBy],
  );

  // ─── Debounced search on query change ──────────────────────────────────

  useEffect(() => {
    const timer = setTimeout(() => {
      performSearch(query);
      // Update URL without navigation
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      const newUrl = `/workspace/search${params.toString() ? `?${params}` : ""}`;
      window.history.replaceState(null, "", newUrl);
    }, 300);

    return () => clearTimeout(timer);
  }, [query, performSearch]);

  // ─── Re-search on filter/sort change ───────────────────────────────────

  useEffect(() => {
    if (query.trim()) {
      performSearch(query);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceFilter, sortBy]);

  // ─── Navigation ────────────────────────────────────────────────────────

  const handleNavigate = useCallback(
    (path: string) => {
      router.push(toWorkspacePath(path));
    },
    [router],
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Find pages across your workspace
        </p>
      </div>

      {/* Search input */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search pages…"
          className="pl-10 pr-10 h-11 text-base"
        />
        {query && (
          <button
            onClick={() => {
              setQuery("");
              setResults([]);
              inputRef.current?.focus();
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Filters bar */}
      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 h-8 text-xs"
          onClick={() => setShowFilters(!showFilters)}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filters
          {spaceFilter !== "all" && (
            <Badge variant="secondary" className="ml-1 px-1 py-0 text-[10px]">
              1
            </Badge>
          )}
        </Button>

        <div className="flex-1" />

        {query.trim() && !loading && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {results.length} result{results.length !== 1 ? "s" : ""}
            </span>
            <SearchModeBadge mode={mode} />
          </div>
        )}
      </div>

      {/* Expanded filters */}
      {showFilters && (
        <div className="mb-4 flex items-center gap-4 rounded-lg border bg-muted/30 p-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-muted-foreground">
              Space
            </label>
            <Select value={spaceFilter} onValueChange={setSpaceFilter}>
              <SelectTrigger className="h-8 w-[160px] text-xs">
                <SelectValue placeholder="All spaces" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All spaces</SelectItem>
                {spaces.map((space) => (
                  <SelectItem key={space.path} value={space.path}>
                    {space.icon && `${space.icon} `}
                    {space.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-muted-foreground">
              Sort
            </label>
            <Select
              value={sortBy}
              onValueChange={(v) => setSortBy(v as SortBy)}
            >
              <SelectTrigger className="h-8 w-[130px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="relevance">Relevance</SelectItem>
                <SelectItem value="date">Date modified</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {spaceFilter !== "all" && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setSpaceFilter("all")}
            >
              Clear filters
            </Button>
          )}
        </div>
      )}

      {/* Results */}
      <SearchResults
        results={results}
        query={query}
        mode={mode}
        loading={loading}
        compact={false}
        onNavigate={handleNavigate}
        emptyMessage={
          spaceFilter !== "all"
            ? `No results in ${spaces.find((s) => s.path === spaceFilter)?.name ?? spaceFilter}`
            : undefined
        }
      />

      {/* Empty state — no query */}
      {!query.trim() && (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
          <Search className="h-12 w-12 opacity-20" />
          <p className="text-sm">Start typing to search your workspace</p>
          <p className="text-xs opacity-60">
            Tip: Use{" "}
            <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px] font-mono">
              ⌘K
            </kbd>{" "}
            for quick search from anywhere
          </p>
        </div>
      )}
    </div>
  );
}
