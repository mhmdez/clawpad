"use client";

import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";
import { useChat } from "@ai-sdk/react";
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
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/lib/stores/workspace";
import { useGatewayStore } from "@/lib/stores/gateway";
import { ChannelBadge } from "./channel-badge";

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
  const fetched = useRef(false);

  useEffect(() => {
    if (!isOpen || fetched.current) return;
    fetched.current = true;
    setLoading(true);

    fetch("/api/gateway/history?limit=50")
      .then((res) => (res.ok ? res.json() : { messages: [] }))
      .then((data: { messages?: HistoryMessage[] }) => {
        setHistory(data.messages ?? []);
      })
      .catch(() => {
        setHistory([]);
      })
      .finally(() => setLoading(false));
  }, [isOpen]);

  return { history, loading };
}

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

  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/chat" }),
    [],
  );

  const { messages, sendMessage, addToolApprovalResponse, status, stop, error } =
    useChat({ transport });

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isLoading = status === "streaming" || status === "submitted";

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

  // Focus input when panel opens
  useEffect(() => {
    if ((chatPanelOpen || variant !== "default") && inputRef.current) {
      inputRef.current.focus();
    }
  }, [chatPanelOpen, variant]);

  const handleSend = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      sendMessage({ text: text.trim() });
      if (inputRef.current) {
        inputRef.current.value = "";
        inputRef.current.style.height = "auto";
      }
    },
    [sendMessage],
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
        if (inputRef.current) {
          handleSend(inputRef.current.value);
        }
      }
    },
    [handleSend],
  );

  const handleInput = useCallback(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`;
  }, []);

  // For desktop "default" variant, respect chatPanelOpen
  if (variant === "default" && !chatPanelOpen) return null;

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
      className={cn(
        "flex flex-col bg-white dark:bg-background",
        // Desktop: fixed-width side panel
        variant === "default" &&
          "h-full w-[400px] shrink-0 border-l shadow-[-4px_0_12px_rgba(0,0,0,0.03)]",
        // Sheet: fill the sheet container
        isSheet && "h-full w-full",
        // Fullscreen (mobile): fill viewport
        isFullscreen && "h-full w-full",
      )}
    >
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Chat</span>
          <StatusDot connected={connected} agentStatus={agentStatus} />
        </div>
        {/* Only show close button on desktop/sheet (mobile uses bottom tabs) */}
        {!isFullscreen && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setChatPanelOpen(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
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

          {/* Typing indicator */}
          {isLoading &&
            (messages.length === 0 ||
              messages[messages.length - 1]?.role === "user") && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span className="text-xs">Thinking…</span>
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

      {/* Input — safe area padding on mobile */}
      <div
        className={cn(
          "shrink-0 border-t p-3",
          isFullscreen && "pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]",
        )}
      >
        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            onKeyDown={handleKeyDown}
            onInput={
              handleInput as unknown as React.FormEventHandler<HTMLTextAreaElement>
            }
            placeholder="Ask your agent…"
            rows={2}
            className={cn(
              "flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm",
              "placeholder:text-muted-foreground",
              "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
              "max-h-[150px]",
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
    : "bg-zinc-300";

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
  onToolApprove,
  onToolDeny,
}: {
  message: ChatMessageType;
  onToolApprove?: (id: string) => void;
  onToolDeny?: (id: string) => void;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1",
        message.role === "user" ? "items-end" : "items-start",
      )}
    >
      {message.role === "user" ? (
        <div className="max-w-[85%] rounded-2xl bg-[hsl(var(--primary))] px-4 py-2.5 text-sm text-primary-foreground leading-relaxed">
          {message.parts.map((part, i) => {
            if (part.type === "text") {
              return <span key={i}>{part.text}</span>;
            }
            return null;
          })}
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
        <div className="max-w-[85%] rounded-2xl bg-[hsl(var(--primary))]/60 px-4 py-2 text-sm text-primary-foreground leading-relaxed">
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
        <pre className="mt-1.5 overflow-x-auto rounded bg-background p-1.5 text-[11px] font-mono text-muted-foreground">
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
