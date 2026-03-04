import crypto from "crypto";
import fs from "fs";
import path from "path";
import { resolveOpenClawStateDir } from "@/lib/openclaw/config";

export interface GatewayDeviceIdentity {
  deviceId: string;
  publicKeyPem: string;
  privateKeyPem: string;
}

interface StoredGatewayDeviceAuthToken {
  token: string;
  role: string;
  scopes: string[];
  updatedAtMs: number;
  gatewayKey?: string;
}

interface StoredGatewayDeviceAuthFile {
  version: 1 | 2;
  deviceId: string;
  tokens: Record<string, StoredGatewayDeviceAuthToken>;
}

interface DeviceProofParams {
  identity: GatewayDeviceIdentity;
  clientId: string;
  clientMode: string;
  role: string;
  scopes: string[];
  token?: string;
  nonce?: string;
}

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const TOKEN_KEY_SEPARATOR = "::";
export const REQUIRED_OPERATOR_GATEWAY_SCOPES = ["operator.read", "operator.write"] as const;

function resolveIdentityDir(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveOpenClawStateDir(env), "identity");
}

function resolveDeviceIdentityPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveIdentityDir(env), "device.json");
}

function resolveDeviceAuthPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveIdentityDir(env), "device-auth.json");
}

function ensureDirForFile(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}

function normalizeToken(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeScopeValue(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim().toLowerCase();
  return trimmed ? trimmed : undefined;
}

function derivePublicKeyRaw(publicKeyPem: string): Buffer {
  const spki = crypto.createPublicKey(publicKeyPem).export({
    type: "spki",
    format: "der",
  });

  if (
    spki.length === ED25519_SPKI_PREFIX.length + 32 &&
    spki.subarray(0, ED25519_SPKI_PREFIX.length).equals(ED25519_SPKI_PREFIX)
  ) {
    return spki.subarray(ED25519_SPKI_PREFIX.length);
  }
  return spki;
}

function fingerprintPublicKey(publicKeyPem: string): string {
  const raw = derivePublicKeyRaw(publicKeyPem);
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function generateIdentity(): GatewayDeviceIdentity {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  return {
    deviceId: fingerprintPublicKey(publicKeyPem),
    publicKeyPem,
    privateKeyPem,
  };
}

function writeJson(filePath: string, data: unknown): void {
  ensureDirForFile(filePath);
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // ignore chmod failures on unsupported filesystems
  }
}

export function loadOrCreateGatewayDeviceIdentity(
  env: NodeJS.ProcessEnv = process.env,
): GatewayDeviceIdentity {
  const filePath = resolveDeviceIdentityPath(env);
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw) as {
        version?: number;
        deviceId?: unknown;
        publicKeyPem?: unknown;
        privateKeyPem?: unknown;
      };
      if (
        parsed?.version === 1 &&
        typeof parsed.deviceId === "string" &&
        typeof parsed.publicKeyPem === "string" &&
        typeof parsed.privateKeyPem === "string"
      ) {
        const derivedId = fingerprintPublicKey(parsed.publicKeyPem);
        if (derivedId !== parsed.deviceId) {
          writeJson(filePath, {
            version: 1,
            deviceId: derivedId,
            publicKeyPem: parsed.publicKeyPem,
            privateKeyPem: parsed.privateKeyPem,
            createdAtMs: Date.now(),
          });
          return {
            deviceId: derivedId,
            publicKeyPem: parsed.publicKeyPem,
            privateKeyPem: parsed.privateKeyPem,
          };
        }

        return {
          deviceId: parsed.deviceId,
          publicKeyPem: parsed.publicKeyPem,
          privateKeyPem: parsed.privateKeyPem,
        };
      }
    }
  } catch {
    // fall through to regeneration
  }

  const identity = generateIdentity();
  writeJson(filePath, {
    version: 1,
    deviceId: identity.deviceId,
    publicKeyPem: identity.publicKeyPem,
    privateKeyPem: identity.privateKeyPem,
    createdAtMs: Date.now(),
  });
  return identity;
}

