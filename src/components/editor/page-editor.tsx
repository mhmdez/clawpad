"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  memo,
  Suspense,
} from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { EditorSkeleton } from "@/components/editor/editor-skeleton";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SaveStatus } from "@/components/editor/editor";
import type { PageMeta } from "@/lib/files/types";
import { useWorkspaceStore } from "@/lib/stores/workspace";
import { useChangesStore } from "@/lib/stores/changes";
import { DocumentDiffView } from "@/components/editor/document-diff-view";

const Editor = dynamic(() => import("@/components/editor/editor"), {
  ssr: false,
  loading: () => <EditorSkeleton />,
});

// ─── Common Emoji Picker (simple) ──────────────────────────────────────────

const PAGE_ICONS = [
  "📝", "📄", "📋", "📌", "📎", "📑", "📒",
  "📓", "📔", "📕", "📖", "📗", "📘", "📙",
  "🎯", "🚀", "💡", "🔥", "⚡", "🎨", "🧠",
  "💻", "🔧", "📊", "🗂️", "✨", "🌟", "👋",
  "🎙️", "🎵", "📷", "🔬", "🏗️", "🗺️", "🧩",
];

// ─── Types ──────────────────────────────────────────────────────────────────

interface PageEditorProps {
  initialContent: string;
  meta: PageMeta;
  filePath: string;
}

interface FileChangeDetail {
  type: "file-changed" | "file-added" | "file-removed" | "connected" | "error";
  path?: string;
  timestamp?: number;
}

// ─── Save Indicator ─────────────────────────────────────────────────────────

const SaveIndicator = memo(function SaveIndicator({
  status,
}: {
  status: SaveStatus;
}) {
  const label: Record<SaveStatus, string> = {
    idle: "",
    saved: "Saved",
    saving: "Saving…",
    unsaved: "Unsaved changes",
    error: "Save failed",
  };
  const color: Record<SaveStatus, string> = {
    idle: "text-text-muted",
    saved: "text-success",
    saving: "text-text-muted",
    unsaved: "text-warning",
    error: "text-error",
  };

  if (status === "idle") return null;

  return (
    <span
      className={`text-xs transition-opacity duration-300 ${color[status]} ${
        status === "saved" ? "animate-fade-out" : ""
      }`}
    >
      {label[status]}
    </span>
  );
});

// ─── Breadcrumb ─────────────────────────────────────────────────────────────

const Breadcrumb = memo(function Breadcrumb({
  filePath,
}: {
  filePath: string;
}) {
  const parts = filePath
    .replace(/\.md$/, "")
    .split("/")
    .map((p) =>
      p
        .replace(/[-_]+/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase()),
    );

  return (
    <nav className="flex items-center gap-1 text-[13px] text-text-muted">
      {parts.map((part, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span className="text-text-muted/50">/</span>}
          <span
            className={i === parts.length - 1 ? "text-text-secondary" : ""}
          >
            {part}
          </span>
        </span>
      ))}
    </nav>
  );
});

// ─── Icon Picker ────────────────────────────────────────────────────────────

