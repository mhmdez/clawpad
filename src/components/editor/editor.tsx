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
import {
  Sparkles,
  ClipboardList,
  PenLine,
  FileText,
  Languages,
  CalendarDays,
  MessageSquareQuote,
  Minus,
} from "lucide-react";
import "@blocknote/mantine/style.css";
import { AIToolbar } from "./ai-toolbar";
import { schema } from "./blocks/callout-block";

export type SaveStatus = "saved" | "saving" | "unsaved" | "error" | "idle";

export interface EditorProps {
  initialContent: string;
  filePath: string;
  onSave?: (content: string) => void;
  onStatusChange?: (status: SaveStatus) => void;
  onWordCountChange?: (count: number) => void;
  readOnly?: boolean;
}

function countWords(markdown: string): number {
  const text = markdown
    .replace(/^---[\s\S]*?---/m, "")
    .replace(/[#*_`~\[\]()>|\\-]/g, " ")
    .trim();
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

async function callAIWrite(
  text: string,
  action: string,
  language?: string,
): Promise<string> {
  const res = await fetch("/api/ai/write", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, action, ...(language ? { language } : {}) }),
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

  const [aiToolbarVisible, setAiToolbarVisible] = useState(false);
  const [aiToolbarPos, setAiToolbarPos] = useState({ top: 0, left: 0 });
  const selectionTextRef = useRef("");

  useEffect(() => {
    filePathRef.current = filePath;
  }, [filePath]);

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
    schema,
    domAttributes: {
      editor: {
        class: "clawpad-editor",
        style:
          "font-family: var(--font-geist-sans); font-size: 16px; line-height: 1.6;",
      },
    },
  });

  const getSlashMenuItems = useMemo(
    () =>
      async (query: string) => {
        const defaultItems = getDefaultReactSlashMenuItems(editor);

        /* eslint-disable @typescript-eslint/no-explicit-any */
        const customItems: any[] = [
          // ── AI Group ──────────────────────────────────
          {
            title: "Ask AI",
            onItemClick: async () => {
              const prompt = window.prompt("What would you like AI to write?");
              if (!prompt?.trim()) return;
              const block = editor.getTextCursorPosition().block;
              try {
                const result = await callAIWrite(prompt, "continue");
                const blocks =
                  await editor.tryParseMarkdownToBlocks(result);
                editor.insertBlocks(blocks, block, "after");
              } catch (e) {
                console.error("Ask AI failed:", e);
              }
            },
            aliases: ["ai", "ask", "prompt", "generate"],
            group: "AI",
            icon: <Sparkles size={18} />,
            key: "ask_ai",
          },
          {
            title: "Extract Tasks",
            onItemClick: async () => {
              const allBlocks = editor.document;
              const md = await editor.blocksToMarkdownLossy(allBlocks);
              if (!md.trim()) return;
              const block = editor.getTextCursorPosition().block;
              try {
                const result = await callAIWrite(md, "summarize");
                const lines = result
                  .split("\n")
                  .map((l: string) => l.replace(/^[-*•]\s*/, "").trim())
                  .filter(Boolean);
                const checklistBlocks: any[] = lines.map((line: string) => ({
                  type: "checkListItem" as const,
                  props: { checked: false },
                  content: [
                    { type: "text" as const, text: line, styles: {} },
                  ],
                }));
                if (checklistBlocks.length > 0) {
                  editor.insertBlocks(checklistBlocks, block, "after");
                }
              } catch (e) {
                console.error("Extract tasks failed:", e);
              }
            },
            aliases: ["tasks", "todo", "checklist", "extract"],
            group: "AI",
            icon: <ClipboardList size={18} />,
            key: "extract_tasks",
          },
          {
            title: "Improve Writing",
            onItemClick: async () => {
              const block = editor.getTextCursorPosition().block;
              const md = await editor.blocksToMarkdownLossy([block]);
              if (!md.trim()) return;
              try {
                const result = await callAIWrite(md, "improve");
                const blocks =
                  await editor.tryParseMarkdownToBlocks(result);
                editor.replaceBlocks([block], blocks);
              } catch (e) {
                console.error("Improve writing failed:", e);
              }
            },
            aliases: ["improve", "rewrite", "better"],
            group: "AI",
            icon: <PenLine size={18} />,
            key: "improve_writing",
          },
          {
            title: "Summarize",
            onItemClick: async () => {
              const allBlocks = editor.document;
              const md = await editor.blocksToMarkdownLossy(allBlocks);
              if (!md.trim()) return;
              const block = editor.getTextCursorPosition().block;
              try {
                const result = await callAIWrite(md, "summarize");
                const blocks =
                  await editor.tryParseMarkdownToBlocks(result);
                editor.insertBlocks(blocks, block, "after");
              } catch (e) {
                console.error("Summarize failed:", e);
              }
            },
            aliases: ["summarize", "summary", "tldr"],
            group: "AI",
            icon: <FileText size={18} />,
            key: "summarize",
          },
          {
            title: "Translate",
            onItemClick: async () => {
              const language = window.prompt(
                "Translate to which language?",
                "Arabic",
              );
              if (!language?.trim()) return;
              const block = editor.getTextCursorPosition().block;
              const md = await editor.blocksToMarkdownLossy([block]);
              if (!md.trim()) return;
              try {
                const result = await callAIWrite(md, "translate", language);
                const blocks =
                  await editor.tryParseMarkdownToBlocks(result);
                editor.insertBlocks(blocks, block, "after");
              } catch (e) {
                console.error("Translate failed:", e);
              }
            },
            aliases: ["translate", "language", "arabic", "english"],
            group: "AI",
            icon: <Languages size={18} />,
            key: "translate",
          },

          // ── Insert Group ──────────────────────────────
          {
            title: "Daily Note",
            onItemClick: () => {
              const today = new Date();
              const dateStr = today.toISOString().split("T")[0];
              const block = editor.getTextCursorPosition().block;
              editor.insertBlocks(
                [
                  {
                    type: "heading" as const,
                    props: { level: 2 as const },
                    content: [
                      { type: "text" as const, text: dateStr, styles: {} },
                    ],
                  },
                ],
                block,
                "after",
              );
            },
            aliases: ["daily", "date", "today", "note"],
            group: "Insert",
            icon: <CalendarDays size={18} />,
            key: "daily_note",
          },
          {
            title: "Callout",
            onItemClick: () => {
              const block = editor.getTextCursorPosition().block;
              editor.insertBlocks(
                [
                  {
                    type: "callout" as const,
                    props: { variant: "info" as const },
                    content: [
                      {
                        type: "text" as const,
                        text: "Type your callout text here…",
                        styles: {},
                      },
                    ],
                  } as any,
                ],
                block,
                "after",
              );
            },
            aliases: [
              "callout",
              "info",
              "warning",
              "tip",
              "note",
              "admonition",
            ],
            group: "Insert",
            icon: <MessageSquareQuote size={18} />,
            key: "callout",
          },
          {
            title: "Divider",
            onItemClick: () => {
              const block = editor.getTextCursorPosition().block;
              editor.insertBlocks(
                [{ type: "divider" as const }],
                block,
                "after",
              );
            },
            aliases: ["divider", "hr", "line", "separator", "rule"],
            group: "Insert",
            icon: <Minus size={18} />,
            key: "divider",
          },
        ];
        /* eslint-enable @typescript-eslint/no-explicit-any */

        return filterSuggestionItems(
          [...customItems, ...defaultItems],
          query,
        );
      },
    [editor],
  );

  // Load initial markdown
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    (async () => {
      if (!initialContent.trim()) return;
      try {
        const blocks = await editor.tryParseMarkdownToBlocks(initialContent);
        editor.replaceBlocks(editor.document, blocks);
      } catch (err) {
        console.error("Failed to parse markdown:", err);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = useCallback(() => {
    if (readOnly) return;
    const markdown = editor.blocksToMarkdownLossy(editor.document);
    contentRef.current = markdown;
    onWordCountChange?.(countWords(markdown));
    updateStatus("unsaved");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => saveContent(markdown), 1000);
  }, [editor, readOnly, updateStatus, saveContent, onWordCountChange]);

  // Flush save on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        if (status === "unsaved") saveContent(contentRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cmd+S
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

  // AI toolbar selection tracking
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

  const restoreOriginal = useCallback(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pm = (editor as any)._tiptapEditor;
      if (pm && typeof pm.commands?.undo === "function") {
        pm.commands.undo();
      }
    } catch (e) {
      console.error("Failed to restore original:", e);
    }
  }, [editor]);

  const insertAtCursor = useCallback(
    async (text: string) => {
      const cursorBlock = editor.getTextCursorPosition().block;
      const newBlocks = await editor.tryParseMarkdownToBlocks(text);
      editor.insertBlocks(newBlocks, cursorBlock, "after");
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
        restoreOriginal={restoreOriginal}
        visible={aiToolbarVisible}
        position={aiToolbarPos}
        onDismiss={dismissToolbar}
        insertAtCursor={insertAtCursor}
      />
    </div>
  );
}
