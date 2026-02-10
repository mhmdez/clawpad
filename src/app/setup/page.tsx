"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import {
  FolderOpen,
  Check,
  Loader2,
  AlertCircle,
  ChevronRight,
  FileText,
  Bot,
  Sparkles,
  HelpCircle,
} from "lucide-react";
import { BrandMark } from "@/components/brand/brand-mark";

type Step = 1 | 2 | 3 | 4;

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
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

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
    fetch("/api/setup/status?includeCounts=true")
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
    setBootstrapError(null);
    try {
      const res = await fetch("/api/setup/bootstrap", { method: "POST" });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error || "Failed to bootstrap workspace");
      }
      setBootstrapped(true);
      // Refresh status
      const statusRes = await fetch("/api/setup/status?includeCounts=true");
      if (statusRes.ok) {
        setSetupStatus(await statusRes.json());
      }
      // If gateway is connected, trigger agent onboarding conversation
      if (gateway?.found) {
        try {
          await fetch("/api/setup/trigger-onboarding", { method: "POST" });
        } catch {
          // Silent - user can still start conversation manually
        }
      }
    } catch (err) {
      setBootstrapError(
        (err as Error)?.message || "Could not create workspace. Please retry.",
      );
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
                  bootstrapError={bootstrapError}
                  onBootstrap={handleBootstrap}
                  onNext={() => goToStep(3)}
                />
              )}
              {step === 3 && (
                <StepReady onNext={() => goToStep(4)} />
              )}
              {step === 4 && (
                <StepWhatsNext
                  gatewayConnected={gateway?.found ?? false}
                  onOpen={() => router.push("/workspace?chat=open")}
                />
              )}
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mt-6">
          {([1, 2, 3, 4] as Step[]).map((s) => (
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
        className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-muted/60 ring-1 ring-border/60"
      >
        <BrandMark variant="icon" size={44} alt="" />
      </motion.div>

      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome to ClawPad
        </h1>
        <p className="text-muted-foreground text-sm">
          The workspace for{" "}
          <InfoTooltip text="OpenClaw is your local AI agent platform that runs on your machine.">
            OpenClaw
          </InfoTooltip>
        </p>
      </div>

      {/* Gateway detection */}
      <div className="rounded-lg border bg-muted/30 p-4 text-left">
        {detecting ? (
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">
                Detecting{" "}
                <InfoTooltip text="The gateway is the local server that connects ClawPad to your AI agent. It usually runs at ws://127.0.0.1:18789.">
                  OpenClaw
                </InfoTooltip>
                …
              </p>
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
  bootstrapError,
  onBootstrap,
  onNext,
}: {
  status: SetupStatus | null;
  loading: boolean;
  bootstrapping: boolean;
  bootstrapped: boolean;
  bootstrapError: string | null;
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
          Set Up Your{" "}
          <InfoTooltip text="A workspace is a folder of markdown files that both you and your AI agent can read and edit.">
            Workspace
          </InfoTooltip>
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
        <div className="rounded-lg border bg-green-50 dark:bg-green-900/20 p-4">
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
          {bootstrapError && (
            <div className="rounded-lg border border-red-300/60 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300">
              {bootstrapError}
            </div>
          )}
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

// ─── Step 3: Celebration ─────────────────────────────────────────────────────

function StepReady({ onNext }: { onNext: () => void }) {
  return (
    <div className="space-y-6 text-center">
      {/* Animated checkmark with confetti ring */}
      <div className="relative mx-auto h-28 w-28">
        {/* Confetti particles */}
        {confettiParticles.map((p, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0, x: 0, y: 0 }}
            animate={{
              opacity: [0, 1, 1, 0],
              scale: [0, 1, 1, 0.5],
              x: p.x,
              y: p.y,
            }}
            transition={{
              duration: 1.2,
              delay: 0.4 + i * 0.05,
              ease: "easeOut",
            }}
            className="absolute left-1/2 top-1/2 h-2 w-2 rounded-full"
            style={{ backgroundColor: p.color }}
          />
        ))}

        {/* Expanding ring */}
        <motion.div
          initial={{ scale: 0, opacity: 0.8 }}
          animate={{ scale: 2.5, opacity: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
          className="absolute inset-0 m-auto h-20 w-20 rounded-full border-2 border-green-400"
        />

        {/* Check circle */}
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{
            type: "spring",
            stiffness: 200,
            damping: 15,
            delay: 0.1,
          }}
          className="absolute inset-0 m-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-green-100 dark:bg-green-900/30"
        >
          <motion.div
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.4 }}
          >
            <Check className="h-10 w-10 text-green-600 dark:text-green-400" />
          </motion.div>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="space-y-2"
      >
        <h1 className="text-2xl font-semibold tracking-tight">
          You&apos;re All Set! 🎉
        </h1>
        <p className="text-muted-foreground text-sm">
          Your workspace is ready. Let&apos;s see what you can do.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
        className="rounded-lg border bg-muted/30 p-4 text-left space-y-2"
      >
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Keyboard Shortcuts
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
          <p>
            <kbd className="rounded border bg-muted px-1.5 py-0.5 text-xs font-mono">
              ⌘⇧L
            </kbd>{" "}
            Open AI chat panel
          </p>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.9 }}
      >
        <Button size="lg" className="w-full" onClick={onNext}>
          What&apos;s Next?
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </motion.div>
    </div>
  );
}

