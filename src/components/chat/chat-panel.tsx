"use client";

import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, memo } from "react";
import { useChat, Chat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  X,
  Send,
  Square,
  Sparkles,
  Loader2,
  AlertCircle,
  Wrench,
  Check,
  Ban,
  ShieldQuestion,
  MessageSquarePlus,
  Paperclip,
  RotateCcw,
  ArrowDown,
  Clock,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/lib/stores/workspace";
import { useGatewayStore } from "@/lib/stores/gateway";
import { ChannelBadge } from "./channel-badge";
import { AgentStatusBar } from "./agent-status-bar";

// ─── Image Upload Helpers ────────────────────────────────────────────────────

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

/** Module-level bucket so the singleton transport can read pending images */
let pendingImagePayload: string[] = [];

interface AttachedImage {
  id: string;
  dataUrl: string;
  name: string;
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function processImageFiles(files: File[]): Promise<AttachedImage[]> {
  const results: AttachedImage[] = [];
  for (const file of files) {
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) continue;
    if (file.size > MAX_IMAGE_SIZE) {
      console.warn(`[chat] Skipping ${file.name}: exceeds 5 MB`);
      continue;
    }
    const dataUrl = await fileToDataUrl(file);
    results.push({ id: crypto.randomUUID(), dataUrl, name: file.name });
  }
  return results;
}

// ─── History Types ──────────────────────────────────────────────────────────

interface HistoryMessage {
  role: string;
  content: string | ContentPart[];
  timestamp?: number;
  channel?: string;
  sessionKey?: string;
  toolCallId?: string;
  tool_call_id?: string;
  toolName?: string;
  tool_name?: string;
  [key: string]: unknown;
}

interface ContentPart {
  type: string;
  text?: string;
  name?: string;
  args?: unknown;
  [key: string]: unknown;
}

// ─── Optimistic Message Types ───────────────────────────────────────────────

interface OptimisticMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  images?: string[];
  timestamp: number;
  status: "sending" | "streaming" | "sent" | "error";
}

// ─── Text Processing (matching OpenClaw's message-extract.ts) ───────────────

const ENVELOPE_PREFIX = /^\[([^\]]+)\]\s*/;
const ENVELOPE_CHANNELS = [
  "WebChat", "WhatsApp", "Telegram", "Signal", "Slack",
  "Discord", "iMessage", "Teams", "Matrix", "Zalo",
];

function looksLikeEnvelopeHeader(header: string): boolean {
  if (/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z\b/.test(header)) return true;
  if (/\d{4}-\d{2}-\d{2} \d{2}:\d{2}\b/.test(header)) return true;
  return ENVELOPE_CHANNELS.some((label) => header.startsWith(`${label} `));
}

function stripEnvelope(text: string): string {
  const match = text.match(ENVELOPE_PREFIX);
  if (!match) return text;
  const header = match[1] ?? "";
  if (!looksLikeEnvelopeHeader(header)) return text;
  return text.slice(match[0].length);
}

function stripThinkingTags(text: string): string {
  return text.replace(/<\s*think(?:ing)?\s*>[\s\S]*?<\s*\/\s*think(?:ing)?\s*>/gi, "").trim();
}

/** Extract display text from a message, stripping envelopes and thinking tags */
function extractText(raw: HistoryMessage): string | null {
  const role = raw.role ?? "";
  const content = raw.content;

  if (typeof content === "string") {
    return role === "assistant" ? stripThinkingTags(content) : stripEnvelope(content);
  }
  if (Array.isArray(content)) {
    const parts = content
      .filter((p) => p.type === "text" && typeof p.text === "string")
      .map((p) => p.text as string);
    if (parts.length > 0) {
      const joined = parts.join("\n");
      return role === "assistant" ? stripThinkingTags(joined) : stripEnvelope(joined);
    }
  }
  if (typeof (raw as any).text === "string") {
    const t = (raw as any).text;
    return role === "assistant" ? stripThinkingTags(t) : stripEnvelope(t);
  }
  return null;
}

// ─── Tool Card Extraction (matching OpenClaw's tool-cards.ts) ───────────────

const TOOL_INLINE_THRESHOLD = 80;
const PREVIEW_MAX_LINES = 2;
const PREVIEW_MAX_CHARS = 100;

interface ToolCard {
  kind: "call" | "result";
  name: string;
  args?: unknown;
  text?: string;
}

function extractToolCards(raw: HistoryMessage): ToolCard[] {
  const cards: ToolCard[] = [];
  const content = Array.isArray(raw.content) ? raw.content : [];

  // Extract tool calls
  for (const item of content) {
    const kind = ((item.type as string) ?? "").toLowerCase();
    const isToolCall =
      ["toolcall", "tool_call", "tooluse", "tool_use"].includes(kind) ||
      (typeof item.name === "string" && item.arguments != null);
    if (isToolCall) {
      cards.push({
        kind: "call",
        name: (item.name as string) ?? "tool",
        args: coerceArgs(item.arguments ?? item.args),
      });
    }
  }

  // Extract tool results from content array
  for (const item of content) {
    const kind = ((item.type as string) ?? "").toLowerCase();
    if (kind !== "toolresult" && kind !== "tool_result") continue;
    const text = (item.text as string) ?? (item.content as string) ?? undefined;
    const name = (item.name as string) ?? "tool";
    cards.push({ kind: "result", name, text });
  }

  // If this is a toolResult role message without explicit result cards, create one
  const isToolResult =
    ((raw.role ?? "").toLowerCase() === "toolresult" ||
      (raw.role ?? "").toLowerCase() === "tool_result" ||
      !!(raw as any).toolCallId ||
      !!(raw as any).tool_call_id ||
      !!(raw as any).toolName ||
      !!(raw as any).tool_name) &&
    !cards.some((c) => c.kind === "result");

  if (isToolResult) {
    const name =
      (raw as any).toolName ?? (raw as any).tool_name ?? "tool";
    const text = extractText(raw) ?? undefined;
    cards.push({ kind: "result", name, text });
  }

  return cards;
}

function coerceArgs(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) return value;
  try { return JSON.parse(trimmed); } catch { return value; }
}

function getTruncatedPreview(text: string): string {
  const allLines = text.split("\n");
  const lines = allLines.slice(0, PREVIEW_MAX_LINES);
  const preview = lines.join("\n");
  if (preview.length > PREVIEW_MAX_CHARS) return preview.slice(0, PREVIEW_MAX_CHARS) + "…";
  return lines.length < allLines.length ? preview + "…" : preview;
}

// ─── Normalized Message (matching OpenClaw's message-normalizer.ts) ─────────

interface NormalizedMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: ContentPart[];
  timestamp: number;
  id?: string;
  channel?: string;
  sessionKey?: string;
  raw: HistoryMessage;
  /** Pre-extracted display text (with envelope/thinking stripped) */
  displayText: string | null;
  /** Pre-extracted tool cards */
  toolCards: ToolCard[];
}

function normalizeRoleForGrouping(role: string): "user" | "assistant" | "system" | "tool" {
  const lower = (role ?? "").toLowerCase();
  if (role === "user" || role === "User") return "user";
  if (role === "assistant") return "assistant";
  if (role === "system") return "system";
  if (
    lower === "toolresult" ||
    lower === "tool_result" ||
    lower === "tool" ||
    lower === "function"
  )
    return "tool";
  return "assistant"; // fallback
}

