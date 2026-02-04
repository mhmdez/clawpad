import { getPagesDir } from "@/lib/files/paths";

/**
 * SSE endpoint that streams file change events from ~/.openclaw/pages/.
 * Uses chokidar to watch for file additions, modifications, and deletions.
 */
export async function GET() {
  const pagesDir = getPagesDir();

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      function send(data: Record<string, unknown>) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Controller closed
        }
      }

      // Send keepalive every 30s
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          clearInterval(keepalive);
        }
      }, 30_000);

      let watcher: import("chokidar").FSWatcher | null = null;

      try {
        const chokidar = await import("chokidar");

        watcher = chokidar.watch(pagesDir, {
          ignoreInitial: true,
          awaitWriteFinish: {
            stabilityThreshold: 500,
            pollInterval: 100,
          },
          ignored: [/(^|[/\\])\./, /\/_space\.yml$/],
        });

        watcher.on("add", (filePath: string) => {
          if (!filePath.endsWith(".md")) return;
          const relative = filePath.replace(pagesDir + "/", "");
          send({ type: "file-added", path: relative, timestamp: Date.now() });
        });

        watcher.on("change", (filePath: string) => {
          if (!filePath.endsWith(".md")) return;
          const relative = filePath.replace(pagesDir + "/", "");
          send({ type: "file-changed", path: relative, timestamp: Date.now() });
        });

        watcher.on("unlink", (filePath: string) => {
          if (!filePath.endsWith(".md")) return;
          const relative = filePath.replace(pagesDir + "/", "");
          send({ type: "file-removed", path: relative, timestamp: Date.now() });
        });

        // Send initial connection event
        send({ type: "connected", timestamp: Date.now() });
      } catch {
        send({ type: "error", message: "File watcher unavailable", timestamp: Date.now() });
      }

      // Cleanup when client disconnects
      const cleanup = () => {
        clearInterval(keepalive);
        watcher?.close();
      };

      // AbortSignal not available on controller, so we rely on error handling
      // The stream will error when the client disconnects
      controller.enqueue(encoder.encode(""));

      // Store cleanup for when the stream is cancelled
      (controller as unknown as Record<string, unknown>).__cleanup = cleanup;
    },

    cancel() {
      // Called when the client disconnects
      const cleanup = (this as unknown as Record<string, unknown>).__cleanup as (() => void) | undefined;
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
