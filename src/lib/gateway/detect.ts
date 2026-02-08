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
  const envToken = process.env.OPENCLAW_GATEWAY_TOKEN;
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
        token: envToken || (config.gateway?.auth?.token ?? undefined),
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
