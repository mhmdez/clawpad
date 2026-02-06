import { create } from "zustand";
import type { Space, PageMeta } from "@/lib/files";
import { titleToSlug } from "@/lib/utils/slug";

interface WorkspaceState {
  // Sidebar
  spaces: Space[];
  expandedSpaces: Set<string>;
  sidebarOpen: boolean;

  // Current page
  activePage: string | null; // relative path

  // Recent pages
  recentPages: PageMeta[];

  // Chat panel
  chatPanelOpen: boolean;

  // Loading states
  loadingSpaces: boolean;
  loadingPages: Map<string, boolean>;

  // Page cache (space → pages)
  pagesBySpace: Map<string, PageMeta[]>;

  // Actions
  loadSpaces: () => Promise<void>;
  loadPages: (space: string) => Promise<void>;
  loadRecentPages: () => Promise<void>;
  setActivePage: (path: string | null) => void;
  toggleSpace: (space: string) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  toggleChatPanel: () => void;
  setChatPanelOpen: (open: boolean) => void;
  createPage: (space: string, title: string) => Promise<string>;
  deletePage: (path: string) => Promise<void>;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  // State
  spaces: [],
  expandedSpaces: new Set<string>(),
  sidebarOpen: true,
  activePage: null,
  recentPages: [],
  chatPanelOpen: false,
  loadingSpaces: false,
  loadingPages: new Map<string, boolean>(),
  pagesBySpace: new Map<string, PageMeta[]>(),

  // Actions
  loadSpaces: async () => {
    set({ loadingSpaces: true });
    try {
      const res = await fetch("/api/files/spaces");
      if (!res.ok) throw new Error("Failed to load spaces");
      const spaces: Space[] = await res.json();
      set({ spaces, loadingSpaces: false });
    } catch {
      set({ loadingSpaces: false });
    }
  },

  loadPages: async (space: string) => {
    const { loadingPages } = get();
    const next = new Map(loadingPages);
    next.set(space, true);
    set({ loadingPages: next });

    try {
      const res = await fetch(
        `/api/files/spaces/${encodeURIComponent(space)}/pages?recursive=true`,
      );
      if (!res.ok) throw new Error("Failed to load pages");
      const pages: PageMeta[] = await res.json();

      const { pagesBySpace, loadingPages: current } = get();
      const nextPages = new Map(pagesBySpace);
      nextPages.set(space, pages);
      const nextLoading = new Map(current);
      nextLoading.set(space, false);
      set({ pagesBySpace: nextPages, loadingPages: nextLoading });
    } catch {
      const { loadingPages: current } = get();
      const nextLoading = new Map(current);
      nextLoading.set(space, false);
      set({ loadingPages: nextLoading });
    }
  },

  loadRecentPages: async () => {
    try {
      const res = await fetch("/api/files/recent?limit=5");
      if (!res.ok) throw new Error("Failed to load recent pages");
      const recentPages: PageMeta[] = await res.json();
      set({ recentPages });
    } catch {
      // silent
    }
  },

  setActivePage: (path) => set({ activePage: path }),

  toggleSpace: (space: string) => {
    const { expandedSpaces, pagesBySpace } = get();
    const next = new Set(expandedSpaces);
    if (next.has(space)) {
      next.delete(space);
    } else {
      next.add(space);
      // Lazy load pages on first expand
      if (!pagesBySpace.has(space)) {
        get().loadPages(space);
      }
    }
    set({ expandedSpaces: next });
  },

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleChatPanel: () => set((s) => ({ chatPanelOpen: !s.chatPanelOpen })),
  setChatPanelOpen: (open) => set({ chatPanelOpen: open }),

  createPage: async (space: string, title: string) => {
    const slug = titleToSlug(title);
    if (!slug) {
      throw new Error("Title results in an empty filename.");
    }
    const pagePath = `${space}/${slug}`;
    const encodedPath = [space, slug].map(encodeURIComponent).join("/");

    const res = await fetch(`/api/files/pages/${encodedPath}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: `\n# ${title}\n\n`,
        meta: { title },
      }),
    });

    if (!res.ok) {
      let message = "Failed to create page";
      try {
        const payload = (await res.json()) as { error?: string };
        if (payload?.error) message = payload.error;
      } catch {
        // ignore JSON parse errors
      }
      throw new Error(message);
    }

    // Refresh the space's pages and recent
    get().loadPages(space);
    get().loadRecentPages();
    get().loadSpaces(); // refresh page counts

    return pagePath;
  },

  deletePage: async (path: string) => {
    const res = await fetch(`/api/files/pages/${path}`, {
      method: "DELETE",
    });

    if (!res.ok) throw new Error("Failed to delete page");

    // Extract space from path
    const space = path.split("/")[0];
    get().loadPages(space);
    get().loadRecentPages();
    get().loadSpaces();

    // Clear active page if it was the deleted one
    const { activePage } = get();
    if (activePage === path) {
      set({ activePage: null });
    }
  },
}));
