"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

const Editor = dynamic(
  () => import("@/components/editor/editor").then((mod) => mod.Editor),
  {
    ssr: false,
    loading: () => <EditorSkeleton />,
  }
);

interface PageEditorProps {
  path: string;
}

export function PageEditor({ path }: PageEditorProps) {
  // TODO: Load page content from API using the path
  const title = path.split("/").pop()?.replace(/-/g, " ") ?? "Untitled";

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      {/* Page header */}
      <div className="mb-8">
        <h1
          className="text-4xl font-semibold tracking-tight outline-none capitalize"
          contentEditable
          suppressContentEditableWarning
        >
          {title}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {path}
        </p>
      </div>

      {/* Editor */}
      <Editor
        onChange={(markdown) => {
          // TODO: Save to file system API with debounce
          console.log("Content changed:", markdown.slice(0, 100));
        }}
      />
    </div>
  );
}

function EditorSkeleton() {
  return (
    <div className="space-y-4 py-4">
      <Skeleton className="h-6 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-4 w-4/6" />
      <div className="h-4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  );
}
