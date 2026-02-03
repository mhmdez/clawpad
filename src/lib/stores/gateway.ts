import { create } from "zustand";

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

interface GatewayState {
  /** Current connection status */
  status: ConnectionStatus;
  /** Gateway WebSocket URL */
  url: string;
  /** Authentication token (if any) */
  token: string | null;
  /** Connected agent name */
  agentName: string | null;
  /** Last error message */
  error: string | null;
  /** Config source (how the gateway was detected) */
  source: string | null;

  // Actions
  setStatus: (status: ConnectionStatus) => void;
  setConfig: (config: { url: string; token?: string; agentName?: string; source?: string }) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const DEFAULT_URL = "ws://127.0.0.1:18789";

export const useGatewayStore = create<GatewayState>((set) => ({
  status: "disconnected",
  url: DEFAULT_URL,
  token: null,
  agentName: null,
  error: null,
  source: null,

  setStatus: (status) => set({ status, error: status === "error" ? undefined : null }),
  setConfig: ({ url, token, agentName, source }) =>
    set({
      url: url || DEFAULT_URL,
      token: token ?? null,
      agentName: agentName ?? null,
      source: source ?? null,
    }),
  setError: (error) => set({ error, status: error ? "error" : "disconnected" }),
  reset: () =>
    set({
      status: "disconnected",
      url: DEFAULT_URL,
      token: null,
      agentName: null,
      error: null,
      source: null,
    }),
}));
