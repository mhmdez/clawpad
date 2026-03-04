/**
 * One-shot WebSocket request to the OpenClaw gateway.
 *
 * Opens a temporary WS connection, performs the challenge/connect
 * handshake, sends a single RPC request, returns the result, and
 * closes the connection. Designed for server-side API routes.
 */

import WS from "ws";
import { detectGateway } from "./detect";
import {
  buildGatewayDeviceProof,
  clearStoredGatewayDeviceToken,
  hasRequiredGatewayScopes,
  loadOrCreateGatewayDeviceIdentity,
  loadStoredGatewayDeviceToken,
  REQUIRED_OPERATOR_GATEWAY_SCOPES,
  storeGatewayDeviceToken,
} from "./device-auth";

interface GatewayRPCOptions {
  method: string;
  params?: unknown;
  timeoutMs?: number;
}

function buildOrigin(rawUrl: string): string | null {
  if (!rawUrl) return null;
  const httpUrl = rawUrl.replace(/^ws/i, "http");
  try {
    const parsed = new URL(httpUrl);
    return parsed.origin;
  } catch {
    return null;
  }
}

function normalizeErrorCode(code: unknown): string | null {
  if (typeof code === "string" && code.trim()) return code.trim().toUpperCase();
  if (typeof code === "number" && Number.isFinite(code)) return String(code);
  return null;
}

function extractGatewayErrorCodeAndMessage(error: unknown): { code: string | null; message: string } {
  if (!error || typeof error !== "object") {
    return { code: null, message: "connect rejected" };
  }
  const record = error as Record<string, unknown>;
  const code = normalizeErrorCode(record.code);
  const message =
    typeof record.message === "string" && record.message.trim()
      ? record.message.trim()
      : "connect rejected";
  return { code, message };
}

function isAuthError(code: string | null, message: string): boolean {
  if (!message) return false;
  if (code === "NOT_PAIRED" || code === "AUTH_REQUIRED" || code === "UNAUTHORIZED") {
    return true;
  }
  const normalized = message.toLowerCase();
  return normalized.includes("device identity required") || normalized.includes("not paired");
}

/**
 * Send a single RPC request to the gateway over WebSocket.
 * Returns the response payload or throws on error/timeout.
 */
