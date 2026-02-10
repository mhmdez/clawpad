import { create } from "zustand";
import type { Space, PageMeta } from "@/lib/files";
import { titleToSlug } from "@/lib/utils/slug";
import { ROOT_SPACE_PATH } from "@/lib/files/constants";

export type LoadStatus = "idle" | "loading" | "success" | "error";

interface LoadOptions {
  force?: boolean;
  timeoutMs?: number;
  /**
   * Silent loads keep existing status when possible and avoid noisy UI transitions.
   * Used by background refreshes (SSE reconnect, file watcher updates).
   */
  silent?: boolean;
}

interface LoadContext {
  timeoutMs: number;
  signal: AbortSignal;
}

interface CreatePageOptions {
  folderPath?: string;
}

interface CreateFolderOptions {
  starterPageName?: string;
}

interface WorkspaceState {
  // Sidebar
  spaces: Space[];
  expandedSpaces: Set<string>;
  expandedFolders: Set<string>;
  appearanceHydrated: boolean;
  sidebarOpen: boolean;
  sidebarWidth: number;

  // Current page
  activePage: string | null; // relative path

  // Recent pages
  recentPages: PageMeta[];

  // Chat panel
  chatPanelOpen: boolean;

  // Loading states
  spacesStatus: LoadStatus;
  recentStatus: LoadStatus;
  pagesStatusBySpace: Map<string, LoadStatus>;
  spacesError: string | null;
  recentError: string | null;
  pagesErrorBySpace: Map<string, string | null>;
  loadingSpaces: boolean;
  loadingPages: Map<string, boolean>;

  // Page cache (space -> pages)
  pagesBySpace: Map<string, PageMeta[]>;

  // Telemetry
  lastLoadedAt: {
    spaces: number | null;
    recent: number | null;
    pagesBySpace: Map<string, number>;
  };
  lastError: string | null;

  // Actions
  loadSpaces: (opts?: LoadOptions) => Promise<void>;
  loadPages: (space: string, opts?: LoadOptions) => Promise<void>;
  loadRecentPages: (opts?: LoadOptions) => Promise<void>;
  setActivePage: (path: string | null) => void;
  toggleSpace: (space: string) => void;
  toggleFolder: (folderPath: string) => void;
  toggleSidebar: () => void;
  hydrateAppearance: () => void;
  setSidebarOpen: (open: boolean) => void;
  setSidebarWidth: (width: number) => void;
  toggleChatPanel: () => void;
  setChatPanelOpen: (open: boolean) => void;
  createSpace: (name: string) => Promise<string>;
  createPage: (
    space: string,
    title: string,
    options?: CreatePageOptions,
  ) => Promise<string>;
  createFolder: (
    space: string,
    folderPath: string,
    options?: CreateFolderOptions,
  ) => Promise<string>;
  deletePage: (path: string) => Promise<void>;
}

const DEFAULT_TIMEOUT_MS = 8000;
const SIDEBAR_OPEN_KEY = "clawpad.sidebar.open";
const SIDEBAR_WIDTH_KEY = "clawpad.sidebar.width";
const DEFAULT_SIDEBAR_WIDTH = 240;

interface InFlightRequest {
  promise: Promise<void>;
  controller: AbortController;
  requestId: number;
}

const inFlight = {
  spaces: null as InFlightRequest | null,
  recent: null as InFlightRequest | null,
  pages: new Map<string, InFlightRequest>(),
};

let nextRequestId = 1;

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function readSidebarOpen(): boolean {
  if (!isBrowser()) return true;
  const raw = window.localStorage.getItem(SIDEBAR_OPEN_KEY);
  if (raw === "0") return false;
  if (raw === "1") return true;
  return true;
}

function writeSidebarOpen(open: boolean): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(SIDEBAR_OPEN_KEY, open ? "1" : "0");
}

function readSidebarWidth(): number {
  if (!isBrowser()) return DEFAULT_SIDEBAR_WIDTH;
  const raw = window.localStorage.getItem(SIDEBAR_WIDTH_KEY);
  if (!raw) return DEFAULT_SIDEBAR_WIDTH;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_SIDEBAR_WIDTH;
  }
  return parsed;
}

function writeSidebarWidth(width: number): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(Math.round(width)));
}

function normalizeFolderSegments(folderPath?: string): string[] {
  if (!folderPath) return [];
  return folderPath
    .split("/")
    .map((segment) => titleToSlug(segment))
    .filter(Boolean);
}

