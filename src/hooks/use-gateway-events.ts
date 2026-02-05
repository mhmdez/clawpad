"use client";

/**
 * Client-side hook that subscribes to the gateway SSE stream
 * and dispatches events to the activity and gateway stores.
 */

import { useEffect, useRef } from "react";
import { useActivityStore } from "@/lib/stores/activity";
import { useGatewayStore } from "@/lib/stores/gateway";

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

  // Track active runs to detect transitions
  const activeRunsRef = useRef(new Set<string>());

  useEffect(() => {
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let closed = false;

    function connect() {
      if (closed) return;

      es = new EventSource("/api/gateway/events");

      // Connection status events
      es.addEventListener("status", (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data) as { status: string; error?: string; code?: string };
          setWSStatus(
            data.status as "disconnected" | "connecting" | "connected",
            { error: data.error, code: data.code },
          );
        } catch {
          // ignore
        }
      });

      // Gateway events
      es.addEventListener("gateway", (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data) as GatewaySSEEvent;
          handleGatewayEvent(data);
        } catch {
          // ignore
        }
      });

      es.onerror = () => {
        es?.close();
        es = null;
        setWSStatus("disconnected");
        if (!closed) {
          reconnectTimer = setTimeout(connect, 5000);
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
        // presence, health, tick — silent
      }
    }

    function handleAgentEvent(payload: AgentStreamPayload) {
      const stream = payload.stream;
      const runId = payload.runId ?? "unknown";

      // State-only events (no stream block)
      if (!stream) {
        if (
          payload.state === "final" ||
          payload.state === "aborted" ||
          payload.state === "error"
        ) {
          activeRunsRef.current.delete(runId);
          if (activeRunsRef.current.size === 0) {
            setAgentStatus("idle");
          }
          if (payload.state === "error") {
            addItem({
              type: "tool-used",
              description: "Agent run errored",
              timestamp: Date.now(),
            });
          }
        }
        return;
      }

      switch (stream) {
        case "lifecycle": {
          const phase = payload.data?.phase;
          if (phase === "start") {
            activeRunsRef.current.add(runId);
            setAgentStatus("thinking");
            addItem({
              type: "sub-agent",
              description: "Agent started thinking",
              timestamp: Date.now(),
            });
          } else if (phase === "end" || phase === "error") {
            activeRunsRef.current.delete(runId);
            if (activeRunsRef.current.size === 0) {
              setAgentStatus("idle");
            }
            addItem({
              type: "sub-agent",
              description: phase === "error" ? "Agent errored" : "Agent finished",
              timestamp: Date.now(),
            });
          }
          break;
        }

        case "assistant":
          // Text streaming — agent is actively responding
          setAgentStatus("active");
          break;

        case "tool": {
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

    return () => {
      closed = true;
      clearTimeout(reconnectTimer);
      es?.close();
    };
  }, [addItem, setWSStatus, setAgentStatus]);
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
