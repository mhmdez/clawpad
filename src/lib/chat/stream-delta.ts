function longestSuffixPrefixOverlap(base: string, incoming: string): number {
  const max = Math.min(base.length, incoming.length);
  for (let size = max; size > 0; size -= 1) {
    if (base.slice(-size) === incoming.slice(0, size)) {
      return size;
    }
  }
  return 0;
}

/**
 * Compute the append-only delta to move from `emittedText` toward `incomingText`.
 *
 * Gateway streams can alternate between:
 * - cumulative payloads (full text-so-far), and
 * - chunk payloads (only the new fragment).
 *
 * We always return text safe to append, avoiding duplicate joins such as
 * "NowNow" when payload modes switch mid-stream.
 */
export function computeAppendDelta(
  emittedText: string,
  incomingText: string,
): string {
  if (!incomingText) return "";
  if (!emittedText) return incomingText;

  // Cumulative mode: incoming already contains full emitted prefix.
  if (incomingText.startsWith(emittedText)) {
    return incomingText.slice(emittedText.length);
  }

  // Duplicate chunk already emitted.
  if (emittedText.endsWith(incomingText)) {
    return "";
  }

  // Sliding-window style payloads: keep only the non-overlapping suffix.
  const overlap = longestSuffixPrefixOverlap(emittedText, incomingText);
  if (overlap > 0) {
    return incomingText.slice(overlap);
  }

  // Independent chunk with no overlap.
  return incomingText;
}
