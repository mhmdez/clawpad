import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SendIcon } from "lucide-react";

export default function WaitlistPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tighter sm:text-5xl">ClawPad Cloud</h1>
          <p className="text-muted-foreground text-lg">
            The "VS Code" for AI Agents is going online.
            <br />
            Access your local agent from anywhere. Securely.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <div className="p-4 border rounded-lg bg-card text-card-foreground shadow-sm text-left">
            <h3 className="font-semibold mb-2">Why Cloud?</h3>
            <ul className="list-disc list-inside text-sm space-y-1 text-muted-foreground">
              <li>No open ports required</li>
              <li>Works on Mobile & Tablet</li>
              <li>Real-time sync with local files</li>
              <li>Zero-config tunnel</li>
            </ul>
          </div>

          <form className="flex w-full max-w-sm items-center space-x-2 mx-auto">
            <Input type="email" placeholder="Email" required />
            <Button type="submit">
              Join Waitlist <SendIcon className="ml-2 h-4 w-4" />
            </Button>
          </form>
          <p className="text-xs text-muted-foreground">
            Early access starts soon. No spam, we promise.
          </p>
        </div>
      </div>
    </div>
  );
}
