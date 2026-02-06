"use client";

import { Suspense, useState, useCallback, useEffect, useRef } from "react";
import { Sidebar } from "@/components/sidebar/sidebar";
import { CommandPalette } from "@/components/command-palette";
import { NewPageDialog } from "@/components/new-page-dialog";
import { ChatPanel } from "@/components/chat/chat-panel";
import { AiFab } from "@/components/chat/ai-fab";
import { MobileTabs, type MobileTab } from "@/components/mobile-tabs";
import { MobilePagesBrowser } from "@/components/mobile-pages-browser";
import { MobileActivityView } from "@/components/mobile-activity-view";
import { EditorSkeleton } from "@/components/editor/editor-skeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { useResponsive } from "@/hooks/use-responsive";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { useWorkspaceStore } from "@/lib/stores/workspace";
import { WorkspaceShortcuts } from "@/components/workspace-shortcuts";
import { useFileEvents } from "@/hooks/use-file-events";
import { useGatewayEvents } from "@/hooks/use-gateway-events";
import { useChangeEvents } from "@/hooks/use-change-events";

function ChatSkeleton() {
  return (
    <div className="flex h-full w-full flex-col p-4 gap-4">
      <Skeleton className="h-8 w-32" />
      <div className="flex-1 space-y-3">
        <Skeleton className="h-16 w-3/4 ml-auto" />
        <Skeleton className="h-24 w-4/5" />
        <Skeleton className="h-16 w-2/3 ml-auto" />
      </div>
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  useFileEvents();
  useGatewayEvents();
  useChangeEvents();
  const { isMobile, isTablet } = useResponsive();
  const [mobileTab, setMobileTab] = useState<MobileTab>("editor");
  const { chatPanelOpen, setChatPanelOpen, setSidebarOpen } =
    useWorkspaceStore();
  const scrollTimersRef = useRef<Map<HTMLElement, number>>(new Map());

  const handleWorkspaceScroll = useCallback(
    (event: React.UIEvent<HTMLElement>) => {
      const el = event.currentTarget;
      el.classList.add("is-scrolling");
      const timers = scrollTimersRef.current;
      const existing = timers.get(el);
      if (existing) window.clearTimeout(existing);
      const id = window.setTimeout(() => {
        el.classList.remove("is-scrolling");
        timers.delete(el);
      }, 900);
      timers.set(el, id);
    },
    [],
  );

  useEffect(() => {
    return () => {
      scrollTimersRef.current.forEach((id) => window.clearTimeout(id));
      scrollTimersRef.current.clear();
    };
  }, []);

  const handleTabChange = useCallback(
    (tab: MobileTab) => {
      setMobileTab(tab);
      // Sidebar is no longer driven by tabs — pages tab has its own browser
      setSidebarOpen(false);
      if (tab === "chat") {
        setChatPanelOpen(true);
      } else {
        setChatPanelOpen(false);
      }
    },
    [setSidebarOpen, setChatPanelOpen],
  );

  const handleNewPage = useCallback(() => {
    window.dispatchEvent(new CustomEvent("clawpad:new-page"));
  }, []);

  // ── Mobile layout ──
  if (isMobile) {
    return (
      <div className="flex h-[100dvh] flex-col overflow-hidden">
        {/* Main content area — only one panel visible at a time */}
        <div className="flex-1 overflow-hidden">
          {mobileTab === "pages" && (
            <div className="h-full pb-14">
              <MobilePagesBrowser
                onNavigate={() => setMobileTab("editor")}
              />
            </div>
          )}
          {mobileTab === "editor" && (
            <main
              className="workspace-scroll-area h-full overflow-y-auto pb-14"
              onScroll={handleWorkspaceScroll}
            >
              <Suspense fallback={<EditorSkeleton />}>{children}</Suspense>
            </main>
          )}
          {mobileTab === "chat" && (
            <div className="h-full pb-14">
              <Suspense fallback={<ChatSkeleton />}>
                <ChatPanel variant="fullscreen" />
              </Suspense>
            </div>
          )}
          {mobileTab === "activity" && (
            <div className="h-full pb-14">
              <MobileActivityView />
            </div>
          )}
        </div>

        {/* Bottom tabs */}
        <MobileTabs
          activeTab={mobileTab}
          onTabChange={handleTabChange}
          onNewPage={handleNewPage}
        />

        <CommandPalette />
        <NewPageDialog />
        <WorkspaceShortcuts />
      </div>
    );
  }

  // ── Tablet layout ──
  if (isTablet) {
    return (
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main
          className="workspace-scroll-area relative z-0 flex-1 overflow-y-auto"
          onScroll={handleWorkspaceScroll}
        >
          <Suspense fallback={<EditorSkeleton />}>{children}</Suspense>
        </main>

        {/* Chat as right sheet on tablet */}
        <Sheet open={chatPanelOpen} onOpenChange={setChatPanelOpen}>
          <SheetContent side="right" className="w-[400px] p-0" showCloseButton={false}>
            <VisuallyHidden>
              <SheetTitle>Chat</SheetTitle>
            </VisuallyHidden>
            <Suspense fallback={<ChatSkeleton />}>
              <ChatPanel variant="sheet" />
            </Suspense>
          </SheetContent>
        </Sheet>

        <AiFab />
        <CommandPalette />
        <NewPageDialog />
        <WorkspaceShortcuts />
      </div>
    );
  }

  // ── Desktop layout (original) ──
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main
        className="workspace-scroll-area relative z-0 flex-1 overflow-y-auto"
        onScroll={handleWorkspaceScroll}
      >
        <Suspense fallback={<EditorSkeleton />}>{children}</Suspense>
      </main>
      <Suspense fallback={<ChatSkeleton />}>
        <ChatPanel />
      </Suspense>
      <AiFab />
      <CommandPalette />
      <NewPageDialog />
      <WorkspaceShortcuts />
    </div>
  );
}
