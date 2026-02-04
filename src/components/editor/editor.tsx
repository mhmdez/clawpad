"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { filterSuggestionItems } from "@blocknote/core/extensions";
import {
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
} from "@blocknote/react";
import { Sparkles, ClipboardList, PenLine } from "lucide-react";
import "@blocknote/mantine/style.css";
import { AIToolbar } from "./ai-toolbar";

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

/** Calls the AI write API and returns full streamed text */
async function callAIWrite(
  text: string,
  action: string,
): Promise<string> {
  const res = await fetch("/api/ai/write", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, action }),
  });
  if (!res.ok) throw new Error(`AI write failed: ${res.status}`);
  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");
  const decoder = new TextDecoder();
  let result = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }
  return result.trim();
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

  // AI Toolbar state
  const [aiToolbarVisible, setAiToolbarVisible] = useState(false);
  const [aiToolbarPos, setAiToolbarPos] = useState({ top: 0, left: 0 });
  const selectionTextRef = useRef("");

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

  // Custom slash menu items including AI commands
  const getSlashMenuItems = useMemo(
    () =>
      async (query: string) => {
        const defaultItems = getDefaultReactSlashMenuItems(editor);
        // AI items use custom keys not in the dictionary, cast to any
        const aiItems: Array<{
          title: string;
          onItemClick: () => void;
          aliases?: string[];
          group?: string;
          icon: React.ReactNode;
          key: string;
        }> = [
          {
            title: "AI Improve",
            onItemClick: async () => {
              const block = editor.getTextCursorPosition().block;
              const md = await editor.blocksToMarkdownLossy([block]);
              if (!md.trim()) return;
              try {
                const result = await callAIWrite(md, "improve");
                const blocks = await editor.tryParseMarkdownToBlocks(result);
                editor.replaceBlocks([block], blocks);
              } catch (e) {
                console.error("AI improve failed:", e);
              }
            },
            aliases: ["ai", "improve", "rewrite"],
            group: "AI",
            icon: <Sparkles size={18} />,
            key: "ai_improve",
          },
          {
            title: "AI Summarize",
            onItemClick: async () => {
              const block = editor.getTextCursorPosition().block;
              const md = await editor.blocksToMarkdownLossy([block]);
              if (!md.trim()) return;
              try {
                const result = await callAIWrite(md, "summarize");
                const blocks = await editor.tryParseMarkdownToBlocks(result);
                editor.replaceBlocks([block], blocks);
              } catch (e) {
                console.error("AI summarize failed:", e);
              }
            },
            aliases: ["ai", "summarize", "summary"],
            group: "AI",
            icon: <ClipboardList size={18} />,
            key: "ai_summarize",
          },
          {
            title: "AI Continue",
            onItemClick: async () => {
              const block = editor.getTextCursorPosition().block;
              const md = await editor.blocksToMarkdownLossy([block]);
              try {
                const result = await callAIWrite(
                  md || "Continue writing about this topic.",
                  "continue",
                );
                const newBlocks =
                  await editor.tryParseMarkdownToBlocks(result);
                editor.insertBlocks(newBlocks, block, "after");
              } catch (e) {
                console.error("AI continue failed:", e);
              }
            },
            aliases: ["ai", "continue", "write"],
            group: "AI",
            icon: <PenLine size={18} />,
            key: "ai_continue",
          },
        ];
        return filterSuggestionItems(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          [...(aiItems as any[]), ...defaultItems],
          query,
        );
      },
    [editor],
  );

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

  // Track text selection for AI toolbar
  useEffect(() => {
    if (readOnly) return;

    const handleSelectionChange = () => {
      const sel = window.getSelection();
      const text = sel?.toString().trim() ?? "";
      selectionTextRef.current = text;

      if (text.length > 3) {
        const range = sel?.getRangeAt(0);
        if (range) {
          const rect = range.getBoundingClientRect();
          setAiToolbarPos({
            top: rect.top - 44,
            left: rect.left + rect.width / 2 - 150,
          });
          setAiToolbarVisible(true);
        }
      } else {
        setAiToolbarVisible(false);
      }
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () =>
      document.removeEventListener("selectionchange", handleSelectionChange);
  }, [readOnly]);

  const getSelectedText = useCallback(() => selectionTextRef.current, []);

  const replaceSelection = useCallback(
    async (text: string) => {
      // Get the selected blocks from the editor and replace them
      const selection = editor.getSelection();
      if (selection) {
        const blocks = await editor.tryParseMarkdownToBlocks(text);
        editor.replaceBlocks(
          selection.blocks.map((b) => b.id),
          blocks,
        );
      }
    },
    [editor],
  );

  const dismissToolbar = useCallback(() => setAiToolbarVisible(false), []);

  return (
    <div className="clawpad-editor-wrapper">
      <BlockNoteView
        editor={editor}
        editable={!readOnly}
        onChange={handleChange}
        theme={resolvedTheme === "dark" ? "dark" : "light"}
        data-theming-css-variables-demo
        slashMenu={false}
      >
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={getSlashMenuItems}
        />
      </BlockNoteView>

      <AIToolbar
        getSelectedText={getSelectedText}
        replaceSelection={replaceSelection}
        visible={aiToolbarVisible}
        position={aiToolbarPos}
        onDismiss={dismissToolbar}
      />
    </div>
  );
}