function isToolResultMessage(raw: HistoryMessage): boolean {
  const role = (raw.role ?? "").toLowerCase();
  if (role === "toolresult" || role === "tool_result") return true;
  if (!!(raw as any).toolCallId || !!(raw as any).tool_call_id) return true;
  if (!!(raw as any).toolName || !!(raw as any).tool_name) return true;
  const contentArray = Array.isArray(raw.content) ? raw.content : null;
  return !!contentArray?.some((p) => {
    const t = ((p.type as string) ?? "").toLowerCase();
    return t === "toolresult" || t === "tool_result";
  });
}

function normalizeMessage(raw: HistoryMessage): NormalizedMessage {
  let role = raw.role ?? "unknown";

  // Detect tool result role (matching OpenClaw's normalizeMessage)
  if (isToolResultMessage(raw)) {
    role = "toolResult";
  }

  // Normalize content to parts array
  let parts: ContentPart[] = [];
  if (typeof raw.content === "string") {
    parts = [{ type: "text", text: raw.content }];
  } else if (Array.isArray(raw.content)) {
    parts = raw.content.map((p) => ({
      ...p,
      type: p.type || "text",
      text: p.text,
    }));
  } else if (typeof (raw as any).text === "string") {
    parts = [{ type: "text", text: (raw as any).text }];
  }

  return {
    role: normalizeRoleForGrouping(role),
    content: parts,
    timestamp: raw.timestamp ?? Date.now(),
    id: (raw as any).id,
    channel: raw.channel,
    sessionKey: raw.sessionKey,
    raw,
    displayText: extractText(raw),
    toolCards: extractToolCards(raw),
  };
}

// ─── Display List + Grouping (matching OpenClaw's bf() and yf()) ────────────

interface DisplayMessageItem {
  kind: "message";
  normalized: NormalizedMessage;
}

interface DisplayOptimisticItem {
  kind: "optimistic";
  message: OptimisticMessage;
}

interface DisplayStreamItem {
  kind: "stream";
  message: ChatMessageType;
  isStreaming: boolean;
}

interface DisplayIndicatorItem {
  kind: "indicator";
  status: string;
}

type DisplayItem =
  | DisplayMessageItem
  | DisplayOptimisticItem
  | DisplayStreamItem
  | DisplayIndicatorItem;

interface MessageGroup {
  kind: "group";
  role: string;
  messages: NormalizedMessage[];
  timestamp: number;
}

interface OptimisticGroup {
  kind: "optimistic-group";
  messages: OptimisticMessage[];
}

interface StreamGroup {
  kind: "stream-group";
  message: ChatMessageType;
  isStreaming: boolean;
}

interface IndicatorGroup {
  kind: "indicator-group";
  status: string;
}

type GroupedItem = MessageGroup | OptimisticGroup | StreamGroup | IndicatorGroup;

function buildDisplayList(
  history: HistoryMessage[],
  showThinking: boolean,
  optimisticMessages: OptimisticMessage[],
  streamingMessages: ChatMessageType[],
  isStreaming: boolean,
): DisplayItem[] {
  const items: DisplayItem[] = [];

  for (const raw of history) {
    const normalized = normalizeMessage(raw);

    // Skip toolResult role messages when not showing thinking
    // (matching OpenClaw's buildChatItems — only toolResult is skipped)
    if (!showThinking && normalized.role === "tool") continue;

    items.push({ kind: "message", normalized });
  }

  // Add optimistic user messages (with dedup against history)
  for (const opt of optimisticMessages) {
    const isDuplicate = items.some((item) => {
      if (item.kind !== "message") return false;
      const n = item.normalized;
      if (n.role !== opt.role) return false;
      const nText = n.content
        .filter((p) => p.type === "text" && p.text)
        .map((p) => p.text)
        .join("\n");
      const textMatch = nText.trim() === opt.text.trim();
      const timeClose = n.timestamp
        ? Math.abs(n.timestamp - opt.timestamp) < 60000
        : false;
      return textMatch && timeClose;
    });

    if (!isDuplicate) {
      items.push({ kind: "optimistic", message: opt });
    }
  }

  // Add AI SDK streaming messages
  if (streamingMessages.length > 0) {
    const lastMsg = streamingMessages[streamingMessages.length - 1];
    if (lastMsg.role === "assistant") {
      items.push({ kind: "stream", message: lastMsg, isStreaming });
    }
  }

  return items;
}

function groupDisplayItems(items: DisplayItem[]): GroupedItem[] {
  const result: GroupedItem[] = [];
  let currentGroup: MessageGroup | null = null;

  for (const item of items) {
    if (item.kind === "message") {
      if (!currentGroup || currentGroup.role !== item.normalized.role) {
        if (currentGroup) result.push(currentGroup);
        currentGroup = {
          kind: "group",
          role: item.normalized.role,
          messages: [item.normalized],
          timestamp: item.normalized.timestamp,
        };
      } else {
        currentGroup.messages.push(item.normalized);
      }
    } else {
      // Non-message items break groups
      if (currentGroup) {
        result.push(currentGroup);
        currentGroup = null;
      }

      if (item.kind === "optimistic") {
        result.push({ kind: "optimistic-group", messages: [item.message] });
      } else if (item.kind === "stream") {
        result.push({
          kind: "stream-group",
          message: item.message,
          isStreaming: item.isStreaming,
        });
      } else if (item.kind === "indicator") {
        result.push({ kind: "indicator-group", status: item.status });
      }
    }
  }

  if (currentGroup) result.push(currentGroup);
  return result;
}

// ─── Progressive Loading Constants ──────────────────────────────────────────

const INITIAL_VISIBLE_COUNT = 300;
const LOAD_MORE_BATCH = 100;

// ─── History Hook ───────────────────────────────────────────────────────────

function useHistoryMessages(
  isOpen: boolean,
  lastSentAtRef: React.RefObject<number>,
) {
  const [allMessages, setAllMessages] = useState<HistoryMessage[]>([]);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadedRef = useRef(false);

  const fetchHistory = useCallback(() => {
    return fetch("/api/gateway/history?limit=1000")
      .then((r) => r.json())
      .then((data) => {
        const msgs: HistoryMessage[] = data.messages ?? [];
        setAllMessages(msgs);
      })
      .catch(() => {
        // Silent — gateway may not support history
      });
  }, []);

  // Wrapped refetch that respects suppression window
  const refetchHistory = useCallback(() => {
    if (Date.now() - lastSentAtRef.current < 5000) {
      return Promise.resolve();
    }
    return fetchHistory();
  }, [fetchHistory, lastSentAtRef]);

  // Visible history = last N messages from allMessages
  const history = useMemo(() => {
    if (allMessages.length <= visibleCount) return allMessages;
    return allMessages.slice(allMessages.length - visibleCount);
  }, [allMessages, visibleCount]);

  const hasMore = allMessages.length > visibleCount;

  const loadMore = useCallback(() => {
    setLoadingMore(true);
    setTimeout(() => {
      setVisibleCount((prev) => Math.min(prev + LOAD_MORE_BATCH, allMessages.length));
      setLoadingMore(false);
    }, 100);
  }, [allMessages.length]);

  // Initial fetch
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    setLoading(true);
    fetchHistory().finally(() => setLoading(false));
  }, [fetchHistory]);

  // Refetch when panel opens and empty
  useEffect(() => {
    if (isOpen && allMessages.length === 0 && !loading) {
      fetchHistory();
    }
  }, [isOpen, allMessages.length, loading, fetchHistory]);

  return { history, allMessages, loading, loadingMore, hasMore, loadMore, refetchHistory };
}

