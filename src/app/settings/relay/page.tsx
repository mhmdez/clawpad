// src/app/settings/relay/page.tsx
"use client";

import { useSession, signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { CopyIcon } from "lucide-react";
import { toast } from "sonner";

export default function RelaySettingsPage() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return <div>Loading...</div>;
  }

  if (status === "unauthenticated") {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <h2 className="text-2xl font-bold mb-4">Connect to ClawPad Cloud</h2>
        <p className="mb-4 text-muted-foreground">Log in with GitHub to get your Relay Token.</p>
        <Button onClick={() => signIn("github")}>Sign in with GitHub</Button>
      </div>
    );
  }

  const relayToken = (session?.user as any)?.relayToken || "No token available";

  const copyToken = () => {
    navigator.clipboard.writeText(relayToken);
    toast.success("Token copied to clipboard!");
  };

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Relay Settings</h1>
        <p className="text-muted-foreground">
          Manage your connection to the ClawPad Cloud relay.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your Relay Token</CardTitle>
          <CardDescription>
            Use this token to connect your local agent to the cloud.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted p-4 rounded-md font-mono text-sm flex items-center justify-between">
            <span className="break-all">{relayToken}</span>
            <Button variant="ghost" size="icon" onClick={copyToken}>
              <CopyIcon className="h-4 w-4" />
            </Button>
          </div>
          <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-md text-sm text-blue-800 dark:text-blue-200">
            <p className="font-semibold mb-2">How to connect:</p>
            <code className="bg-black/10 dark:bg-white/10 px-2 py-1 rounded">
              clawpad share --token={relayToken}
            </code>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
