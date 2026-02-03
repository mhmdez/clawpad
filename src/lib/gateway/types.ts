// ─── OpenClaw Gateway Protocol v3 Types ────────────────────────────────────
// Ported from crabwalk analysis — complete protocol types for gateway communication

// ─── Frame Types ────────────────────────────────────────────────────────────

export interface RequestFrame {
  id: string;
  method: string;
  params?: unknown;
}

export interface ResponseFrame {
  id: string;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface EventFrame {
  event: string;
  data: unknown;
  ts?: number;
}

export type GatewayFrame = RequestFrame | ResponseFrame | EventFrame;

// ─── Connection ─────────────────────────────────────────────────────────────

export interface ConnectParams {
  name: string;
  token?: string;
  role: "monitor" | "client";
  version?: string;
  nonce?: string;
  challenge?: string;
}

export interface HelloOk {
  name: string;
  version: string;
  agents: string[];
  presence: PresenceEntry[];
}

export interface PresenceEntry {
  name: string;
  role: string;
  connectedAt: string;
  lastSeen?: string;
}

// ─── Chat Events ────────────────────────────────────────────────────────────

export type ChatEventState = "delta" | "final" | "aborted" | "error";

export interface ChatEvent {
  runId: string;
  sessionKey: string;
  state: ChatEventState;
  message?: ChatMessage;
  usage?: TokenUsage;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  stopReason?: string;
}

export interface ChatMessage {
  role: "assistant" | "user" | "system";
  content: string | ContentBlock[];
}

export interface ContentBlock {
  type: "text" | "tool_use" | "tool_result" | "image";
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  content?: string | ContentBlock[];
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
}

// ─── Agent Events ───────────────────────────────────────────────────────────

export type AgentStreamType = "lifecycle" | "assistant" | "tool";

export interface AgentEvent {
  runId: string;
  sessionKey: string;
  stream: AgentStreamType;
  type: string; // "start" | "end" | "text" | "tool_use" | "tool_result" | etc.
  data?: unknown;
  timestamp?: string;
}

// ─── Exec Events ────────────────────────────────────────────────────────────

export interface ExecStartedEvent {
  runId: string;
  sessionKey: string;
  pid: number;
  command: string;
  cwd?: string;
  startedAt: string;
}

export interface ExecOutputEvent {
  runId: string;
  sessionKey: string;
  pid: number;
  stream: "stdout" | "stderr";
  data: string;
  timestamp: string;
}

export interface ExecCompletedEvent {
  runId: string;
  sessionKey: string;
  pid: number;
  exitCode: number;
  duration: number;
  completedAt: string;
}

// ─── Sessions ───────────────────────────────────────────────────────────────

export interface SessionInfo {
  sessionKey: string;
  agentId: string;
  platform: string;
  channel: string;
  recipient?: string;
  status: "idle" | "thinking" | "active";
  startedAt: string;
  lastActivityAt: string;
  messageCount?: number;
}

export interface MonitorSession {
  sessionKey: string;
  agentId: string;
  platform: string;
  channel: string;
  recipient?: string;
  status: "idle" | "thinking" | "active";
  actions: MonitorAction[];
  spawnedBy?: string;
}

export interface MonitorAction {
  id: string;
  runId: string;
  type: "chat" | "agent" | "exec" | "system";
  state: string;
  content?: string;
  toolName?: string;
  toolArgs?: unknown;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  usage?: TokenUsage;
}

// ─── Session Key Parsing ────────────────────────────────────────────────────

export interface ParsedSessionKey {
  agentId: string;
  scope: string;
  platform: string;
  channel: string;
  recipient?: string;
  raw: string;
}

/**
 * Parse a session key string like "agent:main:telegram:group:12345"
 * into its component parts.
 */
export function parseSessionKey(key: string): ParsedSessionKey {
  const parts = key.split(":");
  return {
    agentId: parts[0] ?? "unknown",
    scope: parts[1] ?? "main",
    platform: parts[2] ?? "unknown",
    channel: parts[3] ?? "",
    recipient: parts.slice(4).join(":") || undefined,
    raw: key,
  };
}

// ─── Request Parameter Types ────────────────────────────────────────────────

export interface SessionsListParams {
  agent?: string;
  platform?: string;
  status?: string;
  limit?: number;
}
