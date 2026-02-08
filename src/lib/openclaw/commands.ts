import { readOpenClawConfigSync } from "./config";

export type OpenClawChatCommand = {
  name: string;
  description: string;
  canonical: string;
  disabled?: boolean;
};

type CommandGate = "config" | "debug" | "bash" | "restart";

const BASE_COMMANDS: Array<{
  name: string;
  description: string;
  canonical?: string;
  gate?: CommandGate;
}> = [
  { name: "help", description: "Show available commands." },
  { name: "commands", description: "List all slash commands." },
  { name: "skill", description: "Run a skill by name." },
  { name: "status", description: "Show current status." },
  { name: "allowlist", description: "List/add/remove allowlist entries." },
  { name: "approve", description: "Approve or deny exec requests." },
  { name: "context", description: "Explain how context is built and used." },
  { name: "tts", description: "Control text-to-speech (TTS)." },
  { name: "config", description: "Show or set config values.", gate: "config" },
  { name: "debug", description: "Set runtime debug overrides.", gate: "debug" },
  { name: "bash", description: "Run host shell commands (host-only).", gate: "bash" },
  { name: "usage", description: "Usage footer or cost summary." },
  { name: "stop", description: "Stop the current run." },
  { name: "restart", description: "Restart OpenClaw.", gate: "restart" },
  { name: "activation", description: "Set group activation mode." },
  { name: "send", description: "Set send policy." },
  { name: "queue", description: "Adjust queue settings." },
  { name: "subagents", description: "List/stop/log/info subagent runs for this session." },
  { name: "model", description: "Show or set the model." },
  { name: "models", description: "List model providers or provider models." },
  { name: "think", description: "Set thinking level." },
  { name: "thinking", description: "Alias for /think.", canonical: "think" },
  { name: "t", description: "Alias for /think.", canonical: "think" },
  { name: "reasoning", description: "Toggle reasoning visibility." },
  { name: "reason", description: "Alias for /reasoning.", canonical: "reasoning" },
  { name: "verbose", description: "Toggle verbose mode." },
  { name: "v", description: "Alias for /verbose.", canonical: "verbose" },
  { name: "elevated", description: "Toggle elevated mode." },
  { name: "elev", description: "Alias for /elevated.", canonical: "elevated" },
  { name: "new", description: "Start a new session." },
  { name: "reset", description: "Reset the current session." },
  { name: "exec", description: "Set exec defaults for this session." },
  { name: "compact", description: "Compact the session context." },
  { name: "whoami", description: "Show your sender id." },
  { name: "id", description: "Alias for /whoami.", canonical: "whoami" },
];

const GATE_TO_CONFIG_PATH: Record<CommandGate, string> = {
  config: "commands.config",
  debug: "commands.debug",
  bash: "commands.bash",
  restart: "commands.restart",
};

function readGateConfigValue(config: Record<string, unknown>, path: string): boolean | undefined {
  const parts = path.split(".");
  let current: unknown = config;
  for (const part of parts) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "boolean" ? current : undefined;
}

export function listOpenClawChatCommands(): OpenClawChatCommand[] {
  const { config } = readOpenClawConfigSync();
  const cfg = config ?? {};

  const commands = BASE_COMMANDS.map((cmd) => {
    const canonical = cmd.canonical ?? cmd.name;
    let disabled: boolean | undefined;
    if (cmd.gate) {
      const value = readGateConfigValue(cfg, GATE_TO_CONFIG_PATH[cmd.gate]);
      if (value === false) {
        disabled = true;
      }
    }
    return {
      name: cmd.name,
      description: cmd.description,
      canonical,
      ...(disabled ? { disabled } : {}),
    };
  });

  return commands.sort((a, b) => a.name.localeCompare(b.name));
}