export function publicKeyRawBase64UrlFromPem(publicKeyPem: string): string {
  return base64UrlEncode(derivePublicKeyRaw(publicKeyPem));
}

function signDevicePayload(privateKeyPem: string, payload: string): string {
  const key = crypto.createPrivateKey(privateKeyPem);
  return base64UrlEncode(crypto.sign(null, Buffer.from(payload, "utf8"), key));
}

function normalizeScopesForSignature(scopes: string[]): string[] {
  const out = new Set<string>();
  const ordered: string[] = [];
  for (const scope of scopes) {
    const normalized = normalizeScopeValue(scope);
    if (!normalized || out.has(normalized)) continue;
    out.add(normalized);
    ordered.push(normalized);
  }
  return ordered;
}

function normalizeScopesForStorage(scopes: string[]): string[] {
  return normalizeScopesForSignature(scopes).sort();
}

export function hasRequiredGatewayScopes(
  scopes: readonly string[] | undefined,
  requiredScopes: readonly string[] = REQUIRED_OPERATOR_GATEWAY_SCOPES,
): boolean {
  if (!Array.isArray(scopes) || scopes.length === 0) return false;
  const available = new Set<string>();
  for (const scope of scopes) {
    const normalized = normalizeScopeValue(scope);
    if (normalized) available.add(normalized);
  }
  for (const required of requiredScopes) {
    const normalized = normalizeScopeValue(required);
    if (!normalized) continue;
    if (!available.has(normalized)) return false;
  }
  return true;
}

export function scoreGatewayScopes(scopes: readonly string[] | undefined): number {
  if (!Array.isArray(scopes) || scopes.length === 0) return 0;
  const normalized = new Set<string>();
  for (const scope of scopes) {
    const value = normalizeScopeValue(scope);
    if (value) normalized.add(value);
  }
  let score = 0;
  if (normalized.has("operator.read")) score += 100;
  if (normalized.has("operator.write")) score += 200;
  if (normalized.has("operator.admin")) score += 30;
  if (normalized.has("operator.approvals")) score += 5;
  if (normalized.has("operator.pairing")) score += 5;
  return score;
}

function normalizeGatewayKey(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  const toHttpLike = (value: string): string => {
    if (/^wss?:\/\//i.test(value)) {
      return value.replace(/^wss?/i, "http");
    }
    if (/^https?:\/\//i.test(value)) {
      return value;
    }
    return `http://${value}`;
  };

  try {
    const parsed = new URL(toHttpLike(trimmed));
    const port =
      parsed.port ||
      (parsed.protocol === "https:" ? "443" : "80");
    return `${parsed.hostname.toLowerCase()}:${port}`;
  } catch {
    return trimmed.toLowerCase();
  }
}

function buildTokenStoreKey(role: string, gatewayKey?: string): string {
  return gatewayKey ? `${role}${TOKEN_KEY_SEPARATOR}${gatewayKey}` : role;
}

function parseTokenStoreKey(storeKey: string): { role: string; gatewayKey?: string } {
  const idx = storeKey.indexOf(TOKEN_KEY_SEPARATOR);
  if (idx === -1) {
    return { role: storeKey.trim() };
  }
  const role = storeKey.slice(0, idx).trim();
  const gatewayKey = normalizeGatewayKey(storeKey.slice(idx + TOKEN_KEY_SEPARATOR.length));
  return { role, ...(gatewayKey ? { gatewayKey } : {}) };
}

