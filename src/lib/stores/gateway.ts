import { create } from "zustand";
import type { SessionInfo } from "@/lib/gateway/types";

type AgentStatus = "idle" | "thinking" | "active";
type WSStatus = "disconnected" | "connecting" | "connected";

interface GatewayState {
  /** Whether connected to gateway (HTTP health check) */
  connected: boolean;
  /** Whether currently attempting HTTP connection */
  connecting: boolean;
  /** WebSocket connection status (real-time) */
  wsStatus: WSStatus;
  /** Gateway HTTP URL */
  url: string;
  /** Authentication token */
  token?: string;
  /** Connected agent name */
  agentName?: string;
  /** Config source (how gateway was detected) */
  source?: string;
  /** Active sessions from gateway */
  sessions: SessionInfo[];
  /** Overall agent status */
  agentStatus: AgentStatus;
  /** Last error message */
  error?: string;
  /** Currently selected session key (from sidebar click) */
  activeSessionKey: string | null;

  // Actions
  detect: () => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => void;
  loadSessions: () => Promise<void>;
  setUrl: (url: string) => void;
  setToken: (token: string) => void;
  /** Update WS connection status (called from useGatewayEvents hook) */
  setWSStatus: (status: WSStatus) => void;
  /** Update agent activity status (called from useGatewayEvents hook) */
  setAgentStatus: (status: AgentStatus) => void;
  /** Set the active session key (e.g. from sidebar session click) */
  setActiveSessionKey: (key: string | null) => void;
}

const DEFAULT_URL = "http://127.0.0.1:18789";

export const useGatewayStore = create<GatewayState>((set, get) => ({
  connected: false,
  connecting: false,
  wsStatus: "disconnected",
  url: DEFAULT_URL,
  token: undefined,
  agentName: undefined,
  source: undefined,
  sessions: [],
  agentStatus: "idle",
  error: undefined,
  activeSessionKey: null,

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
      set({ error: `Detection failed: ${String(error)}` });
    }
  },

  connect: async () => {
    const { url } = get();
    set({ connecting: true, error: undefined });

    try {
      const res = await fetch("/api/gateway/status");
      if (!res.ok) throw new Error("Failed to check gateway status");
      const status = await res.json();

      if (status.connected) {
        set({
          connected: true,
          connecting: false,
          agentName: status.agentName || get().agentName,
          error: undefined,
        });
        // Load sessions after successful connection
        get().loadSessions();
      } else {
        set({
          connected: false,
          connecting: false,
          error: status.error || `Cannot connect to ${url}`,
        });
      }
    } catch (error) {
      set({
        connected: false,
        connecting: false,
        error: `Connection failed: ${String(error)}`,
      });
    }
  },

  disconnect: () => {
    set({
      connected: false,
      connecting: false,
      wsStatus: "disconnected",
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

  setWSStatus: (wsStatus: WSStatus) => {
    set({ wsStatus });
    // Sync the legacy `connected` flag
    if (wsStatus === "connected") {
      set({ connected: true, connecting: false, error: undefined });
    } else if (wsStatus === "connecting") {
      set({ connecting: true });
    } else {
      set({ connected: false, connecting: false });
    }
  },

  setAgentStatus: (agentStatus: AgentStatus) => set({ agentStatus }),

  setActiveSessionKey: (key: string | null) => set({ activeSessionKey: key }),
}));
