import fs from "fs/promises";
import path from "path";
import { resolveOpenClawStateDir } from "@/lib/openclaw/config";

export interface GatewayOverrideConfig {
  version: 1;
  url: string;
  token?: string;
  updatedAt: string;
}

function normalizeUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withProtocol =
    trimmed.startsWith("http://") || trimmed.startsWith("https://")
      ? trimmed
      : `http://${trimmed}`;
  return withProtocol.replace(/\/+$/g, "");
}

function normalizeToken(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed ? trimmed : undefined;
}

export function resolveGatewayOverridePath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return path.join(resolveOpenClawStateDir(env), "clawpad", "gateway-override.json");
}

export async function readGatewayOverride(
  env: NodeJS.ProcessEnv = process.env,
): Promise<GatewayOverrideConfig | null> {
  const filePath = resolveGatewayOverridePath(env);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as {
      version?: unknown;
      url?: unknown;
      token?: unknown;
      updatedAt?: unknown;
    };

    const url = normalizeUrl(parsed?.url);
    if (parsed?.version !== 1 || !url) return null;
    const token = normalizeToken(parsed?.token);
    const updatedAt =
      typeof parsed?.updatedAt === "string" && parsed.updatedAt.trim()
        ? parsed.updatedAt
        : new Date().toISOString();

    return {
      version: 1,
      url,
      ...(token ? { token } : {}),
      updatedAt,
    };
  } catch {
    return null;
  }
}

export async function writeGatewayOverride(
  input: { url: string; token?: string },
  env: NodeJS.ProcessEnv = process.env,
): Promise<GatewayOverrideConfig> {
  const url = normalizeUrl(input.url);
  if (!url) {
    throw new Error("Gateway URL is required");
  }
  const token = normalizeToken(input.token);

  const payload: GatewayOverrideConfig = {
    version: 1,
    url,
    ...(token ? { token } : {}),
    updatedAt: new Date().toISOString(),
  };
  const filePath = resolveGatewayOverridePath(env);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, {
    mode: 0o600,
  });
  try {
    await fs.chmod(filePath, 0o600);
  } catch {
    // ignore permission errors on filesystems that don't support chmod
  }
  return payload;
}

export async function clearGatewayOverride(
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const filePath = resolveGatewayOverridePath(env);
  try {
    await fs.unlink(filePath);
  } catch {
    // no-op if missing or cannot remove
  }
}