async function fetchJson<T>(url: string, ctx: LoadContext): Promise<T> {
  const timeoutController = new AbortController();
  const timer = setTimeout(() => timeoutController.abort(), ctx.timeoutMs);
  const onAbort = () => timeoutController.abort();
  ctx.signal.addEventListener("abort", onAbort, { once: true });

  try {
    const res = await fetch(url, { signal: timeoutController.signal });
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
    ctx.signal.removeEventListener("abort", onAbort);
  }
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  // State
  spaces: [],
  expandedSpaces: new Set<string>(),
  expandedFolders: new Set<string>(),
  appearanceHydrated: false,
  sidebarOpen: true,
  sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
  activePage: null,
  recentPages: [],
  chatPanelOpen: true,

  spacesStatus: "idle",
  recentStatus: "idle",
  pagesStatusBySpace: new Map<string, LoadStatus>(),
  spacesError: null,
  recentError: null,
  pagesErrorBySpace: new Map<string, string | null>(),
  loadingSpaces: false,
  loadingPages: new Map<string, boolean>(),

  pagesBySpace: new Map<string, PageMeta[]>(),

  lastLoadedAt: {
    spaces: null,
    recent: null,
    pagesBySpace: new Map<string, number>(),
  },
  lastError: null,

  // Actions
  loadSpaces: async (opts) => {
    const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (inFlight.spaces) {
      if (!opts?.force) {
        return inFlight.spaces.promise;
      }
      inFlight.spaces.controller.abort();
    }

    const requestId = nextRequestId++;
    const controller = new AbortController();
    const hasCachedSpaces = get().spaces.length > 0;

    if (!opts?.silent || !hasCachedSpaces) {
      set({
        spacesStatus: "loading",
        loadingSpaces: true,
        spacesError: null,
      });
    }

    const promise = (async () => {
      try {
        const spaces = await fetchJson<Space[]>("/api/files/spaces", {
          timeoutMs,
          signal: controller.signal,
        });

        if (inFlight.spaces?.requestId !== requestId) return;

        set((state) => ({
          spaces,
          spacesStatus: "success",
          loadingSpaces: false,
          spacesError: null,
          lastError: null,
          lastLoadedAt: {
            ...state.lastLoadedAt,
            spaces: Date.now(),
          },
        }));
      } catch (err) {
        if (inFlight.spaces?.requestId !== requestId) return;
        const message =
          err instanceof Error
            ? err.name === "AbortError"
              ? "Timed out loading spaces"
              : err.message
            : "Failed to load spaces";

        set((state) => ({
          spacesStatus: state.spaces.length > 0 ? "success" : "error",
          loadingSpaces: false,
          spacesError: message,
          lastError: message,
        }));
      } finally {
        if (inFlight.spaces?.requestId === requestId) {
          inFlight.spaces = null;
        }
      }
    })();

    inFlight.spaces = { promise, controller, requestId };
    return promise;
  },

  loadPages: async (space: string, opts) => {
    const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const existing = inFlight.pages.get(space);
    if (existing) {
      if (!opts?.force) {
        return existing.promise;
      }
      existing.controller.abort();
    }

    const requestId = nextRequestId++;
    const controller = new AbortController();
    const hasCachedPages = (get().pagesBySpace.get(space) ?? []).length > 0;

    set((state) => {
      const nextStatuses = new Map(state.pagesStatusBySpace);
      const nextErrors = new Map(state.pagesErrorBySpace);
      const nextLoading = new Map(state.loadingPages);

      if (!opts?.silent || !hasCachedPages) {
        nextStatuses.set(space, "loading");
      }
      nextErrors.set(space, null);
      nextLoading.set(space, true);

      return {
        pagesStatusBySpace: nextStatuses,
        pagesErrorBySpace: nextErrors,
        loadingPages: nextLoading,
      };
    });

    const promise = (async () => {
      try {
        const pages = await fetchJson<PageMeta[]>(
          `/api/files/spaces/${encodeURIComponent(space)}/pages?recursive=true`,
          { timeoutMs, signal: controller.signal },
        );

        const current = inFlight.pages.get(space);
        if (!current || current.requestId !== requestId) return;

        set((state) => {
          const nextPages = new Map(state.pagesBySpace);
          nextPages.set(space, pages);

          const nextStatuses = new Map(state.pagesStatusBySpace);
          nextStatuses.set(space, "success");

          const nextErrors = new Map(state.pagesErrorBySpace);
          nextErrors.set(space, null);

          const nextLoading = new Map(state.loadingPages);
          nextLoading.set(space, false);

          const nextLoadedAt = new Map(state.lastLoadedAt.pagesBySpace);
          nextLoadedAt.set(space, Date.now());

          return {
            pagesBySpace: nextPages,
            pagesStatusBySpace: nextStatuses,
            pagesErrorBySpace: nextErrors,
            loadingPages: nextLoading,
            lastError: null,
            lastLoadedAt: {
              ...state.lastLoadedAt,
              pagesBySpace: nextLoadedAt,
            },
          };
        });
      } catch (err) {
        const current = inFlight.pages.get(space);
        if (!current || current.requestId !== requestId) return;

        const message =
          err instanceof Error
            ? err.name === "AbortError"
              ? `Timed out loading pages for ${space}`
              : err.message
            : `Failed to load pages for ${space}`;

        set((state) => {
          const hadCached = (state.pagesBySpace.get(space) ?? []).length > 0;
          const nextStatuses = new Map(state.pagesStatusBySpace);
          nextStatuses.set(space, hadCached ? "success" : "error");

          const nextErrors = new Map(state.pagesErrorBySpace);
          nextErrors.set(space, message);

          const nextLoading = new Map(state.loadingPages);
          nextLoading.set(space, false);

          return {
            pagesStatusBySpace: nextStatuses,
            pagesErrorBySpace: nextErrors,
            loadingPages: nextLoading,
            lastError: message,
          };
        });
      } finally {
        const current = inFlight.pages.get(space);
        if (current?.requestId === requestId) {
          inFlight.pages.delete(space);
        }
      }
    })();

    inFlight.pages.set(space, { promise, controller, requestId });
    return promise;
  },

  loadRecentPages: async (opts) => {
    const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (inFlight.recent) {
      if (!opts?.force) {
        return inFlight.recent.promise;
      }
      inFlight.recent.controller.abort();
    }

    const requestId = nextRequestId++;
    const controller = new AbortController();
    const hasCached = get().recentPages.length > 0;

    if (!opts?.silent || !hasCached) {
      set({
        recentStatus: "loading",
        recentError: null,
      });
    }

    const promise = (async () => {
      try {
        const recentPages = await fetchJson<PageMeta[]>("/api/files/recent?limit=5", {
          timeoutMs,
          signal: controller.signal,
        });

        if (inFlight.recent?.requestId !== requestId) return;

        set((state) => ({
          recentPages,
          recentStatus: "success",
          recentError: null,
          lastError: null,
          lastLoadedAt: {
            ...state.lastLoadedAt,
            recent: Date.now(),
          },
        }));
      } catch (err) {
        if (inFlight.recent?.requestId !== requestId) return;

        const message =
          err instanceof Error
            ? err.name === "AbortError"
              ? "Timed out loading recent pages"
              : err.message
            : "Failed to load recent pages";

        set((state) => ({
          recentStatus: state.recentPages.length > 0 ? "success" : "error",
          recentError: message,
          lastError: message,
        }));
      } finally {
        if (inFlight.recent?.requestId === requestId) {
          inFlight.recent = null;
        }
      }
    })();

    inFlight.recent = { promise, controller, requestId };
    return promise;
  },

  setActivePage: (path) =>
    set((state) => {
      if (!path) return { activePage: null };
      const normalized = path.replace(/\.md$/, "");
      const parts = normalized.split("/").filter(Boolean);
      if (parts.length <= 1) {
        return { activePage: path };
      }

      const spaceCandidate = parts[0];
      const spaceExists = state.spaces.some((s) => s.path === spaceCandidate);
      const spaceRoot = spaceExists ? spaceCandidate : ROOT_SPACE_PATH;
      const folderParts = spaceExists ? parts.slice(1, -1) : parts.slice(0, -1);

      const nextFolders = new Set(state.expandedFolders);
      let current = spaceRoot;
      for (const part of folderParts) {
        current = `${current}/${part}`;
        nextFolders.add(current);
      }

      return { activePage: path, expandedFolders: nextFolders };
    }),

  toggleSpace: (space: string) => {
    const { expandedSpaces, pagesBySpace } = get();
    const next = new Set(expandedSpaces);
    if (next.has(space)) {
      next.delete(space);
    } else {
      next.add(space);
      // Lazy load pages on first expand
      if (!pagesBySpace.has(space)) {
        void get().loadPages(space);
      }
    }
    set({ expandedSpaces: next });
  },

  toggleFolder: (folderPath: string) => {
    const { expandedFolders } = get();
    const next = new Set(expandedFolders);
    if (next.has(folderPath)) {
      next.delete(folderPath);
    } else {
      next.add(folderPath);
    }
    set({ expandedFolders: next });
  },

  toggleSidebar: () =>
    set((state) => {
      const next = !state.sidebarOpen;
      writeSidebarOpen(next);
      return { sidebarOpen: next };
    }),

  hydrateAppearance: () => {
    if (get().appearanceHydrated) return;
    const sidebarOpen = readSidebarOpen();
    const sidebarWidth = readSidebarWidth();
    set((state) => ({
      appearanceHydrated: true,
      sidebarOpen,
      sidebarWidth:
        Number.isFinite(sidebarWidth) && sidebarWidth > 0
          ? sidebarWidth
          : state.sidebarWidth,
    }));
  },

  setSidebarOpen: (open) => {
    writeSidebarOpen(open);
    set({ sidebarOpen: open });
  },

  setSidebarWidth: (width) => {
    if (get().sidebarWidth === width) return;
    writeSidebarWidth(width);
    set({ sidebarWidth: width });
  },

  toggleChatPanel: () => set((s) => ({ chatPanelOpen: !s.chatPanelOpen })),
  setChatPanelOpen: (open) => set({ chatPanelOpen: open }),

  createSpace: async (name: string) => {
    const slug = titleToSlug(name);
    if (!slug) {
      throw new Error("Space name results in an empty folder name.");
    }

    const res = await fetch("/api/files/spaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: slug }),
    });

    if (!res.ok) {
      let message = "Failed to create space";
      try {
        const payload = (await res.json()) as { error?: string };
        if (payload?.error) message = payload.error;
      } catch {
        // ignore JSON parse errors
      }
      throw new Error(message);
    }

    // Pull authoritative metadata (icon, counts, ordering) from server.
    await get().loadSpaces({ force: true, silent: true });
    return slug;
  },

  createPage: async (space: string, title: string, options?: CreatePageOptions) => {
    const slug = titleToSlug(title);
    if (!slug) {
      throw new Error("Title results in an empty filename.");
    }

    const folderSegments = normalizeFolderSegments(options?.folderPath);
    const prefixSegments =
      space === ROOT_SPACE_PATH ? folderSegments : [space, ...folderSegments];
    const pathSegments = [...prefixSegments, slug];
    const pagePath = pathSegments.join("/");
    const encodedPath = pathSegments.map((segment) => encodeURIComponent(segment)).join("/");

    const now = new Date().toISOString();

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

    const payload = (await res.json().catch(() => null)) as
      | { meta?: Partial<PageMeta> }
      | null;

    const optimisticMeta: PageMeta = {
      title,
      path: `${pagePath}.md`,
      space,
      icon: payload?.meta?.icon,
      created: (payload?.meta?.created as string | undefined) ?? now,
      modified: (payload?.meta?.modified as string | undefined) ?? now,
      size: Number(payload?.meta?.size ?? 0),
      tags: Array.isArray(payload?.meta?.tags)
        ? (payload?.meta?.tags as string[])
        : undefined,
    };

    set((state) => {
      const nextRecent = [
        optimisticMeta,
        ...state.recentPages.filter((p) => p.path !== optimisticMeta.path),
      ].slice(0, 5);

      const nextPagesBySpace = new Map(state.pagesBySpace);
      if (nextPagesBySpace.has(space)) {
        const existing = nextPagesBySpace.get(space) ?? [];
        nextPagesBySpace.set(
          space,
          [optimisticMeta, ...existing.filter((p) => p.path !== optimisticMeta.path)],
        );
      }

      return {
        recentPages: nextRecent,
        recentStatus: "success" as LoadStatus,
        pagesBySpace: nextPagesBySpace,
      };
    });

    // Refresh with server state in the background.
    void get().loadRecentPages({ force: true, silent: true });
    if (get().pagesBySpace.has(space)) {
      void get().loadPages(space, { force: true, silent: true });
    }
    void get().loadSpaces({ force: true, silent: true });

    return pagePath;
  },

  createFolder: async (space: string, folderPath: string, options?: CreateFolderOptions) => {
    const folderSegments = normalizeFolderSegments(folderPath);
    if (folderSegments.length === 0) {
      throw new Error("Folder path is empty.");
    }

    const starterPageName = (options?.starterPageName ?? "README").trim();
    if (!titleToSlug(starterPageName)) {
      throw new Error("Starter page name is empty.");
    }

    const normalizedFolderPath = folderSegments.join("/");
    return get().createPage(space, starterPageName, {
      folderPath: normalizedFolderPath,
    });
  },

  deletePage: async (path: string) => {
    const encodedPath = path
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");

    const res = await fetch(`/api/files/pages/${encodedPath}`, {
      method: "DELETE",
    });

    if (!res.ok) throw new Error("Failed to delete page");

    // Extract space from path
    const space = path.includes("/") ? path.split("/")[0] : ROOT_SPACE_PATH;

    set((state) => {
      const nextRecent = state.recentPages.filter((page) => page.path !== path);
      const nextPagesBySpace = new Map(state.pagesBySpace);
      if (nextPagesBySpace.has(space)) {
        const currentPages = nextPagesBySpace.get(space) ?? [];
        nextPagesBySpace.set(
          space,
          currentPages.filter((page) => page.path !== path),
        );
      }

      return {
        recentPages: nextRecent,
        pagesBySpace: nextPagesBySpace,
      };
    });

    void get().loadPages(space, { force: true, silent: true });
    void get().loadRecentPages({ force: true, silent: true });
    void get().loadSpaces({ force: true, silent: true });

    // Clear active page if it was the deleted one
    const { activePage } = get();
    if (activePage === path) {
      set({ activePage: null });
    }
  },
}));
