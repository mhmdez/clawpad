"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { SidebarContent, SidebarHeader } from "./sidebar-content";
import { useWorkspaceStore } from "@/lib/stores/workspace";
import { useResponsive } from "@/hooks/use-responsive";
import { VisuallyHidden } from "@/components/ui/visually-hidden";

const DEFAULT_SIDEBAR_WIDTH = 240;
const MIN_SIDEBAR_WIDTH = 208;
const MAX_SIDEBAR_FRACTION = 0.35;

export function Sidebar() {
  const { sidebarOpen, toggleSidebar, setSidebarOpen } = useWorkspaceStore();
  const { isMobile, isTablet } = useResponsive();
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement | null>(null);
  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(DEFAULT_SIDEBAR_WIDTH);
  const liveSidebarWidthRef = useRef(DEFAULT_SIDEBAR_WIDTH);

  const clampSidebarWidth = useCallback((width: number) => {
    const maxWidth =
      typeof window === "undefined"
        ? DEFAULT_SIDEBAR_WIDTH
        : Math.round(window.innerWidth * MAX_SIDEBAR_FRACTION);
    return Math.max(MIN_SIDEBAR_WIDTH, Math.min(width, maxWidth));
  }, []);

  useEffect(() => {
    if (isMobile || isTablet) return;
    const handleResize = () => {
      setSidebarWidth((prev) => {
        const next = clampSidebarWidth(prev);
        liveSidebarWidthRef.current = next;
        return next;
      });
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [clampSidebarWidth, isMobile, isTablet]);

  useEffect(() => {
    liveSidebarWidthRef.current = sidebarWidth;
    if (sidebarRef.current) {
      sidebarRef.current.style.width = `${sidebarWidth}px`;
    }
  }, [sidebarWidth]);

  useEffect(() => {
    if (!isResizing) return;
    const handleMove = (event: PointerEvent) => {
      const delta = event.clientX - resizeStartXRef.current;
      const next = clampSidebarWidth(resizeStartWidthRef.current + delta);
      liveSidebarWidthRef.current = next;
      if (sidebarRef.current) {
        sidebarRef.current.style.width = `${next}px`;
      }
    };
    const handleUp = () => {
      setIsResizing(false);
      setSidebarWidth(liveSidebarWidthRef.current);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [clampSidebarWidth, isResizing]);

  const handleResizeStart = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (isMobile || isTablet || !sidebarOpen) return;
      event.preventDefault();
      resizeStartXRef.current = event.clientX;
      resizeStartWidthRef.current = liveSidebarWidthRef.current;
      setIsResizing(true);
    },
    [isMobile, isTablet, sidebarOpen],
  );

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
    <div
      ref={sidebarRef}
      className="relative flex h-full shrink-0 flex-col border-r bg-sidebar"
      style={{
        width: sidebarWidth,
        minWidth: MIN_SIDEBAR_WIDTH,
        maxWidth: "35vw",
      }}
    >
      <div className="flex h-12 shrink-0 items-center justify-between px-3">
        <SidebarHeader />
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
      <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
        <SidebarContent showHeader={false} />
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        onPointerDown={handleResizeStart}
        className={cn(
          "absolute right-0 top-0 z-20 h-full w-2 cursor-col-resize",
          "group",
        )}
      >
        <div
          className={cn(
            "absolute inset-y-0 right-0 w-px bg-border/70",
            "transition-colors group-hover:bg-[color:var(--cp-brand-2)]",
            isResizing && "bg-[color:var(--cp-brand-2)]",
          )}
        />
      </div>
    </div>
  );
}
