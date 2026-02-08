"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useChangesStore } from "@/lib/stores/changes";
import { cn } from "@/lib/utils";
import { toWorkspacePath } from "@/lib/utils/workspace-route";

export type ChangeLipStatusTone = "warn" | "error";

export interface ChangeLipStatus {
  kind: "thinking" | "writing" | "background" | "alert";
  label: string;
  detail?: string;
  tone?: ChangeLipStatusTone;
}

interface ChangeLipProps {
  status?: ChangeLipStatus | null;
}

export function ChangeLip({ status }: ChangeLipProps) {
  const router = useRouter();
  const activeRun = useChangesStore((s) => s.activeRun);
  const activeFiles = useChangesStore((s) => s.activeFiles);
  const changeSets = useChangesStore((s) => s.changeSets);
  const openReview = useChangesStore((s) => s.openReview);
  const closeReview = useChangesStore((s) => s.closeReview);

  const latestChangeSet = changeSets.find((item) => item.status === "completed");
  const [open, setOpen] = useState(false);

  const activeFileCount = activeFiles.size;
  const isEditingFiles = Boolean(activeRun) && activeFileCount > 0;
  const hasSummary = Boolean(latestChangeSet);
  const mode: "status" | "editing" | "summary" | null = status
    ? "status"
    : isEditingFiles
      ? "editing"
      : hasSummary
        ? "summary"
        : null;

  const fileCount = mode === "editing"
    ? activeFileCount
    : latestChangeSet?.totals.filesChanged ?? 0;
  const additions = latestChangeSet?.totals.additions ?? 0;
  const deletions = latestChangeSet?.totals.deletions ?? 0;

  const label = fileCount === 0 ? "files" : fileCount === 1 ? "1 file" : `${fileCount} files`;
  const canToggleSummary = mode === "summary" && Boolean(latestChangeSet);
  const summaryOpen = canToggleSummary && open;

  if (!mode) return null;

  const handleOpenFile = (path: string) => {
    closeReview();
    router.push(toWorkspacePath(path));
  };

  const handleOpenDiff = (path: string) => {
    if (!latestChangeSet) return;
    openReview(latestChangeSet.id, path);
    router.push(toWorkspacePath(path));
  };

  const statusIsAlert = status?.kind === "alert";
  const statusIsError = status?.tone === "error";
  const statusClasses = status
    ? cn(
        "flex w-full items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-colors",
        status.kind === "thinking" &&
          "border-[color:var(--cp-brand-border)] bg-[color:var(--cp-status-thinking-bg)] text-[color:var(--cp-status-thinking-text)]",
        status.kind === "writing" &&
          "border-[color:var(--cp-brand-border)] bg-[color:var(--cp-status-thinking-bg)] text-[color:var(--cp-status-thinking-text)]",
        status.kind === "background" &&
          "border-border/60 bg-[color:var(--cp-status-neutral-bg)] text-[color:var(--cp-status-neutral-text)]",
        statusIsAlert &&
          (statusIsError
            ? "border-red-500/40 bg-[color:var(--cp-status-error-bg)] text-[color:var(--cp-status-error-text)]"
            : "border-amber-500/40 bg-[color:var(--cp-status-alert-bg)] text-[color:var(--cp-status-alert-text)]"),
      )
    : "";
  const dotClasses = status
    ? cn(
        "inline-flex h-2 w-2 rounded-full",
        (status.kind === "thinking" ||
          status.kind === "background" ||
          status.kind === "writing") &&
          "animate-pulse",
        (status.kind === "thinking" || status.kind === "writing") &&
          "bg-[color:var(--cp-status-thinking-text)]",
        status.kind === "background" &&
          "bg-[color:var(--cp-status-neutral-text)]",
        statusIsAlert &&
          (statusIsError
            ? "bg-[color:var(--cp-status-error-text)]"
            : "bg-[color:var(--cp-status-alert-text)]"),
      )
    : "";

  return (
    <div className="mb-2">
      {mode === "status" && status && (
        <div className={statusClasses} role="status" aria-live="polite">
          <span className={dotClasses} />
          <span className="text-[11px] font-medium">{status.label}</span>
          {status.detail && (
            <span className="max-w-[240px] truncate text-[10px] text-foreground/70">
              {status.detail}
            </span>
          )}
        </div>
      )}

      {(mode === "editing" || mode === "summary") && (
        <>
          <button
            type="button"
            onClick={() => {
              if (!canToggleSummary) return;
              setOpen((prev) => !prev);
            }}
            className={cn(
              "flex w-full items-center gap-2 border border-border/60 bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground",
              "rounded-lg",
              canToggleSummary && "cursor-pointer hover:bg-muted/60",
            )}
          >
            <span className="inline-flex h-2 w-2 rounded-full bg-[color:var(--cp-brand-2)] animate-pulse" />
            <span className="flex-1 text-left">
              {mode === "editing" ? (
                <>Editing {label}…</>
              ) : (
                <>
                  {label} changed{" "}
                  <span className="text-emerald-600">+{additions}</span>{" "}
                  <span className="text-rose-500">-{deletions}</span>
                </>
              )}
            </span>
            {canToggleSummary && (
              <span className="text-muted-foreground/70">
                {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </span>
            )}
          </button>

          {summaryOpen && latestChangeSet && (
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
        </>
      )}
    </div>
  );
}
