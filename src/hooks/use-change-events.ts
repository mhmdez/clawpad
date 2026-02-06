"use client";

import { useEffect } from "react";
import { useChangesStore } from "@/lib/stores/changes";

interface AgentLifecycleDetail {
  phase: "start" | "end";
  runId: string;
  sessionKey: string;
  timestamp?: number;
  error?: boolean;
}

interface FileChangeDetail {
  type: "file-changed" | "file-added" | "file-removed" | "connected" | "error";
  path?: string;
  timestamp?: number;
}

export function useChangeEvents(): void {
  useEffect(() => {
    const handleLifecycle = async (event: Event) => {
      const detail = (event as CustomEvent<AgentLifecycleDetail>).detail;
      if (!detail?.runId || !detail?.sessionKey) return;

      if (detail.phase === "start") {
        useChangesStore.getState().setSessionKey(detail.sessionKey);
        useChangesStore.getState().setActiveRun({
          runId: detail.runId,
          sessionKey: detail.sessionKey,
          startedAt: detail.timestamp ?? Date.now(),
        });
        useChangesStore.getState().clearActiveFiles();

        await fetch("/api/changes/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionKey: detail.sessionKey,
            runId: detail.runId,
            status: "start",
            startedAt: new Date(detail.timestamp ?? Date.now()).toISOString(),
          }),
        });
      }

      if (detail.phase === "end") {
        useChangesStore.getState().setSessionKey(detail.sessionKey);
        await fetch("/api/changes/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionKey: detail.sessionKey,
            runId: detail.runId,
            status: "end",
            endedAt: new Date(detail.timestamp ?? Date.now()).toISOString(),
          }),
        });
        useChangesStore.getState().setActiveRun(null);
        useChangesStore.getState().clearActiveFiles();
        useChangesStore.getState().loadChangeSets();
      }
    };

    const handleFileChange = async (event: Event) => {
      const detail = (event as CustomEvent<FileChangeDetail>).detail;
      if (!detail?.path || !detail.type) return;
      if (detail.type === "connected" || detail.type === "error") return;

      const { activeRun } = useChangesStore.getState();
      if (!activeRun) return;

      useChangesStore.getState().touchFile(detail.path);

      await fetch("/api/changes/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionKey: activeRun.sessionKey,
          runId: activeRun.runId,
          path: detail.path,
          eventType: detail.type,
          timestamp: detail.timestamp ?? Date.now(),
        }),
      });
    };

    window.addEventListener("clawpad:agent-lifecycle", handleLifecycle as EventListener);
    window.addEventListener("clawpad:file-change", handleFileChange as EventListener);

    return () => {
      window.removeEventListener("clawpad:agent-lifecycle", handleLifecycle as EventListener);
      window.removeEventListener("clawpad:file-change", handleFileChange as EventListener);
    };
  }, []);
}
