"use client";

import { useEffect, useState, useCallback } from "react";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Wifi,
} from "lucide-react";
import { useGatewayStore } from "@/lib/stores/gateway";

interface GatewayConnectionSettingsProps {
  embedded?: boolean;
}

export function GatewayConnectionSettings({
  embedded = false,
}: GatewayConnectionSettingsProps) {
  const {
    connected,
    connecting,
    wsStatus,
    url,
    token,
    agentName,
    source,
    reason,
    wsError,
    error,
    detect,
    connect,
    disconnect,
    setUrl,
    setToken,
  } = useGatewayStore();

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    detect();
  }, [detect]);

  const handleAutoDetect = useCallback(async () => {
    setTestResult(null);
    await detect();
  }, [detect]);

  const handleTestConnection = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/gateway/status");
      const data = await res.json();
      if (data.connected) {
        setTestResult({ ok: true, message: "Connected successfully!" });
      } else {
        setTestResult({
          ok: false,
          message: data.error || "Cannot connect to gateway",
        });
      }
    } catch (err) {
      const message = String((err as Error)?.message ?? err);
      const friendly =
        message.includes("Failed to fetch") || message.includes("Load failed")
          ? "ClawPad couldn’t reach the gateway. Is OpenClaw running?"
          : `Failed to test connection: ${message}`;
      setTestResult({ ok: false, message: friendly });
    } finally {
      setTesting(false);
    }
  }, []);

  const handleConnect = useCallback(async () => {
    setTestResult(null);
    await connect();
  }, [connect]);

  return (
    <div className={embedded ? "space-y-6" : "mx-auto max-w-2xl px-6 py-10"}>
      {!embedded && (
        <>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              Gateway Connection
            </h1>
            <p className="text-sm text-muted-foreground">
              Connect ClawPad to your local OpenClaw gateway.
            </p>
          </div>
          <Separator className="my-6" />
        </>
      )}

      <div className="space-y-6">
        <div className="rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full ${
                  connected
                    ? "bg-green-50 dark:bg-green-900/30"
                    : "bg-zinc-100 dark:bg-zinc-800"
                }`}
              >
                {connecting || wsStatus === "reconnecting" ? (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                ) : connected ? (
                  <Wifi className="h-5 w-5 text-green-600" />
                ) : (
                  <XCircle className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div className="space-y-0.5">
                <h3 className="text-sm font-medium">
                  {connected
                    ? "Connected"
                    : connecting
                      ? "Connecting…"
                      : wsStatus === "reconnecting"
                        ? "Reconnecting…"
                        : "Disconnected"}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {connected && agentName
                    ? `Agent: ${agentName}`
                    : connected
                      ? "Connected to gateway"
                      : wsError ||
                        error ||
                        (reason === "server_unreachable"
                          ? "ClawPad server is unreachable from this browser."
                          : "Not connected to any gateway.")}
                </p>
              </div>
            </div>
            <Badge
              variant={connected ? "default" : "secondary"}
              className={
                connected
                  ? "bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/30"
                  : ""
              }
            >
              {connected
                ? "Connected"
                : connecting
                  ? "Connecting"
                  : wsStatus === "reconnecting"
                    ? "Reconnecting"
                    : "Disconnected"}
            </Badge>
          </div>

          {source && (
            <p className="mt-3 text-xs text-muted-foreground">
              Config source: <span className="font-medium">{source}</span>
            </p>
          )}
        </div>

        <div className="space-y-2">
          <label htmlFor="gateway-url" className="text-sm font-medium">
            Gateway URL
          </label>
          <Input
            id="gateway-url"
            placeholder="http://127.0.0.1:18789"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            The HTTP URL of your OpenClaw gateway. Usually auto-detected.
          </p>
        </div>

        <div className="space-y-2">
          <label htmlFor="gateway-token" className="text-sm font-medium">
            Authentication Token
          </label>
          <Input
            id="gateway-token"
            type="password"
            placeholder="Optional — read from openclaw.json if available"
            value={token || ""}
            onChange={(e) => setToken(e.target.value)}
          />
        </div>

        {testResult && (
          <div
            className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${
              testResult.ok
                ? "border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400"
                : "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400"
            }`}
          >
            {testResult.ok ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <XCircle className="h-4 w-4 shrink-0" />
            )}
            {testResult.message}
          </div>
        )}

        <div className="flex gap-3">
          {connected ? (
            <Button variant="outline" onClick={disconnect}>
              Disconnect
            </Button>
          ) : (
            <Button onClick={handleConnect} disabled={connecting}>
              {connecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Connect
            </Button>
          )}
          <Button
            variant="outline"
            onClick={handleTestConnection}
            disabled={testing}
          >
            {testing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Test Connection
          </Button>
          <Button variant="outline" onClick={handleAutoDetect}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Auto-Detect
          </Button>
        </div>
      </div>
    </div>
  );
}