function IconPicker({
  icon,
  onSelect,
}: {
  icon?: string;
  onSelect: (emoji: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-4xl leading-none hover:bg-surface-hover rounded-lg p-1 transition-colors cursor-pointer md:text-4xl text-3xl"
        title="Change icon"
      >
        {icon || "📄"}
      </button>

      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 grid grid-cols-7 gap-1 rounded-lg border border-border bg-popover p-2 shadow-lg">
          {PAGE_ICONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                onSelect(emoji);
                setOpen(false);
              }}
              className="flex items-center justify-center w-8 h-8 rounded hover:bg-surface-hover transition-colors text-lg cursor-pointer min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Status Bar ─────────────────────────────────────────────────────────────

const StatusBar = memo(function StatusBar({
  status,
  wordCount,
  modified,
}: {
  status: SaveStatus;
  wordCount: number;
  modified: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard hydration pattern
    setMounted(true);
  }, []);

  const modifiedDate = new Date(modified);
  const timeStr = mounted
    ? modifiedDate.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
  const dateStr = mounted
    ? modifiedDate.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : "";

  return (
    <div className="sticky bottom-0 z-10 flex items-center justify-between border-t border-border bg-background/80 backdrop-blur-sm px-4 py-1.5 text-xs text-text-muted md:px-6 max-md:bottom-14">
      <div className="flex items-center gap-4">
        <SaveIndicator status={status} />
        <span className="hidden sm:inline">{wordCount} words</span>
      </div>
      <span className="hidden sm:inline">
        Last edited{" "}
        <span suppressHydrationWarning>{dateStr}</span> at{" "}
        <span suppressHydrationWarning>{timeStr}</span>
      </span>
      {/* Simplified mobile status */}
      <span className="sm:hidden">
        <SaveIndicator status={status} />
      </span>
    </div>
  );
});

// ─── Page Editor ────────────────────────────────────────────────────────────

export function PageEditor({
  initialContent,
  meta,
  filePath,
}: PageEditorProps) {
  const router = useRouter();
  const { deletePage } = useWorkspaceStore();
  const review = useChangesStore((s) => s.review);
  const closeReview = useChangesStore((s) => s.closeReview);
  const [pageMeta, setPageMeta] = useState(meta);
  const [content, setContent] = useState(initialContent);
  const [contentVersion, setContentVersion] = useState(0);
  const [icon, setIcon] = useState(meta.icon);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [wordCount, setWordCount] = useState(0);
  const [modified, setModified] = useState(meta.modified);
  // Removed unused useTransition
  const titleRef = useRef<HTMLHeadingElement>(null);
  const titleSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleValueRef = useRef(meta.title);
  const saveStatusRef = useRef<SaveStatus>("idle");
  const lastSavedContentRef = useRef(initialContent);
  const lastLocalSaveAtRef = useRef(0);
  const pendingExternalRef = useRef<{ content: string; meta: PageMeta } | null>(null);
  const pendingToastIdRef = useRef<string | number | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filePathRef = useRef(filePath);

  useEffect(() => {
    saveStatusRef.current = saveStatus;
  }, [saveStatus]);

  useEffect(() => {
    filePathRef.current = filePath;
  }, [filePath]);

  useEffect(() => {
    setPageMeta(meta);
    setContent(initialContent);
    setContentVersion((v) => v + 1);
    setIcon(meta.icon);
    setModified(meta.modified);
    setSaveStatus("idle");
    setWordCount(0);
    titleValueRef.current = meta.title;
    lastSavedContentRef.current = initialContent;
    lastLocalSaveAtRef.current = 0;
    pendingExternalRef.current = null;
    if (pendingToastIdRef.current) {
      toast.dismiss(pendingToastIdRef.current);
      pendingToastIdRef.current = null;
    }
  }, [filePath, initialContent, meta]);

  const saveMetaDebounced = useCallback(
    (updates: { title?: string; icon?: string }) => {
      if (titleSaveRef.current) clearTimeout(titleSaveRef.current);
      titleSaveRef.current = setTimeout(async () => {
        try {
          const res = await fetch(
            `/api/files/pages/${encodeURIComponent(filePath)}`,
          );
          if (!res.ok) return;
          const page = await res.json();

          await fetch(`/api/files/pages/${encodeURIComponent(filePath)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              content: page.content,
              meta: { ...updates },
            }),
          });
          const nextModified = new Date().toISOString();
          lastLocalSaveAtRef.current = Date.now();
          setModified(nextModified);
          setPageMeta((prev) => ({
            ...prev,
            ...updates,
            modified: nextModified,
          }));
        } catch (err) {
          console.error("Failed to save meta:", err);
        }
      }, 800);
    },
    [filePath],
  );

  const handleTitleInput = useCallback(() => {
    const newTitle = titleRef.current?.textContent?.trim() || "Untitled";
    if (newTitle !== titleValueRef.current) {
      titleValueRef.current = newTitle;
      saveMetaDebounced({ title: newTitle, icon });
    }
  }, [icon, saveMetaDebounced]);

  const handleTitleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLHeadingElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const editorEl = document.querySelector(
          ".clawpad-editor .ProseMirror",
        ) as HTMLElement | null;
        editorEl?.focus();
      }
    },
    [],
  );

  const handleIconSelect = useCallback(
    (emoji: string) => {
      setIcon(emoji);
      const currentTitle =
        titleRef.current?.textContent?.trim() ||
        titleValueRef.current ||
        "Untitled";
      titleValueRef.current = currentTitle;
      saveMetaDebounced({ title: currentTitle, icon: emoji });
    },
    [saveMetaDebounced],
  );

  const handleSave = useCallback((nextContent: string) => {
    const nextModified = new Date().toISOString();
    lastSavedContentRef.current = nextContent;
    lastLocalSaveAtRef.current = Date.now();
    setModified(nextModified);
    setPageMeta((prev) => ({
      ...prev,
      modified: nextModified,
    }));
  }, []);

  const handleDelete = useCallback(async () => {
    try {
      await deletePage(filePath);
      router.push("/workspace");
    } catch (err) {
      console.error("Failed to delete page:", err);
    }
  }, [deletePage, filePath, router]);

  const applyExternalUpdate = useCallback(
    (nextContent: string, nextMeta: PageMeta) => {
      pendingExternalRef.current = null;
      if (pendingToastIdRef.current) {
        toast.dismiss(pendingToastIdRef.current);
        pendingToastIdRef.current = null;
      }
      setPageMeta(nextMeta);
      setIcon(nextMeta.icon);
      setModified(nextMeta.modified);
      setContent(nextContent);
      setContentVersion((v) => v + 1);
      setSaveStatus("idle");
      lastSavedContentRef.current = nextContent;
    },
    [],
  );

  const fetchLatest = useCallback(
    async (force = false) => {
      try {
        const res = await fetch(
          `/api/files/pages/${encodeURIComponent(filePathRef.current)}`,
        );
        if (!res.ok) {
          if (res.status === 404) {
            toast.error("This page was deleted.");
            router.push("/workspace");
          }
          return;
        }
        const page = await res.json();
        const nextContent = page.content ?? "";
        const nextMeta = page.meta as PageMeta;

        const isDirty =
          saveStatusRef.current === "unsaved" ||
          saveStatusRef.current === "saving";

        if (isDirty && !force) {
          pendingExternalRef.current = {
            content: nextContent,
            meta: nextMeta,
          };
          if (!pendingToastIdRef.current) {
            pendingToastIdRef.current = toast(
              "This page changed on disk",
              {
                action: {
                  label: "Reload",
                  // eslint-disable-next-line react-hooks/immutability -- self-reference is intentional
                  onClick: () => fetchLatest(true),
                },
                duration: 6000,
              },
            );
          }
          return;
        }

        if (nextContent === lastSavedContentRef.current && !force) {
          setPageMeta(nextMeta);
          setIcon(nextMeta.icon);
          setModified(nextMeta.modified);
          return;
        }

        applyExternalUpdate(nextContent, nextMeta);
      } catch (err) {
        console.error("Failed to refresh page:", err);
      }
    },
    [applyExternalUpdate, router],
  );

  useEffect(() => {
    titleValueRef.current = pageMeta.title;
    if (titleRef.current) {
      titleRef.current.textContent = pageMeta.title;
    }
  }, [pageMeta.title, filePath]);

  useEffect(() => {
    const handleFileChange = (event: Event) => {
      const detail = (event as CustomEvent<FileChangeDetail>).detail;
      if (!detail?.path) return;
      if (detail.path !== filePathRef.current) return;

      if (detail.type === "file-removed") {
        toast.error("This page was deleted.");
        router.push("/workspace");
        return;
      }

      if (detail.timestamp && Math.abs(detail.timestamp - lastLocalSaveAtRef.current) < 1000) {
        return;
      }

      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
      refreshTimerRef.current = setTimeout(() => {
        fetchLatest();
      }, 250);
    };

    window.addEventListener(
      "clawpad:file-change",
      handleFileChange as EventListener,
    );

    return () => {
      window.removeEventListener(
        "clawpad:file-change",
        handleFileChange as EventListener,
      );
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [fetchLatest, router]);

  useEffect(() => {
    return () => {
      if (titleSaveRef.current) clearTimeout(titleSaveRef.current);
    };
  }, []);

  if (review.open && review.changeSetId && review.filePath === filePath) {
    return (
      <DocumentDiffView
        changeSetId={review.changeSetId}
        filePath={filePath}
        onExit={closeReview}
      />
    );
  }

  return (
    <div className="flex min-h-full flex-col max-md:pb-14">
      {/* Editor content area — centered like Notion */}
      <div
        className="mx-auto w-full flex-1 px-3 md:px-8"
        style={{ maxWidth: "var(--clawpad-editor-width, 720px)" }}
      >
        {/* Title area */}
        <div className="pt-12 pb-1 md:pt-20">
          <div className="flex items-start justify-between gap-3">
            {/* Icon picker */}
            <IconPicker icon={icon} onSelect={handleIconSelect} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                >
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">Page actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={handleDelete}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Editable title */}
          <h1
            ref={titleRef}
            className="mt-2 text-2xl font-semibold leading-tight tracking-tight outline-none md:text-[2rem] empty:before:content-['Untitled'] empty:before:text-text-muted"
            contentEditable
            suppressContentEditableWarning
            onInput={handleTitleInput}
            onKeyDown={handleTitleKeyDown}
            spellCheck={false}
            dir="auto"
          >
          </h1>

          {/* Breadcrumb */}
          <div className="mt-2 mb-4 md:mb-6">
            <Breadcrumb filePath={filePath} />
          </div>
        </div>

        {/* BlockNote Editor */}
        <Suspense fallback={<EditorSkeleton />}>
          <Editor
            key={`${filePath}-${contentVersion}`}
            initialContent={content}
            filePath={filePath}
            onSave={handleSave}
            onStatusChange={setSaveStatus}
            onWordCountChange={setWordCount}
            readOnly={false}
          />
        </Suspense>
      </div>

      {/* Status bar */}
      <StatusBar
        status={saveStatus}
        wordCount={wordCount}
        modified={modified}
      />
    </div>
  );
}
