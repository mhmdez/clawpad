"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ChangeSet, ChangeFileEntry } from "@/lib/changes/types";
import { toast } from "sonner";
import { useChangesStore } from "@/lib/stores/changes";

interface DocumentDiffViewProps {
  changeSetId: string;
  filePath: string;
  onExit: () => void;
}

export function DocumentDiffView({
  changeSetId,
  filePath,
  onExit,
}: DocumentDiffViewProps) {
  const [changeSet, setChangeSet] = useState<ChangeSet | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const loadChangeSets = useChangesStore((s) => s.loadChangeSets);

  const loadChangeSet = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/changes/${encodeURIComponent(changeSetId)}`);
      if (!res.ok) throw new Error("Failed to load diff");
      const data = (await res.json()) as ChangeSet;
      setChangeSet(data);
    } catch (err) {
      toast.error("Could not load diff");
    } finally {
      setLoading(false);
    }
  }, [changeSetId]);

  useEffect(() => {
    loadChangeSet();
  }, [loadChangeSet]);

  const file = changeSet?.files.find((entry) => entry.path === filePath);

  const handleUndoFile = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/changes/revert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          changeSetId,
          mode: "file",
          path: filePath,
        }),
      });
      if (!res.ok) throw new Error("Undo failed");
      await loadChangeSet();
      await loadChangeSets();
    } catch {
      toast.error("Undo failed");
    } finally {
      setBusy(false);
    }
  };

  const handleUndoHunk = async (hunkId: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/changes/revert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          changeSetId,
          mode: "hunk",
          path: filePath,
          hunkId,
        }),
      });
      if (!res.ok) throw new Error("Undo failed");
      await loadChangeSet();
      await loadChangeSets();
    } catch {
      toast.error("Could not apply undo");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading diff…
      </div>
    );
  }

  if (!file) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
        <span>No diff available for this file.</span>
        <Button variant="outline" size="sm" onClick={onExit}>
          Back to document
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background/90 px-4 py-2 backdrop-blur">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onExit}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="text-sm font-medium">Review changes</div>
            <div className="text-xs text-muted-foreground">{filePath}</div>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleUndoFile} disabled={busy}>
          <Undo2 className="mr-2 h-3.5 w-3.5" />
          Undo file
        </Button>
      </div>

      <div className="flex-1 px-4 py-6">
        <FileDiffContent file={file} onUndoHunk={handleUndoHunk} busy={busy} />
      </div>
    </div>
  );
}

function FileDiffContent({
  file,
  onUndoHunk,
  busy,
}: {
  file: ChangeFileEntry;
  onUndoHunk: (hunkId: string) => void;
  busy: boolean;
}) {
  if (file.tooLarge) {
    return (
      <div className="rounded-md border border-border p-4 text-sm text-muted-foreground">
        File is too large to diff.
      </div>
    );
  }

  const hunks = file.hunks ?? [];
  if (hunks.length === 0) {
    return (
      <div className="rounded-md border border-border p-4 text-sm text-muted-foreground">
        No differences found.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {hunks.map((hunk, index) => (
        <div key={hunk.id} className="overflow-hidden rounded-lg border border-border">
          <div className="flex items-center justify-between bg-muted/60 px-3 py-1.5 text-xs text-muted-foreground">
            <span>
              Hunk {index + 1} · +{hunk.adds} −{hunk.removes}
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => onUndoHunk(hunk.id)}
              disabled={busy}
            >
              Undo
            </Button>
          </div>
          <div className="bg-background">
            <pre className="whitespace-pre-wrap px-3 py-2 text-xs leading-relaxed">
              {hunk.lines.map((line, idx) => {
                const prefix = line[0];
                const text = line.slice(1);
                return (
                  <div
                    key={`${hunk.id}-${idx}`}
                    className={cn(
                      "rounded-sm px-1",
                      prefix === "+" && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
                      prefix === "-" && "bg-rose-500/15 text-rose-700 dark:text-rose-300 line-through",
                    )}
                  >
                    <span className="mr-2 text-muted-foreground/70">{prefix}</span>
                    {text}
                  </div>
                );
              })}
            </pre>
          </div>
        </div>
      ))}
    </div>
  );
}
