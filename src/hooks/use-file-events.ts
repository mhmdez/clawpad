"use client";

import { useEffect, useRef } from "react";
import { useActivityStore } from "@/lib/stores/activity";
import { useWorkspaceStore } from "@/lib/stores/workspace";

type FileEventType = "file-changed" | "file-added" | "file-removed" | "connected" | "error";

interface FileEventPayload {
  type: FileEventType;
  path?: string;
  timestamp?: number;
  message?: string;
}

const REFRESH_DEBOUNCE_MS = 250;

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

  useEffect(() => {
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let closed = false;

    const scheduleRefresh = (space?: string, refreshSpaces?: boolean) => {
      if (space) pendingSpacesRef.current.add(space);
      if (refreshSpaces) refreshSpacesRef.current = true;
      if (refreshTimerRef.current) return;
      refreshTimerRef.current = setTimeout(() => {
        refreshTimerRef.current = null;
        const { loadRecentPages, loadPages, loadSpaces, pagesBySpace } =
          useWorkspaceStore.getState();

        // Refresh pages for spaces we've already loaded
        for (const spaceName of pendingSpacesRef.current) {
          if (pagesBySpace.has(spaceName)) {
            loadPages(spaceName);
          }
        }
        pendingSpacesRef.current.clear();

        loadRecentPages();
        if (refreshSpacesRef.current) {
          loadSpaces();
          refreshSpacesRef.current = false;
        }
      }, REFRESH_DEBOUNCE_MS);
    };

    function connect() {
      if (closed) return;
      es = new EventSource("/api/files/watch");

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as FileEventPayload;
          if (data.type === "connected" || data.type === "error") return;

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

          const space = filePath.split("/")[0];
          const shouldRefreshSpaces = data.type === "file-added" || data.type === "file-removed";
          scheduleRefresh(space, shouldRefreshSpaces);
        } catch {
          // Ignore malformed events
        }
      };

      es.onerror = () => {
        es?.close();
        es = null;
        if (!closed) {
          reconnectTimer = setTimeout(connect, 5000);
        }
      };
    }

    connect();

    return () => {
      closed = true;
      es?.close();
      clearTimeout(reconnectTimer);
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [addItem]);
}
