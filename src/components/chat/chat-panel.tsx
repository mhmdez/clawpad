"use client";

import { useState } from "react";
import { Send, X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

interface ChatPanelProps {
  open: boolean;
  onClose: () => void;
}

export function ChatPanel({ open, onClose }: ChatPanelProps) {
  const [input, setInput] = useState("");

  if (!open) return null;

  return (
    <div
      className={cn(
        "flex h-full w-[400px] shrink-0 flex-col border-l bg-background"
      )}
    >
      {/* Header */}
      <div className="flex h-12 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="h-4 w-4" />
          Chat
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        <div className="flex h-full items-center justify-center">
          <div className="space-y-2 text-center">
            <Sparkles className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Chat with your OpenClaw agent.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {["Summarize this page", "Extract tasks", "Improve writing"].map(
                (suggestion) => (
                  <button
                    key={suggestion}
                    className="rounded-full border px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    onClick={() => setInput(suggestion)}
                  >
                    {suggestion}
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      </ScrollArea>

      <Separator />

      {/* Input */}
      <div className="p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!input.trim()) return;
            // TODO: Send via AI SDK useChat
            console.log("Send:", input);
            setInput("");
          }}
          className="flex items-center gap-2"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask your agent..."
            className="flex-1"
          />
          <Button type="submit" size="icon" disabled={!input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
