import { create } from "zustand";

export type ActivityType =
  | "file-changed"
  | "file-added"
  | "file-removed"
  | "chat-message"
  | "tool-used"
  | "sub-agent";

export interface ActivityItem {
  id: string;
  type: ActivityType;
  description: string;
  path?: string;
  timestamp: number;
}

const MAX_ITEMS = 20;

interface ActivityState {
  items: ActivityItem[];
  addItem: (item: Omit<ActivityItem, "id">) => void;
  clear: () => void;
}

let counter = 0;

export const useActivityStore = create<ActivityState>((set) => ({
  items: [],

  addItem: (item) =>
    set((state) => {
      const newItem: ActivityItem = {
        ...item,
        id: `activity-${Date.now()}-${++counter}`,
      };
      const next = [newItem, ...state.items].slice(0, MAX_ITEMS);
      return { items: next };
    }),

  clear: () => set({ items: [] }),
}));
