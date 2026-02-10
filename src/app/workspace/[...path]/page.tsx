import { readPage } from "@/lib/files";
import { PageEditor } from "@/components/editor/page-editor";
import { FileSystemError } from "@/lib/files/types";
import { FileQuestion } from "lucide-react";
import Link from "next/link";
import { PageDiffFallback } from "@/components/editor/page-diff-fallback";

interface PageViewProps {
  params: Promise<{ path: string[] }>;
}

export default async function PageView({ params }: PageViewProps) {
  const { path: segments } = await params;
  const filePath = segments
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })
    .join("/");

  try {
    const page = await readPage(filePath);
    return (
      /* eslint-disable-next-line -- try/catch is for file read errors, not React render */
      <PageEditor
        initialContent={page.content}
        meta={page.meta}
        filePath={page.meta.path}
      />
    );
  } catch (err) {
    if (err instanceof FileSystemError && err.code === "NOT_FOUND") {
      return <PageNotFound path={filePath} />;
    }
    // Re-throw unexpected errors
    throw err;
  }
}

// ─── Not Found State ────────────────────────────────────────────────────────

function PageNotFound({ path }: { path: string }) {
  const displayPath = path.replace(/\.md$/, "").replace(/[-_]/g, " ");

  return (
    <PageDiffFallback
      filePath={path}
      fallback={(
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-center max-w-md px-6">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <FileQuestion className="h-8 w-8 text-muted-foreground" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight mb-2">
              Page not found
            </h1>
            <p className="text-muted-foreground mb-6">
              <code className="rounded bg-muted px-1.5 py-0.5 text-sm">
                {displayPath}
              </code>{" "}
              doesn&apos;t exist yet.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Link
                href="/workspace"
                className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Go to workspace
              </Link>
            </div>
          </div>
        </div>
      )}
    />
  );
}
