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
  History,
  MessageSquarePlus,
  Paperclip,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/lib/stores/workspace";
import { useGatewayStore } from "@/lib/stores/gateway";
import { ChannelBadge } from "./channel-badge";

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

function useHistoryMessages(isOpen: boolean) {
  const [history, setHistory] = useState<HistoryMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!isOpen || loadedRef.current) return;
    loadedRef.current = true;
    setLoading(true);

    fetch("/api/gateway/history?limit=20")
      .then((r) => r.json())
      .then((data) => {
        setHistory(data.messages ?? []);
      })
      .catch(() => {
        // Silent — gateway may not support history
      })
      .finally(() => setLoading(false));
  }, [isOpen]);

  return { history, loading };
}

// ─── Singleton Chat Instance ────────────────────────────────────────────────
// Persists chat state across component mount/unmount cycles (HMR, layout re-renders)

/** Create a transport that includes the current page context in the request body */
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
  const { history, loading: historyLoading } = useHistoryMessages(panelVisible);

  const [chatInstance, setChatInstance] = useState(sharedChat);
  const { messages, sendMessage, addToolApprovalResponse, status, stop, error } =
    useChat({ chat: chatInstance });

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isLoading = status === "streaming" || status === "submitted";

  // ─── Image upload state ─────────────────────────────────────────────
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);
  const [messageImages, setMessageImages] = useState<Record<string, string[]>>({});
  const [isDragOver, setIsDragOver] = useState(false);
  const pendingSendImages = useRef<string[]>([]);

  // Associate pending images with the latest user message after send
  useEffect(() => {
    if (pendingSendImages.current.length === 0) return;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        const id = messages[i].id;
        if (!messageImages[id]) {
          setMessageImages((prev) => ({ ...prev, [id]: pendingSendImages.current }));
          pendingSendImages.current = [];
        }
        break;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

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

  // Paste handler (images from clipboard)
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

  // Drag and drop handlers
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
    // Only leave if we actually leave the container
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
      // Reset so re-selecting the same file triggers onChange
      e.target.value = "";
    },
    [addImages],
  );

  // New chat handler — create a fresh Chat instance
  const handleNewChat = useCallback(() => {
    const newChat = new Chat({ transport: createChatTransport() });
    setChatInstance(newChat);
    setAttachedImages([]);
    setMessageImages({});
    pendingImagePayload = [];
    pendingSendImages.current = [];
    if (inputRef.current) {
      inputRef.current.value = "";
      inputRef.current.style.height = "auto";
      inputRef.current.focus();
    }
  }, []);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      const el = scrollRef.current;
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

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

  // Focus input when panel opens (with small delay for animation)
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

      // Set module-level payload so the transport body() picks it up
      const imageUrls = attachedImages.map((img) => img.dataUrl);
      pendingImagePayload = imageUrls;
      if (imageUrls.length > 0) {
        pendingSendImages.current = imageUrls;
      }

      console.log("[chat] Sending message:", trimmed, imageUrls.length > 0 ? `(+${imageUrls.length} images)` : "");
      try {
        await sendMessage({ text: trimmed });
        console.log("[chat] Message sent successfully");
      } catch (err) {
        console.error("[chat] sendMessage error:", err);
      }

      // Clear
      pendingImagePayload = [];
      setAttachedImages([]);
      if (inputRef.current) {
        inputRef.current.value = "";
        inputRef.current.style.height = "auto";
      }
    },
    [sendMessage, attachedImages],
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
        // Read directly from the target element to ensure we get the current value
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

  // For desktop "default" variant, hide (don't unmount) when closed
  // to preserve useChat state across open/close cycles
  const isHidden = variant === "default" && !chatPanelOpen;

  const hasMessages = messages.length > 0 || history.length > 0;
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
        // Hidden when closed (keeps state alive)
        isHidden && "hidden",
        // Desktop: fixed-width side panel
        variant === "default" &&
          "h-full w-[400px] shrink-0 border-l shadow-[-4px_0_12px_rgba(0,0,0,0.03)] dark:shadow-[-4px_0_12px_rgba(0,0,0,0.2)]",
        // Sheet: fill the sheet container
        isSheet && "h-full w-full",
        // Fullscreen (mobile): fill viewport
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
      {/* Header */}
      <div className={cn(
        "flex shrink-0 items-center justify-between border-b px-4",
        isFullscreen ? "h-14" : "h-12",
      )}>
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Chat</span>
          <StatusDot connected={connected} agentStatus={agentStatus} />
        </div>
        <div className="flex items-center gap-1">
          {/* New Chat button */}
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleNewChat}
              title="New Chat"
            >
              <MessageSquarePlus className="h-4 w-4" />
            </Button>
          )}
          {/* Only show close button on desktop/sheet (mobile uses bottom tabs) */}
          {!isFullscreen && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setChatPanelOpen(false)}
              title="Close chat (⌘⇧L)"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="flex flex-col gap-4 p-4">
          {!hasMessages && !historyLoading && (
            <EmptyState
              pageTitle={pageTitle}
              suggestions={suggestions}
              onSuggestionClick={handleSend}
            />
          )}

          {/* History loading indicator */}
          {historyLoading && (
            <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span className="text-xs">Loading history…</span>
            </div>
          )}

          {/* Cross-channel history messages */}
          {history.length > 0 && (
            <>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60 select-none">
                <History className="h-3 w-3" />
                <span>Recent history</span>
                <div className="flex-1 border-t border-dashed border-muted-foreground/20" />
              </div>
              {history.map((msg, i) => (
                <HistoryMessageBubble key={`hist-${i}`} message={msg} />
              ))}
              {messages.length > 0 && (
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60 select-none py-1">
                  <div className="flex-1 border-t border-muted-foreground/20" />
                  <span>This session</span>
                  <div className="flex-1 border-t border-muted-foreground/20" />
                </div>
              )}
            </>
          )}

          {messages.map((message) => (
            <ChatMessage
              key={message.id}
              message={message}
              images={messageImages[message.id]}
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
          ))}

          {/* Typing / streaming indicator */}
          {isLoading && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span className="text-xs">
                {status === "streaming" ? "Agent is typing…" : "Thinking…"}
              </span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">Error</p>
                <p className="text-xs opacity-80">
                  {error.message.includes("API key")
                    ? "No OpenAI API key configured. Set OPENAI_API_KEY in your environment to enable chat."
                    : error.message}
                </p>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

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

      {/* Input — safe area padding on mobile, keyboard-aware */}
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

        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />

          {/* Paperclip button */}
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

        {/* Suggestion chips */}
        {hasMessages && pageTitle && (
          <div className="mt-2 flex flex-wrap gap-1.5">
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
      </div>
    </div>
  );
}

// ─── Memoized Sub-components ────────────────────────────────────────────────

function StatusDot({
  connected,
  agentStatus,
}: {
  connected: boolean;
  agentStatus: string;
}) {
  const color = connected
    ? agentStatus === "active"
      ? "bg-green-500"
      : agentStatus === "thinking"
        ? "bg-yellow-400"
        : "bg-[#00a67e]"
    : "bg-zinc-300 dark:bg-zinc-600";

  const animate =
    connected && (agentStatus === "active" || agentStatus === "thinking");

  return (
    <span
      className="relative flex h-2 w-2"
      title={connected ? agentStatus : "disconnected"}
    >
      {animate && (
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
  onToolApprove,
  onToolDeny,
}: {
  message: ChatMessageType;
  images?: string[];
  onToolApprove?: (id: string) => void;
  onToolDeny?: (id: string) => void;
}) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  return (
    <div
      className={cn(
        "flex flex-col gap-1",
        message.role === "user" ? "items-end" : "items-start",
      )}
    >
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

      {message.role === "user" ? (
        <div className="max-w-[85%] space-y-2">
          {/* Inline images */}
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
          <div className="rounded-2xl bg-blue-600 dark:bg-blue-500 px-4 py-2.5 text-sm text-white leading-relaxed shadow-sm">
            {message.parts.map((part, i) => {
              if (part.type === "text") {
                return <span key={i}>{part.text}</span>;
              }
              return null;
            })}
          </div>
        </div>
      ) : (
        <div className="max-w-[95%] text-sm leading-relaxed">
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
        </div>
      )}
    </div>
  );
});

const MarkdownRenderer = memo(function MarkdownRenderer({
  text,
}: {
  text: string;
}) {
  return (
    <div className="prose prose-sm prose-zinc dark:prose-invert max-w-none [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0 [&_pre]:my-2 [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_code]:text-[13px] [&_pre]:rounded-lg [&_pre]:bg-zinc-100 [&_pre]:dark:bg-zinc-900 [&_pre]:p-3 [&_code]:before:content-[''] [&_code]:after:content-['']">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
});

// ─── History Message ─────────────────────────────────────────────────────────

const HistoryMessageBubble = memo(function HistoryMessageBubble({
  message,
}: {
  message: HistoryMessage;
}) {
  const text =
    typeof message.content === "string"
      ? message.content
      : (message.content ?? [])
          .filter((p) => p.type === "text" && p.text)
          .map((p) => p.text)
          .join("\n");

  if (!text) return null;

  const timeStr = message.timestamp
    ? new Date(message.timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div
      className={cn(
        "flex flex-col gap-0.5 opacity-70",
        message.role === "user" ? "items-end" : "items-start",
      )}
    >
      {/* Channel badge + timestamp */}
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
        <div className="max-w-[85%] rounded-2xl bg-blue-600/60 dark:bg-blue-500/40 px-4 py-2 text-sm text-white leading-relaxed">
          {text}
        </div>
      ) : (
        <div className="max-w-[95%] text-sm leading-relaxed opacity-85">
          <MarkdownRenderer text={text} />
        </div>
      )}
    </div>
  );
});

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

  return (
    <div
      className={cn(
        "my-1 rounded-lg border p-2.5 text-xs",
        isApprovalRequested
          ? "border-amber-500/40 bg-amber-50/50 dark:bg-amber-950/20"
          : "bg-muted/50",
      )}
    >
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {isApprovalRequested ? (
          <ShieldQuestion className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
        ) : isRunning ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : state === "output-available" ? (
          <Check className="h-3 w-3 text-green-600" />
        ) : state === "output-error" ? (
          <Ban className="h-3 w-3 text-destructive" />
        ) : (
          <Wrench className="h-3 w-3" />
        )}
        <span className="font-medium font-mono">{toolName}</span>
        <span className="text-muted-foreground/60">
          {isApprovalRequested
            ? "Requires approval"
            : isRunning
              ? "Running…"
              : state === "output-available"
                ? "Complete"
                : state === "output-error"
                  ? "Failed"
                  : state === "result"
                    ? "Complete"
                    : state}
        </span>
      </div>

      {args != null &&
      typeof args === "object" &&
      Object.keys(args as Record<string, unknown>).length > 0 ? (
        <pre className="mt-1.5 overflow-x-auto rounded bg-background dark:bg-muted/50 p-1.5 text-[11px] font-mono text-muted-foreground">
          {JSON.stringify(args, null, 2)}
        </pre>
      ) : null}

      {isApprovalRequested && onApprove && onDeny && (
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
