import { create } from "zustand";

interface WorkspaceState {
  /** Currently active page path (relative to pages dir) */
  activePage: string | null;
  /** Whether the sidebar is expanded */
  sidebarOpen: boolean;
  /** Whether the chat panel is visible */
  chatPanelOpen: boolean;

  // Actions
  setActivePage: (path: string | null) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  toggleChatPanel: () => void;
  setChatPanelOpen: (open: boolean) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  activePage: null,
  sidebarOpen: true,
  chatPanelOpen: false,

  setActivePage: (path) => set({ activePage: path }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleChatPanel: () => set((s) => ({ chatPanelOpen: !s.chatPanelOpen })),
  setChatPanelOpen: (open) => set({ chatPanelOpen: open }),
}));
