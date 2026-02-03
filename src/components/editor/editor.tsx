"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";

export type SaveStatus = "saved" | "saving" | "unsaved" | "error" | "idle";

export interface EditorProps {
  /** Markdown string to load initially */
  initialContent: string;
  /** Relative file path for saving */
  filePath: string;
  /** Callback after save completes */
  onSave?: (content: string) => void;
  /** Called whenever save status changes */
  onStatusChange?: (status: SaveStatus) => void;
  /** Called with word count on content change */
  onWordCountChange?: (count: number) => void;
  /** Read-only mode */
  readOnly?: boolean;
}

function countWords(markdown: string): number {
  const text = markdown
    .replace(/^---[\s\S]*?---/m, "") // strip frontmatter
    .replace(/[#*_`~\[\]()>|\\-]/g, " ") // strip md syntax
    .trim();
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

export default function Editor({
  initialContent,
  filePath,
  onSave,
  onStatusChange,
  onWordCountChange,
  readOnly = false,
}: EditorProps) {
  const { resolvedTheme } = useTheme();
  const [status, setStatus] = useState<SaveStatus>("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRef = useRef(initialContent);
  const filePathRef = useRef(filePath);
  const initializedRef = useRef(false);

  // Keep filePath ref in sync
  useEffect(() => {
    filePathRef.current = filePath;
  }, [filePath]);

  // Update status and notify parent
  const updateStatus = useCallback(
    (s: SaveStatus) => {
      setStatus(s);
      onStatusChange?.(s);
    },
    [onStatusChange],
  );

  const saveContent = useCallback(
    async (markdown: string) => {
      updateStatus("saving");
      try {
        const res = await fetch(
          `/api/files/pages/${encodeURIComponent(filePathRef.current)}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: markdown }),
          },
        );
        if (!res.ok) throw new Error(`Save failed: ${res.status}`);
        updateStatus("saved");
        onSave?.(markdown);
      } catch (err) {
        console.error("Failed to save:", err);
        updateStatus("error");
      }
    },
    [updateStatus, onSave],
  );

  const editor = useCreateBlockNote({
    domAttributes: {
      editor: {
        class: "clawpad-editor",
        style: "font-family: var(--font-geist-sans); font-size: 16px; line-height: 1.6;",
      },
    },
  });

  // Load initial markdown content into blocks
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    async function loadContent() {
      if (!initialContent.trim()) return;
      try {
        const blocks = await editor.tryParseMarkdownToBlocks(initialContent);
        editor.replaceBlocks(editor.document, blocks);
      } catch (err) {
        console.error("Failed to parse markdown:", err);
      }
    }
    loadContent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = useCallback(() => {
    if (readOnly) return;

    const markdown = editor.blocksToMarkdownLossy(editor.document);
    contentRef.current = markdown;

    // Update word count
    onWordCountChange?.(countWords(markdown));

    // Mark as unsaved
    updateStatus("unsaved");

    // Debounced save
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      saveContent(markdown);
    }, 1000);
  }, [editor, readOnly, updateStatus, saveContent, onWordCountChange]);

  // Cleanup debounce timer on unmount; flush pending save
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        // Flush pending save on unmount
        if (status === "unsaved") {
          saveContent(contentRef.current);
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cmd+S to force save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (debounceRef.current) clearTimeout(debounceRef.current);
        saveContent(contentRef.current);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [saveContent]);

  return (
    <div className="clawpad-editor-wrapper">
      <BlockNoteView
        editor={editor}
        editable={!readOnly}
        onChange={handleChange}
        theme={resolvedTheme === "dark" ? "dark" : "light"}
        data-theming-css-variables-demo
      />
    </div>
  );
}
