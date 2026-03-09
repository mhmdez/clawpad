"use client";

import { useEffect, useRef } from "react";
import { useActivityStore } from "@/lib/stores/activity";
import { useWorkspaceStore } from "@/lib/stores/workspace";
import { ROOT_SPACE_PATH } from "@/lib/files/constants";

type FileEventType = "file-changed" | "file-added" | "file-removed" | "connected" | "error";

interface FileEventPayload {
  type: FileEventType;
  path?: string;
  timestamp?: number;
  message?: string;
  seq?: number;
}

const REFRESH_DEBOUNCE_MS = 250;
const RECONNECT_INITIAL_MS = 2_000;
const RECONNECT_MAX_MS = 30_000;
const RECONNECT_FACTOR = 1.6;
const RECONNECT_JITTER = 0.2;

/**
 * Subscribes to the file watcher SSE stream and keeps UI state in sync.
 * - Updates recent pages + space trees
 * - Emits activity feed items
 * - Dispatches a window event for open document refresh
 */
export function useFileEvents(): void {
  const addItem = useActivityStore((s) => s.addItem);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSpacesRef = useRef<Set<string>>(new Set());
  const refreshSpacesRef = useRef(false);
  const refreshLoadedSpacesRef = useRef(false);
  const lastSeqRef = useRef<number | null>(null);

  useEffect(() => {
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;
    let reconnectAttempts = 0;

    const scheduleRefresh = (opts?: {
      space?: string;
      refreshSpaces?: boolean;
      refreshLoadedSpaces?: boolean;
    }) => {
      if (opts?.space) pendingSpacesRef.current.add(opts.space);
      if (opts?.refreshSpaces) refreshSpacesRef.current = true;
      if (opts?.refreshLoadedSpaces) refreshLoadedSpacesRef.current = true;
      if (refreshTimerRef.current) return;
      refreshTimerRef.current = setTimeout(() => {
        refreshTimerRef.current = null;
        const { loadRecentPages, loadPages, loadSpaces, pagesBySpace } =
          useWorkspaceStore.getState();

        const spacesToRefresh = refreshLoadedSpacesRef.current
          ? new Set(pagesBySpace.keys())
          : pendingSpacesRef.current;

        // Refresh pages for spaces we've already loaded
        for (const spaceName of spacesToRefresh) {
          if (pagesBySpace.has(spaceName)) {
            void loadPages(spaceName, { force: true, silent: true });
          }
        }
        pendingSpacesRef.current.clear();
        refreshLoadedSpacesRef.current = false;

        void loadRecentPages({ force: true, silent: true });
        if (refreshSpacesRef.current) {
          void loadSpaces({ force: true, silent: true });
          refreshSpacesRef.current = false;
        }
      }, REFRESH_DEBOUNCE_MS);
    };

    function connect() {
      if (closed) return;
      es = new EventSource("/api/files/watch");
      reconnectAttempts = 0;

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as FileEventPayload;
          const nextSeq = typeof data.seq === "number" ? data.seq : null;
          const lastSeq = lastSeqRef.current;
          if (nextSeq !== null) {
            if (lastSeq !== null && (nextSeq <= lastSeq || nextSeq > lastSeq + 1)) {
              scheduleRefresh({ refreshSpaces: true, refreshLoadedSpaces: true });
            }
            lastSeqRef.current = nextSeq;
          }

          if (data.type === "connected") {
            scheduleRefresh({ refreshSpaces: true, refreshLoadedSpaces: true });
            return;
          }
          if (data.type === "error") return;

          const filePath = data.path ?? "";
          const filename =
            filePath.split("/").pop()?.replace(/\.md$/, "") ?? filePath;
          const descriptions: Record<string, string> = {
            "file-changed": `Edited ${filename}`,
            "file-added": `Created ${filename}`,
            "file-removed": `Deleted ${filename}`,
          };

          addItem({
            type: data.type,
            description: descriptions[data.type] ?? `${data.type}: ${filename}`,
            path: data.path,
            timestamp: data.timestamp ?? Date.now(),
          });

          // Notify the rest of the app (open document, etc.)
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("clawpad:file-change", { detail: data }),
            );
          }

          const space = filePath.includes("/") ? filePath.split("/")[0] : ROOT_SPACE_PATH;
          const shouldRefreshSpaces = data.type === "file-added" || data.type === "file-removed";
          scheduleRefresh({ space, refreshSpaces: shouldRefreshSpaces });
        } catch {
          // Ignore malformed events
        }
      };

      es.onerror = () => {
        es?.close();
        es = null;
        if (!closed) {
          const base = Math.min(
            RECONNECT_MAX_MS,
            RECONNECT_INITIAL_MS * Math.pow(RECONNECT_FACTOR, reconnectAttempts),
          );
          const jitter = base * RECONNECT_JITTER * (Math.random() * 2 - 1);
          const delay = Math.max(500, Math.round(base + jitter));
          reconnectAttempts += 1;
          reconnectTimer = setTimeout(connect, delay);
        }
      };
    }

    connect();

    return () => {
      closed = true;
      es?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [addItem]);
}
