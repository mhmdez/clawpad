import { create } from "zustand";

export type HeartbeatIndicatorType = "ok" | "alert" | "error";

export interface HeartbeatEvent {
  ts: number;
  status: string;
  preview?: string;
  reason?: string;
  indicatorType?: HeartbeatIndicatorType;
  silent?: boolean;
  channel?: string;
  durationMs?: number;
  actionable?: boolean;
}

interface HeartbeatState {
  lastEvent?: HeartbeatEvent;
  events: HeartbeatEvent[];
  updatedAt?: number;
  addEvent: (event: HeartbeatEvent) => void;
  clear: () => void;
}

const MAX_EVENTS = 20;

function resolveIndicatorType(
  status: string | undefined,
  explicit?: HeartbeatIndicatorType,
): HeartbeatIndicatorType | undefined {
  if (explicit) return explicit;
  const normalized = (status ?? "").toLowerCase();
  if (!normalized) return undefined;
  if (normalized === "failed") return "error";
  if (normalized === "sent") return "alert";
  if (normalized.startsWith("ok")) return "ok";
  return undefined;
}

export const useHeartbeatStore = create<HeartbeatState>((set) => ({
  lastEvent: undefined,
  events: [],
  updatedAt: undefined,

  addEvent: (event) =>
    set((state) => {
      const indicatorType = resolveIndicatorType(event.status, event.indicatorType);
      const actionable = indicatorType === "alert" || indicatorType === "error";
      const normalized = { ...event, indicatorType, actionable };
      const next = [normalized, ...state.events];
      if (next.length > MAX_EVENTS) next.length = MAX_EVENTS;
      return {
        lastEvent: normalized,
        events: next,
        updatedAt: Date.now(),
      };
    }),

  clear: () => set({ lastEvent: undefined, events: [], updatedAt: undefined }),
}));
