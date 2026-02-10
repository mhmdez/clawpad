"use client";

import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, useId, memo } from "react";
import { useChat, Chat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  X,
  Sparkles,
  Loader2,
  AlertCircle,
  Wrench,
  FileText,
  FilePenLine,
  FileOutput,
  Terminal,
  Search,
  Globe,
  MessageSquare,
  Image as ImageIcon,
  Volume2,
  Network,
  Palette,
  Cpu,
  Check,
  Ban,
  ShieldQuestion,
  MessageSquarePlus,
  Paperclip,
  ArrowDown,
  ArrowUp,
  AtSign,
  Plus,
  Clock,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/lib/stores/workspace";
import { useGatewayStore } from "@/lib/stores/gateway";
import { useHeartbeatStore, type HeartbeatEvent } from "@/lib/stores/heartbeat";
import { useChangesStore } from "@/lib/stores/changes";
import { stripReasoningTagsFromText } from "@/lib/text/reasoning-tags";
import type { AiActionType } from "@/lib/stores/ai-actions";
import { ChangeLip, type ChangeLipStatus } from "@/components/chat/change-lip";
import { ChannelBadge } from "./channel-badge";

// ─── Image Upload Helpers ────────────────────────────────────────────────────

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

/** Module-level bucket so the singleton transport can read pending images */
let pendingImagePayload: string[] = [];
let pendingContextPayload: ChatContextPayload | null = null;
let activeSessionKey = "main";

function setActiveSessionKey(next: string) {
  activeSessionKey = next || "main";
}

interface AiActionEventDetail {
  messageId?: string;
  action?: AiActionType;
  selection?: string;
  pagePath?: string;
  message?: string;
}

function buildAiActionPrompt(action: AiActionType, target: string): string {
  switch (action) {
    case "improve":
      return `Improve the writing of the ${target}. Return only the improved text.`;
    case "simplify":
      return `Simplify the ${target} while preserving meaning. Return only the simplified text.`;
    case "expand":
      return `Expand the ${target} with more detail while preserving meaning. Return only the expanded text.`;
    case "summarize":
      return `Summarize the ${target} concisely. Return only the summary.`;
    case "fix-grammar":
      return `Fix grammar, spelling, and punctuation in the ${target}. Return only the corrected text.`;
    case "continue":
      return `Continue writing from the ${target}. Return only the continuation.`;
    default:
      return `Please help with the ${target}.`;
  }
}

function buildAiActionMessage(
  detail: AiActionEventDetail,
  fallbackPagePath?: string | null,
): string | null {
  if (detail.message && detail.message.trim()) {
    const parts = [detail.message.trim()];
    if (detail.messageId?.trim()) {
      parts.push(`[message_id: ${detail.messageId.trim()}]`);
    }
    return parts.join("\n\n");
  }
  if (!detail.action) return null;

  const selection = detail.selection?.trim() ?? "";
  const pagePath = (detail.pagePath ?? fallbackPagePath ?? "").trim();
  const hasSelection = selection.length > 0;
  const target =
    detail.action === "continue"
      ? hasSelection
        ? "context below"
        : "referenced page"
      : hasSelection
        ? "selected text"
        : "referenced page";

  const parts = [buildAiActionPrompt(detail.action, target)];
  if (pagePath) parts.push(`Reference: ${pagePath}`);
  if (selection) {
    parts.push(`Selected text:\n"""\n${selection}\n"""`);
  }
  if (detail.messageId?.trim()) {
    parts.push(`[message_id: ${detail.messageId.trim()}]`);
  }
  return parts.join("\n\n");
}

interface AttachedImage {
  id: string;
  dataUrl: string;
  name: string;
}

interface PageRef {
  title: string;
  path: string;
  space?: string;
  modified?: string;
  snippet?: string;
}

interface ChatContextPayload {
  activePage?: PageRef;
  attachedPages?: PageRef[];
  scope?: "current" | "custom" | "all";
}

function formatPageTitleFromPath(path: string): string {
  const base = path.split("/").pop() ?? path;
  const trimmed = base.replace(/\.md$/, "");
  return trimmed
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function normalizePageRef(input: Partial<PageRef> & { path: string }): PageRef {
  return {
    title: input.title?.trim() || formatPageTitleFromPath(input.path),
    path: input.path,
    space: input.space,
    modified: input.modified,
    snippet: input.snippet,
  };
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

// ─── Tool Stream Types (from agent events) ─────────────────────────────────

interface ToolStreamEntry {
  toolCallId: string;
  runId: string;
  sessionKey?: string;
  name: string;
  args?: unknown;
  output?: string;
  phase: "start" | "update" | "result" | "error" | "unknown";
  startedAt: number;
  updatedAt: number;
}

// ─── Text Processing (matching OpenClaw's message-extract.ts) ───────────────

const ENVELOPE_PREFIX = /^\[([^\]]+)\]\s*/;
const ENVELOPE_CHANNELS = [
  "WebChat", "WhatsApp", "Telegram", "Signal", "Slack",
  "Discord", "Google Chat", "iMessage", "Teams", "Matrix", "Zalo",
  "Zalo Personal", "BlueBubbles",
];
const MESSAGE_ID_LINE = /^\s*\[message_id:\s*[^\]]+\]\s*$/i;
const MESSAGE_ID_CAPTURE = /^\s*\[message_id:\s*([^\]]+)\]\s*$/i;
const OPTIMISTIC_DEDUP_WINDOW_MS = 5 * 60_000;
const OPTIMISTIC_HISTORY_FALLBACK = 5;

function looksLikeEnvelopeHeader(header: string): boolean {
  if (/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z\b/.test(header)) return true;
  if (/\d{4}-\d{2}-\d{2} \d{2}:\d{2}\b/.test(header)) return true;
  return ENVELOPE_CHANNELS.some((label) => header.startsWith(`${label} `));
}

function stripEnvelope(text: string): string {
  const match = text.match(ENVELOPE_PREFIX);
  if (!match) return stripMessageIdHints(text);
  const header = match[1] ?? "";
  if (!looksLikeEnvelopeHeader(header)) return stripMessageIdHints(text);
  return stripMessageIdHints(text.slice(match[0].length));
}

function isInternalSystemMessage(text: string, role?: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (/^HEARTBEAT_OK\b/i.test(trimmed) || /^HEARTBEAT\b/i.test(trimmed)) {
    return true;
  }
  const hasSystemPrefix = /^System:/i.test(trimmed);
  const hasNetworkTag = /\[NETWORK\]/i.test(trimmed);
  const hasHeartbeatInstruction = /\bRead HEARTBEAT\.md\b/i.test(trimmed);
  if (hasSystemPrefix && (hasNetworkTag || hasHeartbeatInstruction)) {
    return true;
  }
  if ((role ?? "").toLowerCase() === "system") return true;
  return false;
}

function normalizeSystemEventText(text: string): string {
  return text.replace(/^System:\s*/i, "").trim();
}

function classifySystemEvent(text: string): { kind: SystemEventKind; tone?: SystemEventTone } {
  const lowered = text.toLowerCase();
  const isHeartbeat =
    lowered.startsWith("heartbeat") ||
    lowered.includes("heartbeat_ok") ||
    lowered.includes("heartbeat");
  const isError = /error|failed|denied|blocked|timeout|unavailable/i.test(lowered);
  const isWarn = /\[network\]|warning|alert/i.test(lowered);
  if (isError) return { kind: "alert", tone: "error" };
  if (isWarn) return { kind: "alert", tone: "warn" };
  if (isHeartbeat) return { kind: "heartbeat" };
  return { kind: "system" };
}

function formatSystemTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatHeartbeatText(event: HeartbeatEvent): string {
  const text = event.preview ?? event.reason ?? event.status ?? "Heartbeat";
  return String(text).trim();
}

function sameInputStatus(
  a: ChangeLipStatus | null,
  b: ChangeLipStatus | null,
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    a.kind === b.kind &&
    a.label === b.label &&
    a.detail === b.detail &&
    a.tone === b.tone
  );
}

function stripMessageIdHints(text: string): string {
  if (!text.includes("[message_id:")) return text;
  const lines = text.split(/\r?\n/);
  const filtered = lines.filter((line) => !MESSAGE_ID_LINE.test(line));
  return filtered.length === lines.length ? text : filtered.join("\n");
}

function extractMessageId(text: string): string | null {
  if (!text.includes("[message_id:")) return null;
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(MESSAGE_ID_CAPTURE);
    if (match) return (match[1] ?? "").trim() || null;
  }
  return null;
}

function stripThinkingTags(text: string): string {
  return stripReasoningTagsFromText(text, { mode: "preserve", trim: "start" });
}

function stripContextPrefix(text: string): string {
  return text.replace(/^\s*\[Context\][\s\S]*?\[\/Context\]\s*/i, "");
}

function stripContextFromParts(parts: ContentPart[]): ContentPart[] {
  let stripped = false;
  return parts
    .map((part) => {
      if (
        !stripped &&
        part.type === "text" &&
        typeof part.text === "string"
      ) {
        const next = stripContextPrefix(part.text);
        if (next !== part.text) {
          stripped = true;
        }
        if (!next.trim()) return null;
        return { ...part, text: next };
      }
      return part;
    })
    .filter(Boolean) as ContentPart[];
}

