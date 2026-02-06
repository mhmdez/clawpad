"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useChangesStore } from "@/lib/stores/changes";
import type { ChangeSetSummary } from "@/lib/changes/types";
import { cn } from "@/lib/utils";

interface ChangeSummaryCardProps {
  summary: ChangeSetSummary;
}

export function ChangeSummaryCard({ summary }: ChangeSummaryCardProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const openReview = useChangesStore((s) => s.openReview);
  const dismiss = useChangesStore((s) => s.dismissChangeSet);
  const loadChangeSets = useChangesStore((s) => s.loadChangeSets);

  const files = summary.files ?? [];
  const totalFiles = summary.totals.filesChanged;
  const additions = summary.totals.additions;
  const deletions = summary.totals.deletions;

  const goToFile = (path: string) => {
    const urlPath = path.replace(/\.md$/, "");
    openReview(summary.id, path);
    router.push(`/workspace/${urlPath}`);
  };

  const handleReview = () => {
    if (files.length === 0) return;
    goToFile(files[0].path);
  };

  const handleUndoAll = async () => {
    setBusy(true);
    try {
      await fetch("/api/changes/revert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          changeSetId: summary.id,
          mode: "all",
        }),
      });
      await loadChangeSets();
      dismiss(summary.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-background/95 shadow-sm">
      <div className="flex items-start justify-between px-4 py-3">
        <div className="space-y-0.5">
          <div className="text-xs text-muted-foreground">
            {totalFiles} files changed
          </div>
          <div className="flex items-center gap-2 text-sm font-medium">
            <span className="text-emerald-600">+{additions}</span>
            <span className="text-rose-500">-{deletions}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => dismiss(summary.id)}
          className="rounded-md p-1 text-muted-foreground/70 hover:text-muted-foreground"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="border-t border-border/70">
        {files.length === 0 ? (
          <div className="px-4 py-3 text-xs text-muted-foreground">
            No file details available.
          </div>
        ) : (
          <div className="divide-y divide-border/70">
            {files.map((file) => (
              <button
                key={file.path}
                type="button"
                onClick={() => goToFile(file.path)}
                className={cn(
                  "flex w-full items-center justify-between px-4 py-2 text-left text-xs",
                  "hover:bg-muted/40 transition-colors",
                )}
              >
                <span className="truncate">{file.path}</span>
                <span className="ml-3 shrink-0 font-mono text-[11px]">
                  <span className="text-emerald-600">+{file.additions}</span>{" "}
                  <span className="text-rose-500">-{file.deletions}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between px-4 py-3">
        <Button size="sm" variant="outline" onClick={handleReview} disabled={files.length === 0}>
          Review changes
          <ArrowUpRight className="ml-2 h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="ghost" onClick={handleUndoAll} disabled={busy}>
          <Undo2 className="mr-2 h-3.5 w-3.5" />
          Undo all
        </Button>
      </div>
    </div>
  );
}
