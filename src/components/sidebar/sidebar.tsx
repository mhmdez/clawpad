"use client";

import { useCallback } from "react";
import {
  PanelLeftClose,
  PanelLeft,
  Search,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { SidebarContent } from "./sidebar-content";
import { useWorkspaceStore } from "@/lib/stores/workspace";
import { useResponsive } from "@/hooks/use-responsive";
import { VisuallyHidden } from "@/components/ui/visually-hidden";

export function Sidebar() {
  const { sidebarOpen, toggleSidebar, setSidebarOpen } = useWorkspaceStore();
  const { isMobile, isTablet } = useResponsive();

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
  }, [setSidebarOpen]);

  const openSearch = useCallback(() => {
    const event = new KeyboardEvent("keydown", {
      key: "k",
      metaKey: true,
      bubbles: true,
    });
    document.dispatchEvent(event);
  }, []);

  const openNewPage = useCallback(() => {
    window.dispatchEvent(new CustomEvent("clawpad:new-page"));
  }, []);

  // ── Mobile: no sidebar — bottom tabs handle navigation ──
  if (isMobile) {
    return null;
  }

  // ── Tablet: sidebar as sheet overlay ──
  if (isTablet) {
    return (
      <>
        {/* Collapsed icon strip always visible on tablet */}
        <div className="flex h-full w-12 flex-col items-center border-r bg-sidebar py-3 gap-2 shrink-0">
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
            <TooltipContent side="right">Open sidebar (⌘\)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={openSearch}
              >
                <Search className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Search (⌘K)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={openNewPage}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">New Page (⌘N)</TooltipContent>
          </Tooltip>
        </div>

        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent
            side="left"
            className="w-72 p-0"
            showCloseButton={false}
          >
            <VisuallyHidden>
              <SheetTitle>Navigation</SheetTitle>
            </VisuallyHidden>
            <SidebarContent onNavigate={closeSidebar} isSheet />
          </SheetContent>
        </Sheet>
      </>
    );
  }

  // ── Desktop: original inline sidebar ──
  if (!sidebarOpen) {
    return (
      <div className="flex h-full w-12 flex-col items-center border-r bg-sidebar py-3 gap-2 shrink-0">
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
          <TooltipContent side="right">Open sidebar (⌘\)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={openSearch}
            >
              <Search className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Search (⌘K)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={openNewPage}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">New Page (⌘N)</TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="flex h-full w-60 flex-col border-r bg-sidebar shrink-0">
      <div className="flex h-12 shrink-0 items-center justify-end px-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={toggleSidebar}
            >
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Close sidebar (⌘\)</TooltipContent>
        </Tooltip>
      </div>
      <SidebarContent />
    </div>
  );
}
