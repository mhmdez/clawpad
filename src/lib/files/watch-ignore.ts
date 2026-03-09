import path from "path";

/**
 * Converts a watched absolute path into a POSIX-style path relative to the pages root.
 * Returns null when the path is outside the root.
 */
export function toRelativeWatchPath(rootDir: string, watchedPath: string): string | null {
  const resolvedRoot = path.resolve(rootDir);
  const resolvedPath = path.resolve(watchedPath);
  const relative = path.relative(resolvedRoot, resolvedPath);

  if (!relative || relative === ".") {
    return "";
  }
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }
  return relative.replace(/\\/g, "/");
}

/**
 * Ignore hidden files/folders and _space.yml inside the watched pages root.
 * Hidden path checks are applied only to the relative path inside pagesDir,
 * never to parent absolute segments (for example "~/.openclaw/...").
 */
export function shouldIgnoreWatchPath(rootDir: string, watchedPath: string): boolean {
  const relative = toRelativeWatchPath(rootDir, watchedPath);
  if (relative === null || relative === "") {
    return false;
  }

  const segments = relative.split("/");
  if (segments.some((segment) => segment.startsWith("."))) {
    return true;
  }

  const leaf = segments[segments.length - 1];
  return leaf === "_space.yml";
}
