"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  ArrowLeft,
  FolderOpen,
  Palette,
  Search,
  Info,
  Sun,
  Moon,
  Monitor,
  Check,
  ExternalLink,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  useAppearanceStore,
  type FontSize,
  type EditorWidth,
} from "@/lib/stores/appearance";
import { BrandMark } from "@/components/brand/brand-mark";

type SettingsTab = "general" | "appearance" | "search" | "about";

interface WorkspaceStats {
  totalPages: number;
  totalSpaces: number;
  hasWorkspace: boolean;
}

interface SearchStatus {
  installed: boolean;
  version: string | null;
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const router = useRouter();

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: "general", label: "General", icon: <FolderOpen className="h-4 w-4" /> },
    { id: "appearance", label: "Appearance", icon: <Palette className="h-4 w-4" /> },
    { id: "search", label: "Search", icon: <Search className="h-4 w-4" /> },
    { id: "about", label: "About", icon: <Info className="h-4 w-4" /> },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/workspace")}
            className="shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
            <p className="text-sm text-muted-foreground">
              Configure your ClawPad workspace
            </p>
          </div>
        </div>

        {/* Tab navigation */}
        <div className="flex gap-1 rounded-lg bg-muted p-1 mb-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors flex-1 justify-center ${
                activeTab === tab.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === "general" && <GeneralTab />}
        {activeTab === "appearance" && <AppearanceTab />}
        {activeTab === "search" && <SearchTab />}
        {activeTab === "about" && <AboutTab />}
      </div>
    </div>
  );
}

// ─── General Tab ────────────────────────────────────────────────────────────

