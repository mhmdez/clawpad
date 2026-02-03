import { readFile } from "fs/promises";
import { join } from "path";
import { homedir } from "os";

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

  const home = homedir();

  // 2. Try ~/.openclaw/openclaw.json
  try {
    const configPath = join(home, ".openclaw", "openclaw.json");
    const raw = await readFile(configPath, "utf-8");
    const config = JSON.parse(raw);
    const port = config.gateway?.port ?? config.port ?? 18789;
    const host = config.gateway?.host ?? config.host ?? "127.0.0.1";

    return {
      url: `http://${host}:${port}`,
      token: config.gateway?.token ?? config.token ?? undefined,
      agentName: config.name ?? config.agentName ?? undefined,
      source: "openclaw.json",
    };
  } catch {
    // File not found or parse error — continue
  }

  // 3. Try ~/.clawdbot/clawdbot.json
  try {
    const configPath = join(home, ".clawdbot", "clawdbot.json");
    const raw = await readFile(configPath, "utf-8");
    const config = JSON.parse(raw);
    const port = config.gateway?.port ?? config.port ?? 18789;
    const host = config.gateway?.host ?? config.host ?? "127.0.0.1";

    return {
      url: `http://${host}:${port}`,
      token: config.gateway?.token ?? config.token ?? undefined,
      agentName: config.name ?? config.agentName ?? undefined,
      source: "clawdbot.json",
    };
  } catch {
    // File not found or parse error — continue
  }

  // 4. Default
  return {
    url: "http://127.0.0.1:18789",
    token: undefined,
    agentName: undefined,
    source: "default",
  };
}

function normalizeUrl(url: string): string {
  // Ensure URL has protocol
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return `http://${url}`;
  }
  // Remove trailing slash
  return url.replace(/\/+$/, "");
}
