import fs from "fs";
import path from "path";
import os from "os";
import { parseOpenClawConfig } from "./parse";

const LEGACY_STATE_DIRS = [".clawdbot"];
const CONFIG_FILENAMES = ["openclaw.json", "clawdbot.json"];

function buildWindowsStateDirCandidates(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const candidates = [
    env.APPDATA ? path.join(env.APPDATA, "OpenClaw") : null,
    env.APPDATA ? path.join(env.APPDATA, "openclaw") : null,
    env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, "OpenClaw") : null,
    env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, "openclaw") : null,
    path.join(os.homedir(), "AppData", "Roaming", "OpenClaw"),
    path.join(os.homedir(), "AppData", "Roaming", "openclaw"),
  ].filter((candidate): candidate is string => Boolean(candidate && candidate.trim()));

  return [...new Set(candidates.map((candidate) => path.resolve(candidate)))];
}

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

  if (process.platform === "win32") {
    const windowsCandidate = buildWindowsStateDirCandidates(env).find((candidate) =>
      fs.existsSync(candidate),
    );
    if (windowsCandidate) {
      return windowsCandidate;
    }
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
  const windowsStateDirs =
    process.platform === "win32" ? buildWindowsStateDirCandidates(env) : [];
  const candidates = [
    ...CONFIG_FILENAMES.map((name) => path.join(stateDir, name)),
    ...windowsStateDirs.flatMap((dir) =>
      CONFIG_FILENAMES.map((name) => path.join(dir, name)),
    ),
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
