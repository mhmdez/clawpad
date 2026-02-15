// src/app/settings/relay/page.tsx
"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { CopyIcon } from "lucide-react";
import { toast } from "sonner";

export default function RelaySettingsPage() {
  // Cloud auth is not wired in this repo yet. Keep this page functional
  // without next-auth dependencies so npm releases remain buildable.
  const relayToken = useMemo(
    () =>
      process.env.NEXT_PUBLIC_CLAWPAD_RELAY_TOKEN?.trim() ||
      process.env.CLAWPAD_RELAY_TOKEN?.trim() ||
      "",
    [],
  );

  const copyToken = () => {
    if (!relayToken) {
      toast.error("No relay token configured yet.");
      return;
    }
    navigator.clipboard.writeText(relayToken);
    toast.success("Token copied to clipboard.");
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Relay Settings</h1>
        <p className="text-muted-foreground">
          ClawPad Cloud relay setup is currently in rollout.
        </p>
      </div>

      <div className="rounded-xl border bg-card p-5 space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Relay Token</h2>
          <p className="text-sm text-muted-foreground">
            If configured, use this token to connect your local agent to ClawPad Cloud.
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-md bg-muted p-3 font-mono text-sm">
          <span className="truncate">
            {relayToken || "Not configured"}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={copyToken}
            disabled={!relayToken}
            aria-label="Copy relay token"
          >
            <CopyIcon className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-2 rounded-md border p-3 text-sm">
          <p className="font-medium">Local command</p>
          <code className="block rounded bg-muted px-2 py-1">
            {relayToken
              ? `clawpad share --token=${relayToken}`
              : "clawpad share --token=<your_token>"}
          </code>
        </div>
      </div>
    </div>
  );
}
