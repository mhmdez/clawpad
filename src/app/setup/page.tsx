"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Zap, FolderOpen, Check } from "lucide-react";

type Step = "welcome" | "workspace" | "ready";

export default function SetupPage() {
  const [step, setStep] = useState<Step>("welcome");

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-lg space-y-8 text-center">
        {step === "welcome" && (
          <div className="space-y-6">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
              <Zap className="h-10 w-10" />
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight">
                Welcome to ClawPad
              </h1>
              <p className="text-muted-foreground">
                The workspace for OpenClaw. Let&apos;s get you set up.
              </p>
            </div>
            <Button size="lg" onClick={() => setStep("workspace")}>
              Get Started
            </Button>
          </div>
        )}

        {step === "workspace" && (
          <div className="space-y-6">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-muted">
              <FolderOpen className="h-10 w-10 text-muted-foreground" />
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight">
                Set up your workspace
              </h1>
              <p className="text-muted-foreground">
                ClawPad reads and writes markdown files in your OpenClaw
                directory.
              </p>
            </div>
            <div className="rounded-lg border bg-muted/50 px-4 py-3 text-left font-mono text-sm">
              ~/.openclaw/pages/
            </div>
            <Button size="lg" onClick={() => setStep("ready")}>
              Create Workspace
            </Button>
          </div>
        )}

        {step === "ready" && (
          <div className="space-y-6">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-success/10 text-success">
              <Check className="h-10 w-10" />
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight">
                You&apos;re ready!
              </h1>
              <p className="text-muted-foreground">
                Your workspace is set up. Start writing, or let your agent do
                the heavy lifting.
              </p>
            </div>
            <Button size="lg" asChild>
              <a href="/workspace">Open Workspace</a>
            </Button>
          </div>
        )}

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2">
          {(["welcome", "workspace", "ready"] as Step[]).map((s) => (
            <div
              key={s}
              className={`h-1.5 w-8 rounded-full transition-colors ${
                s === step ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
