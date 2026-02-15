import { readFile } from "fs/promises";
import { findOpenClawConfigPath } from "@/lib/openclaw/config";
import { parseOpenClawConfig } from "@/lib/openclaw/parse";

interface GatewayConfig {
  url: string;
  token?: string;
  agentName?: string;
  source: string;
}

/**
 * Auto-detect the OpenClaw gateway configuration.
 * Priority: env vars → ~/.openclaw/openclaw.json → ~/.clawdbot/clawdbot.json → default localhost:18789
 */
export async function detectGateway(): Promise<GatewayConfig | null> {
  // 1. Check environment variables
  const envUrl = process.env.OPENCLAW_GATEWAY_URL;
  const envToken = normalizeToken(process.env.OPENCLAW_GATEWAY_TOKEN);
  const envAgent = process.env.OPENCLAW_AGENT_NAME;

  if (envUrl) {
    return {
      url: normalizeUrl(envUrl),
      token: envToken || undefined,
      agentName: envAgent || undefined,
      source: "env",
    };
  }

  // 2. Try OpenClaw config (OPENCLAW_CONFIG_PATH / OPENCLAW_STATE_DIR / defaults)
  try {
    const configPath = findOpenClawConfigPath();
    if (configPath) {
      const raw = await readFile(configPath, "utf-8");
      const parsed = parseOpenClawConfig(raw);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic config structure
      const config: any = parsed.ok && parsed.value && typeof parsed.value === "object"
        ? parsed.value
        : {};
      const port = config.gateway?.port ?? config.port ?? 18789;
      const host = normalizeHost(
        config.gateway?.bind ?? config.gateway?.host ?? config.host ?? "127.0.0.1",
      );

      return {
        url: `http://${host}:${port}`,
        token: selectGatewayAuthToken(config.gateway?.auth) ?? envToken,
        agentName: config.name ?? config.agentName ?? undefined,
        source: configPath.includes("clawdbot.json") ? "clawdbot.json" : "openclaw.json",
      };
    }
  } catch {
    // File not found or parse error — continue
  }

  // 3. Default
  return {
    url: "http://127.0.0.1:18789",
    token: undefined,
    agentName: undefined,
    source: "default",
  };
}

function normalizeHost(host: string): string {
  // Convert named bind addresses to IP
  const hostMap: Record<string, string> = {
    loopback: "127.0.0.1",
    localhost: "127.0.0.1",
    "0.0.0.0": "127.0.0.1",
    "::": "127.0.0.1",
    "::1": "127.0.0.1",
  };
  return hostMap[host] ?? host;
}

function normalizeUrl(url: string): string {
  // Ensure URL has protocol
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return `http://${url}`;
  }
  // Remove trailing slash
  return url.replace(/\/+$/, "");
}

function normalizeToken(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeScopes(raw: unknown): Set<string> {
  const scopes = new Set<string>();
  const parts: string[] = [];

  if (typeof raw === "string") {
    parts.push(...raw.split(/[,\s]+/g));
  } else if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === "string") {
        parts.push(...item.split(/[,\s]+/g));
      }
    }
  }

  for (const part of parts) {
    const normalized = part.trim().toLowerCase();
    if (normalized) scopes.add(normalized);
  }
  return scopes;
}

function scoreScopes(scopes: Set<string>): number {
  if (scopes.has("operator.admin")) return 100;
  if (scopes.has("operator.write")) return 90;
  if (scopes.has("operator.read")) return 20;
  return 10;
}

function extractTokenFromEntry(entry: unknown): string | undefined {
  if (typeof entry === "string") {
    return normalizeToken(entry);
  }
  if (!entry || typeof entry !== "object") {
    return undefined;
  }
  const record = entry as Record<string, unknown>;
  if (record.enabled === false) {
    return undefined;
  }
  return normalizeToken(
    record.token ??
      record.value ??
      record.accessToken ??
      record.access_token ??
      record.bearer ??
      record.secret,
  );
}

function selectGatewayAuthToken(auth: unknown): string | undefined {
  if (!auth || typeof auth !== "object") return undefined;
  const authRecord = auth as Record<string, unknown>;

  const candidates: Array<{ token: string; score: number; priority: number }> = [];

  const directToken = normalizeToken(authRecord.token);
  if (directToken) {
    const directScopes = normalizeScopes(authRecord.scopes ?? authRecord.scope);
    candidates.push({
      token: directToken,
      score: directScopes.size > 0 ? scoreScopes(directScopes) + 30 : 50,
      priority: 0,
    });
  }

  const rawTokens = Array.isArray(authRecord.tokens) ? authRecord.tokens : [];
  for (let index = 0; index < rawTokens.length; index += 1) {
    const entry = rawTokens[index];
    const token = extractTokenFromEntry(entry);
    if (!token) continue;

    const entryScopes =
      entry && typeof entry === "object"
        ? normalizeScopes((entry as Record<string, unknown>).scopes ?? (entry as Record<string, unknown>).scope)
        : new Set<string>();

    candidates.push({
      token,
      score: entryScopes.size > 0 ? scoreScopes(entryScopes) : 25,
      priority: index + 1,
    });
  }

  if (candidates.length === 0) return undefined;
  candidates.sort((a, b) => b.score - a.score || a.priority - b.priority);
  return candidates[0]?.token;
}
