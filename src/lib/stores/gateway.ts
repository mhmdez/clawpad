import { create } from "zustand";
import type { SessionInfo } from "@/lib/gateway/types";

type AgentStatus = "idle" | "thinking" | "active";

interface GatewayState {
  /** Whether connected to gateway */
  connected: boolean;
  /** Whether currently attempting connection */
  connecting: boolean;
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

  // Actions
  detect: () => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => void;
  loadSessions: () => Promise<void>;
  setUrl: (url: string) => void;
  setToken: (token: string) => void;
}

const DEFAULT_URL = "http://127.0.0.1:18789";

export const useGatewayStore = create<GatewayState>((set, get) => ({
  connected: false,
  connecting: false,
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

      // Derive agent status from sessions
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
}));
