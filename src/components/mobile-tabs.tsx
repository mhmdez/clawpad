"use client";

import { memo } from "react";
import { FileText, Edit3, MessageCircle, Activity, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export type MobileTab = "pages" | "editor" | "chat" | "activity";

interface MobileTabsProps {
  activeTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
  hasUnreadChat?: boolean;
  onNewPage?: () => void;
}

const tabs: { id: MobileTab; label: string; icon: typeof FileText }[] = [
  { id: "pages", label: "Pages", icon: FileText },
  { id: "editor", label: "Editor", icon: Edit3 },
  { id: "chat", label: "Chat", icon: MessageCircle },
  { id: "activity", label: "Activity", icon: Activity },
];

export const MobileTabs = memo(function MobileTabs({
  activeTab,
  onTabChange,
  hasUnreadChat = false,
  onNewPage,
}: MobileTabsProps) {
  return (
    <>
      {/* Floating action button for New Page — visible on Pages tab */}
      {activeTab === "pages" && onNewPage && (
        <button
          onClick={onNewPage}
          className={cn(
            "fixed bottom-20 right-4 z-50 flex h-14 w-14 items-center justify-center",
            "rounded-full bg-accent-blue text-white shadow-lg",
            "active:scale-95 transition-transform",
            "safe-area-bottom-fab",
          )}
          aria-label="New Page"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}

      {/* Bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-14 items-stretch border-t border-border bg-background/95 backdrop-blur-sm safe-area-bottom">
        {tabs.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className={cn(
                "relative flex flex-1 flex-col items-center justify-center gap-0.5 transition-colors min-h-[44px]",
                isActive
                  ? "text-accent-blue"
                  : "text-muted-foreground active:text-foreground",
              )}
            >
              <div className="relative">
                <Icon className="h-5 w-5" />
                {id === "chat" && hasUnreadChat && (
                  <span className="absolute -right-1.5 -top-1 flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-blue opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent-blue" />
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium">{label}</span>
              {isActive && (
                <span className="absolute top-0 left-1/4 right-1/4 h-0.5 rounded-full bg-accent-blue" />
              )}
            </button>
          );
        })}
      </nav>
    </>
  );
});