function normalizeStoredTokenEntry(
  storeKey: string,
  entry: unknown,
): StoredGatewayDeviceAuthToken | null {
  if (!entry || typeof entry !== "object") return null;
  const record = entry as Record<string, unknown>;
  const parsed = parseTokenStoreKey(storeKey);
  const token = normalizeToken(record.token);
  if (!token) return null;
  const role = typeof record.role === "string" && record.role.trim()
    ? record.role.trim()
    : parsed.role;
  if (!role) return null;
  const gatewayKey = normalizeGatewayKey(
    typeof record.gatewayKey === "string" ? record.gatewayKey : parsed.gatewayKey,
  );
  const scopesRaw = Array.isArray(record.scopes)
    ? (record.scopes.filter((scope): scope is string => typeof scope === "string"))
    : [];
  const updatedAtMs = typeof record.updatedAtMs === "number" && Number.isFinite(record.updatedAtMs)
    ? record.updatedAtMs
    : 0;

  return {
    token,
    role,
    scopes: normalizeScopesForStorage(scopesRaw),
    updatedAtMs,
    ...(gatewayKey ? { gatewayKey } : {}),
  };
}

function buildDeviceAuthPayload(params: {
  deviceId: string;
  clientId: string;
  clientMode: string;
  role: string;
  scopes: string[];
  signedAtMs: number;
  token?: string;
  nonce?: string;
}): string {
  const version = params.nonce ? "v2" : "v1";
  const pieces = [
    version,
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    params.scopes.join(","),
    String(params.signedAtMs),
    params.token ?? "",
  ];
  if (version === "v2") {
    pieces.push(params.nonce ?? "");
  }
  return pieces.join("|");
}

export function buildGatewayDeviceProof(params: DeviceProofParams): {
  id: string;
  publicKey: string;
  signature: string;
  signedAt: number;
  nonce?: string;
} {
  const normalizedScopes = normalizeScopesForSignature(params.scopes);
  const signedAt = Date.now();
  const payload = buildDeviceAuthPayload({
    deviceId: params.identity.deviceId,
    clientId: params.clientId,
    clientMode: params.clientMode,
    role: params.role,
    scopes: normalizedScopes,
    signedAtMs: signedAt,
    token: params.token,
    nonce: params.nonce,
  });

  return {
    id: params.identity.deviceId,
    publicKey: publicKeyRawBase64UrlFromPem(params.identity.publicKeyPem),
    signature: signDevicePayload(params.identity.privateKeyPem, payload),
    signedAt,
    ...(params.nonce ? { nonce: params.nonce } : {}),
  };
}