export async function gatewayRequest<T = unknown>(
  opts: GatewayRPCOptions,
): Promise<T> {
  const config = await detectGateway();
  if (!config) throw new Error("No gateway configuration found");

  const wsUrl = config.url.replace(/^http/, "ws");
  const origin = buildOrigin(config.url);
  const timeout = opts.timeoutMs ?? 10_000;
  const role = "operator";
  const scopes = ["operator.read", "operator.write", "operator.admin"];
  const identity = loadOrCreateGatewayDeviceIdentity();
  const storedToken = loadStoredGatewayDeviceToken({
    deviceId: identity.deviceId,
    role,
    gatewayUrl: config.url,
    requiredScopes: REQUIRED_OPERATOR_GATEWAY_SCOPES,
  })?.token;
  const configToken = typeof config.token === "string" && config.token.trim()
    ? config.token.trim()
    : undefined;

  class RetryWithConfigTokenError extends Error {}

  const tokenCandidates: Array<{ token: string | undefined; source: "stored" | "config" }> = [];
  if (storedToken) {
    tokenCandidates.push({ token: storedToken, source: "stored" });
  }
  if (!storedToken || storedToken !== configToken) {
    tokenCandidates.push({ token: configToken, source: "config" });
  }
  if (tokenCandidates.length === 0) {
    tokenCandidates.push({ token: undefined, source: "config" });
  }

  const runSingleRequest = async (
    authToken: string | undefined,
    source: "stored" | "config",
  ): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      let reqId = 0;
      let settled = false;
      let ws: WS;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          try { ws?.close(); } catch { /* ignore */ }
          reject(new Error("Gateway request timed out"));
        }
      }, timeout);

      function done(err: Error | null, result?: T) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { ws?.close(); } catch { /* ignore */ }
        if (err) reject(err);
        else resolve(result as T);
      }

      try {
        ws = new WS(wsUrl, origin ? { origin } : undefined);
      } catch (err) {
        clearTimeout(timer);
        reject(new Error(`Failed to create WebSocket: ${err}`));
        return;
      }

      ws.on("close", () => {
        done(new Error("WebSocket closed before response"));
      });

      ws.on("error", (err: Error) => {
        done(new Error(`WebSocket error: ${err.message}`));
      });

      ws.on("message", (data: WS.Data) => {
        let frame: { type: string; event?: string; payload?: unknown; id?: string; ok?: boolean; error?: unknown };
        try {
          frame = JSON.parse(String(data));
        } catch {
          return;
        }

        // Step 1: Handle connect challenge
        if (frame.type === "event" && frame.event === "connect.challenge") {
          const payload =
            frame.payload && typeof frame.payload === "object"
              ? (frame.payload as { nonce?: unknown })
              : undefined;
          const nonce = typeof payload?.nonce === "string" ? payload.nonce : undefined;
          const device = buildGatewayDeviceProof({
            identity,
            clientId: "webchat-ui",
            clientMode: "webchat",
            role,
            scopes,
            token: authToken,
            nonce,
          });
          const connectReq = {
            type: "req",
            id: String(++reqId),
            method: "connect",
            params: {
              minProtocol: 3,
              maxProtocol: 3,
              client: { id: "webchat-ui", version: "clawpad", platform: "web", mode: "webchat" },
              role,
              scopes,
              caps: [],
              commands: [],
              permissions: {},
              auth: authToken ? { token: authToken } : {},
              device,
            },
          };
          ws.send(JSON.stringify(connectReq));
          return;
        }

        // Step 2: Handle connect response
        if (frame.type === "res" && frame.id === String(reqId) && reqId === 1) {
          if (!frame.ok) {
            const { code, message } = extractGatewayErrorCodeAndMessage(frame.error);
            if (source === "stored" && isAuthError(code, message)) {
              clearStoredGatewayDeviceToken({
                deviceId: identity.deviceId,
                role,
                gatewayUrl: config.url,
                includeLegacyRoleEntry: true,
              });
              done(
                new RetryWithConfigTokenError(
                  `Gateway connect rejected for cached device token (${message}). Retrying with configured token.`,
                ),
              );
              return;
            }
            if (code === "NOT_PAIRED") {
              done(
                new Error(
                  "Gateway pairing required. Approve this ClawPad device in OpenClaw, then reconnect.",
                ),
              );
              return;
            }
            done(new Error(`Gateway connect rejected: ${JSON.stringify(frame.error)}`));
            return;
          }

          const helloPayload =
            frame.payload && typeof frame.payload === "object"
              ? (frame.payload as { auth?: { deviceToken?: unknown; role?: unknown; scopes?: unknown } })
              : undefined;
          const issuedToken =
            typeof helloPayload?.auth?.deviceToken === "string"
              ? helloPayload.auth.deviceToken
              : null;
          const issuedRole =
            typeof helloPayload?.auth?.role === "string"
              ? helloPayload.auth.role
              : role;
          const issuedScopes = Array.isArray(helloPayload?.auth?.scopes)
            ? helloPayload.auth.scopes.filter(
                (scope): scope is string => typeof scope === "string",
              )
            : [];
          const hasScopeInfo = issuedScopes.length > 0;
          const hasRequiredScopes = !hasScopeInfo
            ? true
            : hasRequiredGatewayScopes(issuedScopes, REQUIRED_OPERATOR_GATEWAY_SCOPES);

          if (issuedToken && hasRequiredScopes) {
            storeGatewayDeviceToken({
              deviceId: identity.deviceId,
              role: issuedRole,
              token: issuedToken,
              scopes: issuedScopes,
              gatewayUrl: config.url,
            });
          }

          if (!hasRequiredScopes) {
            const issuedScopeSet = new Set(issuedScopes.map((scope) => scope.toLowerCase()));
            clearStoredGatewayDeviceToken({
              deviceId: identity.deviceId,
              role: issuedRole,
              gatewayUrl: config.url,
              includeLegacyRoleEntry: true,
            });
            const missingScopes = REQUIRED_OPERATOR_GATEWAY_SCOPES.filter(
              (scope) => !issuedScopeSet.has(scope),
            );
            const message =
              `Gateway connect rejected: missing scope(s) ${missingScopes.join(", ") || "unknown"}. ` +
              "Run `openclaw doctor --generate-gateway-token`, `openclaw gateway restart`, then restart ClawPad.";
            if (source === "stored") {
              done(new RetryWithConfigTokenError(message));
            } else {
              done(new Error(message));
            }
            return;
          }

          // Connected — now send the actual RPC request
          const rpcReq = {
            type: "req",
            id: String(++reqId),
            method: opts.method,
            params: opts.params ?? {},
          };
          ws.send(JSON.stringify(rpcReq));
          return;
        }

        // Step 3: Handle RPC response
        if (frame.type === "res" && frame.id === String(reqId) && reqId === 2) {
          if (!frame.ok) {
            done(new Error(`Gateway RPC error: ${JSON.stringify(frame.error)}`));
            return;
          }
          done(null, frame.payload as T);
          return;
        }
      });
    });

  let lastError: Error | null = null;
  for (const candidate of tokenCandidates) {
    try {
      return await runSingleRequest(candidate.token, candidate.source);
    } catch (error) {
      if (error instanceof RetryWithConfigTokenError) {
        lastError = error;
        continue;
      }
      lastError = error instanceof Error ? error : new Error(String(error));
      break;
    }
  }

  throw lastError ?? new Error("Gateway request failed");
}
