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
}

interface StoredGatewayDeviceAuthFile {
  version: 1;
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
    const trimmed = scope.trim();
    if (!trimmed || out.has(trimmed)) continue;
    out.add(trimmed);
    ordered.push(trimmed);
  }
  return ordered;
}

function normalizeScopesForStorage(scopes: string[]): string[] {
  return normalizeScopesForSignature(scopes).sort();
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
      parsed?.version !== 1 ||
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
  params: { deviceId: string; role: string; env?: NodeJS.ProcessEnv },
): StoredGatewayDeviceAuthToken | null {
  const store = readDeviceAuthStore(params.env);
  if (!store) return null;
  if (store.deviceId !== params.deviceId) return null;
  const role = params.role.trim();
  const entry = store.tokens[role];
  if (!entry || typeof entry.token !== "string" || !entry.token) {
    return null;
  }
  return entry;
}

export function storeGatewayDeviceToken(params: {
  deviceId: string;
  role: string;
  token: string;
  scopes: string[];
  env?: NodeJS.ProcessEnv;
}): void {
  const role = params.role.trim();
  const existing = readDeviceAuthStore(params.env);
  const base: StoredGatewayDeviceAuthFile = existing &&
      existing.deviceId === params.deviceId &&
      existing.tokens &&
      typeof existing.tokens === "object"
    ? existing
    : {
        version: 1,
        deviceId: params.deviceId,
        tokens: {},
      };

  base.tokens[role] = {
    token: params.token,
    role,
    scopes: normalizeScopesForStorage(params.scopes),
    updatedAtMs: Date.now(),
  };

  writeDeviceAuthStore(base, params.env);
}
