"use client";

import { Activity } from "lucide-react";
import { ActivityFeed } from "@/components/activity-feed";
import { ScrollArea } from "@/components/ui/scroll-area";

export function MobileActivityView() {
  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center border-b px-4">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Activity</span>
        </div>
      </div>

      {/* Feed */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          <ActivityFeed />
        </div>
      </ScrollArea>
    </div>
  );
}
