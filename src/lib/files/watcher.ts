/**
 * ClawPad v2 — File Watcher
 *
 * Watches ~/.openclaw/pages/ for changes using chokidar.
 * Emits FileChangeEvent when pages are created, modified, or deleted.
 * Used for real-time UI updates when the agent edits files externally.
 */

import type { FSWatcher } from 'chokidar';
import { getPagesDir, toRelativePath } from './paths';
import type { FileChangeEvent } from './types';

/**
 * Watches the pages directory for file changes and notifies subscribers.
 *
 * Features:
 * - Debounced writes (500ms stabilityThreshold) to avoid partial-write events
 * - Self-write ignorance via ignoreNextWrite() to prevent echo
 * - Multiple subscriber support with unsubscribe cleanup
 *
 * @example
 * ```ts
 * const watcher = new PageWatcher();
 * const unsub = watcher.onChange((event) => {
 *   console.log(`${event.type}: ${event.path}`);
 * });
 * watcher.start();
 *
 * // Later:
 * watcher.stop();
 * unsub();
 * ```
 */
export class PageWatcher {
  private callbacks: Set<(event: FileChangeEvent) => void> = new Set();
  private watcher: FSWatcher | null = null;
  private pagesDir: string;
  private ignoredPaths: Set<string> = new Set();
  private ignoreTimers: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Create a new PageWatcher.
   *
   * @param pagesDir - Directory to watch (defaults to PAGES_DIR)
   */
  constructor(pagesDir?: string) {
    this.pagesDir = pagesDir ?? getPagesDir();
  }

  /**
   * Start watching for file changes.
   * Requires chokidar to be installed. If chokidar is not available,
   * logs a warning and does nothing.
   */
  start(): void {
    if (this.watcher) return; // Already watching

    // Dynamic import to make chokidar optional
    let chokidar: typeof import('chokidar');
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      chokidar = require('chokidar');
    } catch {
      console.warn('[PageWatcher] chokidar not installed — file watching disabled');
      return;
    }

    this.watcher = chokidar.watch(this.pagesDir, {
      ignoreInitial: true,
      // Wait for writes to stabilize before firing events
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100,
      },
      // Ignore dotfiles and _space.yml
      ignored: [
        /(^|[/\\])\./,
        /\/_space\.yml$/,
      ],
      // Only watch .md files
      // (chokidar doesn't have a glob filter, so we filter in handlers)
    });

    this.watcher.on('add', (filePath: string) => {
      if (!filePath.endsWith('.md')) return;
      this.emit(filePath, 'created');
    });

    this.watcher.on('change', (filePath: string) => {
      if (!filePath.endsWith('.md')) return;
      this.emit(filePath, 'modified');
    });

    this.watcher.on('unlink', (filePath: string) => {
      if (!filePath.endsWith('.md')) return;
      this.emit(filePath, 'deleted');
    });

    this.watcher.on('error', (error: unknown) => {
      console.error('[PageWatcher] Error:', error instanceof Error ? error.message : error);
    });
  }

  /**
   * Stop watching for file changes and clean up resources.
   */
  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    // Clear all ignore timers
    for (const timer of this.ignoreTimers.values()) {
      clearTimeout(timer);
    }
    this.ignoreTimers.clear();
    this.ignoredPaths.clear();
  }

  /**
   * Subscribe to file change events.
   *
   * @param callback - Function to call when a file changes
   * @returns Unsubscribe function — call it to stop receiving events
   */
  onChange(callback: (event: FileChangeEvent) => void): () => void {
    this.callbacks.add(callback);
    return () => {
      this.callbacks.delete(callback);
    };
  }

  /**
   * Mark a path to be ignored on the next write event.
   * Used to prevent echoing our own writes back as external changes.
   * The ignore expires after 5 seconds to avoid stale state.
   *
   * @param relativePath - Relative path to ignore
   */
  ignoreNextWrite(relativePath: string): void {
    this.ignoredPaths.add(relativePath);

    // Clear any existing timer for this path
    const existingTimer = this.ignoreTimers.get(relativePath);
    if (existingTimer) clearTimeout(existingTimer);

    // Auto-expire ignore after 5 seconds
    const timer = setTimeout(() => {
      this.ignoredPaths.delete(relativePath);
      this.ignoreTimers.delete(relativePath);
    }, 5000);

    this.ignoreTimers.set(relativePath, timer);
  }

  /** Emit a change event to all subscribers. */
  private emit(absolutePath: string, type: FileChangeEvent['type']): void {
    let relativePath: string;
    try {
      relativePath = toRelativePath(absolutePath);
    } catch {
      return; // Path outside pages dir — ignore
    }

    // Check if this path should be ignored (self-write)
    if (this.ignoredPaths.has(relativePath)) {
      this.ignoredPaths.delete(relativePath);
      const timer = this.ignoreTimers.get(relativePath);
      if (timer) {
        clearTimeout(timer);
        this.ignoreTimers.delete(relativePath);
      }
      return;
    }

    const event: FileChangeEvent = {
      type,
      path: relativePath,
      timestamp: Date.now(),
    };

    for (const callback of this.callbacks) {
      try {
        callback(event);
      } catch (err) {
        console.error('[PageWatcher] Callback error:', err);
      }
    }
  }
}
