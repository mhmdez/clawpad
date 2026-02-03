import { Settings, Palette, Plug, FolderOpen } from "lucide-react";
import { Separator } from "@/components/ui/separator";

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Configure your ClawPad workspace.
        </p>
      </div>
      <Separator className="my-6" />
      <div className="space-y-6">
        <SettingsSection
          icon={<Plug className="h-5 w-5" />}
          title="Gateway Connection"
          description="Connect to your OpenClaw agent"
          href="/settings/connection"
        />
        <SettingsSection
          icon={<Palette className="h-5 w-5" />}
          title="Appearance"
          description="Theme, fonts, and display preferences"
        />
        <SettingsSection
          icon={<FolderOpen className="h-5 w-5" />}
          title="Workspace"
          description="File paths and workspace configuration"
        />
      </div>
    </div>
  );
}

function SettingsSection({
  icon,
  title,
  description,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  href?: string;
}) {
  const Component = href ? "a" : "div";
  return (
    <Component
      href={href}
      className="flex items-center gap-4 rounded-lg border p-4 transition-colors hover:bg-muted/50"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
        {icon}
      </div>
      <div>
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </Component>
  );
}
