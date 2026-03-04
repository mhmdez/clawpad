import {
  loadOrCreateGatewayDeviceIdentity,
  loadStoredGatewayDeviceToken,
} from "./device-auth";

function normalizeToken(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Resolve the most reliable gateway token for the current device.
 * Prefers a cached device token issued by the gateway, then falls back to
 * the configured gateway token.
 */
export function resolveGatewayAuthToken(
  configToken?: string,
  role = "operator",
): string | undefined {
  const fallback = normalizeToken(configToken);
  try {
    const identity = loadOrCreateGatewayDeviceIdentity();
    const stored = loadStoredGatewayDeviceToken({
      deviceId: identity.deviceId,
      role,
    })?.token;
    return normalizeToken(stored) ?? fallback;
  } catch {
    return fallback;
  }
}
