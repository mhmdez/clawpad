import { create } from "zustand";
import type { ChangeSetSummary } from "@/lib/changes/types";

interface ActiveRun {
  runId: string;
  sessionKey: string;
  startedAt: number;
}

interface ReviewState {
  open: boolean;
  changeSetId: string | null;
  filePath: string | null;
}

interface ChangesState {
  sessionKey: string | null;
  activeRun: ActiveRun | null;
  activeFiles: Set<string>;
  changeSets: ChangeSetSummary[];
  review: ReviewState;
  dismissed: Set<string>;
  loading: boolean;
  error?: string;

  setSessionKey: (sessionKey: string) => void;
  setActiveRun: (run: ActiveRun | null) => void;
  touchFile: (path: string) => void;
  clearActiveFiles: () => void;
  loadChangeSets: () => Promise<void>;
  openReview: (changeSetId: string, filePath: string) => void;
  closeReview: () => void;
  dismissChangeSet: (id: string) => void;
}

export const useChangesStore = create<ChangesState>((set, get) => ({
  sessionKey: null,
  activeRun: null,
  activeFiles: new Set<string>(),
  changeSets: [],
  review: { open: false, changeSetId: null, filePath: null },
  dismissed: new Set<string>(),
  loading: false,
  error: undefined,

  setSessionKey: (sessionKey) => set({ sessionKey }),
  setActiveRun: (run) => set({ activeRun: run }),

  touchFile: (path) =>
    set((state) => {
      const next = new Set(state.activeFiles);
      next.add(path);
      return { activeFiles: next };
    }),

  clearActiveFiles: () => set({ activeFiles: new Set<string>() }),

  loadChangeSets: async () => {
    const sessionKey = get().sessionKey;
    if (!sessionKey) return;
    set({ loading: true, error: undefined });
    try {
      const res = await fetch(`/api/changes?sessionKey=${encodeURIComponent(sessionKey)}`);
      if (!res.ok) throw new Error("Failed to load change sets");
      const data = (await res.json()) as ChangeSetSummary[];
      set({ changeSets: data, loading: false });
    } catch (err) {
      set({ loading: false, error: String(err) });
    }
  },

  openReview: (changeSetId, filePath) =>
    set({ review: { open: true, changeSetId, filePath } }),

  closeReview: () =>
    set({ review: { open: false, changeSetId: null, filePath: null } }),

  dismissChangeSet: (id) =>
    set((state) => {
      const next = new Set(state.dismissed);
      next.add(id);
      return { dismissed: next };
    }),
}));
