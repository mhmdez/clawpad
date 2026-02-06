"use client";

import type { ReactNode } from "react";
import { useChangesStore } from "@/lib/stores/changes";
import { DocumentDiffView } from "@/components/editor/document-diff-view";

interface PageDiffFallbackProps {
  filePath: string;
  fallback: ReactNode;
}

export function PageDiffFallback({ filePath, fallback }: PageDiffFallbackProps) {
  const review = useChangesStore((s) => s.review);
  const closeReview = useChangesStore((s) => s.closeReview);

  if (review.open && review.changeSetId && review.filePath === filePath) {
    return (
      <DocumentDiffView
        changeSetId={review.changeSetId}
        filePath={filePath}
        onExit={closeReview}
      />
    );
  }

  return <>{fallback}</>;
}
