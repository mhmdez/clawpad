"use client";

/**
 * Client-side hook that subscribes to the gateway SSE stream
 * and dispatches events to the activity and gateway stores.
 */

import { useEffect, useRef } from "react";
import { useActivityStore } from "@/lib/stores/activity";
import { useGatewayStore } from "@/lib/stores/gateway";
import { useHeartbeatStore, type HeartbeatEvent } from "@/lib/stores/heartbeat";
import { useWorkspaceStore } from "@/lib/stores/workspace";
import { useChangesStore } from "@/lib/stores/changes";

const RECONNECT_INITIAL_MS = 2_000;
const RECONNECT_MAX_MS = 30_000;
const RECONNECT_FACTOR = 1.6;
const RECONNECT_JITTER = 0.2;
const INACTIVITY_TIMEOUT_MS = 45_000;
const INACTIVITY_CHECK_MS = 10_000;
const RECONNECT_ALERT_THRESHOLD = 6;
const ACTIVE_RUN_STALE_MS = 20_000;

interface GatewaySSEEvent {
  event: string;
  payload: Record<string, unknown>;
  seq?: number;
}

interface AgentStreamPayload {
  sessionKey?: string;
  runId?: string;
  stream?: "lifecycle" | "assistant" | "tool";
  data?: Record<string, unknown>;
  state?: "delta" | "final" | "aborted" | "error";
}