// ─── Step 4: What's Next ────────────────────────────────────────────────────

function StepWhatsNext({
  gatewayConnected,
  onOpen,
}: {
  gatewayConnected: boolean;
  onOpen: () => void;
}) {
  const nextCards = gatewayConnected
    ? [
        {
          icon: Sparkles,
          title: "Chat with your agent",
          desc: "Your agent is ready to help you set up. Check the chat panel!",
          color: "text-purple-500",
          bg: "bg-purple-100 dark:bg-purple-900/30",
        },
        {
          icon: FileText,
          title: "Create pages together",
          desc: "Ask your agent to create documents, plans, or notes.",
          color: "text-blue-500",
          bg: "bg-blue-100 dark:bg-blue-900/30",
        },
        {
          icon: Bot,
          title: "Organize your workspace",
          desc: "Your agent can help structure folders based on your needs.",
          color: "text-green-500",
          bg: "bg-green-100 dark:bg-green-900/30",
        },
      ]
    : [
        {
          icon: FileText,
          title: "Create your first page",
          desc: "Hit ⌘N to start a new page in any space.",
          color: "text-blue-500",
          bg: "bg-blue-100 dark:bg-blue-900/30",
        },
        {
          icon: Bot,
          title: "Connect your agent",
          desc: "Your OpenClaw agent can read and edit pages in real-time.",
          color: "text-green-500",
          bg: "bg-green-100 dark:bg-green-900/30",
        },
        {
          icon: Sparkles,
          title: "Try AI writing",
          desc: "Press ⌘⇧L to chat with your agent and generate content.",
          color: "text-purple-500",
          bg: "bg-purple-100 dark:bg-purple-900/30",
        },
      ];

  return (
    <div className="space-y-6 text-center">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {gatewayConnected ? "Your Agent is Ready!" : "What's Next?"}
        </h1>
        <p className="text-muted-foreground text-sm">
          {gatewayConnected
            ? "Your agent has started setting up your workspace."
            : "Here are some things to try first."}
        </p>
      </div>

      <div className="space-y-3 text-left">
        {nextCards.map((card, i) => (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 + i * 0.15, duration: 0.3 }}
            className="flex items-start gap-3 rounded-lg border p-3 hover:bg-muted/30 transition-colors"
          >
            <div
              className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${card.bg}`}
            >
              <card.icon className={`h-4 w-4 ${card.color}`} />
            </div>
            <div>
              <p className="text-sm font-medium">{card.title}</p>
              <p className="text-xs text-muted-foreground">{card.desc}</p>
            </div>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
      >
        <Button size="lg" className="w-full" onClick={onOpen}>
          {gatewayConnected ? "Open Chat" : "Open Your Workspace"}
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </motion.div>
    </div>
  );
}

// ─── Shared Helpers ─────────────────────────────────────────────────────────

/** Reusable info tooltip for technical terms */
function InfoTooltip({
  children,
  text,
}: {
  children: React.ReactNode;
  text: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-0.5 underline decoration-dotted underline-offset-2 cursor-help">
          {children}
          <HelpCircle className="inline h-3 w-3 text-muted-foreground" />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[220px]">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

/** Confetti particle positions and colors */
const confettiParticles = [
  { x: -40, y: -35, color: "#4A9EFF" },
  { x: 35, y: -40, color: "#00A67E" },
  { x: -35, y: 25, color: "#9333EA" },
  { x: 40, y: 20, color: "#F59E0B" },
  { x: -15, y: -45, color: "#EF4444" },
  { x: 20, y: -30, color: "#10B981" },
  { x: -45, y: 5, color: "#6366F1" },
  { x: 45, y: -10, color: "#F97316" },
  { x: 0, y: 40, color: "#EC4899" },
  { x: -25, y: 35, color: "#14B8A6" },
  { x: 30, y: 35, color: "#8B5CF6" },
  { x: 10, y: -50, color: "#F43F5E" },
];
