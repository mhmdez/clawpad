"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  memo,
  Suspense,
} from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Trash2 } from "lucide-react";
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
  const modifiedDate = new Date(modified);
  const timeStr = modifiedDate.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  const dateStr = modifiedDate.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

  return (
    <div className="sticky bottom-0 z-10 flex items-center justify-between border-t border-border bg-background/80 backdrop-blur-sm px-4 py-1.5 text-xs text-text-muted md:px-6 max-md:bottom-14">
      <div className="flex items-center gap-4">
        <SaveIndicator status={status} />
        <span className="hidden sm:inline">{wordCount} words</span>
      </div>
      <span className="hidden sm:inline">
        Last edited {dateStr} at {timeStr}
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
  const [icon, setIcon] = useState(meta.icon);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [wordCount, setWordCount] = useState(0);
  const [modified, setModified] = useState(meta.modified);
  const [, startTransition] = useTransition();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const titleSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleValueRef = useRef(meta.title);

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
          setModified(new Date().toISOString());
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

  const handleSave = useCallback(() => {
    setModified(new Date().toISOString());
  }, []);

  const handleDelete = useCallback(async () => {
    try {
      await deletePage(filePath);
      router.push("/workspace");
    } catch (err) {
      console.error("Failed to delete page:", err);
    }
  }, [deletePage, filePath, router]);

  useEffect(() => {
    titleValueRef.current = meta.title;
    if (titleRef.current) {
      titleRef.current.textContent = meta.title;
    }
  }, [meta.title, filePath]);

  useEffect(() => {
    return () => {
      if (titleSaveRef.current) clearTimeout(titleSaveRef.current);
    };
  }, []);

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
            initialContent={initialContent}
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