function normalizeTextForMatch(text: string | null | undefined): string {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

function normalizeHistoryTimestamp(ts?: number): number | null {
  if (typeof ts !== "number" || !Number.isFinite(ts)) return null;
  // Heuristic: treat seconds-precision epoch as milliseconds.
  return ts < 1_000_000_000_000 ? ts * 1000 : ts;
}

/** Extract display text from a message, stripping envelopes and thinking tags */
function extractText(raw: HistoryMessage): string | null {
  const role = raw.role ?? "";
  const content = raw.content;

  if (typeof content === "string") {
    const base =
      role === "assistant" ? stripThinkingTags(content) : stripEnvelope(content);
    return role === "user" || role === "User"
      ? stripContextPrefix(base)
      : base;
  }
  if (Array.isArray(content)) {
    const parts = content
      .filter((p) => p.type === "text" && typeof p.text === "string")
      .map((p) => p.text as string);
    if (parts.length > 0) {
      const joined = parts.join("\n");
      const base =
        role === "assistant" ? stripThinkingTags(joined) : stripEnvelope(joined);
      return role === "user" || role === "User"
        ? stripContextPrefix(base)
        : base;
    }
  }
  if (typeof (raw as any).text === "string") {
    const t = (raw as any).text;
    const base = role === "assistant" ? stripThinkingTags(t) : stripEnvelope(t);
    return role === "user" || role === "User" ? stripContextPrefix(base) : base;
  }
  return null;
}

/** Extract raw text from a message without stripping reasoning tags */
function extractRawText(raw: HistoryMessage): string | null {
  const role = raw.role ?? "";
  const content = raw.content;
  if (typeof content === "string") {
    return role === "user" || role === "User"
      ? stripContextPrefix(content)
      : content;
  }
  if (Array.isArray(content)) {
    const parts = content
      .filter((p) => p.type === "text" && typeof p.text === "string")
      .map((p) => p.text as string);
    if (parts.length > 0) {
      const joined = parts.join("\n");
      return role === "user" || role === "User"
        ? stripContextPrefix(joined)
        : joined;
    }
  }
  if (typeof (raw as any).text === "string") {
    const t = (raw as any).text;
    return role === "user" || role === "User" ? stripContextPrefix(t) : t;
  }
  return null;
}

/** Extract thinking content from a message (content blocks or <think> tags) */
function extractThinking(raw: HistoryMessage): string | null {
  const content = raw.content;
  const parts: string[] = [];
  if (Array.isArray(content)) {
    for (const p of content) {
      const item = p as Record<string, unknown>;
      if (item.type === "thinking" && typeof item.thinking === "string") {
        const cleaned = item.thinking.trim();
        if (cleaned) parts.push(cleaned);
      }
    }
  }
  if (parts.length > 0) return parts.join("\n");

  const rawText = extractRawText(raw);
  if (!rawText) return null;
  const matches = [
    ...rawText.matchAll(/<\s*think(?:ing)?\s*>([\s\S]*?)<\s*\/\s*think(?:ing)?\s*>/gi),
  ];
  const extracted = matches.map((m) => (m[1] ?? "").trim()).filter(Boolean);
  return extracted.length > 0 ? extracted.join("\n") : null;
}

function formatReasoningMarkdown(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `_${line}_`);
  return lines.length ? ["_Reasoning:_", ...lines].join("\n") : "";
}

// ─── Tool Card Extraction (matching OpenClaw's tool-cards.ts) ───────────────

const TOOL_STREAM_LIMIT = 50;
const TOOL_STREAM_THROTTLE_MS = 80;
const TOOL_OUTPUT_CHAR_LIMIT = 120_000;

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
        args: coerceArgs(item.arguments ?? item.args ?? item.input),
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

function truncateText(value: string, max: number): { text: string; truncated: boolean; total: number } {
  if (value.length <= max) {
    return { text: value, truncated: false, total: value.length };
  }
  return { text: value.slice(0, Math.max(0, max)), truncated: true, total: value.length };
}

function formatToolOutput(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  let text: string;
  if (typeof value === "string") {
    text = value;
  } else if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.text === "string") {
      text = record.text;
    } else if (Array.isArray(record.content)) {
      const parts = record.content
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const entry = item as Record<string, unknown>;
          return entry.type === "text" && typeof entry.text === "string"
            ? entry.text
            : null;
        })
        .filter((part): part is string => Boolean(part));
      text = parts.length > 0 ? parts.join("\n") : "";
    } else {
      try {
        text = JSON.stringify(value, null, 2);
      } catch {
        text = String(value);
      }
    }
  } else {
    text = String(value);
  }

  if (!text) return undefined;
  const formatted = tryFormatJson(text) ?? text;
  const truncated = truncateText(formatted, TOOL_OUTPUT_CHAR_LIMIT);
  if (!truncated.truncated) {
    return truncated.text;
  }
  return `${truncated.text}\n\n… truncated (${truncated.total} chars, showing first ${truncated.text.length}).`;
}

function tryFormatJson(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return null;
  }
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
  /** Internal system/heartbeat messages */
  internal?: boolean;
}

type SystemEventKind = "system" | "heartbeat" | "alert";
type SystemEventTone = "warn" | "error";

interface SystemEventEntry {
  id: string;
  kind: SystemEventKind;
  tone?: SystemEventTone;
  text: string;
  timestamp: number;
  source: "system" | "heartbeat";
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

  const rawText = extractRawText(raw);
  const internal = rawText ? isInternalSystemMessage(rawText, role) : false;
  const normalizedRole = internal ? "system" : normalizeRoleForGrouping(role);
  if (normalizedRole === "user") {
    parts = stripContextFromParts(parts);
  }