function readDeviceAuthStore(
  env: NodeJS.ProcessEnv = process.env,
): StoredGatewayDeviceAuthFile | null {
  const filePath = resolveDeviceAuthPath(env);
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as StoredGatewayDeviceAuthFile;
    if (
      !parsed ||
      (parsed.version !== 1 && parsed.version !== 2) ||
      typeof parsed.deviceId !== "string" ||
      !parsed.tokens ||
      typeof parsed.tokens !== "object"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeDeviceAuthStore(
  store: StoredGatewayDeviceAuthFile,
  env: NodeJS.ProcessEnv = process.env,
): void {
  writeJson(resolveDeviceAuthPath(env), store);
}

export function loadStoredGatewayDeviceToken(
  params: {
    deviceId: string;
    role: string;
    gatewayUrl?: string;
    requiredScopes?: readonly string[];
    env?: NodeJS.ProcessEnv;
  },
): StoredGatewayDeviceAuthToken | null {
  const store = readDeviceAuthStore(params.env);
  if (!store) return null;
  if (store.deviceId !== params.deviceId) return null;
  const role = params.role.trim();
  if (!role) return null;

  const expectedGatewayKey = normalizeGatewayKey(params.gatewayUrl);
  const requiredScopes = normalizeScopesForStorage(
    (params.requiredScopes ?? []).filter((scope): scope is string => typeof scope === "string"),
  );
  const candidates: Array<StoredGatewayDeviceAuthToken & { gatewayMatch: number; scopeScore: number }> = [];

  for (const [storeKey, rawEntry] of Object.entries(store.tokens)) {
    const entry = normalizeStoredTokenEntry(storeKey, rawEntry);
    if (!entry) continue;
    if (entry.role !== role) continue;
    if (expectedGatewayKey && entry.gatewayKey && entry.gatewayKey !== expectedGatewayKey) {
      continue;
    }
    if (requiredScopes.length > 0 && !hasRequiredGatewayScopes(entry.scopes, requiredScopes)) {
      continue;
    }
    const gatewayMatch = expectedGatewayKey
      ? entry.gatewayKey === expectedGatewayKey
        ? 2
        : entry.gatewayKey
          ? 0
          : 1
      : entry.gatewayKey
        ? 1
        : 0;
    candidates.push({
      ...entry,
      gatewayMatch,
      scopeScore: scoreGatewayScopes(entry.scopes),
    });
  }

  if (candidates.length === 0) return null;

  candidates.sort(
    (a, b) =>
      b.gatewayMatch - a.gatewayMatch ||
      b.scopeScore - a.scopeScore ||
      b.updatedAtMs - a.updatedAtMs,
  );
  const best = candidates[0];
  return {
    token: best.token,
    role: best.role,
    scopes: best.scopes,
    updatedAtMs: best.updatedAtMs,
    ...(best.gatewayKey ? { gatewayKey: best.gatewayKey } : {}),
  };
}

export function storeGatewayDeviceToken(params: {
  deviceId: string;
  role: string;
  token: string;
  scopes: string[];
  gatewayUrl?: string;
  env?: NodeJS.ProcessEnv;
}): boolean {
  const role = params.role.trim();
  const token = normalizeToken(params.token);
  if (!role || !token) return false;
  const gatewayKey = normalizeGatewayKey(params.gatewayUrl);
  const storeKey = buildTokenStoreKey(role, gatewayKey);
  const existing = readDeviceAuthStore(params.env);
  const base: StoredGatewayDeviceAuthFile = existing &&
      existing.deviceId === params.deviceId &&
      existing.tokens &&
      typeof existing.tokens === "object"
    ? existing
    : {
        version: 2,
        deviceId: params.deviceId,
        tokens: {},
      };
  base.version = 2;

  const normalizedScopes = normalizeScopesForStorage(params.scopes);
  const nextEntry: StoredGatewayDeviceAuthToken = {
    token,
    role,
    scopes: normalizedScopes,
    updatedAtMs: Date.now(),
    ...(gatewayKey ? { gatewayKey } : {}),
  };
  const currentEntry = normalizeStoredTokenEntry(storeKey, base.tokens[storeKey]);

  if (currentEntry) {
    const currentScore = scoreGatewayScopes(currentEntry.scopes);
    const nextScore = scoreGatewayScopes(nextEntry.scopes);
    if (currentScore > nextScore) {
      return false;
    }
  }

  base.tokens[storeKey] = nextEntry;

  writeDeviceAuthStore(base, params.env);
  return true;
}

export function clearStoredGatewayDeviceToken(params: {
  deviceId: string;
  role: string;
  gatewayUrl?: string;
  includeLegacyRoleEntry?: boolean;
  env?: NodeJS.ProcessEnv;
}): boolean {
  const role = params.role.trim();
  if (!role) return false;
  const store = readDeviceAuthStore(params.env);
  if (!store) return false;
  if (store.deviceId !== params.deviceId) return false;

  const gatewayKey = normalizeGatewayKey(params.gatewayUrl);
  const exactKey = buildTokenStoreKey(role, gatewayKey);
  let changed = false;

  if (store.tokens[exactKey]) {
    delete store.tokens[exactKey];
    changed = true;
  }

  if (params.includeLegacyRoleEntry && store.tokens[role]) {
    delete store.tokens[role];
    changed = true;
  }

  if (changed) {
    store.version = 2;
    writeDeviceAuthStore(store, params.env);
  }

  return changed;
}
