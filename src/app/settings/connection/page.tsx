import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export default function ConnectionSettingsPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Gateway Connection
        </h1>
        <p className="text-sm text-muted-foreground">
          Connect ClawPad to your local OpenClaw gateway.
        </p>
      </div>
      <Separator className="my-6" />

      <div className="space-y-6">
        {/* Connection Status */}
        <div className="rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h3 className="text-sm font-medium">Status</h3>
              <p className="text-sm text-muted-foreground">
                Not connected to any gateway.
              </p>
            </div>
            <Badge variant="secondary">Disconnected</Badge>
          </div>
        </div>

        {/* Gateway URL */}
        <div className="space-y-2">
          <label htmlFor="gateway-url" className="text-sm font-medium">
            Gateway URL
          </label>
          <Input
            id="gateway-url"
            placeholder="ws://127.0.0.1:18789"
            defaultValue="ws://127.0.0.1:18789"
          />
          <p className="text-xs text-muted-foreground">
            The WebSocket URL of your OpenClaw gateway. Usually auto-detected.
          </p>
        </div>

        {/* Token */}
        <div className="space-y-2">
          <label htmlFor="gateway-token" className="text-sm font-medium">
            Authentication Token
          </label>
          <Input
            id="gateway-token"
            type="password"
            placeholder="Optional — read from openclaw.json if available"
          />
        </div>

        <div className="flex gap-3">
          <Button>Connect</Button>
          <Button variant="outline">Auto-Detect</Button>
        </div>
      </div>
    </div>
  );
}
