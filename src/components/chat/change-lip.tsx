"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useChangesStore } from "@/lib/stores/changes";
import { cn } from "@/lib/utils";

export function ChangeLip() {
  const router = useRouter();
  const activeRun = useChangesStore((s) => s.activeRun);
  const activeFiles = useChangesStore((s) => s.activeFiles);
  const changeSets = useChangesStore((s) => s.changeSets);
  const openReview = useChangesStore((s) => s.openReview);
  const closeReview = useChangesStore((s) => s.closeReview);

  const latestChangeSet = changeSets.find((item) => item.status === "completed");
  const [open, setOpen] = useState(false);

  if (!activeRun && !latestChangeSet) return null;

  const isActive = Boolean(activeRun);
  const fileCount = isActive
    ? activeFiles.size
    : latestChangeSet?.totals.filesChanged ?? 0;
  const additions = latestChangeSet?.totals.additions ?? 0;
  const deletions = latestChangeSet?.totals.deletions ?? 0;

  const label = fileCount === 0 ? "files" : fileCount === 1 ? "1 file" : `${fileCount} files`;

  const handleOpenFile = (path: string) => {
    closeReview();
    const urlPath = path.replace(/\.md$/, "");
    router.push(`/workspace/${urlPath}`);
  };

  const handleOpenDiff = (path: string) => {
    if (!latestChangeSet) return;
    openReview(latestChangeSet.id, path);
    const urlPath = path.replace(/\.md$/, "");
    router.push(`/workspace/${urlPath}`);
  };

  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={() => {
          if (!latestChangeSet) return;
          setOpen((prev) => !prev);
        }}
        className={cn(
          "flex w-full items-center gap-2 border border-border/60 bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground",
          "rounded-lg",
          latestChangeSet && "cursor-pointer hover:bg-muted/60",
        )}
      >
        <span className="inline-flex h-2 w-2 rounded-full bg-[color:var(--cp-brand-2)] animate-pulse" />
        <span className="flex-1 text-left">
          {isActive ? (
            <>Editing {label}…</>
          ) : (
            <>
              {label} changed{" "}
              <span className="text-emerald-600">+{additions}</span>{" "}
              <span className="text-rose-500">-{deletions}</span>
            </>
          )}
        </span>
        {latestChangeSet && (
          <span className="text-muted-foreground/70">
            {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </span>
        )}
      </button>

      {open && latestChangeSet && (
        <div className="rounded-b-lg border border-t-0 border-border/60 bg-background/95">
          <div className="divide-y divide-border/70">
            {latestChangeSet.files.map((file) => (
              <div
                key={file.path}
                className="flex items-center gap-3 px-3 py-2 text-xs"
              >
                <button
                  type="button"
                  onClick={() => handleOpenDiff(file.path)}
                  className="rounded-md border border-border/70 px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground"
                >
                  Diff
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenFile(file.path)}
                  className="flex-1 truncate text-left text-foreground/80 hover:text-foreground"
                >
                  {file.path}
                </button>
                <span className="shrink-0 font-mono text-[11px]">
                  <span className="text-emerald-600">+{file.additions}</span>{" "}
                  <span className="text-rose-500">-{file.deletions}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
