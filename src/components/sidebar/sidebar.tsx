"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronRight,
  FileText,
  Plus,
  Search,
  Settings,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useWorkspaceStore } from "@/lib/stores/workspace";

interface SpaceItem {
  name: string;
  icon: string;
  path: string;
  pages: { name: string; path: string }[];
}

const PLACEHOLDER_SPACES: SpaceItem[] = [
  {
    name: "Daily Notes",
    icon: "📝",
    path: "daily-notes",
    pages: [],
  },
  {
    name: "Projects",
    icon: "🚀",
    path: "projects",
    pages: [],
  },
  {
    name: "Knowledge Base",
    icon: "📚",
    path: "knowledge-base",
    pages: [],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarOpen, toggleSidebar } = useWorkspaceStore();
  const [expandedSpaces, setExpandedSpaces] = useState<Set<string>>(
    new Set(["daily-notes", "projects"])
  );

  const toggleSpace = (path: string) => {
    setExpandedSpaces((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  if (!sidebarOpen) {
    return (
      <div className="flex h-full w-12 flex-col items-center border-r bg-sidebar py-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={toggleSidebar}
            >
              <PanelLeft className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Open sidebar</TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="flex h-full w-60 flex-col border-r bg-sidebar">
      {/* Header */}
      <div className="flex h-12 items-center justify-between px-3">
        <Link
          href="/workspace"
          className="flex items-center gap-2 text-sm font-semibold"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded bg-primary text-xs text-primary-foreground">
            C
          </span>
          ClawPad
        </Link>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={toggleSidebar}
            >
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Close sidebar</TooltipContent>
        </Tooltip>
      </div>

      {/* Quick actions */}
      <div className="space-y-0.5 px-2">
        <SidebarButton icon={<Search className="h-4 w-4" />} label="Search" shortcut="⌘K" />
        <SidebarButton icon={<Plus className="h-4 w-4" />} label="New Page" shortcut="⌘N" />
      </div>

      <Separator className="my-2" />

      {/* Spaces */}
      <ScrollArea className="flex-1 px-2">
        <div className="space-y-1 py-1">
          {PLACEHOLDER_SPACES.map((space) => (
            <div key={space.path}>
              <button
                onClick={() => toggleSpace(space.path)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-sidebar-accent",
                  expandedSpaces.has(space.path) && "font-medium"
                )}
              >
                <ChevronRight
                  className={cn(
                    "h-3 w-3 shrink-0 text-muted-foreground transition-transform",
                    expandedSpaces.has(space.path) && "rotate-90"
                  )}
                />
                <span>{space.icon}</span>
                <span className="truncate">{space.name}</span>
              </button>

              {expandedSpaces.has(space.path) && space.pages.length > 0 && (
                <div className="ml-5 space-y-0.5 py-0.5">
                  {space.pages.map((page) => (
                    <Link
                      key={page.path}
                      href={`/workspace/${page.path}`}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground",
                        pathname === `/workspace/${page.path}` &&
                          "bg-sidebar-accent text-sidebar-foreground font-medium"
                      )}
                    >
                      <FileText className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{page.name}</span>
                    </Link>
                  ))}
                </div>
              )}

              {expandedSpaces.has(space.path) && space.pages.length === 0 && (
                <div className="ml-5 px-2 py-1.5">
                  <p className="text-xs text-muted-foreground">No pages yet</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>

      <Separator />

      {/* Footer */}
      <div className="space-y-0.5 px-2 py-2">
        <GatewayStatus />
        <Link href="/settings">
          <SidebarButton
            icon={<Settings className="h-4 w-4" />}
            label="Settings"
          />
        </Link>
      </div>
    </div>
  );
}

function SidebarButton({
  icon,
  label,
  shortcut,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
    >
      {icon}
      <span className="flex-1 text-left">{label}</span>
      {shortcut && (
        <kbd className="text-xs text-muted-foreground/60">{shortcut}</kbd>
      )}
    </button>
  );
}

function GatewayStatus() {
  return (
    <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-yellow-400" />
      </span>
      <span className="text-xs">Agent offline</span>
    </div>
  );
}
