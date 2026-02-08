import { create } from "zustand";
import type { SessionInfo } from "@/lib/gateway/types";

type AgentStatus = "idle" | "thinking" | "active";
export type GatewayReachabilityReason =
  | "gateway_unreachable"
  | "server_unreachable"
  | null;
type WSStatus = "disconnected" | "connecting" | "reconnecting" | "connected";

interface GatewayState {
  /** Whether connected to gateway (HTTP health check) */
  connected: boolean;
  /** Whether currently attempting HTTP connection */
  connecting: boolean;
  /** WebSocket connection status (real-time) */
  wsStatus: WSStatus;
  /** Last WebSocket error message */
  wsError?: string;
  /** Why the gateway is unreachable (if known) */
  reason: GatewayReachabilityReason;
  /** Gateway HTTP URL */
  url: string;
  /** Authentication token */
  token?: string;
  /** Connected agent name */
  agentName?: string;
  /** Config source (how gateway was detected) */
  source?: string;
  /** Active sessions from gateway (still fetched for internal use) */
  sessions: SessionInfo[];
  /** Overall agent status */
  agentStatus: AgentStatus;
  /** Last error message */
  error?: string;

  // Actions
  detect: () => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => void;
  loadSessions: () => Promise<void>;
  setUrl: (url: string) => void;
  setToken: (token: string) => void;
  /** Update WS connection status (called from useGatewayEvents hook) */
  setWSStatus: (
    status: WSStatus,
    info?: { error?: string; code?: string; reason?: GatewayReachabilityReason },
  ) => void;
  /** Update agent activity status (called from useGatewayEvents hook) */
  setAgentStatus: (status: AgentStatus) => void;
}

const DEFAULT_URL = "http://127.0.0.1:18789";

export const useGatewayStore = create<GatewayState>((set, get) => ({
  connected: false,
  connecting: false,
  wsStatus: "disconnected",
  wsError: undefined,
  reason: null,
  url: DEFAULT_URL,
  token: undefined,
  agentName: undefined,
  source: undefined,
  sessions: [],
  agentStatus: "idle",
  error: undefined,

  detect: async () => {
    try {
      const res = await fetch("/api/gateway/detect");
      if (!res.ok) throw new Error("Failed to detect gateway");
      const config = await res.json();
      if (config) {
        set({
          url: config.url || DEFAULT_URL,
          token: config.token || undefined,
          agentName: config.agentName || undefined,
          source: config.source || undefined,
        });
      }
    } catch (error) {
      set({
        reason: "server_unreachable",
        error: `Detection failed: ${String(error)}`,
      });
    }
  },

  connect: async () => {
    const { url } = get();
    set({ connecting: true, error: undefined, reason: null });

    try {
      const res = await fetch("/api/gateway/status");
      if (!res.ok) throw new Error("Failed to check gateway status");
      const status = await res.json() as {
        connected?: boolean;
        reason?: GatewayReachabilityReason;
        agentName?: string;
        error?: string;
      };

      if (status.connected) {
        set({
          connected: true,
          connecting: false,
          agentName: status.agentName || get().agentName,
          reason: null,
          error: undefined,
        });
        // Load sessions after successful connection
        get().loadSessions();
      } else {
        set({
          connected: false,
          connecting: false,
          reason: status.reason ?? "gateway_unreachable",
          error: status.error || `Cannot connect to ${url}`,
        });
      }
    } catch (error) {
      set({
        connected: false,
        connecting: false,
        reason: "server_unreachable",
        error: `ClawPad server unreachable: ${String(error)}`,
      });
    }
  },

  disconnect: () => {
    set({
      connected: false,
      connecting: false,
      wsStatus: "disconnected",
      reason: null,
      sessions: [],
      agentStatus: "idle",
      error: undefined,
    });
  },

  loadSessions: async () => {
    try {
      const res = await fetch("/api/gateway/sessions");
      if (!res.ok) return;
      const data = await res.json();
      const sessions: SessionInfo[] = data.sessions ?? [];

      // Derive agent status from sessions (only if WS hasn't already set it)
      const hasActive = sessions.some((s) => s.status === "active");
      const hasThinking = sessions.some((s) => s.status === "thinking");
      const agentStatus: AgentStatus = hasActive
        ? "active"
        : hasThinking
          ? "thinking"
          : "idle";

      set({ sessions, agentStatus });
    } catch {
      // Silent — don't clear sessions on transient failure
    }
  },

  setUrl: (url: string) => set({ url }),
  setToken: (token: string) => set({ token: token || undefined }),

  setWSStatus: (
    wsStatus: WSStatus,
    info?: { error?: string; code?: string; reason?: GatewayReachabilityReason },
  ) => {
    set({ wsStatus, wsError: wsStatus === "connected" ? undefined : info?.error });
    // Sync the legacy `connected` flag
    if (wsStatus === "connected") {
      set({ connected: true, connecting: false, reason: null, error: undefined });
    } else if (wsStatus === "connecting" || wsStatus === "reconnecting") {
      set({
        connected: false,
        connecting: true,
        reason: info?.reason ?? "gateway_unreachable",
      });
    } else {
      set({
        connected: false,
        connecting: false,
        reason: info?.reason ?? get().reason ?? "gateway_unreachable",
      });
    }
  },

  setAgentStatus: (agentStatus: AgentStatus) => set({ agentStatus }),
}));
