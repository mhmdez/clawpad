"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "next-themes";
import {
  FormattingToolbar,
  FormattingToolbarController,
  type FormattingToolbarProps,
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
  getFormattingToolbarItems,
  useBlockNoteEditor,
  useComponentsContext,
  useCreateBlockNote,
  useEditorState,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { filterSuggestionItems } from "@blocknote/core/extensions";
import {
  Sparkles,
  ClipboardList,
  PenLine,
  FileText,
  BookOpen,
  Wrench,
  Languages,
  CalendarDays,
  MessageSquareQuote,
  Minus,
} from "lucide-react";
import "@blocknote/mantine/style.css";
import { toast } from "sonner";
import { schema } from "./blocks/callout-block";
import { useWorkspaceStore } from "@/lib/stores/workspace";
import { Button } from "@/components/ui/button";
import {
  addAiAction,
  getAiAction,
  removeAiAction,
  type AiActionType,
} from "@/lib/stores/ai-actions";
type AiPreviewStatus = "loading" | "streaming" | "done";
type SelectionAnchor = { left: number; bottom: number; width?: number };

const AI_ACTIONS: { action: AiActionType; label: string; icon: typeof Sparkles }[] =
  [
    { action: "improve", label: "Improve", icon: Sparkles },
    { action: "simplify", label: "Simplify", icon: FileText },
    { action: "expand", label: "Expand", icon: BookOpen },
    { action: "summarize", label: "Summarize", icon: ClipboardList },
    { action: "fix-grammar", label: "Fix grammar", icon: Wrench },
  ];

type AiFormattingToolbarProps = FormattingToolbarProps & {
  onAction: (action: AiActionType) => void;
};

function AiFormattingToolbar({ onAction, ...props }: AiFormattingToolbarProps) {
  const Components = useComponentsContext()!;
  const editor = useBlockNoteEditor();
  const hasSelection =
    useEditorState({
      editor,
      selector: ({ editor }) => {
        const { from, to } = editor.prosemirrorState.selection;
        return from !== to;
      },
    }) ?? false;

  return (
    <FormattingToolbar {...props}>
      {getFormattingToolbarItems(props.blockTypeSelectItems)}
      <div className="mx-1 h-4 w-px bg-border" />
      <Components.Generic.Menu.Root position="bottom-start">
        <Components.Generic.Menu.Trigger>
          <Components.FormattingToolbar.Button
            className="bn-button"
            label="Ask AI"
            mainTooltip="Ask AI"
            isDisabled={!hasSelection}
          >
            <span className="flex items-center gap-1 text-xs">
              <Sparkles className="h-3 w-3" />
              Ask AI
            </span>
          </Components.FormattingToolbar.Button>
        </Components.Generic.Menu.Trigger>
        <Components.Generic.Menu.Dropdown>
          {AI_ACTIONS.map(({ action, label, icon: Icon }) => (
            <Components.Generic.Menu.Item
              key={action}
              icon={<Icon size={14} />}
              onClick={() => onAction(action)}
            >
              {label}
            </Components.Generic.Menu.Item>
          ))}
        </Components.Generic.Menu.Dropdown>
      </Components.Generic.Menu.Root>
    </FormattingToolbar>
  );
}

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
  const chatPanelOpen = useWorkspaceStore((s) => s.chatPanelOpen);
  const setChatPanelOpen = useWorkspaceStore((s) => s.setChatPanelOpen);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRef = useRef(initialContent);
  const filePathRef = useRef(filePath);
  const isHydratingRef = useRef(true);
  const hydratedEditorRef = useRef<ReturnType<typeof useCreateBlockNote> | null>(null);
  const lastSavedRef = useRef(initialContent);

  const [aiPreviewStatus, setAiPreviewStatus] = useState<AiPreviewStatus | null>(null);
  const [aiPreviewAnchor, setAiPreviewAnchor] = useState<SelectionAnchor | null>(null);
  const [aiPreviewPos, setAiPreviewPos] = useState<{ top: number; left: number } | null>(null);
  const [aiPreviewWidth, setAiPreviewWidth] = useState(140);
  const aiPreviewBubbleRef = useRef<HTMLDivElement | null>(null);
  const [aiPreview, setAiPreview] = useState<{
    messageId: string;
    from: number;
    to: number;
    previewFrom: number;
    previewTo: number;
  } | null>(null);
  const aiPreviewRef = useRef<{
    messageId: string;
    from: number;
    to: number;
    previewFrom: number;
    previewTo: number;
  } | null>(null);
  const [aiMenuWidth, setAiMenuWidth] = useState(260);
  const aiMenuRef = useRef<HTMLDivElement | null>(null);
  const [aiResult, setAiResult] = useState<{
    messageId: string;
    text: string;
    action: AiActionType;
    selectionText: string;
    blockIds: string[];
    selectionFrom?: number;
    selectionTo?: number;
    anchor: SelectionAnchor;
  } | null>(null);

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

  // Fast Refresh can recreate the editor instance while preserving refs/state.
  // Keep hydration guard on until we explicitly sync content into the new instance.
  if (hydratedEditorRef.current !== editor) {
    hydratedEditorRef.current = editor;
    isHydratingRef.current = true;
  }

  useEffect(() => {
    filePathRef.current = filePath;
  }, [filePath]);

  useEffect(() => {
    aiPreviewRef.current = aiPreview;
  }, [aiPreview]);

  const MENU_OFFSET = 8;
  const PREVIEW_OFFSET = 8;

  const clampLeft = useCallback((left: number, width: number, padding = 12) => {
    if (typeof window === "undefined") return left;
    const maxLeft = window.innerWidth - width - padding;
    return Math.max(padding, Math.min(left, maxLeft));
  }, []);

  const getAnchorFromPositions = useCallback(
    (from: number, to: number): SelectionAnchor | null => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pm = (editor as any)?._tiptapEditor;
      if (!pm?.view || typeof from !== "number" || typeof to !== "number") {
        return null;
      }
      try {
        const start = pm.view.coordsAtPos(from, 1);
        const end = pm.view.coordsAtPos(to, -1);
        return {
          left: start.left,
          bottom: end.bottom,
          width: Math.max(0, end.right - start.left),
        };
      } catch {
        return null;
      }
    },
    [editor],
  );

  const getPreviewAnchorFromDOM = useCallback(
    (status: AiPreviewStatus): SelectionAnchor | null => {
      if (typeof document === "undefined") return null;
      const root = editor.domElement;
      if (!root) return null;
      const selector =
        status === "done"
          ? '[data-style-type="backgroundColor"][data-value="ai-preview-done"]'
          : '[data-style-type="backgroundColor"][data-value="ai-preview-stream"]';
      const nodes = root.querySelectorAll(selector);
      if (nodes.length === 0) return null;
      const firstRect = (nodes[0] as HTMLElement).getBoundingClientRect();
      let maxBottom = firstRect.bottom;
      nodes.forEach((node) => {
        const rect = (node as HTMLElement).getBoundingClientRect();
        if (rect.bottom > maxBottom) maxBottom = rect.bottom;
      });
      return { left: firstRect.left, bottom: maxBottom, width: firstRect.width };
    },
    [editor],
  );

  const anchorToPos = useCallback(
    (anchor: SelectionAnchor | null, width: number, offsetY: number) => {
      if (!anchor) return null;
      return {
        top: anchor.bottom + offsetY,
        left: clampLeft(anchor.left, width),
      };
    },
    [clampLeft],
  );

  const aiMenuPos = useMemo(
    () => (aiResult ? anchorToPos(aiResult.anchor, aiMenuWidth, MENU_OFFSET) : null),
    [aiResult, aiMenuWidth, anchorToPos, MENU_OFFSET],
  );

  useEffect(() => {
    if (!aiPreviewAnchor || !aiPreviewStatus) {
      setAiPreviewPos(null);
      return;
    }
    setAiPreviewPos(anchorToPos(aiPreviewAnchor, aiPreviewWidth, PREVIEW_OFFSET));
  }, [aiPreviewAnchor, aiPreviewStatus, aiPreviewWidth, anchorToPos, PREVIEW_OFFSET]);

  useLayoutEffect(() => {
    if (aiPreviewStatus && aiPreviewBubbleRef.current) {
      setAiPreviewWidth(aiPreviewBubbleRef.current.getBoundingClientRect().width);
    }
  }, [aiPreviewStatus]);

  useLayoutEffect(() => {
    if (aiResult && aiMenuRef.current) {
      setAiMenuWidth(aiMenuRef.current.getBoundingClientRect().width);
    }
  }, [aiResult?.messageId]);

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
        lastSavedRef.current = markdown;
        onSave?.(markdown);
      } catch (err) {
        console.error("Failed to save:", err);
        updateStatus("error");
      }
    },
    [updateStatus, onSave],
  );

  const getSlashMenuItems = useMemo(
    () =>
      async (query: string) => {
        const defaultItems = getDefaultReactSlashMenuItems(editor).filter(
          (item) => item.title !== "Divider",
        );

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

  // Sync editor document from incoming markdown.
  useEffect(() => {
    let cancelled = false;

    const syncInitialContent = async () => {
      const currentMarkdown = editor.blocksToMarkdownLossy(editor.document);
      const hasCurrentText = currentMarkdown.trim().length > 0;
      const hasUnsavedDraft =
        hasCurrentText && currentMarkdown !== lastSavedRef.current;
      const shouldHydrate =
        currentMarkdown !== initialContent && (!hasUnsavedDraft || !hasCurrentText);

      if (shouldHydrate) {
        isHydratingRef.current = true;
      }

      try {
        if (shouldHydrate) {
          const blocks = await editor.tryParseMarkdownToBlocks(
            initialContent.trim() ? initialContent : " ",
          );
          if (!cancelled) {
            editor.replaceBlocks(editor.document, blocks);
          }
        }
      } catch (err) {
        console.error("Failed to parse markdown:", err);
      } finally {
        // Avoid treating programmatic hydration as a user edit.
        requestAnimationFrame(() => {
          if (cancelled) return;
          const effectiveMarkdown = shouldHydrate
            ? initialContent
            : editor.blocksToMarkdownLossy(editor.document);
          contentRef.current = effectiveMarkdown;
          if (shouldHydrate) {
            lastSavedRef.current = initialContent;
          }
          onWordCountChange?.(countWords(effectiveMarkdown));
          isHydratingRef.current = false;
        });
      }
    };

    void syncInitialContent();

    return () => {
      cancelled = true;
    };
  }, [editor, initialContent, onWordCountChange]);

  const handleChange = useCallback(() => {
    if (readOnly) return;
    const markdown = editor.blocksToMarkdownLossy(editor.document);
    contentRef.current = markdown;
    onWordCountChange?.(countWords(markdown));
    if (isHydratingRef.current) return;
    if (markdown === lastSavedRef.current) {
      updateStatus("saved");
      return;
    }
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

  const getSelectionBlockIds = useCallback(() => {
    const selection = editor.getSelection();
    if (!selection?.blocks) return [];
    return selection.blocks.map((block) => block.id);
  }, [editor]);

  const getHighlightMark = useCallback((pm: any, value: string) => {
    const marks = pm?.state?.schema?.marks;
    if (!marks) return null;
    const markType =
      marks.backgroundColor ?? marks.highlight ?? marks.textStyle;
    if (!markType) return null;
    const attrs = markType.spec?.attrs ?? {};
    if ("stringValue" in attrs) {
      return markType.create({ stringValue: value });
    }
    if ("backgroundColor" in attrs) {
      return markType.create({ backgroundColor: value });
    }
    if ("color" in attrs) {
      return markType.create({ color: value });
    }
    return markType.create();
  }, []);

  const getTextColorMark = useCallback((pm: any, value: string) => {
    const marks = pm?.state?.schema?.marks;
    if (!marks) return null;
    const markType = marks.textColor ?? marks.textStyle;
    if (!markType) return null;
    const attrs = markType.spec?.attrs ?? {};
    if ("stringValue" in attrs) {
      return markType.create({ stringValue: value });
    }
    if ("color" in attrs) {
      return markType.create({ color: value });
    }
    return markType.create();
  }, []);

  const removePreviewMarks = useCallback(
    (pm: any, tr: any, from: number, to: number) => {
      const strikeHighlight = getHighlightMark(pm, "ai-preview-strike");
      const streamHighlight = getHighlightMark(pm, "ai-preview-stream");
      const doneHighlight = getHighlightMark(pm, "ai-preview-done");
      if (strikeHighlight) tr.removeMark(from, to, strikeHighlight);
      if (streamHighlight) tr.removeMark(from, to, streamHighlight);
      if (doneHighlight) tr.removeMark(from, to, doneHighlight);
      const strikeColor = getTextColorMark(pm, "ai-preview-strike");
      if (strikeColor) tr.removeMark(from, to, strikeColor);
    },
    [getHighlightMark, getTextColorMark],
  );

  const clearStoredPreviewMarks = useCallback((pm: any, tr?: any) => {
    const stored = pm?.state?.storedMarks;
    if (!pm || !stored || stored.length === 0) return;
    const next = stored.filter((mark: any) => {
      if (mark.type?.name === "strike") return false;
      if (mark.attrs?.backgroundColor === "var(--cp-ai-preview-strike)") return false;
      if (mark.attrs?.backgroundColor === "var(--cp-ai-preview-stream)") return false;
      if (mark.attrs?.backgroundColor === "var(--cp-ai-preview-done)") return false;
      if (mark.attrs?.color === "var(--cp-ai-preview-strike-text)") return false;
      if (mark.attrs?.stringValue === "ai-preview-strike") return false;
      if (mark.attrs?.stringValue === "ai-preview-stream") return false;
      if (mark.attrs?.stringValue === "ai-preview-done") return false;
      return true;
    });
    if (next.length === stored.length) return;
    if (tr) {
      tr.setStoredMarks(next);
      return;
    }
    const localTr = pm.state.tr;
    localTr.setStoredMarks(next);
    localTr.setMeta("addToHistory", false);
    pm.view.dispatch(localTr);
  }, []);

  const applyStrikePreview = useCallback(
    (from: number, to: number, enabled: boolean) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pm = (editor as any)?._tiptapEditor;
      if (!pm || from === to) return;
      const tr = pm.state.tr;
      const strikeMark = pm.state.schema.marks.strike;
      if (enabled) {
        if (strikeMark) tr.addMark(from, to, strikeMark.create());
        const highlight = getHighlightMark(pm, "ai-preview-strike");
        if (highlight) tr.addMark(from, to, highlight);
        const colorMark = getTextColorMark(pm, "ai-preview-strike");
        if (colorMark) tr.addMark(from, to, colorMark);
      } else {
        if (strikeMark) tr.removeMark(from, to, strikeMark);
        removePreviewMarks(pm, tr, from, to);
      }
      tr.setMeta("addToHistory", false);
      pm.view.dispatch(tr);
    },
    [editor, getHighlightMark, getTextColorMark, removePreviewMarks],
  );

  const setPreviewText = useCallback(
    (
      previewState: {
        messageId: string;
        from: number;
        to: number;
        previewFrom: number;
        previewTo: number;
      },
      text: string,
      status: AiPreviewStatus = "streaming",
    ) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pm = (editor as any)?._tiptapEditor;
      if (!pm) return previewState;
      const tr = pm.state.tr;
      tr.insertText(text, previewState.previewFrom, previewState.previewTo);
      if (text) {
        const color =
          status === "done" ? "ai-preview-done" : "ai-preview-stream";
        const mark = getHighlightMark(pm, color);
        if (mark) {
          tr.addMark(
            previewState.previewFrom,
            previewState.previewFrom + text.length,
            mark,
          );
        }
        const strikeMark = pm.state.schema.marks.strike;
        if (strikeMark) {
          tr.removeMark(
            previewState.previewFrom,
            previewState.previewFrom + text.length,
            strikeMark,
          );
        }
      }
      tr.setMeta("addToHistory", false);
      pm.view.dispatch(tr);
      return {
        ...previewState,
        previewTo: previewState.previewFrom + text.length,
      };
    },
    [editor, getHighlightMark],
  );

  const clearPreviewInline = useCallback(
    (options?: { removeStrike?: boolean }) => {
      if (!aiPreview) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pm = (editor as any)?._tiptapEditor;
      if (!pm) return;
      const tr = pm.state.tr;
      if (aiPreview.previewFrom !== aiPreview.previewTo) {
        tr.delete(aiPreview.previewFrom, aiPreview.previewTo);
      }
      if (options?.removeStrike) {
        removePreviewMarks(pm, tr, aiPreview.from, aiPreview.to);
        const strikeMark = pm.state.schema.marks.strike;
        if (strikeMark) {
          tr.removeMark(aiPreview.from, aiPreview.to, strikeMark);
        }
      }
      clearStoredPreviewMarks(pm, tr);
      tr.setMeta("addToHistory", false);
      pm.view.dispatch(tr);
      setAiPreview(null);
    },
    [aiPreview, editor, removePreviewMarks, clearStoredPreviewMarks],
  );

  const handleAiToolbarAction = useCallback(
    (action: AiActionType) => {
      if (readOnly) return;
      const messageId = crypto.randomUUID();
      const blockIds = getSelectionBlockIds();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pm = (editor as any)?._tiptapEditor;
      const selectionFrom =
        typeof pm?.state?.selection?.from === "number"
          ? pm.state.selection.from
          : undefined;
      const selectionTo =
        typeof pm?.state?.selection?.to === "number"
          ? pm.state.selection.to
          : undefined;
      if (
        typeof selectionFrom !== "number" ||
        typeof selectionTo !== "number" ||
        selectionFrom === selectionTo
      ) {
        toast.error("Select text to use AI");
        return;
      }
      const pmSelectionText =
        typeof pm?.state?.doc?.textBetween === "function"
          ? pm.state.doc.textBetween(selectionFrom, selectionTo, "\n")
          : "";
      const normalizedSelection = pmSelectionText.trim();
      if (!normalizedSelection) {
        toast.error("Select text to use AI");
        return;
      }
      const anchor = getAnchorFromPositions(selectionFrom, selectionTo);

      addAiAction({
        messageId,
        pagePath: filePathRef.current,
        action,
        selectionText: normalizedSelection,
        blockIds,
        selectionFrom,
        selectionTo,
        anchor: anchor ?? undefined,
        createdAt: Date.now(),
      });

      setAiResult(null);
      setAiPreviewStatus("loading");
      setAiPreviewAnchor(anchor ?? null);
      setAiPreview({
        messageId,
        from: selectionFrom,
        to: selectionTo,
        previewFrom: selectionTo,
        previewTo: selectionTo,
      });
      applyStrikePreview(selectionFrom, selectionTo, true);

      if (!chatPanelOpen) setChatPanelOpen(true);

      window.dispatchEvent(
        new CustomEvent("clawpad:ai-action", {
          detail: {
            messageId,
            action,
            selection: normalizedSelection,
            pagePath: filePathRef.current,
          },
        }),
      );
    },
    [
      readOnly,
      getSelectionBlockIds,
      chatPanelOpen,
      setChatPanelOpen,
      editor,
      applyStrikePreview,
      getAnchorFromPositions,
    ],
  );

  useEffect(() => {
    const handleAiStream = (event: Event) => {
      const custom = event as CustomEvent<{ messageId?: string; text?: string }>;
      const messageId = custom.detail?.messageId;
      const text = custom.detail?.text ?? "";
      if (!messageId) return;

      const pending = getAiAction(messageId);
      if (!pending) return;
      if (pending.pagePath && pending.pagePath !== filePathRef.current) return;

      const anchor =
        pending.anchor ??
        (typeof pending.selectionFrom === "number" &&
        typeof pending.selectionTo === "number"
          ? getAnchorFromPositions(pending.selectionFrom, pending.selectionTo)
          : null);
      setAiPreviewStatus("streaming");
      setAiPreviewAnchor(anchor ?? null);
      const current = aiPreviewRef.current;
      let nextPreview = current;
      if (!current || current.messageId !== messageId) {
        if (
          typeof pending.selectionFrom === "number" &&
          typeof pending.selectionTo === "number"
        ) {
          nextPreview = {
            messageId,
            from: pending.selectionFrom,
            to: pending.selectionTo,
            previewFrom: pending.selectionTo,
            previewTo: pending.selectionTo,
          };
          applyStrikePreview(pending.selectionFrom, pending.selectionTo, true);
        }
      }
      if (nextPreview) {
        const updated = setPreviewText(nextPreview, text, "streaming");
        setAiPreview(updated);
      }
    };

    window.addEventListener(
      "clawpad:ai-stream",
      handleAiStream as EventListener,
    );
    return () =>
      window.removeEventListener(
        "clawpad:ai-stream",
        handleAiStream as EventListener,
      );
  }, [applyStrikePreview, setPreviewText, getAnchorFromPositions, getPreviewAnchorFromDOM]);

  useEffect(() => {
    const handleAiResult = (event: Event) => {
      const custom = event as CustomEvent<{ messageId?: string; text?: string }>;
      const messageId = custom.detail?.messageId;
      const text = custom.detail?.text;
      if (!messageId || !text?.trim()) return;

      const pending = getAiAction(messageId);
      if (!pending) return;

      if (pending.pagePath && pending.pagePath !== filePathRef.current) {
        removeAiAction(messageId);
        return;
      }
      const fallbackAnchor =
        pending.anchor ??
        (typeof pending.selectionFrom === "number" &&
        typeof pending.selectionTo === "number"
          ? getAnchorFromPositions(pending.selectionFrom, pending.selectionTo)
          : null);
      setAiPreviewStatus("done");
      setAiPreviewAnchor(fallbackAnchor ?? null);
      const nextText = text.trim();
      const current = aiPreviewRef.current;
      let nextPreview = current;
      if (!current || current.messageId !== messageId) {
        if (
          typeof pending.selectionFrom === "number" &&
          typeof pending.selectionTo === "number"
        ) {
          nextPreview = {
            messageId,
            from: pending.selectionFrom,
            to: pending.selectionTo,
            previewFrom: pending.selectionTo,
            previewTo: pending.selectionTo,
          };
          applyStrikePreview(pending.selectionFrom, pending.selectionTo, true);
        }
      }
      let updatedPreview = nextPreview;
      if (nextPreview) {
        updatedPreview = setPreviewText(nextPreview, nextText, "done");
        setAiPreview(updatedPreview);
      }
      const resultAnchor =
        updatedPreview
          ? getAnchorFromPositions(
              updatedPreview.previewFrom,
              updatedPreview.previewTo,
            )
          : null;

      const fallback = resultAnchor ?? fallbackAnchor ?? { left: 0, bottom: 0 };
      setAiResult({
        messageId,
        text: text.trim(),
        action: pending.action,
        selectionText: pending.selectionText,
        blockIds: pending.blockIds,
        selectionFrom: pending.selectionFrom,
        selectionTo: pending.selectionTo,
        anchor: fallback,
      });
      requestAnimationFrame(() => {
        const domAnchor = getPreviewAnchorFromDOM("done");
        if (!domAnchor) return;
        setAiResult((prev) =>
          prev && prev.messageId === messageId ? { ...prev, anchor: domAnchor } : prev,
        );
      });
    };

    window.addEventListener(
      "clawpad:ai-result",
      handleAiResult as EventListener,
    );
    return () =>
      window.removeEventListener(
        "clawpad:ai-result",
        handleAiResult as EventListener,
      );
  }, [applyStrikePreview, setPreviewText, getAnchorFromPositions]);

  const findBlockById = useCallback(
    (id: string) => {
      const walk = (blocks: any[]): any | null => {
        for (const block of blocks) {
          if (block?.id === id) return block;
          if (Array.isArray(block?.children)) {
            const child = walk(block.children);
            if (child) return child;
          }
        }
        return null;
      };
      return walk(editor.document as any[]);
    },
    [editor],
  );

  const handleApplyReplace = useCallback(() => {
    if (!aiResult) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pm = (editor as any)?._tiptapEditor;
    const previewState = aiPreview;
    const from = previewState?.from ?? aiResult.selectionFrom;
    const to = previewState?.to ?? aiResult.selectionTo;
    if (!pm || typeof from !== "number" || typeof to !== "number") {
      toast.error("Could not apply AI result: selection unavailable");
      return;
    }
    const currentText = pm.state.doc.textBetween(from, to, "\n").trim();
    const expected = aiResult.selectionText.trim();
    if (expected && currentText !== expected) {
      toast.error("Could not apply AI result: selection changed");
      return;
    }
    const tr = pm.state.tr;
    if (previewState && previewState.previewFrom !== previewState.previewTo) {
      tr.delete(previewState.previewFrom, previewState.previewTo);
    }
    removePreviewMarks(pm, tr, from, to);
    const strikeMark = pm.state.schema.marks.strike;
    if (strikeMark) {
      tr.removeMark(from, to, strikeMark);
    }
    const mappedFrom = tr.mapping.map(from);
    const mappedTo = tr.mapping.map(to);
    clearStoredPreviewMarks(pm, tr);
    tr.insertText(aiResult.text, mappedFrom, mappedTo);
    pm.view.dispatch(tr);
    removeAiAction(aiResult.messageId);
    setAiPreview(null);
    setAiPreviewStatus(null);
    setAiPreviewAnchor(null);
    setAiResult(null);
  }, [aiResult, editor, aiPreview, removePreviewMarks, clearStoredPreviewMarks]);

  const handleInsertBelow = useCallback(async () => {
    if (!aiResult) return;
    const lastBlockId = aiResult.blockIds[aiResult.blockIds.length - 1];
    if (!lastBlockId) {
      toast.error("Could not insert: no target block");
      return;
    }
    const target = findBlockById(lastBlockId);
    if (!target) {
      toast.error("Could not insert: target block missing");
      return;
    }
    try {
      const blocks = await editor.tryParseMarkdownToBlocks(aiResult.text.trim());
      clearPreviewInline({ removeStrike: true });
      editor.insertBlocks(blocks, target, "after");
      removeAiAction(aiResult.messageId);
      setAiPreviewStatus(null);
      setAiPreviewAnchor(null);
      setAiResult(null);
    } catch (err) {
      console.error("Failed to insert AI result:", err);
      toast.error("Could not insert AI result");
    }
  }, [aiResult, editor, findBlockById, clearPreviewInline]);

  const handleTryAgain = useCallback(() => {
    if (!aiResult) return;
    clearPreviewInline({ removeStrike: true });
    removeAiAction(aiResult.messageId);
    const messageId = crypto.randomUUID();
    addAiAction({
      messageId,
      pagePath: filePathRef.current,
      action: aiResult.action,
      selectionText: aiResult.selectionText,
      blockIds: aiResult.blockIds,
      selectionFrom: aiResult.selectionFrom,
      selectionTo: aiResult.selectionTo,
      anchor: aiResult.anchor,
      createdAt: Date.now(),
    });
    if (!chatPanelOpen) setChatPanelOpen(true);
    window.dispatchEvent(
      new CustomEvent("clawpad:ai-action", {
        detail: {
          messageId,
          action: aiResult.action,
          selection: aiResult.selectionText,
          pagePath: filePathRef.current,
        },
      }),
    );
    setAiPreviewStatus("loading");
    setAiPreviewAnchor(aiResult.anchor);
    if (
      typeof aiResult.selectionFrom === "number" &&
      typeof aiResult.selectionTo === "number"
    ) {
      setAiPreview({
        messageId,
        from: aiResult.selectionFrom,
        to: aiResult.selectionTo,
        previewFrom: aiResult.selectionTo,
        previewTo: aiResult.selectionTo,
      });
      applyStrikePreview(aiResult.selectionFrom, aiResult.selectionTo, true);
    }
    setAiResult(null);
  }, [
    aiResult,
    chatPanelOpen,
    setChatPanelOpen,
    clearPreviewInline,
    applyStrikePreview,
  ]);

  const handleDiscardResult = useCallback(() => {
    if (!aiResult) return;
    clearPreviewInline({ removeStrike: true });
    removeAiAction(aiResult.messageId);
    setAiPreviewStatus(null);
    setAiPreviewAnchor(null);
    setAiResult(null);
  }, [aiResult, clearPreviewInline]);

  const portalTarget =
    typeof document !== "undefined" ? document.documentElement : null;
  const aiPreviewNode =
    aiPreviewStatus && aiPreviewStatus !== "done" && aiPreviewPos ? (
      <div
        ref={aiPreviewBubbleRef}
        className="fixed z-50 flex items-center gap-2 rounded-full border bg-popover px-2 py-1 text-xs text-muted-foreground shadow-sm ai-preview-loading"
        style={{
          position: "fixed",
          top: aiPreviewPos.top,
          left: aiPreviewPos.left,
        }}
      >
        <span className="ai-preview-spinner" />
        {aiPreviewStatus === "loading" ? "Thinking…" : "Streaming…"}
      </div>
    ) : null;

  const aiMenuNode =
    aiResult && aiMenuPos ? (
      <div
        ref={aiMenuRef}
        className="fixed z-50 flex flex-wrap gap-1 rounded-lg border bg-popover p-1 shadow-lg ai-preview-menu"
        style={{
          position: "fixed",
          top: aiMenuPos.top,
          left: aiMenuPos.left,
        }}
      >
        <Button
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={handleApplyReplace}
        >
          Replace selection
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="h-7 px-2 text-xs"
          onClick={handleInsertBelow}
        >
          Insert below
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={handleTryAgain}
        >
          Try again
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={handleDiscardResult}
        >
          Discard
        </Button>
      </div>
    ) : null;

  return (
    <div className="clawpad-editor-wrapper">
      <BlockNoteView
        editor={editor}
        editable={!readOnly}
        onChange={handleChange}
        theme={resolvedTheme === "dark" ? "dark" : "light"}
        data-theming-css-variables-demo
        slashMenu={false}
        formattingToolbar={false}
      >
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={getSlashMenuItems}
        />
        <FormattingToolbarController
          formattingToolbar={(props) => (
            <AiFormattingToolbar {...props} onAction={handleAiToolbarAction} />
          )}
        />
      </BlockNoteView>

      {portalTarget ? createPortal(aiPreviewNode, portalTarget) : aiPreviewNode}
      {portalTarget ? createPortal(aiMenuNode, portalTarget) : aiMenuNode}
    </div>
  );
}
