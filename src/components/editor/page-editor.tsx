"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import dynamic from "next/dynamic";
import { EditorSkeleton } from "@/components/editor/editor-skeleton";
import type { SaveStatus } from "@/components/editor/editor";
import type { PageMeta } from "@/lib/files/types";

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

function SaveIndicator({ status }: { status: SaveStatus }) {
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
}

// ─── Breadcrumb ─────────────────────────────────────────────────────────────

function Breadcrumb({ filePath }: { filePath: string }) {
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
          <span className={i === parts.length - 1 ? "text-text-secondary" : ""}>
            {part}
          </span>
        </span>
      ))}
    </nav>
  );
}

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

  // Close on click outside
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
        className="text-4xl leading-none hover:bg-surface-hover rounded-lg p-1 transition-colors cursor-pointer"
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
              className="flex items-center justify-center w-8 h-8 rounded hover:bg-surface-hover transition-colors text-lg cursor-pointer"
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

function StatusBar({
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
    <div className="fixed bottom-0 left-0 right-0 z-10 flex items-center justify-between border-t border-border bg-background/80 backdrop-blur-sm px-6 py-1.5 text-xs text-text-muted">
      <div className="flex items-center gap-4">
        <SaveIndicator status={status} />
        <span>{wordCount} words</span>
      </div>
      <span>
        Last edited {dateStr} at {timeStr}
      </span>
    </div>
  );
}

// ─── Page Editor ────────────────────────────────────────────────────────────

export function PageEditor({ initialContent, meta, filePath }: PageEditorProps) {
  const [title, setTitle] = useState(meta.title);
  const [icon, setIcon] = useState(meta.icon);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [wordCount, setWordCount] = useState(0);
  const [modified, setModified] = useState(meta.modified);
  const [, startTransition] = useTransition();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const titleSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Save title/icon changes to API
  const saveMetaUpdate = useCallback(
    (updates: { title?: string; icon?: string }) => {
      startTransition(async () => {
        try {
          await fetch(`/api/files/pages/${encodeURIComponent(filePath)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              content: "__KEEP__", // signal to not overwrite content
              meta: updates,
            }),
          });
        } catch (err) {
          console.error("Failed to save meta:", err);
        }
      });
    },
    [filePath],
  );

  // Actually, the PUT endpoint requires content. Let's use a dedicated approach:
  // We'll read the current content from the API first, then save with updated meta.
  // But that's heavy. Instead, let's just use the existing content from the editor.
  // For title changes, we'll do a GET then PUT. Simpler: add a PATCH-like behavior.
  //
  // For now: save meta by re-reading and re-writing. We can optimize later.
  const saveMetaDebounced = useCallback(
    (updates: { title?: string; icon?: string }) => {
      if (titleSaveRef.current) clearTimeout(titleSaveRef.current);
      titleSaveRef.current = setTimeout(async () => {
        try {
          // Read current content
          const res = await fetch(
            `/api/files/pages/${encodeURIComponent(filePath)}`,
          );
          if (!res.ok) return;
          const page = await res.json();

          // Write back with updated meta
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
    if (newTitle !== title) {
      setTitle(newTitle);
      saveMetaDebounced({ title: newTitle, icon });
    }
  }, [title, icon, saveMetaDebounced]);

  const handleTitleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLHeadingElement>) => {
      // Enter in title → focus editor
      if (e.key === "Enter") {
        e.preventDefault();
        // Focus the editor by clicking into it
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
      saveMetaDebounced({ title, icon: emoji });
    },
    [title, saveMetaDebounced],
  );

  const handleSave = useCallback(() => {
    setModified(new Date().toISOString());
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      if (titleSaveRef.current) clearTimeout(titleSaveRef.current);
    };
  }, []);

  return (
    <div className="min-h-screen pb-12">
      {/* Top-right save indicator (for when status bar is hidden above fold) */}
      <div className="fixed top-4 right-6 z-20">
        <SaveIndicator status={saveStatus} />
      </div>

      {/* Editor content area — centered like Notion */}
      <div className="mx-auto w-full max-w-[720px] px-6">
        {/* Title area */}
        <div className="pt-20 pb-1">
          {/* Icon picker */}
          <IconPicker icon={icon} onSelect={handleIconSelect} />

          {/* Editable title */}
          <h1
            ref={titleRef}
            className="mt-2 text-[2rem] font-semibold leading-tight tracking-tight outline-none empty:before:content-['Untitled'] empty:before:text-text-muted"
            contentEditable
            suppressContentEditableWarning
            onInput={handleTitleInput}
            onKeyDown={handleTitleKeyDown}
            spellCheck={false}
          >
            {title}
          </h1>

          {/* Breadcrumb */}
          <div className="mt-2 mb-6">
            <Breadcrumb filePath={filePath} />
          </div>
        </div>

        {/* BlockNote Editor */}
        <Editor
          initialContent={initialContent}
          filePath={filePath}
          onSave={handleSave}
          onStatusChange={setSaveStatus}
          onWordCountChange={setWordCount}
          readOnly={false}
        />
      </div>

      {/* Status bar */}
      <StatusBar status={saveStatus} wordCount={wordCount} modified={modified} />
    </div>
  );
}