  return {
    role: normalizedRole,
    content: parts,
    timestamp: raw.timestamp ?? Date.now(),
    id: (raw as any).id,
    channel: raw.channel,
    sessionKey: raw.sessionKey,
    raw,
    displayText: extractText(raw),
    toolCards: extractToolCards(raw),
    internal,
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
  | DisplayIndicatorItem
  | DisplayToolStreamItem;

interface DisplayToolStreamItem {
  kind: "tool-stream";
  entry: ToolStreamEntry;
}

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

interface ToolStreamGroup {
  kind: "tool-stream-group";
  entries: ToolStreamEntry[];
}

type GroupedItem =
  | MessageGroup
  | OptimisticGroup
  | StreamGroup
  | IndicatorGroup
  | ToolStreamGroup;

function buildDisplayList(
  history: HistoryMessage[],
  showThinking: boolean,
  optimisticMessages: OptimisticMessage[],
  toolStream: ToolStreamEntry[],
  streamingMessages: ChatMessageType[],
  isStreaming: boolean,
): DisplayItem[] {
  const items: DisplayItem[] = [];
  const historyIndex = new Map<HistoryMessage, number>();

  for (let i = 0; i < history.length; i += 1) {
    const raw = history[i];
    historyIndex.set(raw, i);
    const normalized = normalizeMessage(raw);

    // Skip toolResult role messages when not showing thinking
    // (matching OpenClaw's buildChatItems — only toolResult is skipped)
    if (normalized.internal) continue;
    if (!showThinking && normalized.role === "tool") continue;

    items.push({ kind: "message", normalized });
  }

  // Add optimistic user messages (with dedup against history)
  for (const opt of optimisticMessages) {
    const optText = normalizeTextForMatch(opt.text);
    const isDuplicate = items.some((item) => {
      if (item.kind !== "message") return false;
      const n = item.normalized;
      if (n.role !== opt.role) return false;
      const rawText = extractRawText(n.raw);
      const historyMessageId = rawText ? extractMessageId(rawText) : null;
      if (historyMessageId && historyMessageId === opt.id) return true;
      const nText = normalizeTextForMatch(n.displayText);
      if (!nText || !optText || nText !== optText) return false;
      const historyTs = normalizeHistoryTimestamp(n.raw.timestamp);
      if (historyTs !== null) {
        const timeClose = Math.abs(historyTs - opt.timestamp) < OPTIMISTIC_DEDUP_WINDOW_MS;
        const notOlderThanSend = historyTs >= opt.timestamp - 5000;
        return timeClose && notOlderThanSend;
      }
      const idx = historyIndex.get(n.raw);
      return typeof idx === "number" && idx >= history.length - OPTIMISTIC_HISTORY_FALLBACK;
    });

    if (!isDuplicate) {
      items.push({ kind: "optimistic", message: opt });
    }
  }

  // Add tool stream items (ChatGPT-style tool cards) only when tools are visible
  if (showThinking) {
    for (const entry of toolStream) {
      items.push({ kind: "tool-stream", entry });
    }
  }

  // Add AI SDK streaming messages only while actively streaming
  if (isStreaming && streamingMessages.length > 0) {
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
      } else if (item.kind === "tool-stream") {
        const last = result[result.length - 1];
        if (last && last.kind === "tool-stream-group") {
          last.entries.push(item.entry);
        } else {
          result.push({ kind: "tool-stream-group", entries: [item.entry] });
        }
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
const INPUT_STATUS_MIN_VISIBLE_MS = 1_500;
const INPUT_STATUS_LINGER_MS = 2_500;
const INPUT_STATUS_BACKGROUND_MIN_VISIBLE_MS = 3_000;
const INPUT_STATUS_ALERT_MIN_VISIBLE_MS = 5_000;
const INPUT_STATUS_ALERT_LINGER_MS = 6_000;

// ─── History Hook ───────────────────────────────────────────────────────────

function useHistoryMessages(
  isOpen: boolean,
  lastSentAtRef: React.RefObject<number>,
  sessionKey: string,
) {
  const [allMessages, setAllMessages] = useState<HistoryMessage[]>([]);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadedRef = useRef<string | null>(null);
  const emptyRetryCountRef = useRef(0);
  const latestRequestIdRef = useRef(0);
  const activeVisibleFetchesRef = useRef(0);

  const fetchHistory = useCallback(async (opts?: { silent?: boolean; preserveExistingOnEmpty?: boolean }) => {
    const resolvedKey = sessionKey || "main";
    const requestId = latestRequestIdRef.current + 1;
    latestRequestIdRef.current = requestId;
    const silent = opts?.silent === true;

    if (!silent) {
      activeVisibleFetchesRef.current += 1;
      setLoading(true);
    }

    try {
      const res = await fetch(
        `/api/gateway/history?limit=1000&sessionKey=${encodeURIComponent(resolvedKey)}`,
        { cache: "no-store" },
      );
      const data = res.ok ? await res.json() : { messages: [] };
      if (requestId !== latestRequestIdRef.current) return;

      const nextMessages: HistoryMessage[] = Array.isArray(data?.messages)
        ? data.messages
        : [];
      const preserveExistingOnEmpty = opts?.preserveExistingOnEmpty !== false;
      setAllMessages((prev) => {
        if (
          preserveExistingOnEmpty &&
          nextMessages.length === 0 &&
          prev.length > 0
        ) {
          return prev;
        }
        return nextMessages;
      });
    } catch {
      // Silent — gateway may not support history or may be reconnecting
    } finally {
      if (!silent) {
        activeVisibleFetchesRef.current = Math.max(
          0,
          activeVisibleFetchesRef.current - 1,
        );
        if (activeVisibleFetchesRef.current === 0) {
          setLoading(false);
        }
      }
    }
  }, [sessionKey]);

  // Wrapped refetch that respects suppression window unless forced
  const refetchHistory = useCallback(
    (opts?: { force?: boolean }) => {
      if (!opts?.force && Date.now() - lastSentAtRef.current < 5000) {
        return Promise.resolve();
      }
      return fetchHistory({ silent: true });
    },
    [fetchHistory, lastSentAtRef],
  );

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
    if (loadedRef.current === sessionKey) return;
    loadedRef.current = sessionKey;
    emptyRetryCountRef.current = 0;
    setVisibleCount(INITIAL_VISIBLE_COUNT);
    void fetchHistory();
  }, [sessionKey, fetchHistory]);

  // Refetch when panel opens and empty
  useEffect(() => {
    if (!isOpen) return;
    if (allMessages.length > 0) {
      emptyRetryCountRef.current = 0;
      return;
    }
    if (loading) return;
    if (emptyRetryCountRef.current >= 3) return;
    emptyRetryCountRef.current += 1;
    void fetchHistory();
  }, [isOpen, allMessages.length, loading, fetchHistory]);

  return { history, allMessages, loading, loadingMore, hasMore, loadMore, refetchHistory };
}

// ─── Singleton Chat Instance ────────────────────────────────────────────────

function createChatTransport() {
  return new DefaultChatTransport({
    api: "/api/chat",
    body: () => ({
      sessionKey: activeSessionKey,
      pageContext: pendingContextPayload?.activePage?.path ?? undefined,
      context: pendingContextPayload ?? undefined,
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

const DEFAULT_PANEL_WIDTH = 600;
const MIN_PANEL_WIDTH = 400;
const MAX_PANEL_FRACTION = 0.4;

export function ChatPanel({ variant = "default" }: ChatPanelProps) {
  const { chatPanelOpen, setChatPanelOpen, activePage } = useWorkspaceStore();
  const connected = useGatewayStore((s) => s.connected);
  const wsStatus = useGatewayStore((s) => s.wsStatus);
  const gatewayReason = useGatewayStore((s) => s.reason);
  const wsError = useGatewayStore((s) => s.wsError);
  const gatewayError = useGatewayStore((s) => s.error);
  const agentStatus = useGatewayStore((s) => s.agentStatus);
  const setChangeSessionKey = useChangesStore((s) => s.setSessionKey);
  const loadChangeSets = useChangesStore((s) => s.loadChangeSets);

  const panelVisible = chatPanelOpen || variant !== "default";

  const [sessionKey, setSessionKey] = useState("main");
  const sessionKeyRef = useRef("main");
  const sessionKeyResolvedRef = useRef(false);
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(DEFAULT_PANEL_WIDTH);
  const isResizable = variant === "default";

  const clampPanelWidth = useCallback((width: number) => {
    const maxWidth =
      typeof window === "undefined"
        ? DEFAULT_PANEL_WIDTH
        : Math.round(window.innerWidth * MAX_PANEL_FRACTION);
    return Math.max(MIN_PANEL_WIDTH, Math.min(width, maxWidth));
  }, []);

  useEffect(() => {
    if (!isResizable) return;
    const handleResize = () => {
      setPanelWidth((prev) => clampPanelWidth(prev));
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [clampPanelWidth, isResizable]);

  useEffect(() => {
    if (!isResizing) return;
    const handleMove = (event: PointerEvent) => {
      const delta = resizeStartXRef.current - event.clientX;
      setPanelWidth(
        clampPanelWidth(resizeStartWidthRef.current + delta),
      );
    };
    const handleUp = () => {
      setIsResizing(false);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [clampPanelWidth, isResizing]);

  useEffect(() => {
    sessionKeyRef.current = sessionKey;
    setActiveSessionKey(sessionKey);
  }, [sessionKey]);

  useEffect(() => {
    if (!panelVisible) return;
    setChangeSessionKey(sessionKey);
    loadChangeSets();
  }, [panelVisible, sessionKey, setChangeSessionKey, loadChangeSets]);

  // Resolve canonical session key from the gateway (e.g., main -> agent:main:work)
  useEffect(() => {
    if (!panelVisible) return;
    let cancelled = false;
    fetch("/api/gateway/resolve?key=main")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const resolved = typeof data.resolved === "string" ? data.resolved.trim() : "";
        if (resolved) {
          sessionKeyResolvedRef.current = true;
          if (resolved !== sessionKeyRef.current) {
            setSessionKey(resolved);
          }
        }
      })
      .catch(() => {
        // ignore resolution failures
      });
    return () => {
      cancelled = true;
    };
  }, [panelVisible]);

  // ─── SSE refetch suppression ──────────────────────────────────────
  const lastSentAtRef = useRef<number>(0);

  const { history, loading: historyLoading, loadingMore, hasMore, loadMore, refetchHistory } =
    useHistoryMessages(panelVisible, lastSentAtRef, sessionKey);

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
  const mentionAnchorRef = useRef<{ start: number; end: number } | null>(null);
  const mentionContainerRef = useRef<HTMLDivElement>(null);
  const slashAnchorRef = useRef<{ start: number; end: number } | null>(null);
  const slashContainerRef = useRef<HTMLDivElement>(null);
  const isLoading = status === "streaming" || status === "submitted";
  const prevStatusRef = useRef<string | null>(null);

  // ─── Page context + mentions ──────────────────────────────────────
  const [activePageMeta, setActivePageMeta] = useState<PageRef | null>(null);
  const [includeActivePage, setIncludeActivePage] = useState(true);
  const [attachedPages, setAttachedPages] = useState<PageRef[]>([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionResults, setMentionResults] = useState<PageRef[]>([]);
  const [mentionLoading, setMentionLoading] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [recentPages, setRecentPages] = useState<PageRef[]>([]);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [slashCommands, setSlashCommands] = useState<
    { name: string; description: string; disabled?: boolean }[]
  >([]);
  const [slashLoading, setSlashLoading] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const connectionBlocked = wsStatus !== "connected";

  // ─── Show thinking toggle ───────────────────────────────────────────
  const [showThinking, setShowThinking] = useState(false);
  const reasoningLevel = "off";
  const showReasoning = showThinking && reasoningLevel !== "off";

  const heartbeatEvents = useHeartbeatStore((s) => s.events);
  const heartbeatLast = useHeartbeatStore((s) => s.lastEvent);
  const [inputStatus, setInputStatus] = useState<ChangeLipStatus | null>(null);
  const inputStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputStatusShownAtRef = useRef<number>(0);
  const inputStatusLastSeenAtRef = useRef<number>(0);

  const hasAssistantDraft = useMemo(() => {
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant) return false;
    return extractAiSdkText(lastAssistant).trim().length > 0;
  }, [messages]);

  const inputStatusCandidate = useMemo<ChangeLipStatus | null>(() => {
    if (wsStatus === "reconnecting") {
      return {
        kind: "background",
        label: "Reconnecting...",
        detail: wsError || "Trying to restore the gateway stream",
      };
    }

    if (wsStatus === "connecting") {
      return {
        kind: "background",
        label: "Connecting...",
        detail: wsError || "Connecting to the gateway",
      };
    }

    if (wsStatus === "disconnected") {
      return {
        kind: "alert",
        label:
          gatewayReason === "server_unreachable"
            ? "ClawPad server unreachable"
            : "Gateway unavailable",
        detail:
          wsError ||
          gatewayError ||
          (gatewayReason === "server_unreachable"
            ? "ClawPad is not reachable from this browser."
            : "OpenClaw gateway is not reachable."),
        tone: "warn",
      };
    }

    const alertHeartbeat =
      heartbeatLast &&
      (heartbeatLast.indicatorType === "alert" ||
        heartbeatLast.indicatorType === "error") &&
      !heartbeatLast.silent
        ? heartbeatLast
        : null;

    if (alertHeartbeat) {
      const detail = formatHeartbeatText(alertHeartbeat);
      return {
        kind: "alert",
        label:
          alertHeartbeat.indicatorType === "error"
            ? "Background error"
            : "Background alert",
        detail: detail || undefined,
        tone: alertHeartbeat.indicatorType === "error" ? "error" : "warn",
      };
    }

    if (status === "submitted") {
      return { kind: "thinking", label: "Thinking..." };
    }

    if (status === "streaming") {
      return hasAssistantDraft
        ? { kind: "writing", label: "Writing response..." }
        : { kind: "thinking", label: "Thinking..." };
    }

    if (agentStatus === "thinking") {
      return { kind: "thinking", label: "Thinking..." };
    }

    if (agentStatus === "active") {
      return { kind: "background", label: "Working on a background task..." };
    }

    return null;
  }, [
    agentStatus,
    gatewayError,
    gatewayReason,
    hasAssistantDraft,
    heartbeatLast,
    status,
    wsError,
    wsStatus,
  ]);

  useEffect(() => {
    if (inputStatusTimerRef.current) {
      clearTimeout(inputStatusTimerRef.current);
      inputStatusTimerRef.current = null;
    }

    const now = Date.now();
    if (inputStatusCandidate) {
      inputStatusLastSeenAtRef.current = now;
      setInputStatus((prev) => {
        if (sameInputStatus(prev, inputStatusCandidate)) return prev;
        inputStatusShownAtRef.current = now;
        return inputStatusCandidate;
      });
      return;
    }

    if (!inputStatus) return;

    const minVisibleMs =
      inputStatus.kind === "alert"
        ? INPUT_STATUS_ALERT_MIN_VISIBLE_MS
        : inputStatus.kind === "background"
          ? INPUT_STATUS_BACKGROUND_MIN_VISIBLE_MS
          : INPUT_STATUS_MIN_VISIBLE_MS;
    const lingerMs =
      inputStatus.kind === "alert"
        ? INPUT_STATUS_ALERT_LINGER_MS
        : INPUT_STATUS_LINGER_MS;
    const hideAt = Math.max(
      inputStatusShownAtRef.current + minVisibleMs,
      inputStatusLastSeenAtRef.current + lingerMs,
    );
    const delay = Math.max(hideAt - now, 0);

    if (delay === 0) {
      setInputStatus(null);
      return;
    }

    inputStatusTimerRef.current = setTimeout(() => {
      setInputStatus(null);
      inputStatusTimerRef.current = null;
    }, delay);

    return () => {
      if (inputStatusTimerRef.current) {
        clearTimeout(inputStatusTimerRef.current);
        inputStatusTimerRef.current = null;
      }
    };
  }, [inputStatusCandidate, inputStatus]);

  // ─── Active page context ───────────────────────────────────────────
  useEffect(() => {
    if (!activePage) {
      setActivePageMeta(null);
      return;
    }

    let cancelled = false;
    setIncludeActivePage(true);

    const load = async () => {
      try {
        const res = await fetch(
          `/api/files/pages/${encodeURIComponent(activePage)}`,
        );
        if (!res.ok) throw new Error("Failed to load page");
        const data = await res.json();
        if (cancelled) return;
        const meta = data?.meta;
        if (meta?.path) {
          setActivePageMeta(
            normalizePageRef({
              title: meta.title,
              path: meta.path,
              space: meta.space,
              modified: meta.modified,
            }),
          );
          return;
        }
      } catch {
        // ignore, fallback to inferred title below
      }
      if (!cancelled) {
        setActivePageMeta(
          normalizePageRef({
            title: formatPageTitleFromPath(activePage),
            path: activePage,
          }),
        );
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [activePage]);

  const buildContextPayload = useCallback((): ChatContextPayload | null => {
    const context: ChatContextPayload = {};
    if (includeActivePage && activePageMeta) {
      context.activePage = activePageMeta;
    }

    const attached = attachedPages.filter(
      (p) => !context.activePage || p.path !== context.activePage.path,
    );
    if (attached.length > 0) {
      context.attachedPages = attached;
      context.scope = "custom";
    } else if (context.activePage) {
      context.scope = "current";
    }

    return Object.keys(context).length > 0 ? context : null;
  }, [activePageMeta, attachedPages, includeActivePage]);

  const updateMentionFromInput = useCallback(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    const value = textarea.value;
    const cursor = textarea.selectionStart ?? value.length;
    const beforeCursor = value.slice(0, cursor);
    const atIndex = beforeCursor.lastIndexOf("@");
    if (atIndex === -1) {
      setMentionOpen(false);
      setMentionQuery("");
      mentionAnchorRef.current = null;
      return;
    }

    const charBefore = beforeCursor[atIndex - 1];
    const isValidTrigger = !charBefore || /[\s([{]/.test(charBefore);
    const query = beforeCursor.slice(atIndex + 1);

    if (!isValidTrigger || /\s/.test(query)) {
      setMentionOpen(false);
      setMentionQuery("");
      mentionAnchorRef.current = null;
      return;
    }

    mentionAnchorRef.current = { start: atIndex, end: cursor };
    setMentionQuery(query);
    setMentionOpen(true);
    setSlashOpen(false);
    setSlashQuery("");
    slashAnchorRef.current = null;
  }, []);

  const loadSlashCommands = useCallback(async () => {
    if (slashLoading || slashCommands.length > 0) return;
    setSlashLoading(true);
    try {
      const res = await fetch("/api/openclaw/commands");
      const data = res.ok ? await res.json() : null;
      const commands = Array.isArray(data?.commands)
        ? data.commands
            .filter(
              (cmd: unknown): cmd is { name: string; description: string; disabled?: boolean } =>
                Boolean(cmd && typeof (cmd as { name?: unknown }).name === "string"),
            )
            .map((cmd: { name: string; description: string; disabled?: boolean }) => ({
              name: cmd.name,
              description: cmd.description ?? "",
              disabled: cmd.disabled,
            }))
        : [];
      setSlashCommands(commands);
      setSlashIndex(0);
    } catch {
      setSlashCommands([]);
    } finally {
      setSlashLoading(false);
    }
  }, [slashCommands.length, slashLoading]);

  const updateSlashFromInput = useCallback(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    const value = textarea.value;
    const cursor = textarea.selectionStart ?? value.length;
    const beforeCursor = value.slice(0, cursor);
    const slashIndex = beforeCursor.lastIndexOf("/");
    if (slashIndex === -1) {
      setSlashOpen(false);
      setSlashQuery("");
      slashAnchorRef.current = null;
      return;
    }

    const charBefore = beforeCursor[slashIndex - 1];
    const isValidTrigger = !charBefore || /[\s([{]/.test(charBefore);
    const query = beforeCursor.slice(slashIndex + 1);

    if (!isValidTrigger || /\s/.test(query)) {
      setSlashOpen(false);
      setSlashQuery("");
      slashAnchorRef.current = null;
      return;
    }

    slashAnchorRef.current = { start: slashIndex, end: cursor };
    setSlashQuery(query);
    setSlashOpen(true);
    setMentionOpen(false);
    setMentionQuery("");
    mentionAnchorRef.current = null;
    void loadSlashCommands();
  }, [loadSlashCommands]);

  const handleSelectSlash = useCallback((command: string) => {
    const textarea = inputRef.current;
    const anchor = slashAnchorRef.current;
    if (!textarea || !anchor) return;

    const value = textarea.value;
    const before = value.slice(0, anchor.start);
    const after = value.slice(anchor.end);
    const insert = `/${command}`;
    const spacer = after.startsWith(" ") ? "" : " ";
    const nextValue = `${before}${insert}${spacer}${after}`;
    const nextCursor = before.length + insert.length + spacer.length;

    textarea.value = nextValue;
    textarea.setSelectionRange(nextCursor, nextCursor);
    textarea.focus();

    setSlashOpen(false);
    setSlashQuery("");
    slashAnchorRef.current = null;
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
    });
  }, []);

  const handleSelectMention = useCallback(
    (page: PageRef) => {
      const textarea = inputRef.current;
      const anchor = mentionAnchorRef.current;
      if (!textarea || !anchor) return;

      const value = textarea.value;
      const before = value.slice(0, anchor.start);
      const after = value.slice(anchor.end);
      const insert = `@${page.title}`;
      const spacer = after.startsWith(" ") ? "" : " ";
      const nextValue = `${before}${insert}${spacer}${after}`;
      const nextCursor = before.length + insert.length + spacer.length;

      textarea.value = nextValue;
      textarea.setSelectionRange(nextCursor, nextCursor);
      textarea.focus();

      setAttachedPages((prev) =>
        prev.some((p) => p.path === page.path)
          ? prev
          : [...prev, page],
      );

      setMentionOpen(false);
      setMentionQuery("");
      mentionAnchorRef.current = null;
      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
      });
    },
    [],
  );

  const handleMentionButton = useCallback(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    const value = textarea.value;
    const start = textarea.selectionStart ?? value.length;
    const end = textarea.selectionEnd ?? start;
    const nextValue = `${value.slice(0, start)}@${value.slice(end)}`;
    textarea.value = nextValue;
    const cursor = start + 1;
    textarea.setSelectionRange(cursor, cursor);
    textarea.focus();
    updateMentionFromInput();
  }, [updateMentionFromInput]);

  useEffect(() => {
    if (!mentionOpen) {
      setMentionLoading(false);
      return;
    }
    let cancelled = false;
    const query = mentionQuery.trim();
    if (!query && recentPages.length > 0) {
      setMentionResults(recentPages);
    }

    const timer = setTimeout(async () => {
      if (cancelled) return;
      setMentionLoading(true);
      try {
        const url = query
          ? `/api/files/search?q=${encodeURIComponent(query)}&limit=8`
          : `/api/files/recent?limit=8`;
        const res = await fetch(url);
        const data = res.ok ? await res.json() : [];
        if (cancelled) return;
        const results = Array.isArray(data)
          ? data.map((item) => normalizePageRef(item))
          : [];
        setMentionResults(results);
        if (!query) {
          setRecentPages(results);
        }
        setMentionIndex(0);
      } catch {
        if (!cancelled) setMentionResults([]);
      } finally {
        if (!cancelled) setMentionLoading(false);
      }
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [mentionOpen, mentionQuery, recentPages]);

  useEffect(() => {
    if (!panelVisible) return;
    void loadSlashCommands();
  }, [panelVisible, loadSlashCommands]);

  useEffect(() => {
    if (!panelVisible) return;
    let cancelled = false;
    const loadRecent = async () => {
      try {
        const res = await fetch("/api/files/recent?limit=8");
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const results = Array.isArray(data)
          ? data.map((item) => normalizePageRef(item))
          : [];
        setRecentPages(results);
      } catch {
        // ignore
      }
    };
    loadRecent();
    return () => {
      cancelled = true;
    };
  }, [panelVisible]);

  useEffect(() => {
    if (panelVisible) return;
    setMentionOpen(false);
    setMentionQuery("");
    mentionAnchorRef.current = null;
    setSlashOpen(false);
    setSlashQuery("");
    slashAnchorRef.current = null;
  }, [panelVisible]);

  useEffect(() => {
    if (!mentionOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        mentionContainerRef.current &&
        !mentionContainerRef.current.contains(target)
      ) {
        setMentionOpen(false);
        setMentionQuery("");
        mentionAnchorRef.current = null;
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [mentionOpen]);

  useEffect(() => {
    if (!slashOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        slashContainerRef.current &&
        !slashContainerRef.current.contains(target)
      ) {
        setSlashOpen(false);
        setSlashQuery("");
        slashAnchorRef.current = null;
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [slashOpen]);

  // ─── Optimistic messages state ──────────────────────────────────────
  const [optimisticMessages, setOptimisticMessages] = useState<
    OptimisticMessage[]
  >([]);

  const currentOptimisticIdRef = useRef<string | null>(null);
  const pendingApplyIdsRef = useRef<string[]>([]);
  const lastAppliedMessageIdRef = useRef<string | null>(null);
  const streamingMessageIdRef = useRef<string | null>(null);
  const lastStreamTextRef = useRef<string>("");

  // ─── Tool stream (agent events) ─────────────────────────────────────
  const toolStreamByIdRef = useRef<Map<string, ToolStreamEntry>>(new Map());
  const toolStreamOrderRef = useRef<string[]>([]);
  const toolStreamSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toolStreamRunIdRef = useRef<string | null>(null);
  const [toolStreamEntries, setToolStreamEntries] = useState<ToolStreamEntry[]>([]);

  const syncToolStreamEntries = useCallback(() => {
    const next = toolStreamOrderRef.current
      .map((id) => toolStreamByIdRef.current.get(id))
      .filter((entry): entry is ToolStreamEntry => Boolean(entry));
    setToolStreamEntries(next);
  }, []);

  const scheduleToolStreamSync = useCallback(
    (force = false) => {
      if (force) {
        if (toolStreamSyncTimerRef.current) {
          clearTimeout(toolStreamSyncTimerRef.current);
          toolStreamSyncTimerRef.current = null;
        }
        syncToolStreamEntries();
        return;
      }
      if (toolStreamSyncTimerRef.current) return;
      toolStreamSyncTimerRef.current = setTimeout(() => {
        toolStreamSyncTimerRef.current = null;
        syncToolStreamEntries();
      }, TOOL_STREAM_THROTTLE_MS);
    },
    [syncToolStreamEntries],
  );

  const resetToolStream = useCallback(() => {
    toolStreamByIdRef.current.clear();
    toolStreamOrderRef.current = [];
    toolStreamRunIdRef.current = null;
    if (toolStreamSyncTimerRef.current) {
      clearTimeout(toolStreamSyncTimerRef.current);
      toolStreamSyncTimerRef.current = null;
    }
    setToolStreamEntries([]);
  }, []);

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

  const handleToolEvent = useCallback(
    (payload: Record<string, unknown>) => {
      const stream = payload.stream as string | undefined;
      if (stream !== "tool") return;

      const sessionKey =
        typeof payload.sessionKey === "string" ? payload.sessionKey : undefined;
      const activeKey = sessionKeyRef.current || "main";
      if (sessionKeyResolvedRef.current && sessionKey && sessionKey !== activeKey) return;

      const runId = typeof payload.runId === "string" ? payload.runId : "unknown";

      const data =
        (payload.data as Record<string, unknown> | undefined) ?? {};
      const toolCallId =
        typeof data.toolCallId === "string" ? data.toolCallId : "";
      if (!toolCallId) return;

      const name = typeof data.name === "string" ? data.name : "tool";
      const phaseRaw = typeof data.phase === "string" ? data.phase : "unknown";
      const phase =
        phaseRaw === "start" ||
        phaseRaw === "update" ||
        phaseRaw === "result" ||
        phaseRaw === "error"
          ? phaseRaw
          : "unknown";

      const args = phase === "start" ? data.args : undefined;
      const output =
        phase === "update"
          ? formatToolOutput(data.partialResult)
          : phase === "result"
            ? formatToolOutput(data.result)
            : phase === "error"
              ? formatToolOutput(data.error ?? data.result)
            : undefined;

      const now = Date.now();

      if (toolStreamRunIdRef.current && toolStreamRunIdRef.current !== runId && phase === "start") {
        resetToolStream();
      }
      toolStreamRunIdRef.current = runId;

      let entry = toolStreamByIdRef.current.get(toolCallId);
      if (!entry) {
        entry = {
          toolCallId,
          runId,
          sessionKey,
          name,
          args,
          output,
          phase,
          startedAt: typeof payload.ts === "number" ? payload.ts : now,
          updatedAt: now,
        };
        toolStreamByIdRef.current.set(toolCallId, entry);
        toolStreamOrderRef.current.push(toolCallId);
      } else {
        entry.name = name;
        entry.phase = phase;
        if (args !== undefined) entry.args = args;
        if (output !== undefined) entry.output = output;
        entry.updatedAt = now;
      }

      if (toolStreamOrderRef.current.length > TOOL_STREAM_LIMIT) {
        const overflow = toolStreamOrderRef.current.length - TOOL_STREAM_LIMIT;
        const removed = toolStreamOrderRef.current.splice(0, overflow);
        for (const id of removed) {
          toolStreamByIdRef.current.delete(id);
        }
      }

      scheduleToolStreamSync(phase === "result" || phase === "error");
    },
    [resetToolStream, scheduleToolStreamSync],
  );

  const systemEvents = useMemo<SystemEventEntry[]>(() => {
    const entries: SystemEventEntry[] = [];
    for (const raw of history) {
      const normalized = normalizeMessage(raw);
      if (!normalized.internal) continue;
      const base = normalized.displayText?.trim() ?? "";
      const text = normalizeSystemEventText(base);
      if (!text) continue;
      const { kind, tone } = classifySystemEvent(text);
      entries.push({
        id: `sys-${normalized.timestamp}-${entries.length}`,
        kind,
        tone,
        text,
        timestamp: normalized.timestamp,
        source: "system",
      });
    }
    return entries;
  }, [history]);

  const heartbeatEventEntries = useMemo<SystemEventEntry[]>(() => {
    const entries: SystemEventEntry[] = [];
    heartbeatEvents.forEach((event, idx) => {
      const text = formatHeartbeatText(event);
      if (!text) return;
      const isAlert =
        event.indicatorType === "alert" || event.indicatorType === "error";
      entries.push({
        id: `hb-${event.ts}-${idx}`,
        kind: isAlert ? "alert" : "heartbeat",
        tone: event.indicatorType === "error" ? "error" : isAlert ? "warn" : undefined,
        text,
        timestamp: event.ts,
        source: "heartbeat",
      });
    });
    return entries;
  }, [heartbeatEvents]);

  const combinedSystemEvents = useMemo<SystemEventEntry[]>(() => {
    const merged = [...systemEvents, ...heartbeatEventEntries].sort(
      (a, b) => b.timestamp - a.timestamp,
    );
    const seen = new Set<string>();
    const deduped: SystemEventEntry[] = [];
    for (const entry of merged) {
      const key = `${entry.source}-${entry.timestamp}-${entry.text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(entry);
    }
    return deduped;
  }, [systemEvents, heartbeatEventEntries]);

  // ─── Build grouped display list ────────────────────────────────────
  const groupedItems = useMemo(() => {
    const displayItems = buildDisplayList(
      history,
      showThinking,
      optimisticMessages,
      toolStreamEntries,
      messages as ChatMessageType[],
      isLoading,
    );
    return groupDisplayItems(displayItems);
  }, [
    history,
    showThinking,
    optimisticMessages,
    toolStreamEntries,
    messages,
    isLoading,
  ]);

  const hasMessages =
    groupedItems.length > 0 || (showThinking && combinedSystemEvents.length > 0);

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
      requestAnimationFrame(() => {
        scrollToBottom("auto");
        // Extra pass to account for late layout/image loads.
        setTimeout(() => scrollToBottom("auto"), 150);
      });
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
  }, [isLoading, messages, toolStreamEntries, scrollToBottom]);

  // ─── SSE subscription ──────────────────────────────────────────────
  useEffect(() => {
    if (!panelVisible) return;

    let es: EventSource | null = null;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;
    let lastSeq: number | null = null;

    function connect() {
      if (closed) return;
      es = new EventSource("/api/gateway/events");

      es.addEventListener("gateway", (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data) as {
            event?: string;
            payload?: Record<string, unknown>;
            seq?: number;
          };
          if (typeof data.seq === "number") {
            if (lastSeq !== null && data.seq > lastSeq + 1) {
              // Event gap detected; refresh history to avoid missing messages.
              refetchHistory({ force: true });
            }
            lastSeq = data.seq;
          }
          if (data.event === "agent" && data.payload) {
            handleToolEvent(data.payload);
          }
          if (data.event === "chat" && data.payload) {
            const payload = data.payload as { state?: string; sessionKey?: string };
            const activeKey = sessionKeyRef.current || "main";
            if (
              sessionKeyResolvedRef.current &&
              payload.sessionKey &&
              payload.sessionKey !== activeKey
            ) {
              return;
            }
            const state = payload.state;
            if (state === "final" || state === "error" || state === "aborted") {
              if (debounceTimer) {
                clearTimeout(debounceTimer);
                debounceTimer = null;
              }
              refetchHistory({ force: true });
            }
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
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      es?.close();
    };
  }, [handleToolEvent, panelVisible, refetchHistory]);

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
    setAttachedPages([]);
    setIncludeActivePage(true);
    setMentionOpen(false);
    setMentionQuery("");
    mentionAnchorRef.current = null;
    setOptimisticMessages([]);
    setOptimisticImageMap({});
    resetToolStream();
    pendingImagePayload = [];
    pendingContextPayload = null;
    currentOptimisticIdRef.current = null;
    if (inputRef.current) {
      inputRef.current.value = "";
      inputRef.current.style.height = "auto";
      inputRef.current.focus();
    }
  }, [resetToolStream]);

  // Keyboard shortcut: Cmd+Shift+L
  useEffect(() => {
    if (variant !== "default") return;
    function handleKeydown(e: KeyboardEvent) {
      if (e.metaKey && e.shiftKey && e.key === "l") {
        e.preventDefault();
        setChatPanelOpen(true);
      }
    }
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [setChatPanelOpen, variant]);

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
    async (text: string, opts?: { messageId?: string }) => {
      if (connectionBlocked) {
        return;
      }
      const hasImages = attachedImages.length > 0;
      if (!text.trim() && !hasImages) return;
      const trimmed =
        text.trim() || (hasImages ? "What's in this image?" : "");
      if (!trimmed) return;

      resetToolStream();
      const optId = opts?.messageId?.trim() || crypto.randomUUID();
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
      setMentionOpen(false);
      setMentionQuery("");
      mentionAnchorRef.current = null;

      pendingImagePayload = imageUrls;
      pendingContextPayload = buildContextPayload();

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
        if (opts?.messageId) {
          pendingApplyIdsRef.current = pendingApplyIdsRef.current.filter(
            (id) => id !== opts.messageId,
          );
          if (streamingMessageIdRef.current === opts.messageId) {
            streamingMessageIdRef.current = null;
            lastStreamTextRef.current = "";
          }
        }
        setOptimisticMessages((prev) =>
          prev.map((m) =>
            m.id === optId ? { ...m, status: "error" as const } : m,
          ),
        );
      }

      pendingImagePayload = [];
      pendingContextPayload = null;
    },
    [connectionBlocked, sendMessage, attachedImages, buildContextPayload, resetToolStream],
  );

  // Listen for editor/command palette AI actions
  useEffect(() => {
    const handleAiAction = (event: Event) => {
      const custom = event as CustomEvent<AiActionEventDetail>;
      const detail = custom.detail ?? {};
      const messageId = detail.messageId?.trim() || crypto.randomUUID();
      const enrichedDetail = { ...detail, messageId };
      const message = buildAiActionMessage(enrichedDetail, activePage);
      if (!message) return;
      if (!chatPanelOpen) setChatPanelOpen(true);
      if (detail.selection?.trim()) {
        pendingApplyIdsRef.current.push(messageId);
      }
      handleSend(message, { messageId });
    };
    window.addEventListener("clawpad:ai-action", handleAiAction as EventListener);
    return () => window.removeEventListener("clawpad:ai-action", handleAiAction as EventListener);
  }, [handleSend, activePage, chatPanelOpen, setChatPanelOpen]);

  // Stream partial AI responses to the editor for inline preview
  useEffect(() => {
    if (status === "ready") {
      streamingMessageIdRef.current = null;
      lastStreamTextRef.current = "";
      return;
    }
    if (status !== "streaming") return;
    const nextMessageId = pendingApplyIdsRef.current[0];
    if (!nextMessageId) return;
    if (!streamingMessageIdRef.current) {
      streamingMessageIdRef.current = nextMessageId;
    }
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant) return;
    const text = extractAiSdkText(lastAssistant);
    if (!text.trim() || text === lastStreamTextRef.current) return;
    lastStreamTextRef.current = text;
    window.dispatchEvent(
      new CustomEvent("clawpad:ai-stream", {
        detail: { messageId: streamingMessageIdRef.current, text },
      }),
    );
  }, [messages, status]);

  // Auto-apply AI responses back to the editor (FIFO)
  useEffect(() => {
    const prevStatus = prevStatusRef.current;
    prevStatusRef.current = status;
    if (status !== "ready" || prevStatus === "ready") return;
    if (pendingApplyIdsRef.current.length === 0) return;
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    const nextMessageId = pendingApplyIdsRef.current[0];
    if (!lastAssistant || !nextMessageId) {
      pendingApplyIdsRef.current.shift();
      return;
    }
    const text = extractAiSdkText(lastAssistant);
    if (!text.trim()) {
      pendingApplyIdsRef.current.shift();
      return;
    }
    const messageId = pendingApplyIdsRef.current.shift();
    if (!messageId) return;
    if (lastAppliedMessageIdRef.current === messageId) return;
    lastAppliedMessageIdRef.current = messageId;
    streamingMessageIdRef.current = null;
    lastStreamTextRef.current = "";
    window.dispatchEvent(
      new CustomEvent("clawpad:ai-result", {
        detail: { messageId, text: text.trim() },
      }),
    );
  }, [messages, status]);

  const handleAbort = useCallback(async () => {
    stop();
    try {
      await fetch("/api/chat/abort", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionKey }),
      });
    } catch {
      // ignore abort errors; local stop already happened
    }
  }, [sessionKey, stop]);

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
      if (connectionBlocked) return;
      if (inputRef.current) {
        handleSend(inputRef.current.value);
      }
    },
    [connectionBlocked, handleSend],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (slashOpen) {
        const query = slashQuery.trim().toLowerCase();
        const filteredCommands =
          query.length === 0
            ? slashCommands
            : slashCommands.filter((cmd) => cmd.name.toLowerCase().includes(query));
        const items =
          filteredCommands.length > 0
            ? filteredCommands
            : slashCommands.slice(0, 12);

        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSlashIndex((prev) =>
            items.length === 0 ? 0 : (prev + 1) % items.length,
          );
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSlashIndex((prev) =>
            items.length === 0
              ? 0
              : (prev - 1 + items.length) % items.length,
          );
          return;
        }
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          const selected = items[slashIndex] ?? items[0];
          if (selected) {
            handleSelectSlash(selected.name);
          } else {
            setSlashOpen(false);
            setSlashQuery("");
            slashAnchorRef.current = null;
          }
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setSlashOpen(false);
          setSlashQuery("");
          slashAnchorRef.current = null;
          return;
        }
      }

      if (mentionOpen) {
        const items = mentionQuery.trim()
          ? mentionResults
          : mentionResults.length > 0
            ? mentionResults
            : recentPages;
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setMentionIndex((prev) =>
            items.length === 0 ? 0 : (prev + 1) % items.length,
          );
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setMentionIndex((prev) =>
            items.length === 0
              ? 0
              : (prev - 1 + items.length) % items.length,
          );
          return;
        }
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          const selected = items[mentionIndex] ?? items[0];
          if (selected) {
            handleSelectMention(selected);
          } else {
            setMentionOpen(false);
            setMentionQuery("");
            mentionAnchorRef.current = null;
            const value = (e.target as HTMLTextAreaElement).value;
            if (value || attachedImages.length > 0) {
              handleSend(value || "");
            }
          }
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setMentionOpen(false);
          setMentionQuery("");
          mentionAnchorRef.current = null;
          return;
        }
      }

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const value = (e.target as HTMLTextAreaElement).value;
        if (value || attachedImages.length > 0) {
          handleSend(value || "");
        }
      }
    },
    [
      attachedImages.length,
      handleSelectMention,
      handleSelectSlash,
      handleSend,
      mentionIndex,
      mentionOpen,
      mentionQuery,
      mentionResults,
      recentPages,
      slashCommands,
      slashIndex,
      slashOpen,
      slashQuery,
    ],
  );

  const handleInput = useCallback(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`;
    updateSlashFromInput();
    updateMentionFromInput();
  }, [updateMentionFromInput, updateSlashFromInput]);

  const isHidden = variant === "default" && !chatPanelOpen;
  const pageTitle =
    activePageMeta?.title ??
    (activePage
      ? (activePage
          .split("/")
          .pop()
          ?.replace(/\.md$/, "")
          .replace(/-/g, " ") ?? null)
      : null);

  const isFullscreen = variant === "fullscreen";
  const isSheet = variant === "sheet";

  const contextItems = useMemo(() => {
    const items: Array<{ key: string; page: PageRef; kind: "current" | "attached" }> = [];
    if (includeActivePage && activePageMeta) {
      items.push({
        key: `current-${activePageMeta.path}`,
        page: activePageMeta,
        kind: "current",
      });
    }
    for (const page of attachedPages) {
      if (items.some((item) => item.page.path === page.path)) continue;
      items.push({ key: `attached-${page.path}`, page, kind: "attached" });
    }
    return items;
  }, [activePageMeta, attachedPages, includeActivePage]);

  const mentionList = mentionQuery.trim()
    ? mentionResults
    : mentionResults.length > 0
      ? mentionResults
      : recentPages;

  const safeSlashCommands = slashCommands.filter(
    (cmd): cmd is { name: string; description: string; disabled?: boolean } =>
      Boolean(cmd && typeof cmd.name === "string"),
  );
  const normalizedSlashQuery = slashQuery.trim().toLowerCase();
  const filteredSlashCommands =
    normalizedSlashQuery.length === 0
      ? safeSlashCommands
      : safeSlashCommands.filter((cmd) =>
          cmd.name.toLowerCase().includes(normalizedSlashQuery),
        );
  const slashList =
    filteredSlashCommands.length > 0
      ? filteredSlashCommands.slice(0, 12)
      : safeSlashCommands.slice(0, 12);

  const handleResizeStart = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isResizable) return;
      event.preventDefault();
      resizeStartXRef.current = event.clientX;
      resizeStartWidthRef.current = panelWidth;
      setIsResizing(true);
    },
    [isResizable, panelWidth],
  );

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "relative flex flex-col bg-background",
        isHidden && "hidden",
        variant === "default" &&
          "h-full shrink-0 border-l",
        isSheet && "h-full w-full",
        isFullscreen && "h-full w-full",
      )}
      style={
        variant === "default"
          ? {
              width: panelWidth,
              minWidth: MIN_PANEL_WIDTH,
              maxWidth: "40vw",
            }
          : undefined
      }
    >
      {isResizable && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize chat panel"
          onPointerDown={handleResizeStart}
          className={cn(
            "absolute left-0 top-0 z-20 h-full w-2 cursor-col-resize",
            "group",
          )}
        >
          <div
            className={cn(
              "absolute inset-y-0 left-0 w-px bg-border/70",
              "transition-colors group-hover:bg-[color:var(--cp-brand-2)]",
              isResizing && "bg-[color:var(--cp-brand-2)]",
            )}
          />
        </div>
      )}
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
          <Sparkles className="h-4 w-4 shrink-0 text-[color:var(--cp-brand-2)]" />
          <span className="text-sm font-medium">Chat</span>
          <ConnectionDot
            connected={connected}
            wsStatus={wsStatus}
            agentStatus={agentStatus}
          />
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-8 w-8 text-muted-foreground hover:text-foreground",
              showThinking && "text-[color:var(--cp-brand-2)] hover:text-[color:var(--cp-brand-2)]",
            )}
            onClick={() => setShowThinking(!showThinking)}
            title={showThinking ? "Hide details" : "Show details"}
            aria-pressed={showThinking}
            aria-label={showThinking ? "Hide details" : "Show details"}
          >
            {showThinking ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
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
        </div>
      </div>

      {connectionBlocked && (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-700 dark:text-amber-300">
          {wsStatus === "reconnecting"
            ? "Reconnecting to OpenClaw gateway…"
            : gatewayReason === "server_unreachable"
              ? "ClawPad server is unreachable from this browser."
              : "OpenClaw gateway is unavailable. Start or restart the gateway to resume chat."}
        </div>
      )}
      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 min-w-0 overflow-y-auto"
      >
        <div className="relative flex min-h-full flex-col gap-4 p-4 pb-[calc(8rem+env(safe-area-inset-bottom,0px))] min-w-0 overflow-hidden">
          {!hasMessages && !historyLoading && (
            <EmptyState
              pageTitle={pageTitle}
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

          {showThinking && combinedSystemEvents.length > 0 && (
            <SystemEventsStack events={combinedSystemEvents} />
          )}

          {/* Grouped message stream */}
          {groupedItems.map((group, gi) => {
            if (group.kind === "group") {
              return (
                <MessageGroupRenderer
                  key={`g-${gi}-${group.timestamp}`}
                  group={group}
                  showReasoning={showReasoning}
                  showTools={showThinking}
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

            if (group.kind === "tool-stream-group") {
              const lastEntry = group.entries[group.entries.length - 1];
              const toolKey = lastEntry
                ? `tool-batch-${lastEntry.toolCallId}-${lastEntry.updatedAt}`
                : `tool-batch-${gi}`;
              return (
                <ToolStreamGroupRenderer
                  key={toolKey}
                  entries={group.entries}
                />
              );
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

      {/* Page context */}
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
          "shrink-0 border-t p-4",
          isFullscreen &&
            "pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]",
          isFullscreen && "sticky bottom-0 bg-background",
        )}
      >
        <ChangeLip status={inputStatus} />

        {/* Image preview thumbnails */}
        {attachedImages.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {attachedImages.map((img) => (
              <div key={img.id} className="group relative">
                {/* eslint-disable-next-line @next/next/no-img-element -- local data URL previews */}
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

        <form onSubmit={handleSubmit} className="w-full">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />

          <div
            className={cn(
              "relative flex w-full flex-col gap-2 rounded-2xl border bg-muted/30 px-4 py-3",
              "shadow-[0_2px_5px_rgba(0,0,0,0.04)] transition-shadow duration-150",
              "focus-within:shadow-[0_8px_14px_rgba(0,0,0,0.08)]",
              isFullscreen && "min-h-[64px]",
            )}
            ref={mentionContainerRef}
          >
            {(contextItems.length > 0 ||
              (activePageMeta && !includeActivePage)) && (
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className={cn(
                    "h-7 w-7 rounded-full text-muted-foreground/70 hover:text-foreground hover:bg-muted/60",
                    mentionOpen && "bg-muted/60 text-foreground",
                  )}
                  onClick={handleMentionButton}
                  title="Mention a page"
                  aria-label="Mention a page"
                  disabled={isLoading || connectionBlocked}
                >
                  <AtSign className="h-4 w-4" />
                </Button>
                {contextItems.map((item) => (
                  <span
                    key={item.key}
                    className="group inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-muted/30 px-2.5 py-1 text-muted-foreground"
                  >
                    {item.kind === "current" ? (
                      <FileText className="h-3.5 w-3.5 text-muted-foreground/70" />
                    ) : (
                      <AtSign className="h-3.5 w-3.5 text-muted-foreground/70" />
                    )}
                    <span className="max-w-[180px] truncate text-foreground/80">
                      {item.page.title}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (item.kind === "current") {
                          setIncludeActivePage(false);
                        } else {
                          setAttachedPages((prev) =>
                            prev.filter((p) => p.path !== item.page.path),
                          );
                        }
                      }}
                      className="ml-0.5 rounded-full p-0.5 text-muted-foreground/60 hover:text-foreground"
                      aria-label="Remove context"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                {!includeActivePage && activePageMeta && (
                  <button
                    type="button"
                    onClick={() => setIncludeActivePage(true)}
                    className="rounded-full border border-dashed border-border/70 px-2.5 py-1 text-[10px] text-muted-foreground hover:text-foreground"
                  >
                    Add current page
                  </button>
                )}
              </div>
            )}
            {mentionOpen && (
              <div
                className="absolute bottom-full left-0 right-0 mb-2 rounded-xl border bg-popover shadow-lg"
                onMouseDown={(e) => e.preventDefault()}
              >
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground/60">
                    {mentionQuery.trim() ? "Pages" : "Recent pages"}
                  </span>
                  {mentionLoading && (
                    <span className="text-[10px] text-muted-foreground/60">
                      Searching…
                    </span>
                  )}
                </div>
                <div className="max-h-56 overflow-y-auto pb-1">
                  {!mentionLoading && mentionList.length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      {mentionQuery.trim()
                        ? "No matching pages"
                        : "No recent pages"}
                    </div>
                  )}
                  {mentionList.map((page, index) => (
                    <button
                      key={page.path}
                      type="button"
                      onClick={() => handleSelectMention(page)}
                      className={cn(
                        "flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition-colors",
                        index === mentionIndex
                          ? "bg-muted/60"
                          : "hover:bg-muted/40",
                      )}
                    >
                      <FileText className="mt-0.5 h-4 w-4 text-muted-foreground/70" />
                      <div className="min-w-0">
                        <div className="truncate font-medium text-foreground">
                          {page.title}
                        </div>
                        <div className="truncate text-[11px] text-muted-foreground/70">
                          {page.path}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {slashOpen && (
              <div
                ref={slashContainerRef}
                className="absolute bottom-full left-0 right-0 mb-2 rounded-xl border bg-popover shadow-lg"
                onMouseDown={(e) => e.preventDefault()}
              >
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground/60">
                    OpenClaw commands
                  </span>
                  {slashLoading && (
                    <span className="text-[10px] text-muted-foreground/60">
                      Loading…
                    </span>
                  )}
                </div>
                <div className="max-h-56 overflow-y-auto pb-1">
                  {!slashLoading && slashList.length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      No commands available
                    </div>
                  )}
                  {slashList.map((command, index) => (
                    <button
                      key={command.name}
                      type="button"
                      onClick={() => handleSelectSlash(command.name)}
                      className={cn(
                        "flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition-colors",
                        index === slashIndex
                          ? "bg-muted/60"
                          : "hover:bg-muted/40",
                        command.disabled && "opacity-60",
                      )}
                    >
                      <Terminal className="mt-0.5 h-4 w-4 text-muted-foreground/70" />
                      <div className="min-w-0">
                        <div className="truncate font-medium text-foreground">
                          {command.name}
                        </div>
                        <div className="truncate text-[11px] text-muted-foreground/70">
                          /{command.name} — {command.description}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
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
                "w-full resize-none bg-transparent px-1 py-1 text-sm leading-relaxed",
                "placeholder:text-muted-foreground/80",
                "focus:outline-none focus:ring-0",
                "min-h-[44px] max-h-[150px]",
                isFullscreen && "text-base",
              )}
              disabled={isLoading}
            />

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 rounded-full text-muted-foreground/70 hover:text-foreground hover:bg-muted/60"
                  onClick={() => fileInputRef.current?.click()}
                  title="Attach image"
                  aria-label="Attach image"
                  disabled={isLoading || connectionBlocked}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              {isLoading ? (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={handleAbort}
                  className="h-9 w-9 rounded-full bg-white text-black shadow-sm hover:bg-white/90"
                  aria-label="Stop generation"
                >
                  <span className="h-3.5 w-3.5 rounded-sm bg-black" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="icon"
                  className="h-9 w-9 rounded-full bg-white text-black shadow-sm hover:bg-white/90"
                  aria-label="Send message"
                  disabled={connectionBlocked}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Connection Dot ─────────────────────────────────────────────────────────

function ConnectionDot({
  connected,
  wsStatus,
  agentStatus,
}: {
  connected: boolean;
  wsStatus: "disconnected" | "connecting" | "reconnecting" | "connected";
  agentStatus: string;
}) {
  const isConnecting = wsStatus === "connecting" || wsStatus === "reconnecting";
  const color = connected
    ? agentStatus === "active" || agentStatus === "thinking"
      ? "bg-violet-400"
      : "bg-green-500"
    : isConnecting
      ? "bg-amber-400"
      : "bg-zinc-300 dark:bg-zinc-600";

  const shouldPing =
    isConnecting ||
    (connected && (agentStatus === "active" || agentStatus === "thinking"));

  return (
    <span
      className="relative flex h-2 w-2"
      title={
        connected
          ? agentStatus
          : isConnecting
            ? wsStatus
            : "disconnected"
      }
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
}: {
  pageTitle: string | null;
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
      </div>
    </div>
  );
}

const SystemEventsStack = memo(function SystemEventsStack({
  events,
}: {
  events: SystemEventEntry[];
}) {
  const [open, setOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const alertCount = events.filter((e) => e.kind === "alert").length;

  return (
    <div className="rounded-xl border border-border/60 bg-muted/20">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "flex w-full items-center justify-between gap-2 px-3 py-2 text-left",
          "text-[11px] text-muted-foreground hover:text-foreground",
        )}
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <ShieldQuestion className="h-3.5 w-3.5 text-muted-foreground/70" />
          <span className="font-medium text-foreground/80">System events</span>
          <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground">
            {events.length}
          </span>
          {alertCount > 0 && (
            <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] text-red-500">
              {alertCount} alert{alertCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 transition-transform",
            open ? "rotate-180" : "rotate-0",
          )}
        />
      </button>

      {open && (
        <div className="border-t border-border/50">
          {events.map((event) => {
            const expanded = expandedId === event.id;
            const shouldExpand = event.text.length > 140;
            const preview = shouldExpand
              ? `${event.text.slice(0, 137)}…`
              : event.text;

            return (
              <div
                key={event.id}
                className="border-t border-border/40 first:border-t-0"
              >
                <button
                  type="button"
                  onClick={() => {
                    if (!shouldExpand) return;
                    setExpandedId((prev) => (prev === event.id ? null : event.id));
                  }}
                  className="flex w-full items-start gap-3 px-3 py-2 text-left"
                >
                  <SystemEventTag kind={event.kind} tone={event.tone} />
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="text-[10px] text-muted-foreground/70">
                      {formatSystemTimestamp(event.timestamp)}
                    </div>
                    <div className="text-xs text-foreground/80 whitespace-pre-wrap">
                      {expanded ? event.text : preview}
                    </div>
                  </div>
                  {shouldExpand && (
                    <ChevronRight
                      className={cn(
                        "mt-1 h-3.5 w-3.5 text-muted-foreground/60 transition-transform",
                        expanded && "rotate-90",
                      )}
                    />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

function SystemEventTag({
  kind,
  tone,
}: {
  kind: SystemEventKind;
  tone?: SystemEventTone;
}) {
  const isAlert = kind === "alert";
  const isError = tone === "error";
  const className = cn(
    "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium",
    kind === "system" && "border-border/60 bg-muted/40 text-muted-foreground",
    kind === "heartbeat" &&
      "border-blue-500/30 bg-[color:var(--cp-status-heartbeat-bg)] text-[color:var(--cp-status-heartbeat-text)]",
    isAlert &&
      (isError
        ? "border-red-500/30 bg-[color:var(--cp-status-error-bg)] text-[color:var(--cp-status-error-text)]"
        : "border-amber-500/30 bg-[color:var(--cp-status-alert-bg)] text-[color:var(--cp-status-alert-text)]"),
  );

  const label = kind === "system" ? "System" : kind === "heartbeat" ? "Heartbeat" : "Alert";

  return <span className={className}>{label}</span>;
}

// ─── Message Group Renderer ─────────────────────────────────────────────────

const ToolStreamGroupRenderer = memo(function ToolStreamGroupRenderer({
  entries,
}: {
  entries: ToolStreamEntry[];
}) {
  return (
    <div className="flex flex-col gap-0.5 items-start max-w-[95%]">
      {entries.map((entry) => (
        <ToolStreamCard
          key={`${entry.toolCallId}-${entry.updatedAt}`}
          entry={entry}
        />
      ))}
    </div>
  );
});

const MessageGroupRenderer = memo(function MessageGroupRenderer({
  group,
  showReasoning,
  showTools,
}: {
  group: MessageGroup;
  showReasoning: boolean;
  showTools: boolean;
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
            showReasoning={showReasoning}
            showTools={showTools}
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
        let src: string | undefined;
        const source = (part as any).source as Record<string, unknown> | undefined;
        if (source?.type === "base64" && typeof source.data === "string") {
          const data = source.data;
          const mediaType = (source.media_type as string) || "image/png";
          src = data.startsWith("data:")
            ? data
            : `data:${mediaType};base64,${data}`;
        } else {
          src =
            (part as any).image_url ??
            (part as any).url ??
            (typeof source?.url === "string" ? (source.url as string) : undefined);
        }
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
          {/* eslint-disable-next-line @next/next/no-img-element -- dynamic lightbox source */}
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

      <div className="flex items-center gap-1.5 pr-4">
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
              /* eslint-disable-next-line @next/next/no-img-element -- dynamic chat image source */
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
          <div className="cp-user-bubble rounded-2xl px-4 py-2 text-sm leading-relaxed break-words overflow-hidden">
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
  showReasoning,
  showTools,
}: {
  message: NormalizedMessage;
  showReasoning: boolean;
  showTools: boolean;
}) {
  // Use pre-extracted display text (thinking tags already stripped)
  const text = message.displayText?.trim() || null;
  const toolCards = showTools ? message.toolCards : [];
  const hasToolCards = toolCards.length > 0;
  const reasoningRaw = showReasoning ? extractThinking(message.raw) : null;
  const reasoning = reasoningRaw ? formatReasoningMarkdown(reasoningRaw) : null;

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
      {text && (
        <div className="flex items-center gap-1.5">
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
      )}

      {/* Text content */}
      {text && (
        <div className="min-w-0 text-sm leading-relaxed opacity-90">
          <MarkdownRenderer text={text} />
        </div>
      )}

      {/* Reasoning (if enabled and available) */}
      {reasoning && (
        <div className="min-w-0 text-xs text-muted-foreground">
          <MarkdownRenderer text={reasoning} />
        </div>
      )}

      {/* Tool cards inline (visible only when tool activity is enabled) */}
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
    <div className="flex flex-col gap-0.5">
      {toolCards.map((card, i) => (
        <HistoryToolCard key={`tr-${i}`} card={card} />
      ))}
    </div>
  );
});

/**
 * Renders a single tool card (call or result) from history.
 * Matches OpenClaw's renderToolCardSidebar pattern:
 * - Output is hidden until expanded
 * - No output: "Completed" status
 */
const HistoryToolCard = memo(function HistoryToolCard({
  card,
}: {
  card: ToolCard;
}) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const prefersReducedMotion = useReducedMotion();
  const tool = getToolMeta(card.name);
  const Icon = tool.icon;
  const displayText = formatToolTextForDisplay(card.text) ?? card.text ?? "";
  const hasText = Boolean(displayText.trim());

  // Build detail line from args (matching OpenClaw's formatToolDetail)
  const detail = formatToolDetailFromArgs(card.args);
  const canExpand = hasText;

  return (
    <div className="my-0 max-w-full">
      <button
        type="button"
        onClick={canExpand ? () => setExpanded(!expanded) : undefined}
        className={cn(
          "group flex w-full items-center gap-1 rounded-md px-0 py-px text-left text-[11px] leading-4 transition-colors",
          "text-muted-foreground/60 hover:text-muted-foreground",
          canExpand && "hover:bg-muted/30 cursor-pointer",
          !canExpand && "cursor-default",
          expanded && "bg-muted/40 text-foreground",
        )}
        aria-expanded={canExpand ? expanded : undefined}
        aria-controls={canExpand ? detailsId : undefined}
      >
        <span
          className={cn(
            "flex h-3.5 w-3.5 items-center justify-center",
            canExpand ? "text-muted-foreground/50 group-hover:text-muted-foreground" : "opacity-0",
          )}
          aria-hidden="true"
        >
          {canExpand ? (
            expanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
        </span>
        <span className="shrink-0 text-muted-foreground/70 group-hover:text-foreground">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex items-center gap-1.5">
          <span className="font-medium text-foreground/75 group-hover:text-foreground">
            {tool.label}
          </span>
          {detail && (
            <span className="truncate max-w-[220px] text-[10px] font-mono text-muted-foreground/60 group-hover:text-muted-foreground">
              {detail}
            </span>
          )}
        </span>
        <span className="ml-auto flex items-center gap-1 text-muted-foreground/50">
          {card.kind === "result" && !hasText && (
            <Check className="h-3 w-3" />
          )}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {canExpand && expanded && (
          <motion.div
            id={detailsId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.18 }}
            className="overflow-hidden"
          >
            <div className="pt-1 pl-6">
              <pre className="max-h-[200px] overflow-y-auto rounded bg-muted/30 p-2 text-[10px] font-mono text-muted-foreground whitespace-pre-wrap">
                {displayText}
              </pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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
          {/* eslint-disable-next-line @next/next/no-img-element -- dynamic lightbox source */}
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
              /* eslint-disable-next-line @next/next/no-img-element -- dynamic chat image source */
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
            "rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm break-words overflow-hidden",
            message.status === "error"
              ? "bg-red-500 text-white dark:bg-red-600"
              : "cp-user-bubble",
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

function mergeTextParts(
  parts: ChatMessageType["parts"],
): ChatMessageType["parts"] {
  const merged: ChatMessageType["parts"] = [];
  let buffer = "";

  const flush = () => {
    if (buffer.trim().length > 0) {
      merged.push({ type: "text", text: buffer });
    }
    buffer = "";
  };

  for (const part of parts) {
    if (part.type === "text" && typeof part.text === "string") {
      if (buffer) {
        buffer += "\n";
      }
      buffer += part.text;
      continue;
    }
    flush();
    merged.push(part);
  }

  flush();
  return merged;
}

function extractAiSdkText(message: ChatMessageType): string {
  const merged = mergeTextParts(message.parts ?? []);
  return merged
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text as string)
    .join("\n")
    .trim();
}

const ChatMessage = memo(function ChatMessage({
  message,
  _images,
  isLatest,
  isStreaming,
  showThinking,
  onToolApprove,
  onToolDeny,
}: {
  message: ChatMessageType;
  _images?: string[];
  isLatest?: boolean;
  isStreaming?: boolean;
  showThinking?: boolean;
  onToolApprove?: (id: string) => void;
  onToolDeny?: (id: string) => void;
}) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const normalizedParts = useMemo(
    () => mergeTextParts(message.parts ?? []),
    [message.parts],
  );

  if (message.role === "user") return null;

  return (
    <div className="flex flex-col gap-1 items-start">
      {/* Lightbox overlay */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 cursor-pointer"
          onClick={() => setLightboxUrl(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- dynamic lightbox source */}
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
        {normalizedParts.map((part, i) => {
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
      // eslint-disable-next-line @next/next/no-img-element -- markdown can include arbitrary sources
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

// ─── Tool Stream Card (ChatGPT-style) ───────────────────────────────────────

const ToolStreamCard = memo(function ToolStreamCard({
  entry,
}: {
  entry: ToolStreamEntry;
}) {
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const prefersReducedMotion = useReducedMotion();
  const tool = getToolMeta(entry.name);
  const Icon = tool.icon;
  const detail = formatToolDetailFromArgs(entry.args);
  const argsText = formatToolArgsForDisplay(entry.args);
  const outputText = entry.output?.trim() ?? "";
  const outputDisplay = formatToolTextForDisplay(outputText) ?? outputText;
  const hasOutput = Boolean(outputText);
  const canExpand = Boolean(argsText || hasOutput);
  const isActive = entry.phase === "start" || entry.phase === "update";

  const status =
    entry.phase === "result"
      ? "Completed"
      : entry.phase === "error"
        ? "Error"
        : "Running";
  const StatusIcon =
    entry.phase === "result"
      ? Check
      : entry.phase === "error"
        ? AlertCircle
        : Loader2;

  return (
    <div
      className={cn(
        "rounded-lg border border-transparent bg-transparent",
        "transition-colors",
        "hover:border-border/40 hover:bg-muted/20",
        open && "border-border/50 bg-muted/30",
        isActive && "bg-muted/30",
      )}
    >
      <button
        type="button"
        onClick={() => {
          if (canExpand) setOpen((prev) => !prev);
        }}
        className={cn(
          "group flex w-full items-center justify-between gap-2 px-0 py-px text-left",
          "text-[11px] leading-4 transition-colors",
          "text-muted-foreground/60 hover:text-muted-foreground",
          canExpand ? "cursor-pointer" : "cursor-default",
        )}
        aria-expanded={canExpand ? open : undefined}
        aria-disabled={!canExpand}
        aria-controls={canExpand ? detailsId : undefined}
      >
        <span
          className={cn(
            "flex h-3.5 w-3.5 items-center justify-center",
            canExpand ? "text-muted-foreground/50 group-hover:text-muted-foreground" : "opacity-0",
          )}
          aria-hidden="true"
        >
          {canExpand ? (
            open ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
        </span>
        <span className="shrink-0 text-muted-foreground/70 group-hover:text-foreground" aria-hidden="true">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="flex flex-col min-w-0">
          <span className="text-[11px] font-medium text-foreground/75 group-hover:text-foreground">
            {tool.label}
          </span>
          {detail && (
            <span className="text-[10px] font-mono text-muted-foreground/60 truncate group-hover:text-muted-foreground">
              {detail}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <StatusIcon
            className={cn(
              "h-3.5 w-3.5",
              status === "Running" && "animate-spin motion-reduce:animate-none",
              status === "Error" && "text-destructive",
            )}
          />
          <span
            className={cn(
              status === "Error" && "text-destructive",
              isActive && "animate-pulse motion-reduce:animate-none",
            )}
          >
            {status}
          </span>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open && canExpand && (
          <motion.div
            id={detailsId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.18 }}
            className="overflow-hidden"
          >
            <div className="px-2 pb-2 space-y-2">
              {argsText && (
                <div>
                  <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
                    Args
                  </div>
                  <pre className="max-h-60 overflow-auto rounded-md bg-background/60 px-2 py-1.5 text-[10px] font-mono whitespace-pre-wrap text-foreground">
                    {argsText}
                  </pre>
                </div>
              )}
              {hasOutput && (
                <div>
                  <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
                    Output
                  </div>
                  <pre className="max-h-60 overflow-auto rounded-md bg-background/60 px-2 py-1.5 text-[10px] font-mono whitespace-pre-wrap text-foreground">
                    {outputDisplay}
                  </pre>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

// ─── Tool Call Card (compact, inline) ────────────────────────────────────────

type ToolMeta = { icon: typeof Wrench; label: string };

const TOOL_META: Record<string, ToolMeta> = {
  Read: { icon: FileText, label: "Read file" },
  Edit: { icon: FilePenLine, label: "Edit file" },
  Write: { icon: FileOutput, label: "Write file" },
  exec: { icon: Terminal, label: "Run command" },
  web_search: { icon: Search, label: "Web search" },
  web_fetch: { icon: Globe, label: "Fetch page" },
  browser: { icon: Globe, label: "Browser" },
  message: { icon: MessageSquare, label: "Send message" },
  image: { icon: ImageIcon, label: "Analyze image" },
  tts: { icon: Volume2, label: "Text to speech" },
  nodes: { icon: Network, label: "Node control" },
  canvas: { icon: Palette, label: "Canvas" },
  process: { icon: Cpu, label: "Process" },
};

function getToolMeta(name: string): ToolMeta {
  const trimmed = name.trim();
  const normalized = trimmed.replace(/[\s-]+/g, "_");
  const normalizedLower = normalized.toLowerCase();
  const capitalized =
    normalizedLower.length > 0
      ? normalizedLower[0].toUpperCase() + normalizedLower.slice(1)
      : "";
  const candidates = [trimmed, normalized, normalizedLower, trimmed.toLowerCase(), capitalized];
  for (const key of candidates) {
    if (key && TOOL_META[key]) return TOOL_META[key];
  }
  return { icon: Wrench, label: trimmed || "Tool" };
}

function formatToolDetailFromArgs(args?: unknown): string | null {
  if (!args) return null;
  if (typeof args === "string") {
    const trimmed = args.trim();
    if (!trimmed) return null;
    return trimmed.length > 60 ? trimmed.slice(0, 57) + "…" : trimmed;
  }
  if (typeof args !== "object") return null;
  const a = args as Record<string, unknown>;
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
}

function formatToolArgsForDisplay(args?: unknown): string | null {
  if (args === null || args === undefined) return null;
  if (typeof args === "string") return args.trim() ? args : null;
  try {
    return JSON.stringify(args, null, 2);
  } catch {
    return String(args);
  }
}

function formatToolTextForDisplay(text?: string | null): string | null {
  if (!text) return null;
  return tryFormatJson(text) ?? text;
}

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

  const tool = getToolMeta(toolName);
  const Icon = tool.icon;

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
      <div className="my-1.5 flex items-center gap-2 rounded-md px-2 py-1 text-[11px] leading-4 text-muted-foreground/60 transition-colors hover:text-muted-foreground hover:bg-muted/30">
        {isRunning ? (
          <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none shrink-0" />
        ) : isComplete ? (
          <Check className="h-3 w-3 text-green-600 shrink-0" />
        ) : isError ? (
          <Ban className="h-3 w-3 text-destructive shrink-0" />
        ) : (
          <span className="shrink-0 text-muted-foreground/70">
            <Icon className="h-3.5 w-3.5" />
          </span>
        )}
        <span className="font-medium text-foreground/75">{tool.label}</span>
        {brief && (
          <span className="truncate max-w-[200px] text-[10px] font-mono text-muted-foreground/60">
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
