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
  HelpCircle,
} from "lucide-react";
import { BrandMark } from "@/components/brand/brand-mark";
import { toWorkspacePath } from "@/lib/utils/workspace-route";

type Step = 1 | 2;
type WorkspaceUseCase =
  | "engineering-devops"
  | "research-academia"
  | "business-consulting"
  | "creative-writing"
  | "personal-knowledge"
  | "other";
type ImportMode = "copy" | "derive" | "both";

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
  needsSetupSignal?: boolean;
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

const workspaceUseCaseOptions: Array<{
  id: WorkspaceUseCase;
  icon: string;
  label: string;
  description: string;
}> = [
  {
    id: "engineering-devops",
    icon: "🏗️",
    label: "Engineering & DevOps",
    description: "Infrastructure, runbooks, architecture, and delivery workflows.",
  },
  {
    id: "research-academia",
    icon: "🔬",
    label: "Research & Academia",
    description: "Projects, literature reviews, experiments, and writing drafts.",
  },
  {
    id: "business-consulting",
    icon: "🏢",
    label: "Business & Consulting",
    description: "Clients, strategy, meetings, and engagement tracking.",
  },
  {
    id: "creative-writing",
    icon: "✍️",
    label: "Creative & Writing",
    description: "Drafts, research, world-building, and idea capture.",
  },
  {
    id: "personal-knowledge",
    icon: "📝",
    label: "Personal Knowledge (PARA)",
    description: "Projects, areas, resources, and archives.",
  },
  {
    id: "other",
    icon: "✨",
    label: "Other",
    description: "General starter structure that your agent can customize.",
  },
];