function GeneralTab() {
  const [stats, setStats] = useState<WorkspaceStats | null>(null);
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    fetch("/api/setup/status")
      .then((r) => r.json())
      .then((data) => setStats(data))
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <SectionCard title="Workspace" description="Your document storage location">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Path</span>
            <code className="rounded bg-muted px-2 py-1 text-xs font-mono">
              ~/.openclaw/pages/
            </code>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total pages</span>
            <span className="text-sm font-medium">
              {stats ? stats.totalPages : "—"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total spaces</span>
            <span className="text-sm font-medium">
              {stats ? stats.totalSpaces : "—"}
            </span>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Danger Zone"
        description="Irreversible actions"
        variant="danger"
      >
        {!confirmReset ? (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setConfirmReset(true)}
          >
            <AlertTriangle className="mr-2 h-4 w-4" />
            Reset Workspace
          </Button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-destructive">
              This will move all spaces and pages to the trash. Are you sure?
            </p>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                size="sm"
                disabled={resetting}
                onClick={async () => {
                  setResetting(true);
                  try {
                    // Delete all spaces by calling API
                    const res = await fetch("/api/files/spaces");
                    if (res.ok) {
                      const spaces = await res.json();
                      for (const space of spaces) {
                        await fetch(`/api/files/spaces/${space.path}`, {
                          method: "DELETE",
                        });
                      }
                    }
                    setConfirmReset(false);
                    window.location.reload();
                  } catch {
                    setResetting(false);
                  }
                }}
              >
                {resetting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Yes, Reset Everything
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmReset(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ─── Appearance Tab ─────────────────────────────────────────────────────────

function AppearanceTab() {
  const { theme, setTheme } = useTheme();
  const { fontSize, editorWidth, setFontSize, setEditorWidth, hydrate } =
    useAppearanceStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    hydrate();
    setMounted(true);
  }, [hydrate]);

  if (!mounted) return null;

  return (
    <div className="space-y-6">
      <SectionCard title="Theme" description="Choose your preferred color scheme">
        <SegmentedControl
          value={theme ?? "system"}
          onChange={(v) => setTheme(v)}
          options={[
            { value: "light", label: "Light", icon: <Sun className="h-4 w-4" /> },
            { value: "dark", label: "Dark", icon: <Moon className="h-4 w-4" /> },
            { value: "system", label: "System", icon: <Monitor className="h-4 w-4" /> },
          ]}
        />
      </SectionCard>

      <SectionCard title="Font Size" description="Adjust the editor text size">
        <SegmentedControl
          value={fontSize}
          onChange={(v) => setFontSize(v as FontSize)}
          options={[
            { value: "small", label: "Small (14px)" },
            { value: "medium", label: "Medium (16px)" },
            { value: "large", label: "Large (18px)" },
          ]}
        />
      </SectionCard>

      <SectionCard title="Editor Width" description="Maximum width of the editor content area">
        <SegmentedControl
          value={editorWidth}
          onChange={(v) => setEditorWidth(v as EditorWidth)}
          options={[
            { value: "narrow", label: "Narrow (640px)" },
            { value: "medium", label: "Medium (720px)" },
            { value: "wide", label: "Wide (800px)" },
          ]}
        />
      </SectionCard>
    </div>
  );
}

// ─── Search Tab ─────────────────────────────────────────────────────────────

function SearchTab() {
  const [status, setStatus] = useState<SearchStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/settings/search-status")
      .then((r) => r.json())
      .then((data) => {
        setStatus(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <SectionCard title="Search Engine" description="How ClawPad searches your pages">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking search engine…
          </div>
        ) : status?.installed ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              <span className="text-sm font-medium text-green-700 dark:text-green-400">
                QMD Installed
              </span>
              {status.version && (
                <Badge variant="secondary" className="text-[10px]">
                  {status.version}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Search is using QMD hybrid search for better results with semantic
              understanding.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-yellow-500" />
              <span className="text-sm font-medium text-yellow-700 dark:text-yellow-400">
                QMD Not Installed
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              ClawPad is using basic text search. Install QMD for hybrid
              semantic search with better results.
            </p>
            <a
              href="https://github.com/tobi/qmd"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              Install QMD
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}
      </SectionCard>

      <SectionCard title="How Search Works" description="Search basics">
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            Press <kbd className="rounded border bg-muted px-1.5 py-0.5 text-xs font-mono">⌘K</kbd>{" "}
            to open the command palette and search across all your pages.
          </p>
          <p>
            Without QMD, search uses case-insensitive text matching across page
            titles and content. With QMD, you get hybrid search combining
            keyword matching with semantic understanding.
          </p>
        </div>
      </SectionCard>
    </div>
  );
}

// ─── About Tab ──────────────────────────────────────────────────────────────

function AboutTab() {
  return (
    <div className="space-y-6">
      <SectionCard title="" description="">
        <div className="text-center py-4 space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/60 ring-1 ring-border/50">
            <BrandMark variant="icon" size={40} alt="" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">ClawPad</h2>
            <p className="text-sm text-muted-foreground">Version 0.1.0</p>
          </div>
          <p className="text-sm text-muted-foreground">
            The workspace for OpenClaw users
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Links" description="Resources and community">
        <div className="space-y-3">
          <LinkRow
            label="GitHub"
            href="https://github.com/openclaw"
            description="Source code and issues"
          />
          <Separator />
          <LinkRow
            label="OpenClaw Docs"
            href="https://docs.openclaw.com"
            description="Documentation and guides"
          />
          <Separator />
          <LinkRow
            label="Discord"
            href="https://discord.gg/openclaw"
            description="Community and support"
          />
        </div>
      </SectionCard>

      <p className="text-center text-sm text-muted-foreground">
        Made with ❤️ for the OpenClaw community
      </p>
    </div>
  );
}

// ─── Shared Components ──────────────────────────────────────────────────────

function SectionCard({
  title,
  description,
  variant,
  children,
}: {
  title: string;
  description: string;
  variant?: "danger";
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-lg border p-5 ${
        variant === "danger" ? "border-destructive/30" : ""
      }`}
    >
      {(title || description) && (
        <div className="mb-4">
          {title && <h3 className="text-sm font-medium">{title}</h3>}
          {description && (
            <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

function SegmentedControl({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; icon?: React.ReactNode }[];
}) {
  return (
    <div className="flex gap-1 rounded-lg bg-muted p-1">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors flex-1 ${
            value === option.value
              ? "bg-background text-foreground shadow-sm font-medium"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}

function LinkRow({
  label,
  href,
  description,
}: {
  label: string;
  href: string;
  description: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between group"
    >
      <div>
        <span className="text-sm font-medium group-hover:underline">
          {label}
        </span>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <ExternalLink className="h-4 w-4 text-muted-foreground" />
    </a>
  );
}
