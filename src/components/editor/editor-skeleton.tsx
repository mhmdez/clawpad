"use client";

import { Skeleton } from "@/components/ui/skeleton";

export function EditorSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[720px] px-6">
      {/* Title skeleton */}
      <div className="pt-20 pb-4">
        <Skeleton className="h-10 w-2/3 mb-3" />
        <Skeleton className="h-4 w-1/3" />
      </div>

      {/* Content skeletons — varying widths to mimic text blocks */}
      <div className="space-y-3 pt-6">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-[92%]" />
        <Skeleton className="h-4 w-[78%]" />
        <div className="h-3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-[85%]" />
        <Skeleton className="h-4 w-[65%]" />
        <div className="h-3" />
        <Skeleton className="h-4 w-[90%]" />
        <Skeleton className="h-4 w-[70%]" />
      </div>
    </div>
  );
}