export function useGatewayEvents(): void {
  const addItem = useActivityStore((s) => s.addItem);
  const setWSStatus = useGatewayStore((s) => s.setWSStatus);
  const setAgentStatus = useGatewayStore((s) => s.setAgentStatus);
  const addHeartbeatEvent = useHeartbeatStore((s) => s.addEvent);

  // Track active runs to detect transitions
  const activeRunsRef = useRef(new Map<string, string>());
  const reconnectAttemptsRef = useRef(0);
  const lastEventAtRef = useRef(0);
  const lastAgentEventAtRef = useRef(0);

  useEffect(() => {
    lastEventAtRef.current = Date.now();
    lastAgentEventAtRef.current = Date.now();
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let inactivityTimer: ReturnType<typeof setInterval> | null = null;
    let closed = false;

    const computeReconnectDelay = (attempt: number) => {
      const base = Math.min(
        RECONNECT_MAX_MS,
        RECONNECT_INITIAL_MS * Math.pow(RECONNECT_FACTOR, attempt),
      );
      const jitter = base * RECONNECT_JITTER * (Math.random() * 2 - 1);
      return Math.max(500, Math.round(base + jitter));
    };

    const scheduleReconnect = (reason?: string) => {
      if (closed || reconnectTimer) return;
      const attempt = reconnectAttemptsRef.current + 1;
      const delay = computeReconnectDelay(reconnectAttemptsRef.current);
      reconnectAttemptsRef.current = attempt;
      const detail = reason
        ? `${reason}. Retrying in ${Math.round(delay / 1000)}s (attempt ${attempt})`
        : `Reconnecting in ${Math.round(delay / 1000)}s (attempt ${attempt})`;
      setWSStatus("reconnecting", {
        error: detail,
        reason: "gateway_unreachable",
      });
      if (attempt === RECONNECT_ALERT_THRESHOLD) {
        addItem({
          type: "sub-agent",
          description: "Gateway reconnection is taking longer than expected",
          timestamp: Date.now(),
        });
      }
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, delay);
    };

    const resetReconnect = () => {
      reconnectAttemptsRef.current = 0;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    function connect() {
      if (closed) return;

      setWSStatus("connecting", { reason: "gateway_unreachable" });
      es = new EventSource("/api/gateway/events");
      lastEventAtRef.current = Date.now();

      es.onopen = () => {
        lastEventAtRef.current = Date.now();
      };

      // Connection status events
      es.addEventListener("status", (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data) as {
            status: "disconnected" | "connecting" | "reconnecting" | "connected";
            error?: string;
            code?: string;
            reason?: "gateway_unreachable" | "server_unreachable" | null;
          };
          setWSStatus(
            data.status,
            { error: data.error, code: data.code, reason: data.reason ?? undefined },
          );
          lastEventAtRef.current = Date.now();
          if (data.status === "connected") {
            resetReconnect();
            // Pull fresh state after reconnect to avoid stale chat/pages indicators.
            const workspace = useWorkspaceStore.getState();
            workspace.loadRecentPages({ force: true, silent: true });
            workspace.loadSpaces({ force: true, silent: true });
            const changes = useChangesStore.getState();
            if (changes.sessionKey) {
              changes.loadChangeSets();
            }
          }
        } catch {
          // ignore
        }
      });

      // Gateway events
      es.addEventListener("gateway", (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data) as GatewaySSEEvent;
          handleGatewayEvent(data);
          lastEventAtRef.current = Date.now();
        } catch {
          // ignore
        }
      });

      es.onerror = () => {
        es?.close();
        es = null;
        setWSStatus("disconnected", {
          error: "Event stream disconnected",
          reason: "gateway_unreachable",
        });
        if (!closed) {
          scheduleReconnect("Event stream disconnected");
        }
      };
    }

    function handleGatewayEvent(data: GatewaySSEEvent) {
      const { event, payload } = data;

      switch (event) {
        case "agent":
          handleAgentEvent(payload as unknown as AgentStreamPayload);
          break;
        case "chat":
          addItem({
            type: "chat-message",
            description: "New chat message",
            timestamp: Date.now(),
          });
          break;
        case "heartbeat":
          handleHeartbeatEvent(payload);
          break;
        // presence, health, tick — silent
      }
    }

    function handleHeartbeatEvent(payload: Record<string, unknown>) {
      const ts = payload.ts;
      const status = payload.status;
      if (typeof ts !== "number" || Number.isNaN(ts)) return;
      if (typeof status !== "string") return;
      const event = {
        ...payload,
        ts,
        status,
      } as HeartbeatEvent;
      addHeartbeatEvent(event);
    }

    function emitLifecycleStart(runId: string, sessionKey: string) {
      if (activeRunsRef.current.has(runId)) return;
      activeRunsRef.current.set(runId, sessionKey);
      lastAgentEventAtRef.current = Date.now();
      setAgentStatus("thinking");
      addItem({
        type: "sub-agent",
        description: "Agent started thinking",
        timestamp: Date.now(),
      });
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("clawpad:agent-lifecycle", {
            detail: {
              phase: "start",
              runId,
              sessionKey,
              timestamp: Date.now(),
            },
          }),
        );
      }
    }

    function emitLifecycleEnd(runId: string, sessionKey: string, errored?: boolean) {
      activeRunsRef.current.delete(runId);
      lastAgentEventAtRef.current = Date.now();
      if (activeRunsRef.current.size === 0) {
        setAgentStatus("idle");
      }
      const changes = useChangesStore.getState();
      if (changes.activeRun?.runId === runId) {
        changes.setActiveRun(null);
        changes.clearActiveFiles();
      }
      addItem({
        type: "sub-agent",
        description: errored ? "Agent errored" : "Agent finished",
        timestamp: Date.now(),
      });
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("clawpad:agent-lifecycle", {
            detail: {
              phase: "end",
              runId,
              sessionKey,
              timestamp: Date.now(),
              error: Boolean(errored),
            },
          }),
        );
      }
    }

    function handleAgentEvent(payload: AgentStreamPayload) {
      lastAgentEventAtRef.current = Date.now();
      const stream = payload.stream;
      const runId = payload.runId ?? "unknown";
      const sessionKey = payload.sessionKey ?? "main";

      // State-only events (no stream block)
      if (!stream) {
        if (
          payload.state === "final" ||
          payload.state === "aborted" ||
          payload.state === "error"
        ) {
          emitLifecycleEnd(runId, sessionKey, payload.state === "error");
        }
        return;
      }

      switch (stream) {
        case "lifecycle": {
          const phase = payload.data?.phase;
          if (phase === "start") {
            emitLifecycleStart(runId, sessionKey);
          } else if (phase === "end" || phase === "error") {
            emitLifecycleEnd(runId, sessionKey, phase === "error");
          }
          break;
        }

        case "assistant":
          // Text streaming — agent is actively responding
          emitLifecycleStart(runId, sessionKey);
          setAgentStatus("active");
          break;

        case "tool": {
          emitLifecycleStart(runId, sessionKey);
          setAgentStatus("active");
          const toolName =
            (payload.data?.name as string | undefined) ?? undefined;
          if (toolName) {
            addItem({
              type: "tool-used",
              description: `Using ${formatToolName(toolName)}`,
              timestamp: Date.now(),
            });
          }
          break;
        }
      }
    }

    connect();

    inactivityTimer = setInterval(() => {
      if (closed) return;
      const age = Date.now() - lastEventAtRef.current;
      const agentAge = Date.now() - lastAgentEventAtRef.current;
      if (activeRunsRef.current.size > 0 && agentAge > ACTIVE_RUN_STALE_MS) {
        for (const [runId, sessionKey] of Array.from(activeRunsRef.current.entries())) {
          emitLifecycleEnd(runId, sessionKey);
        }
      }
      if (age > INACTIVITY_TIMEOUT_MS) {
        es?.close();
        es = null;
        scheduleReconnect("Connection stale");
      }
    }, INACTIVITY_CHECK_MS);

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (inactivityTimer) clearInterval(inactivityTimer);
      es?.close();
    };
  }, [addItem, setWSStatus, setAgentStatus, addHeartbeatEvent]);
}

/** Format tool names for human-friendly display */
function formatToolName(name: string): string {
  const TOOL_NAMES: Record<string, string> = {
    Read: "file reader",
    Edit: "file editor",
    Write: "file writer",
    exec: "terminal",
    web_search: "web search",
    web_fetch: "web fetcher",
    browser: "browser",
    message: "messenger",
    image: "image analyzer",
    tts: "text-to-speech",
    nodes: "node manager",
    canvas: "canvas",
    process: "process manager",
  };
  return TOOL_NAMES[name] ?? name;
}
