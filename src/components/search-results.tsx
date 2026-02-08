"use client";

import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { FileText, Search, Brain, Clock, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toWorkspacePath } from "@/lib/utils/workspace-route";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SearchResultItem {
  title: string;
  path: string;
  snippet?: string;
  score?: number;
  space: string;
  icon?: string;
  modified?: string;
  matchType?: "title" | "content" | "both";
}

export type SearchMode = "basic" | "semantic" | "unavailable";

interface SearchResultsProps {
  results: SearchResultItem[];
  query: string;
  mode?: SearchMode;
  loading?: boolean;
  compact?: boolean;
  onNavigate?: (path: string) => void;
  showHeader?: boolean;
  emptyMessage?: string;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function SearchResults({
  results,
  query,
  mode = "basic",
  loading = false,
  compact = false,
  onNavigate,
  showHeader = false,
  emptyMessage,
}: SearchResultsProps) {
  const router = useRouter();

  const handleNavigate = useCallback(
    (path: string) => {
      const normalizedPath = path.replace(/\.md$/, "");
      if (onNavigate) {
        onNavigate(normalizedPath);
      } else {
        router.push(toWorkspacePath(path));
      }
    },
    [router, onNavigate],
  );

  if (loading) {
    return <SearchResultsSkeleton compact={compact} />;
  }

  if (results.length === 0 && query.trim()) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
        <Search className="h-8 w-8 opacity-40" />
        <p className="text-sm">{emptyMessage ?? "No results found"}</p>
        <p className="text-xs opacity-60">
          Try different keywords or check your spelling
        </p>
      </div>
    );
  }

  if (results.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1">
      {showHeader && (
        <div className="flex items-center justify-between px-1 pb-2">
          <span className="text-xs font-medium text-muted-foreground">
            {results.length} result{results.length !== 1 ? "s" : ""}
          </span>
          <SearchModeBadge mode={mode} />
        </div>
      )}

      {results.map((result) => (
        <SearchResultCard
          key={result.path}
          result={result}
          query={query}
          compact={compact}
          onClick={() => handleNavigate(result.path)}
        />
      ))}
    </div>
  );
}

// ─── Result Card ────────────────────────────────────────────────────────────

function SearchResultCard({
  result,
  query,
  compact,
  onClick,
}: {
  result: SearchResultItem;
  query: string;
  compact: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`group flex w-full flex-col items-start gap-1 rounded-md border border-transparent px-3 text-left transition-colors hover:bg-accent/50 hover:border-border/50 ${
        compact ? "py-2" : "py-3"
      }`}
    >
      {/* Title row */}
      <div className="flex w-full items-center gap-2">
        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className={`truncate font-medium ${compact ? "text-sm" : ""}`}>
          {result.icon && `${result.icon} `}
          {result.title}
        </span>
        <Badge
          variant="secondary"
          className="ml-auto shrink-0 text-[10px] px-1.5 py-0"
        >
          {formatSpaceName(result.space)}
        </Badge>
        {result.score != null && !compact && (
          <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums opacity-60">
            {result.score.toFixed(1)}
          </span>
        )}
        {result.modified && (
          <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
            {formatRelativeDate(result.modified)}
          </span>
        )}
        <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-60" />
      </div>

      {/* Snippet */}
      {result.snippet && (
        <p
          className={`ml-6 text-muted-foreground ${
            compact ? "text-xs line-clamp-1" : "text-sm line-clamp-2"
          } max-w-full`}
        >
          <HighlightedSnippet text={result.snippet} query={query} />
        </p>
      )}
    </button>
  );
}

// ─── Search Mode Badge ──────────────────────────────────────────────────────

export function SearchModeBadge({ mode }: { mode: SearchMode }) {
  if (mode === "semantic") {
    return (
      <Badge
        variant="secondary"
        className="gap-1 text-[10px] px-1.5 py-0 bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
      >
        <Brain className="h-3 w-3" />
        Semantic
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-1 text-[10px] px-1.5 py-0">
      <Search className="h-3 w-3" />
      Basic
    </Badge>
  );
}

// ─── Highlighted Snippet ────────────────────────────────────────────────────

function HighlightedSnippet({
  text,
  query,
}: {
  text: string;
  query: string;
}) {
  const parts = useMemo(() => {
    if (!query.trim()) return [{ text, highlighted: false }];

    const terms = query
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .sort((a, b) => b.length - a.length); // longest first

    if (terms.length === 0) return [{ text, highlighted: false }];

    // Build regex from terms
    const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const regex = new RegExp(`(${escaped.join("|")})`, "gi");

    const result: Array<{ text: string; highlighted: boolean }> = [];
    let lastIndex = 0;

    text.replace(regex, (match, _p1, offset) => {
      if (offset > lastIndex) {
        result.push({ text: text.slice(lastIndex, offset), highlighted: false });
      }
      result.push({ text: match, highlighted: true });
      lastIndex = offset + match.length;
      return match;
    });

    if (lastIndex < text.length) {
      result.push({ text: text.slice(lastIndex), highlighted: false });
    }

    return result;
  }, [text, query]);

  return (
    <>
      {parts.map((part, i) =>
        part.highlighted ? (
          <mark
            key={i}
            className="bg-yellow-200/70 dark:bg-yellow-500/30 text-inherit rounded-sm px-0.5"
          >
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}

// ─── Skeleton ───────────────────────────────────────────────────────────────

function SearchResultsSkeleton({ compact }: { compact: boolean }) {
  const count = compact ? 4 : 6;
  return (
    <div className="flex flex-col gap-1">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`flex flex-col gap-1.5 rounded-md px-3 ${compact ? "py-2" : "py-3"}`}
        >
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded bg-muted animate-pulse" />
            <div className="h-4 flex-1 rounded bg-muted animate-pulse" style={{ maxWidth: `${150 + i * 30}px` }} />
            <div className="h-4 w-16 rounded bg-muted animate-pulse" />
          </div>
          {!compact && (
            <div className="ml-6 h-3 w-4/5 rounded bg-muted/60 animate-pulse" />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Utilities ──────────────────────────────────────────────────────────────

function formatSpaceName(space: string): string {
  return space
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

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
