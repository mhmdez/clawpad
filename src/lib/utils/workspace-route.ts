export function toWorkspacePath(pagePath: string): string {
  const normalized = pagePath.replace(/\.md$/, "");
  const segments = normalized
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment));

  if (segments.length === 0) {
    return "/workspace";
  }

  return `/workspace/${segments.join("/")}`;
}