const targetSpacesByUseCase: Record<WorkspaceUseCase, string[]> = {
  "engineering-devops": [
    "infrastructure",
    "devops",
    "architecture",
    "security",
    "team",
    "daily-notes",
  ],
  "research-academia": ["projects", "literature", "experiments", "writing", "notes"],
  "business-consulting": [
    "clients",
    "projects",
    "meetings",
    "strategy",
    "templates",
    "daily-notes",
  ],
  "creative-writing": [
    "projects",
    "drafts",
    "research",
    "world-building",
    "ideas",
    "daily-notes",
  ],
  "personal-knowledge": ["projects", "areas", "resources", "archive", "daily-notes"],
  other: ["projects", "notes", "resources", "daily-notes"],
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
  const [workspaceUseCase, setWorkspaceUseCase] =
    useState<WorkspaceUseCase>("engineering-devops");
  const [customUseCase, setCustomUseCase] = useState("");
  const [importEnabled, setImportEnabled] = useState(false);
  const [importMode, setImportMode] = useState<ImportMode>("both");
  const [importSourcePathsText, setImportSourcePathsText] = useState("");
  const [importTargetSpaces, setImportTargetSpaces] = useState<string[]>([]);
  const [welcomeDocPath, setWelcomeDocPath] = useState("welcome-to-clawpad.md");
  const [autoRedirected, setAutoRedirected] = useState(false);

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
        if (data?.hasWorkspace && data?.needsSetupSignal !== true) {
          setAutoRedirected(true);
          router.replace("/workspace");
        }
      })
      .catch(() => setLoadingStatus(false));
  }, [router]);

  useEffect(() => {
    const allowed = new Set(targetSpacesByUseCase[workspaceUseCase] ?? []);
    setImportTargetSpaces((prev) => prev.filter((spaceName) => allowed.has(spaceName)));
  }, [workspaceUseCase]);

  useEffect(() => {
    if (!importEnabled) return;
    setImportTargetSpaces((prev) => {
      if (prev.length > 0) return prev;
      return [...(targetSpacesByUseCase[workspaceUseCase] ?? [])];
    });
  }, [importEnabled, workspaceUseCase]);

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
      const res = await fetch("/api/setup/trigger-onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceType: workspaceUseCase,
          customUseCase: workspaceUseCase === "other" ? customUseCase : undefined,
          importEnabled,
          importMode,
          importSourcePaths: importSourcePathsText
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean),
          importTargetSpaces,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error || "Failed to set up workspace");
      }
      const payload = await res.json().catch(() => null);
      setOnboardingTriggered(Boolean(payload?.onboardingTriggered));
      const routeWelcomePath =
        typeof payload?.welcomePage?.path === "string" && payload.welcomePage.path.trim()
          ? payload.welcomePage.path.trim()
          : null;
      const scaffoldWelcomePath = Array.isArray(payload?.scaffoldResult?.pages)
        ? payload.scaffoldResult.pages.find(
            (page: unknown): page is { path: string; status?: string } =>
              typeof page === "object" &&
              page !== null &&
              typeof (page as { path?: unknown }).path === "string" &&
              (page as { status?: unknown }).status !== "error",
          )?.path ?? null
        : null;
      setWelcomeDocPath(routeWelcomePath ?? scaffoldWelcomePath ?? "welcome-to-clawpad.md");
      setBootstrapped(true);
      // Refresh status
      const statusRes = await fetch("/api/setup/status?includeCounts=true");
      if (statusRes.ok) {
        setSetupStatus(await statusRes.json());
      }
      setTimeout(() => {
        handleOpenWelcome();
      }, 500);
    } catch (err) {
      setBootstrapError(
        (err as Error)?.message || "Could not create workspace. Please retry.",
      );
    } finally {
      setBootstrapping(false);
    }
  };

  const handleOpenWelcome = useCallback(async () => {
    const docPath = welcomeDocPath.endsWith(".md")
      ? welcomeDocPath
      : `${welcomeDocPath}.md`;
    const encoded = encodeURIComponent(docPath);
    const targetRoute = toWorkspacePath(docPath);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const pageRes = await fetch(`/api/files/pages/${encoded}`, {
          cache: "no-store",
        });
        if (pageRes.ok) {
          router.push(targetRoute);
          return;
        }
      } catch {
        // Retry on transient network or hydration timing errors.
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    router.push("/workspace");
  }, [router, welcomeDocPath]);

  // Auto-advance from welcome once detection finishes and gateway is found
  useEffect(() => {
    if (step !== 1) return;
    if (detectingGateway) return;
    if (gateway?.found) {
      goToStep(2);
    }
  }, [detectingGateway, step, gateway, goToStep]);

  // Early exit if we already redirected
  if (autoRedirected) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Opening workspace...
      </div>
    );
  }

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
                  onSkip={() => router.replace("/workspace")}
                />
              )}
              {step === 2 && (
                <StepWorkspace
                  status={setupStatus}
                  loading={loadingStatus}
                  bootstrapping={bootstrapping}
                  bootstrapped={bootstrapped}
                  bootstrapError={bootstrapError}
                  gatewayConnected={gateway?.found ?? false}
                  workspaceUseCase={workspaceUseCase}
                  customUseCase={customUseCase}
                  importEnabled={importEnabled}
                  importMode={importMode}
                  importSourcePathsText={importSourcePathsText}
                  importTargetSpaces={importTargetSpaces}
                  onWorkspaceUseCaseChange={setWorkspaceUseCase}
                  onCustomUseCaseChange={setCustomUseCase}
                  onImportEnabledChange={setImportEnabled}
                  onImportModeChange={setImportMode}
                  onImportSourcePathsTextChange={setImportSourcePathsText}
                  onImportTargetSpacesChange={setImportTargetSpaces}
                  onBootstrap={handleBootstrap}
                  onNext={() => router.replace("/workspace")}
                  onSkip={() => router.replace("/workspace")}
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
  onSkip,
}: {
  gateway: GatewayDetection | null;
  detecting: boolean;
  manualUrl: string;
  onManualUrlChange: (url: string) => void;
  onNext: () => void;
  onSkip: () => void;
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
        <button
          onClick={onSkip}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Skip and open workspace
        </button>
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
  gatewayConnected,
  workspaceUseCase,
  customUseCase,
  importEnabled,
  importMode,
  importSourcePathsText,
  importTargetSpaces,
  onWorkspaceUseCaseChange,
  onCustomUseCaseChange,
  onImportEnabledChange,
  onImportModeChange,
  onImportSourcePathsTextChange,
  onImportTargetSpacesChange,
  onBootstrap,
  onNext,
  onSkip,
}: {
  status: SetupStatus | null;
  loading: boolean;
  bootstrapping: boolean;
  bootstrapped: boolean;
  bootstrapError: string | null;
  gatewayConnected: boolean;
  workspaceUseCase: WorkspaceUseCase;
  customUseCase: string;
  importEnabled: boolean;
  importMode: ImportMode;
  importSourcePathsText: string;
  importTargetSpaces: string[];
  onWorkspaceUseCaseChange: (value: WorkspaceUseCase) => void;
  onCustomUseCaseChange: (value: string) => void;
  onImportEnabledChange: (value: boolean) => void;
  onImportModeChange: (value: ImportMode) => void;
  onImportSourcePathsTextChange: (value: string) => void;
  onImportTargetSpacesChange: (value: string[]) => void;
  onBootstrap: () => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  const hasContent = status?.hasWorkspace || bootstrapped;
  const targetSpaces = targetSpacesByUseCase[workspaceUseCase] ?? [];

  const toggleTargetSpace = (spaceName: string) => {
    if (importTargetSpaces.includes(spaceName)) {
      onImportTargetSpacesChange(importTargetSpaces.filter((item) => item !== spaceName));
      return;
    }
    onImportTargetSpacesChange([...importTargetSpaces, spaceName].sort((a, b) => a.localeCompare(b)));
  };

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
            What will you mainly use ClawPad for?
          </p>
          <div className="space-y-2 text-left">
            {workspaceUseCaseOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => onWorkspaceUseCaseChange(option.id)}
                className={`w-full rounded-lg border p-3 transition-colors ${
                  workspaceUseCase === option.id
                    ? "border-primary bg-primary/5"
                    : "hover:bg-muted/30"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span>{option.icon}</span>
                  <span className="text-sm font-medium">{option.label}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {option.description}
                </p>
              </button>
            ))}
          </div>
          {workspaceUseCase === "other" && (
            <Input
              placeholder="Describe your use case (optional)"
              value={customUseCase}
              onChange={(e) => onCustomUseCaseChange(e.target.value)}
              className="text-sm"
            />
          )}
          <div className="rounded-lg border bg-muted/20 p-3 text-left space-y-3">
            <label className="flex items-start gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={importEnabled}
                onChange={(e) => onImportEnabledChange(e.target.checked)}
              />
              <span>
                Bring existing documents with OpenClaw during setup
              </span>
            </label>

            {importEnabled && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-foreground">Import mode</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(["copy", "derive", "both"] as ImportMode[]).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => onImportModeChange(mode)}
                        className={`rounded-md border px-2 py-1 text-xs capitalize transition-colors ${
                          importMode === mode
                            ? "border-primary bg-primary/10 text-foreground"
                            : "hover:bg-muted/40"
                        }`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-foreground">Local source paths</p>
                  <textarea
                    className="min-h-20 w-full rounded-md border bg-background px-2 py-1.5 text-xs"
                    placeholder={"/Users/you/Documents\n~/Desktop/project-notes"}
                    value={importSourcePathsText}
                    onChange={(e) => onImportSourcePathsTextChange(e.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    One path per line.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-foreground">Target spaces</p>
                  <div className="flex flex-wrap gap-1.5">
                    {targetSpaces.map((spaceName) => {
                      const selected = importTargetSpaces.includes(spaceName);
                      return (
                        <button
                          key={spaceName}
                          type="button"
                          onClick={() => toggleTargetSpace(spaceName)}
                          className={`rounded-md border px-2 py-1 text-[11px] transition-colors ${
                            selected
                              ? "border-primary bg-primary/10 text-foreground"
                              : "hover:bg-muted/40"
                          }`}
                        >
                          {spaceName}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {gatewayConnected
              ? "ClawPad will scaffold this structure and trigger OpenClaw to continue setup."
              : "ClawPad will scaffold this structure locally. You can connect OpenClaw later."}
          </p>
          <Button
            size="lg"
            className="w-full"
            onClick={onBootstrap}
            disabled={bootstrapping}
          >
            {bootstrapping ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Setting Up Workspace…
              </>
            ) : (
              "Set Up Workspace"
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
        <div className="space-y-2">
          <Button size="lg" className="w-full" onClick={onNext}>
            Open Workspace
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
          <button
            onClick={onSkip}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Skip and open workspace
          </button>
        </div>
      )}
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