// ─── Singleton Chat Instance ────────────────────────────────────────────────

function createChatTransport() {
  return new DefaultChatTransport({
    api: "/api/chat",
    body: () => ({
      pageContext: useWorkspaceStore.getState().activePage ?? undefined,
      images:
        pendingImagePayload.length > 0 ? [...pendingImagePayload] : undefined,
    }),
  });
}

const sharedTransport = createChatTransport();
const sharedChat = new Chat({ transport: sharedTransport });

interface ChatPanelProps {
  variant?: "default" | "sheet" | "fullscreen";
}

export function ChatPanel({ variant = "default" }: ChatPanelProps) {
  const { chatPanelOpen, setChatPanelOpen, activePage } = useWorkspaceStore();
  const connected = useGatewayStore((s) => s.connected);
  const agentStatus = useGatewayStore((s) => s.agentStatus);

  const panelVisible = chatPanelOpen || variant !== "default";

  // ─── SSE refetch suppression ──────────────────────────────────────
  const lastSentAtRef = useRef<number>(0);

  const { history, allMessages, loading: historyLoading, loadingMore, hasMore, loadMore, refetchHistory } =
    useHistoryMessages(panelVisible, lastSentAtRef);

  const [chatInstance, setChatInstance] = useState(sharedChat);
  const {
    messages,
    sendMessage,
    addToolApprovalResponse,
    status,
    stop,
    error,
  } = useChat({ chat: chatInstance });

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isLoading = status === "streaming" || status === "submitted";

  // ─── Show thinking toggle ───────────────────────────────────────────
  const [showThinking, setShowThinking] = useState(false);

  // ─── Optimistic messages state ──────────────────────────────────────
  const [optimisticMessages, setOptimisticMessages] = useState<
    OptimisticMessage[]
  >([]);

  const currentOptimisticIdRef = useRef<string | null>(null);

  // ─── Sync AI SDK status with optimistic message status ─────────────
  useEffect(() => {
    const optId = currentOptimisticIdRef.current;
    if (!optId) return;

    if (status === "streaming") {
      setOptimisticMessages((prev) =>
        prev.map((m) =>
          m.id === optId && m.status === "sending"
            ? { ...m, status: "sent" as const }
            : m,
        ),
      );
    } else if (status === "ready") {
      setOptimisticMessages((prev) =>
        prev.map((m) =>
          m.id === optId && (m.status === "sending" || m.status === "streaming")
            ? { ...m, status: "sent" as const }
            : m,
        ),
      );
      currentOptimisticIdRef.current = null;
    }
  }, [status]);

  // ─── Sync error with optimistic message ────────────────────────────
  useEffect(() => {
    if (error && currentOptimisticIdRef.current) {
      const optId = currentOptimisticIdRef.current;
      setOptimisticMessages((prev) =>
        prev.map((m) =>
          m.id === optId ? { ...m, status: "error" as const } : m,
        ),
      );
      currentOptimisticIdRef.current = null;
    }
  }, [error]);

  // ─── Auto-scroll state ──────────────────────────────────────────────
  const isAtBottomRef = useRef(true);
  const prevItemCountRef = useRef(0);
  const [unreadCount, setUnreadCount] = useState(0);

  // Standard scrolling: bottom is scrollHeight - clientHeight
  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      const el = scrollRef.current;
      if (!el) return;
      const top = el.scrollHeight - el.clientHeight;
      el.scrollTo({ top: top > 0 ? top : 0, behavior });
    },
    [],
  );

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 100;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isAtBottomRef.current = distanceFromBottom < threshold;
    if (isAtBottomRef.current) setUnreadCount(0);
  }, []);

  // ─── Build grouped display list ────────────────────────────────────
  const groupedItems = useMemo(() => {
    const displayItems = buildDisplayList(
      history,
      showThinking,
      optimisticMessages,
      messages as ChatMessageType[],
      isLoading,
    );
    return groupDisplayItems(displayItems);
  }, [history, showThinking, optimisticMessages, messages, isLoading]);

  const hasMessages = groupedItems.length > 0;

  // Auto-scroll when items change
  useEffect(() => {
    const totalItems = groupedItems.length;

    // First population — jump to bottom if the panel is visible
    if (prevItemCountRef.current === 0 && totalItems > 0) {
      prevItemCountRef.current = totalItems;
      isAtBottomRef.current = true;
      if (panelVisible) {
        requestAnimationFrame(() => scrollToBottom("auto"));
      }
      return;
    }

    if (isAtBottomRef.current) {
      // Already at bottom, scroll to keep at bottom for new messages
      requestAnimationFrame(() => scrollToBottom("smooth"));
    } else if (
      totalItems > prevItemCountRef.current &&
      prevItemCountRef.current > 0
    ) {
      setUnreadCount(
        (prev) => prev + (totalItems - prevItemCountRef.current),
      );
    }
    prevItemCountRef.current = totalItems;
  }, [groupedItems.length, scrollToBottom, panelVisible]);

  // Sync initial scroll when the panel opens and history is ready.
  const initialScrollDone = useRef(false);
  useEffect(() => {
    if (!panelVisible) {
      initialScrollDone.current = false;
      return;
    }
    if (historyLoading) return;
    if (!initialScrollDone.current) {
      initialScrollDone.current = true;
      isAtBottomRef.current = true;
      setUnreadCount(0);
      requestAnimationFrame(() => scrollToBottom("auto"));
    }
  }, [panelVisible, historyLoading, scrollToBottom]);

  // handleLoadMore — preserve scroll position when older messages prepend
  const pendingScrollRestoreRef = useRef<{
    prevScrollHeight: number;
    prevScrollTop: number;
  } | null>(null);
  const handleLoadMore = useCallback(() => {
    const el = scrollRef.current;
    if (el) {
      pendingScrollRestoreRef.current = {
        prevScrollHeight: el.scrollHeight,
        prevScrollTop: el.scrollTop,
      };
    }
    loadMore();
  }, [loadMore]);

  useLayoutEffect(() => {
    const restore = pendingScrollRestoreRef.current;
    if (!restore) return;
    const el = scrollRef.current;
    if (!el) return;
    const delta = el.scrollHeight - restore.prevScrollHeight;
    if (delta !== 0) {
      el.scrollTop = restore.prevScrollTop + delta;
    }
    pendingScrollRestoreRef.current = null;
  }, [groupedItems.length]);

  // Keep at bottom during streaming
  useEffect(() => {
    if (isLoading && isAtBottomRef.current) {
      requestAnimationFrame(() => scrollToBottom("smooth"));
    }
  }, [isLoading, messages, scrollToBottom]);

  // ─── SSE subscription ──────────────────────────────────────────────
  useEffect(() => {
    if (!panelVisible) return;

    let es: EventSource | null = null;
    let debounceTimer: ReturnType<typeof setTimeout>;
    let closed = false;

    function connect() {
      if (closed) return;
      es = new EventSource("/api/gateway/events");

      es.addEventListener("gateway", (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          if (data.event === "chat") {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
              if (!closed) refetchHistory();
            }, 2000);
          }
        } catch {
          // ignore
        }
      });

      es.onerror = () => {
        es?.close();
        es = null;
        if (!closed) {
          setTimeout(connect, 5000);
        }
      };
    }

    connect();

    return () => {
      closed = true;
      clearTimeout(debounceTimer);
      es?.close();
    };
  }, [panelVisible, refetchHistory]);

  // ─── Image upload state ─────────────────────────────────────────────
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);
  const [optimisticImageMap, setOptimisticImageMap] = useState<
    Record<string, string[]>
  >({});
  const [isDragOver, setIsDragOver] = useState(false);

  const addImages = useCallback(async (files: File[]) => {
    const imgs = await processImageFiles(files);
    if (imgs.length > 0) {
      setAttachedImages((prev) => [...prev, ...imgs]);
      inputRef.current?.focus();
    }
  }, []);

  const removeImage = useCallback((id: string) => {
    setAttachedImages((prev) => prev.filter((img) => img.id !== id));
  }, []);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imageFiles: File[] = [];
      for (const item of Array.from(items)) {
        if (
          item.kind === "file" &&
          ACCEPTED_IMAGE_TYPES.includes(item.type)
        ) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length > 0) {
        e.preventDefault();
        addImages(imageFiles);
      }
    },
    [addImages],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer?.types.includes("Files")) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const { clientX, clientY } = e;
    if (
      clientX <= rect.left ||
      clientX >= rect.right ||
      clientY <= rect.top ||
      clientY >= rect.bottom
    ) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      const files = Array.from(e.dataTransfer?.files ?? []).filter((f) =>
        ACCEPTED_IMAGE_TYPES.includes(f.type),
      );
      if (files.length > 0) addImages(files);
    },
    [addImages],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length > 0) addImages(files);
      e.target.value = "";
    },
    [addImages],
  );

  // New chat handler
  const handleNewChat = useCallback(() => {
    const newChat = new Chat({ transport: createChatTransport() });
    setChatInstance(newChat);
    setAttachedImages([]);
    setOptimisticMessages([]);
    setOptimisticImageMap({});
    pendingImagePayload = [];
    currentOptimisticIdRef.current = null;
    if (inputRef.current) {
      inputRef.current.value = "";
      inputRef.current.style.height = "auto";
      inputRef.current.focus();
    }
  }, []);

  // Keyboard shortcut: Cmd+Shift+L
  useEffect(() => {
    if (variant !== "default") return;
    function handleKeydown(e: KeyboardEvent) {
      if (e.metaKey && e.shiftKey && e.key === "l") {
        e.preventDefault();
        setChatPanelOpen(!chatPanelOpen);
      }
    }
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [chatPanelOpen, setChatPanelOpen, variant]);

  // Focus input when panel opens
  useEffect(() => {
    if (chatPanelOpen || variant !== "default") {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [chatPanelOpen, variant]);

  const handleSend = useCallback(
    async (text: string) => {
      const hasImages = attachedImages.length > 0;
      if (!text.trim() && !hasImages) return;
      const trimmed =
        text.trim() || (hasImages ? "What's in this image?" : "");
      if (!trimmed) return;

      const optId = crypto.randomUUID();
      const imageUrls = attachedImages.map((img) => img.dataUrl);

      const optimistic: OptimisticMessage = {
        id: optId,
        role: "user",
        text: trimmed,
        images: imageUrls.length > 0 ? imageUrls : undefined,
        timestamp: Date.now(),
        status: "sending",
      };

      setOptimisticMessages((prev) => [...prev, optimistic]);
      if (imageUrls.length > 0) {
        setOptimisticImageMap((prev) => ({ ...prev, [optId]: imageUrls }));
      }
      currentOptimisticIdRef.current = optId;
      lastSentAtRef.current = Date.now();

      setAttachedImages([]);
      if (inputRef.current) {
        inputRef.current.value = "";
        inputRef.current.style.height = "auto";
      }

      pendingImagePayload = imageUrls;

      try {
        await sendMessage({ text: trimmed });
        // Safety net: if sendMessage resolved but status effect hasn't fired,
        // force transition to "sent" after a short delay
        setTimeout(() => {
          setOptimisticMessages((prev) =>
            prev.map((m) =>
              m.id === optId && m.status === "sending"
                ? { ...m, status: "sent" as const }
                : m,
            ),
          );
        }, 2000);
      } catch (err) {
        console.error("[chat] sendMessage error:", err);
        setOptimisticMessages((prev) =>
          prev.map((m) =>
            m.id === optId ? { ...m, status: "error" as const } : m,
          ),
        );
      }

      pendingImagePayload = [];
    },
    [sendMessage, attachedImages],
  );

  const handleRetry = useCallback(
    (optMsg: OptimisticMessage) => {
      setOptimisticMessages((prev) => prev.filter((m) => m.id !== optMsg.id));
      if (optMsg.images && optMsg.images.length > 0) {
        const fakeAttached: AttachedImage[] = optMsg.images.map((url, i) => ({
          id: crypto.randomUUID(),
          dataUrl: url,
          name: `image-${i}`,
        }));
        setAttachedImages(fakeAttached);
        setTimeout(() => {
          handleSend(optMsg.text);
        }, 0);
      } else {
        handleSend(optMsg.text);
      }
    },
    [handleSend],
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (inputRef.current) {
        handleSend(inputRef.current.value);
      }
    },
    [handleSend],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const value = (e.target as HTMLTextAreaElement).value;
        if (value || attachedImages.length > 0) {
          handleSend(value || "");
        }
      }
    },
    [handleSend, attachedImages.length],
  );

  const handleInput = useCallback(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`;
  }, []);

  const isHidden = variant === "default" && !chatPanelOpen;
  const pageTitle = activePage
    ? (activePage
        .split("/")
        .pop()
        ?.replace(/\.md$/, "")
        .replace(/-/g, " ") ?? null)
    : null;

  const suggestions = [
    "Summarize this page",
    "Extract tasks",
    "Improve writing",
  ];

  const isFullscreen = variant === "fullscreen";
  const isSheet = variant === "sheet";

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "relative flex flex-col bg-background",
        isHidden && "hidden",
        variant === "default" &&
          "h-full w-[400px] shrink-0 overflow-hidden border-l shadow-[-4px_0_12px_rgba(0,0,0,0.03)] dark:shadow-[-4px_0_12px_rgba(0,0,0,0.2)]",
        isSheet && "h-full w-full",
        isFullscreen && "h-full w-full",
      )}
    >
      {/* Drag overlay */}
      {isDragOver && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center rounded-lg border-2 border-dashed border-blue-500 bg-blue-50/60 dark:bg-blue-950/40">
          <div className="flex flex-col items-center gap-2 text-blue-600 dark:text-blue-400">
            <Paperclip className="h-8 w-8" />
            <span className="text-sm font-medium">Drop image here</span>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div
        className={cn(
          "flex shrink-0 items-center justify-between border-b px-4",
          isFullscreen ? "h-14" : "h-12",
        )}
      >
        <div className="flex items-center gap-2.5">
          <Sparkles className="h-4 w-4 shrink-0 text-violet-500" />
          <span className="text-sm font-medium">Chat</span>
          <ConnectionDot connected={connected} agentStatus={agentStatus} />
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-8 w-8 text-muted-foreground hover:text-foreground",
              showThinking && "text-violet-500 hover:text-violet-600",
            )}
            onClick={() => setShowThinking(!showThinking)}
            title={showThinking ? "Hide tool calls" : "Show tool calls"}
          >
            <Wrench className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={handleNewChat}
            title="New chat"
          >
            <MessageSquarePlus className="h-4 w-4" />
          </Button>
          {!isFullscreen && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => setChatPanelOpen(false)}
              title="Close chat (⌘⇧L)"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* ── Agent Status Bar ── */}
      <AgentStatusBar />

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 min-w-0 overflow-y-auto"
      >
        <div className="flex flex-col gap-4 p-4 min-w-0 overflow-hidden">
          {!hasMessages && !historyLoading && (
            <EmptyState
              pageTitle={pageTitle}
              suggestions={suggestions}
              onSuggestionClick={handleSend}
            />
          )}

          {historyLoading && (
            <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span className="text-xs">Loading history…</span>
            </div>
          )}

          {/* Load earlier messages button */}
          {hasMore && !historyLoading && (
            <div className="flex justify-center py-2">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="mx-auto flex items-center gap-2 rounded-full bg-muted/60 px-4 py-2 text-xs text-muted-foreground hover:bg-muted transition-colors"
              >
                {loadingMore ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Clock className="h-3 w-3" />
                )}
                Load earlier messages
              </button>
            </div>
          )}

          {/* Grouped message stream */}
          {groupedItems.map((group, gi) => {
            if (group.kind === "group") {
              return (
                <MessageGroupRenderer
                  key={`g-${gi}-${group.timestamp}`}
                  group={group}
                  showThinking={showThinking}
                />
              );
            }

            if (group.kind === "optimistic-group") {
              return group.messages.map((msg) => (
                <OptimisticMessageBubble
                  key={msg.id}
                  message={msg}
                  images={optimisticImageMap[msg.id]}
                  onRetry={handleRetry}
                />
              ));
            }

            if (group.kind === "stream-group") {
              return (
                <ChatMessage
                  key={`stream-${group.message.id}`}
                  message={group.message}
                  isLatest={true}
                  isStreaming={group.isStreaming}
                  showThinking={showThinking}
                  onToolApprove={(id) =>
                    addToolApprovalResponse({ id, approved: true })
                  }
                  onToolDeny={(id) =>
                    addToolApprovalResponse({
                      id,
                      approved: false,
                      reason: "Denied by user",
                    })
                  }
                />
              );
            }

            return null;
          })}

          {/* Streaming indicator */}
          <AnimatePresence>
            {isLoading && messages.length === 0 && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-2 text-muted-foreground"
              >
                <div className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-bounce [animation-delay:0ms]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-bounce [animation-delay:150ms]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-bounce [animation-delay:300ms]" />
                </div>
                <span className="text-xs">
                  {status === "streaming" ? "Writing…" : "Thinking…"}
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error banner */}
          {error &&
            !optimisticMessages.some((m) => m.status === "error") && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="flex-1">
                  <p className="font-medium">Something went wrong</p>
                  <p className="text-xs opacity-80 mt-0.5">
                    {error.message.includes("API key")
                      ? "No API key configured. Check your environment settings."
                      : error.message}
                  </p>
                </div>
              </motion.div>
            )}
        </div>
      </div>

      {/* Unread messages pill */}
      <AnimatePresence>
        {unreadCount > 0 && (
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.2 }}
            onClick={() => {
              scrollToBottom("smooth");
              setUnreadCount(0);
            }}
            className="absolute bottom-[4.5rem] left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 rounded-full bg-blue-600 dark:bg-blue-500 px-3 py-1.5 text-xs font-medium text-white shadow-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors"
          >
            <ArrowDown className="h-3 w-3" />
            {unreadCount} new message{unreadCount !== 1 ? "s" : ""}
          </motion.button>
        )}
      </AnimatePresence>

      {/* Page context + suggestions */}
      {!hasMessages && pageTitle && (
        <div className="border-t px-4 py-2">
          <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>Viewing:</span>
            <span className="font-medium capitalize text-foreground">
              {pageTitle}
            </span>
          </div>
        </div>
      )}

      {/* Input */}
      <div
        className={cn(
          "shrink-0 border-t p-3",
          isFullscreen &&
            "pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]",
          isFullscreen && "sticky bottom-0 bg-background",
        )}
      >
        {/* Image preview thumbnails */}
        {attachedImages.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {attachedImages.map((img) => (
              <div key={img.id} className="group relative">
                <img
                  src={img.dataUrl}
                  alt={img.name}
                  className="h-16 w-16 rounded-lg border object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeImage(img.id)}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive/90"
                  title="Remove image"
                >
                  <X className="h-3 w-3" />
                </button>
                <div className="absolute bottom-0 left-0 right-0 truncate rounded-b-lg bg-black/50 px-1 py-0.5 text-[9px] text-white">
                  {img.name}
                </div>
              </div>
            ))}
          </div>
        )}

        {hasMessages && pageTitle && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => handleSend(s)}
                className="rounded-full bg-secondary px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />

          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => fileInputRef.current?.click()}
            title="Attach image"
            disabled={isLoading}
          >
            <Paperclip className="h-4 w-4" />
          </Button>

          <textarea
            ref={inputRef}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onInput={
              handleInput as unknown as React.FormEventHandler<HTMLTextAreaElement>
            }
            placeholder={
              attachedImages.length > 0
                ? "Add a message or send…"
                : "Ask your agent…"
            }
            rows={isFullscreen ? 1 : 2}
            className={cn(
              "flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm",
              "placeholder:text-muted-foreground",
              "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
              "max-h-[150px]",
              isFullscreen && "min-h-[44px] text-base",
            )}
            disabled={isLoading}
          />
          {isLoading ? (
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={() => stop()}
              className="h-9 w-9 shrink-0"
            >
              <Square className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button type="submit" size="icon" className="h-9 w-9 shrink-0">
              <Send className="h-4 w-4" />
            </Button>
          )}
        </form>
      </div>
    </div>
  );
}

// ─── Connection Dot ─────────────────────────────────────────────────────────

function ConnectionDot({
  connected,
  agentStatus,
}: {
  connected: boolean;
  agentStatus: string;
}) {
  const color = connected
    ? agentStatus === "active" || agentStatus === "thinking"
      ? "bg-violet-400"
      : "bg-green-500"
    : "bg-zinc-300 dark:bg-zinc-600";

  const shouldPing =
    connected && (agentStatus === "active" || agentStatus === "thinking");

  return (
    <span
      className="relative flex h-2 w-2"
      title={connected ? agentStatus : "disconnected"}
    >
      {shouldPing && (
        <span
          className={cn(
            "absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping",
            color,
          )}
        />
      )}
      <span
        className={cn("relative inline-flex h-2 w-2 rounded-full", color)}
      />
    </span>
  );
}

// ─── Empty State ────────────────────────────────────────────────────────────

function EmptyState({
  pageTitle,
  suggestions,
  onSuggestionClick,
}: {
  pageTitle: string | null;
  suggestions: string[];
  onSuggestionClick: (text: string) => void;
}) {
  return (
    <div className="flex flex-1 items-center justify-center py-16">
      <div className="space-y-3 text-center">
        <Sparkles className="mx-auto h-8 w-8 text-muted-foreground/40" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">
            Chat with your OpenClaw agent
          </p>
          {pageTitle && (
            <p className="text-xs text-muted-foreground/60">
              Viewing:{" "}
              <span className="capitalize font-medium">{pageTitle}</span>
            </p>
          )}
        </div>
        <div className="flex flex-wrap justify-center gap-2 pt-1">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => onSuggestionClick(s)}
              className="rounded-full bg-secondary px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Message Group Renderer ─────────────────────────────────────────────────

const MessageGroupRenderer = memo(function MessageGroupRenderer({
  group,
  showThinking,
}: {
  group: MessageGroup;
  showThinking: boolean;
}) {
  if (group.role === "user") {
    return (
      <div className="flex flex-col gap-2">
        {group.messages.map((msg, i) => (
          <UserBubble key={msg.id ?? `u-${i}`} message={msg} />
        ))}
      </div>
    );
  }

  if (group.role === "assistant") {
    return (
      <div className="flex flex-col gap-1 items-start">
        {group.messages.map((msg, i) => (
          <AssistantBubble
            key={msg.id ?? `a-${i}`}
            message={msg}
            showThinking={showThinking}
          />
        ))}
      </div>
    );
  }

  if (group.role === "tool") {
    // Only rendered when showThinking is true (filtered in buildDisplayList)
    return (
      <div className="flex flex-col gap-1">
        {group.messages.map((msg, i) => (
          <ToolResultGroupRenderer key={msg.id ?? `t-${i}`} message={msg} />
        ))}
      </div>
    );
  }

  if (group.role === "system") {
    return (
      <div className="flex flex-col gap-1">
        {group.messages.map((msg, i) => {
          const text = msg.displayText;
          if (!text) return null;
          return (
            <div
              key={msg.id ?? `s-${i}`}
              className="text-center text-xs text-muted-foreground/60 italic py-1"
            >
              {text}
            </div>
          );
        })}
      </div>
    );
  }

  return null;
});

// ─── User Bubble ────────────────────────────────────────────────────────────

const UserBubble = memo(function UserBubble({
  message,
}: {
  message: NormalizedMessage;
}) {
  const text = message.displayText;
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // Extract image URLs from content parts
  const imageUrls = useMemo(() => {
    const urls: string[] = [];
    for (const part of message.content) {
      if (part.type === "input_image" || part.type === "image") {
        const src =
          (part as any).image_url ??
          (part as any).url ??
          ((part as any).source?.type === "base64"
            ? `data:${(part as any).source.media_type ?? "image/png"};base64,${(part as any).source.data}`
            : (part as any).source?.url);
        if (src) urls.push(src);
      }
    }
    return urls;
  }, [message.content]);

  if ((!text || text.trim().length < 1) && imageUrls.length === 0) return null;

  const timeStr = message.timestamp
    ? new Date(message.timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="flex flex-col gap-0.5 items-end">
      {/* Lightbox overlay */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 cursor-pointer"
          onClick={() => setLightboxUrl(null)}
        >
          <img
            src={lightboxUrl}
            alt="Full size"
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
          />
          <button
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
            onClick={() => setLightboxUrl(null)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex items-center gap-1.5 px-1">
        <ChannelBadge
          channel={message.channel}
          sessionKey={message.sessionKey}
        />
        {timeStr && (
          <span className="text-[10px] text-muted-foreground/50">
            {timeStr}
          </span>
        )}
      </div>

      <div className="max-w-[85%] space-y-2">
        {/* Image thumbnails */}
        {imageUrls.length > 0 && (
          <div className="flex flex-wrap justify-end gap-1.5">
            {imageUrls.map((url, i) => (
              <img
                key={i}
                src={url}
                alt={`Attached image ${i + 1}`}
                className="max-h-48 max-w-[200px] cursor-pointer rounded-xl border border-white/20 object-cover shadow-sm transition-transform hover:scale-[1.02]"
                onClick={() => setLightboxUrl(url)}
              />
            ))}
          </div>
        )}

        {text && text.trim().length > 0 && (
          <div className="rounded-2xl bg-blue-600/60 dark:bg-blue-500/40 px-4 py-2 text-sm text-white leading-relaxed break-words overflow-hidden">
            {text}
          </div>
        )}
      </div>
    </div>
  );
});

// ─── Assistant Bubble ───────────────────────────────────────────────────────

const AssistantBubble = memo(function AssistantBubble({
  message,
  showThinking,
}: {
  message: NormalizedMessage;
  showThinking: boolean;
}) {
  // Use pre-extracted display text (thinking tags already stripped)
  const text = message.displayText?.trim() || null;
  const toolCards = message.toolCards;
  const hasToolCards = toolCards.length > 0;

  const timeStr = message.timestamp
    ? new Date(message.timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  // Matching renderGroupedMessage: if no text, no tool cards → nothing
  if (!text && !hasToolCards) return null;

  return (
    <div className="flex flex-col gap-0.5 items-start max-w-[95%] min-w-0">
      <div className="flex items-center gap-1.5 px-1">
        <ChannelBadge
          channel={message.channel}
          sessionKey={message.sessionKey}
        />
        {timeStr && (
          <span className="text-[10px] text-muted-foreground/50">
            {timeStr}
          </span>
        )}
      </div>

      {/* Text content */}
      {text && (
        <div className="min-w-0 text-sm leading-relaxed opacity-90">
          <MarkdownRenderer text={text} />
        </div>
      )}

      {/* Tool cards inline (matching OpenClaw: always shown, not gated by showThinking) */}
      {hasToolCards &&
        toolCards.map((card, i) => (
          <HistoryToolCard key={`tc-${i}`} card={card} />
        ))}
    </div>
  );
});

// ─── Tool Result Card (for history tool messages) ───────────────────────────

/** Renders tool result messages (only shown when showThinking=true) */
const ToolResultGroupRenderer = memo(function ToolResultGroupRenderer({
  message,
}: {
  message: NormalizedMessage;
}) {
  const toolCards = message.toolCards;
  if (toolCards.length === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      {toolCards.map((card, i) => (
        <HistoryToolCard key={`tr-${i}`} card={card} />
      ))}
    </div>
  );
});

/**
 * Renders a single tool card (call or result) from history.
 * Matches OpenClaw's renderToolCardSidebar pattern:
 * - Short output (<=80 chars): shown inline
 * - Long output: collapsed with preview, expandable
 * - No output: "Completed" status
 */
const HistoryToolCard = memo(function HistoryToolCard({
  card,
}: {
  card: ToolCard;
}) {
  const [expanded, setExpanded] = useState(false);

  const tool = TOOL_LABELS[card.name] ?? { emoji: "🔧", label: card.name };
  const hasText = Boolean(card.text?.trim());
  const isShort = hasText && (card.text?.length ?? 0) <= TOOL_INLINE_THRESHOLD;
  const isLong = hasText && !isShort;

  // Build detail line from args (matching OpenClaw's formatToolDetail)
  const detail = (() => {
    if (!card.args || typeof card.args !== "object") return null;
    const a = card.args as Record<string, unknown>;
    if (a.query) return `"${String(a.query)}"`;
    if (a.path) {
      const p = String(a.path);
      return p.replace(/\/Users\/[^/]+/g, "~").replace(/\/home\/[^/]+/g, "~");
    }
    if (a.file_path) {
      const p = String(a.file_path);
      return p.replace(/\/Users\/[^/]+/g, "~").replace(/\/home\/[^/]+/g, "~");
    }
    if (a.command) {
      const cmd = String(a.command);
      return cmd.length > 60 ? cmd.slice(0, 57) + "…" : cmd;
    }
    if (a.url) return String(a.url);
    if (a.action) return String(a.action);
    return null;
  })();

  return (
    <div className="my-0.5">
      <button
        onClick={isLong ? () => setExpanded(!expanded) : undefined}
        className={cn(
          "flex items-center gap-2 rounded-md bg-muted/50 px-2.5 py-1.5 text-xs text-muted-foreground w-full text-left",
          isLong && "hover:bg-muted/70 cursor-pointer transition-colors",
          !isLong && "cursor-default",
        )}
      >
        {isLong && (
          expanded ? (
            <ChevronDown className="h-3 w-3 shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0" />
          )
        )}
        <span className="shrink-0 text-sm leading-none">{tool.emoji}</span>
        <span className="font-medium">{tool.label}</span>
        {detail && (
          <span className="truncate max-w-[200px] text-muted-foreground/60 font-mono text-[11px]">
            {detail}
          </span>
        )}
        {!hasText && (
          <span className="text-muted-foreground/40 ml-auto">
            <Check className="h-3 w-3 inline" />
          </span>
        )}
      </button>
      {/* Short inline output */}
      {isShort && (
        <div className="ml-6 mt-0.5 text-[11px] font-mono text-muted-foreground/70">
          {card.text}
        </div>
      )}
      {/* Long output: collapsed preview / expanded full */}
      {isLong && !expanded && (
        <div className="ml-6 mt-0.5 text-[11px] font-mono text-muted-foreground/50 truncate max-w-[300px]">
          {getTruncatedPreview(card.text!)}
        </div>
      )}
      {isLong && expanded && (
        <pre className="mt-1 ml-6 overflow-x-auto rounded bg-muted/30 p-2 text-[11px] font-mono text-muted-foreground max-h-[200px] overflow-y-auto">
          {card.text}
        </pre>
      )}
    </div>
  );
});

// ─── Optimistic Message Bubble ──────────────────────────────────────────────

const OptimisticMessageBubble = memo(function OptimisticMessageBubble({
  message,
  images,
  onRetry,
}: {
  message: OptimisticMessage;
  images?: string[];
  onRetry: (msg: OptimisticMessage) => void;
}) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const timeStr = new Date(message.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="flex flex-col gap-0.5 items-end">
      {/* Lightbox overlay */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 cursor-pointer"
          onClick={() => setLightboxUrl(null)}
        >
          <img
            src={lightboxUrl}
            alt="Full size"
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
          />
          <button
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
            onClick={() => setLightboxUrl(null)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Timestamp + status row */}
      <div className="flex items-center gap-1.5 px-1">
        <span className="text-[10px] text-muted-foreground/50">
          {timeStr}
        </span>
        {message.status === "sending" && (
          <Clock className="h-3 w-3 text-muted-foreground/50" />
        )}
        {(message.status === "streaming" || message.status === "sent") && (
          <div className="flex items-center text-blue-400">
            <Check className="h-3 w-3" />
            <Check className="-ml-1.5 h-3 w-3" />
          </div>
        )}
        {message.status === "error" && (
          <button
            onClick={() => onRetry(message)}
            className="flex items-center gap-1 text-destructive hover:text-destructive/80 transition-colors"
            title="Tap to retry"
          >
            <AlertCircle className="h-3 w-3" />
            <span className="text-[10px] font-medium">Retry</span>
          </button>
        )}
      </div>

      <div className="max-w-[85%] space-y-2">
        {/* Image previews */}
        {images && images.length > 0 && (
          <div className="flex flex-wrap justify-end gap-1.5">
            {images.map((url, i) => (
              <img
                key={i}
                src={url}
                alt={`Attached image ${i + 1}`}
                className="max-h-48 max-w-[200px] cursor-pointer rounded-xl border border-white/20 object-cover shadow-sm transition-transform hover:scale-[1.02]"
                onClick={() => setLightboxUrl(url)}
              />
            ))}
          </div>
        )}

        {/* Message bubble */}
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 text-sm text-white leading-relaxed shadow-sm break-words overflow-hidden",
            message.status === "error"
              ? "bg-red-500 dark:bg-red-600"
              : "bg-blue-600 dark:bg-blue-500",
          )}
        >
          <span>{message.text}</span>
        </div>
      </div>
    </div>
  );
});

// ─── Chat Message (AI SDK message rendering) ────────────────────────────────

interface ChatMessageType {
  id: string;
  role: string;
  parts: Array<{
    type: string;
    text?: string;
    toolCallId?: string;
    toolName?: string;
    state?: string;
    input?: unknown;
    approval?: unknown;
    [key: string]: unknown;
  }>;
}

const ChatMessage = memo(function ChatMessage({
  message,
  images,
  isLatest,
  isStreaming,
  showThinking,
  onToolApprove,
  onToolDeny,
}: {
  message: ChatMessageType;
  images?: string[];
  isLatest?: boolean;
  isStreaming?: boolean;
  showThinking?: boolean;
  onToolApprove?: (id: string) => void;
  onToolDeny?: (id: string) => void;
}) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  if (message.role === "user") return null;

  return (
    <div className="flex flex-col gap-1 items-start">
      {/* Lightbox overlay */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 cursor-pointer"
          onClick={() => setLightboxUrl(null)}
        >
          <img
            src={lightboxUrl}
            alt="Full size"
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
          />
          <button
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
            onClick={() => setLightboxUrl(null)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="max-w-[95%] min-w-0 text-sm leading-relaxed">
        {message.parts.map((part, i) => {
          if (part.type === "text") {
            return <MarkdownRenderer key={i} text={part.text ?? ""} />;
          }
          if (
            part.type === "dynamic-tool" ||
            part.type?.startsWith("tool-")
          ) {
            // Always show approval-requested tools; otherwise only when showThinking
            const isApproval = part.state === "approval-requested";
            if (!isApproval && !showThinking) return null;

            const toolName =
              part.toolName ?? part.type.replace(/^tool-/, "");
            const approvalId =
              (part.approval as { approvalId?: string } | undefined)
                ?.approvalId ?? part.toolCallId;
            return (
              <ToolCallCard
                key={i}
                toolName={toolName}
                state={part.state ?? ""}
                args={part.input}
                onApprove={
                  isApproval && onToolApprove
                    ? () => onToolApprove(approvalId ?? "")
                    : undefined
                }
                onDeny={
                  isApproval && onToolDeny
                    ? () => onToolDeny(approvalId ?? "")
                    : undefined
                }
              />
            );
          }
          return null;
        })}
        {/* Streaming cursor */}
        {isStreaming && isLatest && (
          <span className="inline-block h-4 w-0.5 animate-pulse bg-foreground/60 ml-0.5 align-text-bottom" />
        )}
      </div>
    </div>
  );
});

// ─── Markdown Renderer ──────────────────────────────────────────────────────

const markdownComponents: import("react-markdown").Components = {
  code({ className, children, ...props }) {
    const isInline =
      !className &&
      typeof children === "string" &&
      !children.includes("\n");
    if (isInline) {
      return (
        <code
          className="rounded bg-zinc-100 px-1.5 py-0.5 text-[13px] dark:bg-zinc-800"
          {...props}
        >
          {children}
        </code>
      );
    }
    return (
      <pre className="my-2 overflow-x-auto rounded-lg bg-zinc-100 p-3 text-[13px] dark:bg-zinc-900">
        <code className={className} {...props}>
          {children}
        </code>
      </pre>
    );
  },
  pre({ children }) {
    return <>{children}</>;
  },
  p({ children }) {
    return <p className="my-1">{children}</p>;
  },
  a({ href, children }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 underline dark:text-blue-400 break-all"
      >
        {children}
      </a>
    );
  },
  ul({ children }) {
    return <ul className="my-1 list-disc pl-4">{children}</ul>;
  },
  ol({ children }) {
    return <ol className="my-1 list-decimal pl-4">{children}</ol>;
  },
  li({ children }) {
    return <li className="my-0">{children}</li>;
  },
  blockquote({ children }) {
    return (
      <blockquote className="my-2 border-l-2 border-zinc-300 pl-3 italic text-muted-foreground dark:border-zinc-600">
        {children}
      </blockquote>
    );
  },
  table({ children }) {
    return (
      <div className="my-2 overflow-x-auto">
        <table className="min-w-full border-collapse text-sm">
          {children}
        </table>
      </div>
    );
  },
  th({ children }) {
    return (
      <th className="border border-zinc-300 bg-zinc-100 px-2 py-1 text-left font-medium dark:border-zinc-600 dark:bg-zinc-800">
        {children}
      </th>
    );
  },
  td({ children }) {
    return (
      <td className="border border-zinc-300 px-2 py-1 dark:border-zinc-600">
        {children}
      </td>
    );
  },
  h1({ children }) {
    return <h1 className="my-2 text-base font-bold">{children}</h1>;
  },
  h2({ children }) {
    return <h2 className="my-1.5 text-sm font-bold">{children}</h2>;
  },
  h3({ children }) {
    return <h3 className="my-1 text-sm font-semibold">{children}</h3>;
  },
  img({ src, alt }) {
    return (
      <img
        src={src}
        alt={alt ?? ""}
        className="my-2 max-w-full rounded-lg"
      />
    );
  },
};

const MarkdownRenderer = memo(function MarkdownRenderer({
  text,
}: {
  text: string;
}) {
  return (
    <div className="chat-message-content min-w-0 max-w-full overflow-hidden text-sm leading-relaxed [overflow-wrap:break-word]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={markdownComponents}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});

// ─── Tool Call Card (compact, inline) ────────────────────────────────────────

const TOOL_LABELS: Record<string, { emoji: string; label: string }> = {
  Read: { emoji: "📂", label: "Read file" },
  Edit: { emoji: "✏️", label: "Edit file" },
  Write: { emoji: "📝", label: "Write file" },
  exec: { emoji: "⚡", label: "Run command" },
  web_search: { emoji: "🔍", label: "Web search" },
  web_fetch: { emoji: "🌐", label: "Fetch page" },
  browser: { emoji: "🌐", label: "Browser" },
  message: { emoji: "💬", label: "Send message" },
  image: { emoji: "🖼️", label: "Analyze image" },
  tts: { emoji: "🔊", label: "Text to speech" },
  nodes: { emoji: "📱", label: "Node control" },
  canvas: { emoji: "🎨", label: "Canvas" },
  process: { emoji: "⚙️", label: "Process" },
};

const ToolCallCard = memo(function ToolCallCard({
  toolName,
  state,
  args,
  onApprove,
  onDeny,
}: {
  toolName: string;
  state: string;
  args?: unknown;
  onApprove?: () => void;
  onDeny?: () => void;
}) {
  const isApprovalRequested = state === "approval-requested";
  const isRunning =
    state === "call" ||
    state === "input-streaming" ||
    state === "input-available";
  const isComplete = state === "output-available" || state === "result";
  const isError = state === "output-error";

  const tool = TOOL_LABELS[toolName] ?? { emoji: "🔧", label: toolName };

  const brief = (() => {
    if (!args || typeof args !== "object") return null;
    const a = args as Record<string, unknown>;
    if (a.query) return `"${String(a.query)}"`;
    if (a.path) return String(a.path).split("/").pop();
    if (a.file_path) return String(a.file_path).split("/").pop();
    if (a.command) {
      const cmd = String(a.command);
      return cmd.length > 50 ? cmd.slice(0, 50) + "…" : cmd;
    }
    if (a.url) return String(a.url);
    return null;
  })();

  if (!isApprovalRequested) {
    return (
      <div className="my-1.5 flex items-center gap-2 rounded-md bg-muted/50 px-2.5 py-1.5 text-xs text-muted-foreground">
        {isRunning ? (
          <Loader2 className="h-3 w-3 animate-spin shrink-0" />
        ) : isComplete ? (
          <Check className="h-3 w-3 text-green-600 shrink-0" />
        ) : isError ? (
          <Ban className="h-3 w-3 text-destructive shrink-0" />
        ) : (
          <span className="shrink-0 text-sm leading-none">{tool.emoji}</span>
        )}
        <span className="font-medium">{tool.label}</span>
        {brief && (
          <span className="truncate max-w-[200px] text-muted-foreground/60">
            {brief}
          </span>
        )}
      </div>
    );
  }

  // Approval card
  return (
    <div className="my-1.5 rounded-lg border border-amber-500/40 bg-amber-50/50 dark:bg-amber-950/20 p-2.5 text-xs">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <ShieldQuestion className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
        <span className="font-medium font-mono">{toolName}</span>
        <span className="text-muted-foreground/60">Requires approval</span>
      </div>

      {args != null &&
      typeof args === "object" &&
      Object.keys(args as Record<string, unknown>).length > 0 ? (
        <pre className="mt-1.5 overflow-x-auto rounded bg-background dark:bg-muted/50 p-1.5 text-[11px] font-mono text-muted-foreground">
          {JSON.stringify(args, null, 2)}
        </pre>
      ) : null}

      {onApprove && onDeny && (
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={onApprove}
            className="inline-flex items-center gap-1 rounded-md bg-green-600 px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-green-700"
          >
            <Check className="h-3 w-3" />
            Approve
          </button>
          <button
            onClick={onDeny}
            className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-red-700"
          >
            <Ban className="h-3 w-3" />
            Deny
          </button>
        </div>
      )}
    </div>
  );
});
