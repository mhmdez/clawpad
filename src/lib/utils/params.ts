export function parseLimit(
  input: string | null | undefined,
  fallback: number,
  max: number,
): number {
  const parsed = Number.parseInt(input ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(Math.max(parsed, 1), max);
}
