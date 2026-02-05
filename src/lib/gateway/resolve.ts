import { gatewayWS } from "./ws-client";
import { gatewayRequest } from "./request";

type ResolveResponse = { ok?: boolean; key?: string };

const SESSION_KEY_CACHE = new Map<string, { value: string; expiresAt: number }>();
const SESSION_KEY_TTL_MS = 5 * 60 * 1000;

function getCachedSessionKey(key: string): string | null {
  const cached = SESSION_KEY_CACHE.get(key);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    SESSION_KEY_CACHE.delete(key);
    return null;
  }
  return cached.value;
}

function setCachedSessionKey(key: string, value: string) {
  SESSION_KEY_CACHE.set(key, {
    value,
    expiresAt: Date.now() + SESSION_KEY_TTL_MS,
  });
}

export async function resolveSessionKey(
  rawKey: string | undefined | null,
  opts?: { timeoutMs?: number },
): Promise<string> {
  const trimmed = (rawKey ?? "").trim();
  const key = trimmed || "main";

  const cached = getCachedSessionKey(key);
  if (cached) {
    return cached;
  }

  const timeoutMs = opts?.timeoutMs ?? 4_000;
  const params = { key };

  try {
    if (gatewayWS.status === "connected") {
      const res = await gatewayWS.sendRPC<ResolveResponse>(
        "sessions.resolve",
        params,
        timeoutMs,
      );
      const resolved = res?.key?.trim();
      if (resolved) {
        setCachedSessionKey(key, resolved);
        return resolved;
      }
    }
  } catch {
    // Fall through to one-shot request
  }

  try {
    const res = await gatewayRequest<ResolveResponse>({
      method: "sessions.resolve",
      params,
      timeoutMs,
    });
    const resolved = res?.key?.trim();
    if (resolved) {
      setCachedSessionKey(key, resolved);
      return resolved;
    }
  } catch {
    // Ignore resolution errors and fall back to raw key
  }

  return key;
}
