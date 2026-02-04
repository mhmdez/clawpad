"use client";

import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";
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
  role: "user" | "assistant" | "system";
  content: string | ContentPart[];
  timestamp?: number;
  channel?: string;
  sessionKey?: string;
}

interface ContentPart {
  type: string;
  text?: string;
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

// ─── Unified Display Message ────────────────────────────────────────────────

interface UnifiedMessage {
  id: string;
  kind: "history" | "optimistic" | "ai-streaming";
  role: "user" | "assistant" | "system";
  // For history messages
  historyMessage?: HistoryMessage;
  // For optimistic messages
  optimisticMessage?: OptimisticMessage;
  // For AI SDK messages (streaming assistant response)
  aiMessage?: ChatMessageType;
  // Timestamp for sorting
  timestamp: number;
}

// ─── History Hook ───────────────────────────────────────────────────────────

function useHistoryMessages(isOpen: boolean, lastSentAtRef: React.RefObject<number>) {
  const [history, setHistory] = useState<HistoryMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const loadedRef = useRef(false);

  const fetchHistory = useCallback(() => {
    return fetch("/api/gateway/history?limit=20")
      .then((r) => r.json())
      .then((data) => {
        setHistory(data.messages ?? []);
      })
      .catch(() => {
        // Silent — gateway may not support history
      });
  }, []);

  // Wrapped refetch that respects suppression window
  const refetchHistory = useCallback(() => {
    if (Date.now() - lastSentAtRef.current < 5000) {
      // Suppress refetch within 5s of sending to prevent flicker
      return Promise.resolve();
    }
    return fetchHistory();
  }, [fetchHistory, lastSentAtRef]);

  useEffect(() => {
    if (!isOpen || loadedRef.current) return;
    loadedRef.current = true;
    setLoading(true);
    fetchHistory().finally(() => setLoading(false));
  }, [isOpen, fetchHistory]);

  return { history, loading, refetchHistory };
}

// ─── Singleton Chat Instance ────────────────────────────────────────────────

function createChatTransport() {
  return new DefaultChatTransport({
    api: "/api/chat",
    body: () => ({
      pageContext: useWorkspaceStore.getState().activePage ?? undefined,
      images: pendingImagePayload.length > 0 ? [...pendingImagePayload] : undefined,
    }),
  });
}

const sharedTransport = createChatTransport();
const sharedChat = new Chat({ transport: sharedTransport });

interface ChatPanelProps {
  /** "default" = desktop side panel, "sheet" = tablet sheet, "fullscreen" = mobile */
  variant?: "default" | "sheet" | "fullscreen";
}

export function ChatPanel({ variant = "default" }: ChatPanelProps) {
  const { chatPanelOpen, setChatPanelOpen, activePage } = useWorkspaceStore();
  const connected = useGatewayStore((s) => s.connected);
  const agentStatus = useGatewayStore((s) => s.agentStatus);

  const panelVisible = chatPanelOpen || variant !== "default";

  // ─── SSE refetch suppression ──────────────────────────────────────
  const lastSentAtRef = useRef<number>(0);

  const { history, loading: historyLoading, refetchHistory } = useHistoryMessages(panelVisible, lastSentAtRef);

  const [chatInstance, setChatInstance] = useState(sharedChat);
  const { messages, sendMessage, addToolApprovalResponse, status, stop, error } =
    useChat({ chat: chatInstance });

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isLoading = status === "streaming" || status === "submitted";

  // ─── Optimistic messages state ──────────────────────────────────────
  const [optimisticMessages, setOptimisticMessages] = useState<OptimisticMessage[]>([]);

  // Track which optimistic user message the AI response corresponds to
  const currentOptimisticIdRef = useRef<string | null>(null);

  // ─── Sync AI SDK status with optimistic message status ─────────────
  useEffect(() => {
    const optId = currentOptimisticIdRef.current;
    if (!optId) return;

    if (status === "streaming") {
      // AI started responding — mark the user message as 'sent'
      setOptimisticMessages((prev) =>
        prev.map((m) =>
          m.id === optId && m.status === "sending"
            ? { ...m, status: "sent" as const }
            : m,
        ),
      );
    } else if (status === "ready") {
      // Streaming completed — mark as 'sent' (final)
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
  const prevMessageCountRef = useRef(0);
  const [unreadCount, setUnreadCount] = useState(0);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 100;
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    if (isAtBottomRef.current) setUnreadCount(0);
  }, []);

  // ─── Build unified message list ────────────────────────────────────
  const unifiedMessages = useMemo(() => {
    const result: UnifiedMessage[] = [];

    // Add history messages
    for (let i = 0; i < history.length; i++) {
      const msg = history[i];
      // Skip tool result messages
      if ((msg.role as string) === "toolResult" || (msg.role as string) === "tool") continue;

      const text =
        typeof msg.content === "string"
          ? msg.content
          : (msg.content ?? [])
              .filter((p) => p.type === "text" && p.text)
              .map((p) => p.text)
              .join("\n");

      if (!text || text.length < 2) continue;
      if (text.startsWith('[{"type":"toolCall"') || text.startsWith('[{"type":"tool_use"')) continue;

      result.push({
        id: `hist-${i}`,
        kind: "history",
        role: msg.role,
        historyMessage: msg,
        timestamp: msg.timestamp ?? i,
      });
    }

    // Add optimistic user messages
    for (const opt of optimisticMessages) {
      // Check for deduplication against history: same role + similar text + close timestamp
      const isDuplicate = result.some((u) => {
        if (u.kind !== "history" || u.role !== opt.role) return false;
        const hMsg = u.historyMessage;
        if (!hMsg) return false;
        const hText =
          typeof hMsg.content === "string"
            ? hMsg.content
            : (hMsg.content ?? [])
                .filter((p) => p.type === "text" && p.text)
                .map((p) => p.text)
                .join("\n");
        // Match if text is very similar and timestamp within 60s
        const textMatch = hText.trim() === opt.text.trim();
        const timeClose = hMsg.timestamp
          ? Math.abs(hMsg.timestamp - opt.timestamp) < 60000
          : false;
        return textMatch && timeClose;
      });

      if (!isDuplicate) {
        result.push({
          id: opt.id,
          kind: "optimistic",
          role: opt.role,
          optimisticMessage: opt,
          timestamp: opt.timestamp,
        });
      }
    }

    // Add AI SDK streaming assistant messages (only the latest one, if currently streaming)
    if (messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role === "assistant" && isLoading) {
        result.push({
          id: `ai-stream-${lastMsg.id}`,
          kind: "ai-streaming",
          role: "assistant",
          aiMessage: lastMsg as ChatMessageType,
          timestamp: Date.now(),
        });
      } else if (lastMsg.role === "assistant" && !isLoading) {
        // Completed assistant response — show it
        result.push({
          id: `ai-done-${lastMsg.id}`,
          kind: "ai-streaming",
          role: "assistant",
          aiMessage: lastMsg as ChatMessageType,
          timestamp: Date.now() - 1, // slightly before "now" so it sorts after user msg
        });
      }

      // Also add any tool call messages from the AI SDK (non-last, or tool parts in last)
      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i] as ChatMessageType;
        if (msg.role !== "assistant") continue;
        if (i === messages.length - 1) continue; // already handled above
        const hasToolParts = msg.parts?.some(
          (p) => p.type === "dynamic-tool" || p.type?.startsWith("tool-"),
        );
        if (hasToolParts) {
          result.push({
            id: `ai-tool-${msg.id}`,
            kind: "ai-streaming",
            role: "assistant",
            aiMessage: msg,
            timestamp: Date.now() - (messages.length - i),
          });
        }
      }
    }

    // Sort by timestamp
    result.sort((a, b) => a.timestamp - b.timestamp);

    return result;
  }, [history, optimisticMessages, messages, isLoading]);

  // Auto-scroll when unified messages change (if at bottom)
  useEffect(() => {
    const totalMessages = unifiedMessages.length;
    if (isAtBottomRef.current) {
      requestAnimationFrame(() => scrollToBottom("smooth"));
    } else if (totalMessages > prevMessageCountRef.current && prevMessageCountRef.current > 0) {
      setUnreadCount((prev) => prev + (totalMessages - prevMessageCountRef.current));
    }
    prevMessageCountRef.current = totalMessages;
  }, [unifiedMessages.length, scrollToBottom]);

  // Scroll to bottom on mount / history load complete
  useEffect(() => {
    if (!historyLoading) {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
      });
    }
  }, [historyLoading]);

  // Keep scrolled during streaming
  useEffect(() => {
    if (isLoading && isAtBottomRef.current) {
      requestAnimationFrame(() => scrollToBottom("smooth"));
    }
  }, [isLoading, messages, scrollToBottom]);

  // ─── SSE subscription for real-time cross-channel messages ──────────
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
  const [optimisticImageMap, setOptimisticImageMap] = useState<Record<string, string[]>>({});
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
        if (item.kind === "file" && ACCEPTED_IMAGE_TYPES.includes(item.type)) {
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

  // New chat handler — create a fresh Chat instance
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

  // Keyboard shortcut: Cmd+Shift+L (desktop only)
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
      const trimmed = text.trim() || (hasImages ? "What's in this image?" : "");
      if (!trimmed) return;

      // ── Optimistic insert ──
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

      // Clear input immediately
      setAttachedImages([]);
      if (inputRef.current) {
        inputRef.current.value = "";
        inputRef.current.style.height = "auto";
      }

      // ── Send via AI SDK ──
      pendingImagePayload = imageUrls;

      try {
        await sendMessage({ text: trimmed });
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

  // ─── Retry handler ──────────────────────────────────────────────────
  const handleRetry = useCallback(
    (optMsg: OptimisticMessage) => {
      // Remove the errored message and re-send
      setOptimisticMessages((prev) => prev.filter((m) => m.id !== optMsg.id));
      // Re-create attached images if any
      if (optMsg.images && optMsg.images.length > 0) {
        const fakeAttached: AttachedImage[] = optMsg.images.map((url, i) => ({
          id: crypto.randomUUID(),
          dataUrl: url,
          name: `image-${i}`,
        }));
        setAttachedImages(fakeAttached);
        // Need to immediately send — use a microtask
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
  const hasMessages = unifiedMessages.length > 0;
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

      {/* ── Clean Header ── */}
      <div className={cn(
        "flex shrink-0 items-center justify-between border-b px-4",
        isFullscreen ? "h-14" : "h-12",
      )}>
        <div className="flex items-center gap-2.5">
          <Sparkles className="h-4 w-4 shrink-0 text-violet-500" />
          <span className="text-sm font-medium">Chat</span>
          <ConnectionDot connected={connected} agentStatus={agentStatus} />
        </div>
        <div className="flex items-center gap-1">
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

      {/* ── Agent Status Bar (inline, below header) ── */}
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

          {/* Unified message stream */}
          {unifiedMessages.map((unified) => {
            if (unified.kind === "history" && unified.historyMessage) {
              return (
                <HistoryMessageBubble
                  key={unified.id}
                  message={unified.historyMessage}
                />
              );
            }

            if (unified.kind === "optimistic" && unified.optimisticMessage) {
              return (
                <OptimisticMessageBubble
                  key={unified.id}
                  message={unified.optimisticMessage}
                  images={optimisticImageMap[unified.optimisticMessage.id]}
                  onRetry={handleRetry}
                />
              );
            }

            if (unified.kind === "ai-streaming" && unified.aiMessage) {
              return (
                <ChatMessage
                  key={unified.id}
                  message={unified.aiMessage}
                  isLatest={true}
                  isStreaming={isLoading && unified.aiMessage.role === "assistant"}
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

          {/* Streaming indicator — ChatGPT-style inline */}
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

          {/* Error banner (general, not per-message) */}
          {error && !optimisticMessages.some((m) => m.status === "error") && (
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
          isFullscreen && "pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]",
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
            placeholder={attachedImages.length > 0 ? "Add a message or send…" : "Ask your agent…"}
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

  return (
    <div className="flex flex-col gap-1 items-end">
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

        {/* Status indicator */}
        <div className="flex items-center justify-end gap-1 px-1">
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
  onToolApprove,
  onToolDeny,
}: {
  message: ChatMessageType;
  images?: string[];
  isLatest?: boolean;
  isStreaming?: boolean;
  onToolApprove?: (id: string) => void;
  onToolDeny?: (id: string) => void;
}) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // Only render assistant messages from AI SDK (user messages are handled by OptimisticMessageBubble)
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
                  part.state === "approval-requested" && onToolApprove
                    ? () => onToolApprove(approvalId ?? "")
                    : undefined
                }
                onDeny={
                  part.state === "approval-requested" && onToolDeny
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
    const isInline = !className && typeof children === "string" && !children.includes("\n");
    if (isInline) {
      return (
        <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-[13px] dark:bg-zinc-800" {...props}>
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
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline dark:text-blue-400 break-all">
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
    return <blockquote className="my-2 border-l-2 border-zinc-300 pl-3 italic text-muted-foreground dark:border-zinc-600">{children}</blockquote>;
  },
  table({ children }) {
    return (
      <div className="my-2 overflow-x-auto">
        <table className="min-w-full border-collapse text-sm">{children}</table>
      </div>
    );
  },
  th({ children }) {
    return <th className="border border-zinc-300 bg-zinc-100 px-2 py-1 text-left font-medium dark:border-zinc-600 dark:bg-zinc-800">{children}</th>;
  },
  td({ children }) {
    return <td className="border border-zinc-300 px-2 py-1 dark:border-zinc-600">{children}</td>;
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
    return <img src={src} alt={alt ?? ""} className="my-2 max-w-full rounded-lg" />;
  },
};

const MarkdownRenderer = memo(function MarkdownRenderer({
  text,
}: {
  text: string;
}) {
  return (
    <div className="chat-message-content min-w-0 max-w-full overflow-hidden text-sm leading-relaxed [overflow-wrap:break-word]">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {text}
      </ReactMarkdown>
    </div>
  );
});

// ─── History Message ─────────────────────────────────────────────────────────

const HistoryMessageBubble = memo(function HistoryMessageBubble({
  message,
}: {
  message: HistoryMessage;
}) {
  if ((message.role as string) === "toolResult" || (message.role as string) === "tool") return null;

  const text =
    typeof message.content === "string"
      ? message.content
      : (message.content ?? [])
          .filter((p) => p.type === "text" && p.text)
          .map((p) => p.text)
          .join("\n");

  if (!text || text.length < 2) return null;
  if (text.startsWith('[{"type":"toolCall"') || text.startsWith('[{"type":"tool_use"')) return null;

  const timeStr = message.timestamp
    ? new Date(message.timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div
      className={cn(
        "flex flex-col gap-0.5",
        message.role === "user" ? "items-end" : "items-start",
      )}
    >
      <div className="flex items-center gap-1.5 px-1">
        <ChannelBadge
          channel={message.channel}
          sessionKey={message.sessionKey}
        />
        {timeStr && (
          <span className="text-[10px] text-muted-foreground/50">{timeStr}</span>
        )}
      </div>

      {message.role === "user" ? (
        <div className="max-w-[85%] rounded-2xl bg-blue-600/60 dark:bg-blue-500/40 px-4 py-2 text-sm text-white leading-relaxed break-words overflow-hidden">
          {text}
        </div>
      ) : (
        <div className="max-w-[95%] min-w-0 text-sm leading-relaxed opacity-85">
          <MarkdownRenderer text={text} />
        </div>
      )}
    </div>
  );
});

// ─── Tool Call Card (compact, inline) ────────────────────────────────────────

/** Human-friendly tool name mapping */
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

  // Build a brief description from args
  const brief = (() => {
    if (!args || typeof args !== "object") return null;
    const a = args as Record<string, unknown>;
    // web_search
    if (a.query) return `"${String(a.query)}"`;
    // Read/Edit/Write
    if (a.path) return String(a.path).split("/").pop();
    if (a.file_path) return String(a.file_path).split("/").pop();
    // exec
    if (a.command) {
      const cmd = String(a.command);
      return cmd.length > 50 ? cmd.slice(0, 50) + "…" : cmd;
    }
    // browser
    if (a.url) return String(a.url);
    return null;
  })();

  // Compact card for non-approval tools
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
