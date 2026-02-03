"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Zap,
  FolderOpen,
  Check,
  Loader2,
  AlertCircle,
  ChevronRight,
} from "lucide-react";

type Step = 1 | 2 | 3;

interface GatewayDetection {
  found: boolean;
  url?: string;
  agentName?: string;
  source?: string;
}

interface SetupStatus {
  hasWorkspace: boolean;
  totalPages: number;
  totalSpaces: number;
}

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 80 : -80,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -80 : 80,
    opacity: 0,
  }),
};

export default function SetupPage() {
  const [step, setStep] = useState<Step>(1);
  const [direction, setDirection] = useState(1);
  const router = useRouter();

  // Step 1 state
  const [gateway, setGateway] = useState<GatewayDetection | null>(null);
  const [detectingGateway, setDetectingGateway] = useState(true);
  const [manualUrl, setManualUrl] = useState("");

  // Step 2 state
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [bootstrapped, setBootstrapped] = useState(false);

  // Detect gateway on mount
  useEffect(() => {
    fetch("/api/gateway/detect")
      .then((r) => r.json())
      .then((data) => {
        setGateway(data);
        setDetectingGateway(false);
      })
      .catch(() => {
        setGateway({ found: false });
        setDetectingGateway(false);
      });
  }, []);

  // Load workspace status on mount
  useEffect(() => {
    fetch("/api/setup/status")
      .then((r) => r.json())
      .then((data) => {
        setSetupStatus(data);
        setLoadingStatus(false);
      })
      .catch(() => setLoadingStatus(false));
  }, []);

  const goToStep = useCallback(
    (next: Step) => {
      setDirection(next > step ? 1 : -1);
      setStep(next);
    },
    [step],
  );

  const handleBootstrap = async () => {
    setBootstrapping(true);
    try {
      const res = await fetch("/api/setup/bootstrap", { method: "POST" });
      if (res.ok) {
        setBootstrapped(true);
        // Refresh status
        const statusRes = await fetch("/api/setup/status");
        if (statusRes.ok) {
          setSetupStatus(await statusRes.json());
        }
      }
    } catch {
      // silent
    } finally {
      setBootstrapping(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 bg-background">
      <div className="w-full max-w-md">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.3, ease: "easeInOut" }}
          >
            <div className="rounded-xl border bg-card p-8 shadow-lg">
              {step === 1 && (
                <StepWelcome
                  gateway={gateway}
                  detecting={detectingGateway}
                  manualUrl={manualUrl}
                  onManualUrlChange={setManualUrl}
                  onNext={() => goToStep(2)}
                />
              )}
              {step === 2 && (
                <StepWorkspace
                  status={setupStatus}
                  loading={loadingStatus}
                  bootstrapping={bootstrapping}
                  bootstrapped={bootstrapped}
                  onBootstrap={handleBootstrap}
                  onNext={() => goToStep(3)}
                />
              )}
              {step === 3 && (
                <StepReady onOpen={() => router.push("/workspace")} />
              )}
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mt-6">
          {([1, 2, 3] as Step[]).map((s) => (
            <div
              key={s}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                s === step
                  ? "w-8 bg-primary"
                  : s < step
                    ? "w-4 bg-primary/40"
                    : "w-4 bg-muted"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Step 1: Welcome ────────────────────────────────────────────────────────

function StepWelcome({
  gateway,
  detecting,
  manualUrl,
  onManualUrlChange,
  onNext,
}: {
  gateway: GatewayDetection | null;
  detecting: boolean;
  manualUrl: string;
  onManualUrlChange: (url: string) => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-6 text-center">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.3 }}
        className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-primary text-primary-foreground"
      >
        <Zap className="h-10 w-10" />
      </motion.div>

      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome to ClawPad
        </h1>
        <p className="text-muted-foreground text-sm">
          The workspace for OpenClaw
        </p>
      </div>

      {/* Gateway detection */}
      <div className="rounded-lg border bg-muted/30 p-4 text-left">
        {detecting ? (
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Detecting OpenClaw…</p>
              <p className="text-xs text-muted-foreground">
                Looking for your local gateway
              </p>
            </div>
          </div>
        ) : gateway?.found ? (
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
              <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-green-700 dark:text-green-400">
                OpenClaw Detected
              </p>
              <p className="text-xs text-muted-foreground">
                {gateway.agentName
                  ? `Agent: ${gateway.agentName}`
                  : `Found via ${gateway.source}`}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-yellow-100 dark:bg-yellow-900/30">
                <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-yellow-700 dark:text-yellow-400">
                  OpenClaw Not Detected
                </p>
                <p className="text-xs text-muted-foreground">
                  You can still use ClawPad as a local workspace
                </p>
              </div>
            </div>
            <Input
              placeholder="ws://127.0.0.1:18789"
              value={manualUrl}
              onChange={(e) => onManualUrlChange(e.target.value)}
              className="text-sm"
            />
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Button size="lg" className="w-full" onClick={onNext}>
          {gateway?.found ? "Next" : "Continue Without Agent"}
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
        {!gateway?.found && !detecting && (
          <button
            onClick={onNext}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Skip for now
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Step 2: Workspace ──────────────────────────────────────────────────────

function StepWorkspace({
  status,
  loading,
  bootstrapping,
  bootstrapped,
  onBootstrap,
  onNext,
}: {
  status: SetupStatus | null;
  loading: boolean;
  bootstrapping: boolean;
  bootstrapped: boolean;
  onBootstrap: () => void;
  onNext: () => void;
}) {
  const hasContent = status?.hasWorkspace || bootstrapped;

  return (
    <div className="space-y-6 text-center">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.3 }}
        className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-muted"
      >
        <FolderOpen className="h-10 w-10 text-muted-foreground" />
      </motion.div>

      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Set Up Your Workspace
        </h1>
        <p className="text-muted-foreground text-sm">
          ClawPad reads and writes markdown files on disk
        </p>
      </div>

      <div className="rounded-lg border bg-muted/30 px-4 py-3 font-mono text-sm">
        ~/.openclaw/pages/
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking workspace…
        </div>
      ) : hasContent ? (
        <div className="rounded-lg border bg-green-50 dark:bg-green-900/10 p-4">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Check className="h-5 w-5 text-green-600 dark:text-green-400" />
            <span className="text-sm font-medium text-green-700 dark:text-green-400">
              Your workspace is ready
            </span>
          </div>
          {status && (
            <p className="text-xs text-muted-foreground">
              {status.totalSpaces} spaces · {status.totalPages} pages
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Create a starter workspace with example spaces?
          </p>
          <div className="rounded-lg border p-3 text-left space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <span>📝</span> Daily Notes
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span>🚀</span> Projects
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span>📚</span> Knowledge Base
            </div>
          </div>
          <Button
            size="lg"
            className="w-full"
            onClick={onBootstrap}
            disabled={bootstrapping}
          >
            {bootstrapping ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating Workspace…
              </>
            ) : (
              "Create Workspace"
            )}
          </Button>
        </div>
      )}

      {hasContent && (
        <Button size="lg" className="w-full" onClick={onNext}>
          Next
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

// ─── Step 3: Ready ──────────────────────────────────────────────────────────

function StepReady({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="space-y-6 text-center">
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{
          type: "spring",
          stiffness: 200,
          damping: 15,
          delay: 0.1,
        }}
        className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-green-100 dark:bg-green-900/30"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.3, type: "spring", stiffness: 300 }}
        >
          <Check className="h-10 w-10 text-green-600 dark:text-green-400" />
        </motion.div>
      </motion.div>

      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          You&apos;re Ready!
        </h1>
        <p className="text-muted-foreground text-sm">
          Your workspace is set up. Start writing, or let your agent do the
          heavy lifting.
        </p>
      </div>

      <div className="rounded-lg border bg-muted/30 p-4 text-left space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Quick Tips
        </p>
        <div className="space-y-1.5 text-sm text-muted-foreground">
          <p>
            <kbd className="rounded border bg-muted px-1.5 py-0.5 text-xs font-mono">
              ⌘K
            </kbd>{" "}
            Search across all pages
          </p>
          <p>
            <kbd className="rounded border bg-muted px-1.5 py-0.5 text-xs font-mono">
              ⌘N
            </kbd>{" "}
            Create a new page
          </p>
        </div>
      </div>

      <Button size="lg" className="w-full" onClick={onOpen}>
        Open Your Workspace
        <ChevronRight className="ml-1 h-4 w-4" />
      </Button>
    </div>
  );
}
