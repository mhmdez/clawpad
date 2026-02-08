import { getPagesDir } from "@/lib/files/paths";
import path from "path";

interface FileWatchEvent {
  type: "file-added" | "file-changed" | "file-removed" | "connected" | "error";
  path?: string;
  timestamp: number;
  message?: string;
}

type Subscriber = (event: FileWatchEvent) => void;

const pagesDir = getPagesDir();
const subscribers = new Set<Subscriber>();

let watcherInitPromise: Promise<void> | null = null;
let watcher: import("chokidar").FSWatcher | null = null;

function toRelativeWatchPath(filePath: string): string {
  return path.relative(pagesDir, filePath).replace(/\\/g, "/");
}

function resetWatcher() {
  if (watcher) {
    const toClose = watcher;
    watcher = null;
    void toClose.close();
  }
  watcherInitPromise = null;
}

function broadcast(event: FileWatchEvent) {
  for (const subscriber of subscribers) {
    try {
      subscriber(event);
    } catch {
      // Ignore bad subscriber
    }
  }
}

async function ensureWatcher() {
  if (watcher || watcherInitPromise) {
    return watcherInitPromise ?? Promise.resolve();
  }

  watcherInitPromise = (async () => {
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
        const relative = toRelativeWatchPath(filePath);
        broadcast({ type: "file-added", path: relative, timestamp: Date.now() });
      });

      watcher.on("change", (filePath: string) => {
        if (!filePath.endsWith(".md")) return;
        const relative = toRelativeWatchPath(filePath);
        broadcast({ type: "file-changed", path: relative, timestamp: Date.now() });
      });

      watcher.on("unlink", (filePath: string) => {
        if (!filePath.endsWith(".md")) return;
        const relative = toRelativeWatchPath(filePath);
        broadcast({ type: "file-removed", path: relative, timestamp: Date.now() });
      });

      watcher.on("error", (error: unknown) => {
        const message =
          error instanceof Error
            ? error.message
            : "Unknown watcher error";
        broadcast({
          type: "error",
          message: `File watcher error: ${message}`,
          timestamp: Date.now(),
        });
        resetWatcher();
        if (subscribers.size > 0) {
          void ensureWatcher();
        }
      });
    } catch {
      broadcast({ type: "error", message: "File watcher unavailable", timestamp: Date.now() });
      watcherInitPromise = null;
    }
  })();

  return watcherInitPromise;
}

function maybeStopWatcher() {
  if (subscribers.size > 0) return;
  if (!watcher) return;

  const toClose = watcher;
  watcher = null;
  watcherInitPromise = null;
  void toClose.close();
}

/**
 * SSE endpoint that streams file change events from ~/.openclaw/pages/.
 */
export async function GET(request: Request) {
  await ensureWatcher();

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let closed = false;

      const send = (data: FileWatchEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // closed stream
        }
      };

      send({ type: "connected", timestamp: Date.now() });

      const subscriber: Subscriber = (event) => send(event);
      subscribers.add(subscriber);

      const keepalive = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          // stream no longer writable; cancellation path handles cleanup
        }
      }, 30_000);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(keepalive);
        subscribers.delete(subscriber);
        maybeStopWatcher();
      };

      request.signal.addEventListener("abort", cleanup, { once: true });
    },

    cancel() {
      // request.signal abort also handles cleanup in normal disconnect paths
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
