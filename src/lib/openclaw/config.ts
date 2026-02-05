import fs from "fs";
import path from "path";
import os from "os";
import { parseOpenClawConfig } from "./parse";

const LEGACY_STATE_DIRS = [".clawdbot"];
const CONFIG_FILENAMES = ["openclaw.json", "clawdbot.json"];

function resolveUserPath(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("~")) {
    return path.resolve(trimmed.replace(/^~(?=$|[\\/])/, os.homedir()));
  }
  return path.resolve(trimmed);
}

export function resolveOpenClawStateDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.OPENCLAW_STATE_DIR || env.CLAWDBOT_STATE_DIR;
  if (override && override.trim()) {
    return resolveUserPath(override);
  }
  return path.join(os.homedir(), ".openclaw");
}

export function resolveOpenClawConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.OPENCLAW_CONFIG_PATH || env.CLAWDBOT_CONFIG_PATH;
  if (override && override.trim()) {
    return resolveUserPath(override);
  }
  return path.join(resolveOpenClawStateDir(env), "openclaw.json");
}

export function findOpenClawConfigPath(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const explicit = env.OPENCLAW_CONFIG_PATH || env.CLAWDBOT_CONFIG_PATH;
  if (explicit && explicit.trim()) {
    const resolved = resolveUserPath(explicit);
    return fs.existsSync(resolved) ? resolved : null;
  }

  const stateDir = resolveOpenClawStateDir(env);
  const candidates = [
    ...CONFIG_FILENAMES.map((name) => path.join(stateDir, name)),
    path.join(os.homedir(), ".openclaw", "openclaw.json"),
    ...LEGACY_STATE_DIRS.map((dir) => path.join(os.homedir(), dir, "clawdbot.json")),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function readOpenClawConfigSync(
  env: NodeJS.ProcessEnv = process.env,
): { path: string | null; config: Record<string, unknown> | null } {
  const configPath = findOpenClawConfigPath(env);
  if (!configPath) {
    return { path: null, config: null };
  }
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    const parsed = parseOpenClawConfig(raw);
    if (parsed.ok && parsed.value && typeof parsed.value === "object") {
      return { path: configPath, config: parsed.value as Record<string, unknown> };
    }
  } catch {
    // ignore malformed config
  }
  return { path: configPath, config: null };
}
