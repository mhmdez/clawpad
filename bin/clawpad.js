#!/usr/bin/env node

const { execSync, spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");
const net = require("net");
const readline = require("readline");
const WebSocket = require("ws"); // Added for Relay Tunnel

// ─── Constants ───────────────────────────────────────────
const DEFAULT_PORT = 3333;
const GATEWAY_DEFAULT_PORT = 18789;
const ROOT_DIR = path.resolve(__dirname, "..");
const RELAY_SERVER_URL = "wss://relay.clawpad.io"; // Default Production Relay
const LOCALHOST_PROBE_HOSTS = ["127.0.0.1", "::1"];
const FORCE_KILL_GRACE_MS = 1500;
const FORCE_KILL_VERIFY_MS = 4000;
const SHUTDOWN_GRACE_MS = 5000;
const PORT_RELEASE_TIMEOUT_MS = 4000;
const CRASH_RESTART_WINDOW_MS = 60_000;
const MAX_CRASH_RESTARTS = 3;
const CRASH_LOG_DIR = path.join(os.homedir(), ".clawpad", "logs");
const CRASH_LOG_PATH = path.join(CRASH_LOG_DIR, "launcher-crashes.log");
const QMD_INSTALL_SCRIPT_URL =
  "https://raw.githubusercontent.com/tobi/qmd/main/install.sh";

// ─── Arg Parsing ─────────────────────────────────────────
const args = process.argv.slice(2);

async function bootstrap() {
  // Handle Cloud Share Command
  if (args[0] === "share") {
    await startShare(args.slice(1));
    return;
  }

  // Normal launcher logic
  await runLauncher(args);
}

function normalizeListenHost(input) {
  const raw = String(input ?? "").trim();
  if (!raw) return "localhost";
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    try {
      const parsed = new URL(raw);
      return parsed.hostname || "localhost";
    } catch {
      return "localhost";
    }
  }
  return raw.replace(/^\[/, "").replace(/\]$/, "");
}

function isWildcardHost(host) {
  return host === "0.0.0.0" || host === "::";
}

function formatHostForUrl(host) {
  if (!host) return "localhost";
  if (host.includes(":") && !host.startsWith("[") && !host.endsWith("]")) {
    return `[${host}]`;
  }
  return host;
}

function getWindowsStateDirCandidates() {
  if (process.platform !== "win32") return [];
  const candidates = [
    process.env.APPDATA ? path.join(process.env.APPDATA, "OpenClaw") : null,
    process.env.APPDATA ? path.join(process.env.APPDATA, "openclaw") : null,
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "OpenClaw") : null,
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "openclaw") : null,
    path.join(os.homedir(), "AppData", "Roaming", "OpenClaw"),
    path.join(os.homedir(), "AppData", "Roaming", "openclaw"),
  ].filter(Boolean);
  return [...new Set(candidates.map((candidate) => path.resolve(candidate)))];
}

function getPrimaryLanIpv4() {
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    if (!Array.isArray(entries)) continue;
    for (const info of entries) {
      if (!info) continue;
      if (info.family !== "IPv4") continue;
      if (info.internal) continue;
      if (info.address.startsWith("169.254.")) continue;
      return info.address;
    }
  }
  return null;
}

function normalizeToken(raw) {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed || undefined;
}

function normalizeScopes(raw) {
  const scopes = new Set();
  const parts = [];
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
    const normalized = String(part || "").trim().toLowerCase();
    if (normalized) scopes.add(normalized);
  }
  return scopes;
}

function scoreScopes(scopes) {
  if (scopes.has("operator.admin")) return 100;
  if (scopes.has("operator.write")) return 90;
  if (scopes.has("operator.read")) return 20;
  return 10;
}

function extractTokenFromEntry(entry) {
  if (typeof entry === "string") {
    return normalizeToken(entry);
  }
  if (!entry || typeof entry !== "object") {
    return undefined;
  }
  if (entry.enabled === false) {
    return undefined;
  }
  return normalizeToken(
    entry.token ??
      entry.value ??
      entry.accessToken ??
      entry.access_token ??
      entry.bearer ??
      entry.secret,
  );
}

function selectGatewayAuthToken(auth) {
  if (!auth || typeof auth !== "object") return undefined;

  const candidates = [];
  const directToken = normalizeToken(auth.token);
  if (directToken) {
    const directScopes = normalizeScopes(auth.scopes ?? auth.scope);
    candidates.push({
      token: directToken,
      score: directScopes.size > 0 ? scoreScopes(directScopes) + 30 : 50,
      priority: 0,
    });
  }

  const tokenEntries = Array.isArray(auth.tokens) ? auth.tokens : [];
  for (let index = 0; index < tokenEntries.length; index += 1) {
    const entry = tokenEntries[index];
    const token = extractTokenFromEntry(entry);
    if (!token) continue;
    const entryScopes =
      entry && typeof entry === "object"
        ? normalizeScopes(entry.scopes ?? entry.scope)
        : new Set();
    candidates.push({
      token,
      score: entryScopes.size > 0 ? scoreScopes(entryScopes) : 25,
      priority: index + 1,
    });
  }

  if (candidates.length === 0) return undefined;
  candidates.sort((a, b) => b.score - a.score || a.priority - b.priority);
  return candidates[0].token;
}

// ─── Cloud Share Logic ──────────────────────────────────
async function startShare(shareArgs) {
  console.log(`
  ┌─────────────────────────────────────┐
  │         ClawPad Cloud Share         │
  └─────────────────────────────────────┘
  `);

  const gateway = await detectGateway();
  if (!gateway) {
    console.error("  ❌ No OpenClaw Gateway detected. Is it running?");
    process.exit(1);
  }
  console.log(`  🔗 Local Gateway: ${gateway.url}`);

  const tokenArg = shareArgs.find(arg => arg.startsWith("--token="));
  const token = tokenArg ? tokenArg.split("=")[1] : process.env.CLAWPAD_RELAY_TOKEN;

  if (!token) {
    console.error("  ❌ No Relay Token provided.");
    console.error("     Use --token=<your_token> or set CLAWPAD_RELAY_TOKEN env var.");
    console.error("     Get your token at https://app.clawpad.io/settings");
    process.exit(1);
  }

  const relayUrl = process.env.CLAWPAD_RELAY_URL || RELAY_SERVER_URL;
  connectRelay(relayUrl, token, gateway.url);
}

function connectRelay(relayUrl, token, gatewayWsUrl) {
  console.log(`  ☁️  Connecting to Relay: ${relayUrl}...`);

  const tunnelUrl = `${relayUrl}?type=agent&token=${token}`;
  const ws = new WebSocket(tunnelUrl);
  let gatewayWs = null;
  let reconnectTimer = null;

  const cleanup = () => {
    if (gatewayWs) {
      gatewayWs.terminate();
      gatewayWs = null;
    }
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  ws.on("open", () => {
    console.log("  ✅ Connected to Cloud Relay.");
    console.log("     Your agent is now accessible via app.clawpad.io");
    
    // Connect to Local Gateway
    gatewayWs = new WebSocket(gatewayWsUrl);
    
    gatewayWs.on("open", () => {
      console.log("  🔗 Connected to Local Gateway.");
    });

    gatewayWs.on("message", (data) => {
      // Forward Gateway -> Relay
      // SECURITY: Here we could inspect 'data' if needed, but it's encrypted JSON-RPC usually.
      // We rely on 'tools.allow' policy for security.
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    gatewayWs.on("error", (err) => {
      console.error("  ⚠️ Local Gateway Error:", err.message);
    });

    gatewayWs.on("close", () => {
      console.log("  ⚠️ Local Gateway Disconnected. Reconnecting in 5s...");
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
           // Re-establish local connection logic could go here or just let it fail until next message
           // Ideally we close the tunnel or try to reconnect local
           ws.close(); // Force full reconnect cycle
        }
      }, 5000);
    });
  });

  ws.on("message", (data) => {
    // Forward Relay -> Gateway
    // SECURITY: Intercept dangerous calls here if we parse JSON-RPC
    if (gatewayWs && gatewayWs.readyState === WebSocket.OPEN) {
      gatewayWs.send(data);
    }
  });

  ws.on("error", (err) => {
    console.error("  ❌ Relay Connection Error:", err.message);
  });

  ws.on("close", () => {
    console.log("  ❌ Disconnected from Relay. Reconnecting in 5s...");
    cleanup();
    reconnectTimer = setTimeout(() => connectRelay(relayUrl, token, gatewayWsUrl), 5000);
  });
}

// ─── Normal Launcher Logic ──────────────────────────────
async function runLauncher(args) {

  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  const portIdx = Math.max(args.indexOf("-p"), args.indexOf("--port"));
  let port =
    portIdx !== -1 && args[portIdx + 1]
      ? parseInt(args[portIdx + 1], 10)
      : parseInt(process.env.PORT || String(DEFAULT_PORT), 10);
  const portExplicit = portIdx !== -1 || Boolean(process.env.PORT);
  const hostIdx = Math.max(args.indexOf("-H"), args.indexOf("--host"));
  const listenHost =
    hostIdx !== -1 && args[hostIdx + 1]
      ? normalizeListenHost(args[hostIdx + 1])
      : normalizeListenHost(process.env.CLAWPAD_HOST || "localhost");

  const shouldOpen = !args.includes("--no-open");
  const shouldSetup = args.includes("--setup");
  const shouldIntegrate = !args.includes("--no-integrate");
  const autoYes = args.includes("--yes");
  const noPrompt = args.includes("--no-prompt");
  const forcePort = args.includes("--force");
  const migrateArg = args.find((arg) => arg === "--migrate" || arg.startsWith("--migrate="));
  let migrateMode = null;
  if (migrateArg) {
    if (migrateArg.includes("=")) {
      migrateMode = migrateArg.split("=")[1] || "move";
    } else {
      const idx = args.indexOf("--migrate");
      const next = idx !== -1 ? args[idx + 1] : null;
      migrateMode = next && !next.startsWith("-") ? next : "move";
    }
  }

  const pagesDirIdx = args.indexOf("--pages-dir");
  if (pagesDirIdx !== -1 && args[pagesDirIdx + 1]) {
    process.env.CLAWPAD_PAGES_DIR = args[pagesDirIdx + 1];
  }
  const hasExplicitPagesDir = Boolean(process.env.CLAWPAD_PAGES_DIR);

  await main(
    port,
    portExplicit,
    shouldOpen,
    shouldSetup,
    shouldIntegrate,
    autoYes,
    noPrompt,
    forcePort,
    migrateMode,
    hasExplicitPagesDir,
    listenHost,
  );
}

// ─── Help ────────────────────────────────────────────────
function printHelp() {
  console.log(`
  ClawPad — The workspace for OpenClaw

  Usage:
    clawpad [command] [options]

  Commands:
    start (default)     Start the local workspace UI
    share               Connect this agent to ClawPad Cloud

  Options (start):
    -p, --port <port>   Port to listen on (default: ${DEFAULT_PORT})
    -H, --host <host>   Host/interface to bind (default: localhost)
    --no-open           Don't auto-open the browser
    --pages-dir <dir>   Override docs directory (default: auto)
    --setup             Open setup onboarding flow on launch
    --yes               Auto-approve integration steps
    --force             Kill any process using the selected port
    -h, --help          Show this help message

  Options (share):
    --token <token>     Relay token from app.clawpad.io

  Examples:
    clawpad                 Start on port ${DEFAULT_PORT}
    clawpad -p 4000         Start on port 4000
    clawpad --host 0.0.0.0  Allow LAN access from other devices
    clawpad --no-open       Start without opening browser
    clawpad --setup         Start and open setup onboarding
    clawpad --yes           Auto-integrate with OpenClaw if detected
    clawpad share --token=abc  Connect to cloud
`);
}

// ─── Banner ──────────────────────────────────────────────
function printBanner() {
  console.log(`
  ┌─────────────────────────────────────┐
  │                                     │
  │      ╔═╗┬  ┌─┐┬ ┬╔═╗┌─┐┌┬┐       │
  │      ║  │  ├─┤│││╠═╝├─┤ ││        │
  │      ╚═╝┴─┘┴ ┴└┴┘╩  ┴ ┴─┴┘       │
  │                                     │
  │      The workspace for OpenClaw     │
  │                                     │
  └─────────────────────────────────────┘
  `);
}

// ─── Gateway Detection ──────────────────────────────────
async function detectGateway() {
  // 1. Environment variables
  if (process.env.OPENCLAW_GATEWAY_URL) {
    return {
      url: process.env.OPENCLAW_GATEWAY_URL,
      token: normalizeToken(process.env.OPENCLAW_GATEWAY_TOKEN),
      source: "env",
    };
  }

  // 2. Config files
  const explicitConfig = process.env.OPENCLAW_CONFIG_PATH || process.env.CLAWDBOT_CONFIG_PATH;
  const stateDir = process.env.OPENCLAW_STATE_DIR || process.env.CLAWDBOT_STATE_DIR;

  const configPaths = [
    explicitConfig ? resolveUserPath(explicitConfig) : null,
    stateDir ? path.join(resolveUserPath(stateDir), "openclaw.json") : null,
    stateDir ? path.join(resolveUserPath(stateDir), "clawdbot.json") : null,
    ...getWindowsStateDirCandidates().flatMap((dir) => [
      path.join(dir, "openclaw.json"),
      path.join(dir, "clawdbot.json"),
    ]),
    path.join(os.homedir(), ".openclaw", "openclaw.json"),
    path.join(os.homedir(), ".clawdbot", "clawdbot.json"),
  ].filter(Boolean);

  for (const configPath of configPaths) {
    try {
      if (fs.existsSync(configPath)) {
        const config = parseConfigRaw(fs.readFileSync(configPath, "utf-8"));
        const gwPort = config.gateway?.port || GATEWAY_DEFAULT_PORT;
        const host = normalizeHost(config.gateway?.bind ?? config.gateway?.host ?? config.host ?? "127.0.0.1");
        return {
          url: `ws://${host}:${gwPort}`,
          token: selectGatewayAuthToken(config.gateway?.auth),
          source: path.basename(configPath),
        };
      }
    } catch {
      // ignore parse errors
    }
  }

  // 3. Probe default port
  const isOpen = await isPortInUse(GATEWAY_DEFAULT_PORT);
  if (isOpen) {
    return {
      url: `ws://127.0.0.1:${GATEWAY_DEFAULT_PORT}`,
      source: "probe",
    };
  }

  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function appendCrashLog(lines) {
  try {
    if (!fs.existsSync(CRASH_LOG_DIR)) {
      fs.mkdirSync(CRASH_LOG_DIR, { recursive: true });
    }
    const payload = `${lines.join("\n")}\n\n`;
    fs.appendFileSync(CRASH_LOG_PATH, payload, "utf-8");
  } catch {
    // best effort
  }
}

function safeCommandOutput(cmd) {
  try {
    return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "(unavailable)";
  }
}

function collectKillHints() {
  const hints = [];

  if (process.platform === "darwin") {
    hints.push("macOS log hints (last 2m):");
    hints.push(
      safeCommandOutput(
        `log show --style compact --last 2m --predicate '(eventMessage CONTAINS[c] "kill" OR eventMessage CONTAINS[c] "killed") AND (eventMessage CONTAINS[c] "node" OR eventMessage CONTAINS[c] "clawpad")' | tail -n 30`,
      ),
    );
    return hints;
  }

  if (process.platform === "linux") {
    hints.push("kernel hints:");
    hints.push(safeCommandOutput("dmesg | tail -n 30"));
    return hints;
  }

  return hints;
}

function recordCrashDiagnostics({ signal, code, childPid, runningPort, startAt }) {
  const now = Date.now();
  const reason = signal ? `signal ${signal}` : `exit code ${code}`;
  const lines = [
    `[${new Date(now).toISOString()}] ClawPad child terminated unexpectedly`,
    `reason=${reason}`,
    `launcherPid=${process.pid}`,
    `launcherPpid=${process.ppid}`,
    `childPid=${childPid ?? "unknown"}`,
    `port=${runningPort}`,
    `childUptimeMs=${Math.max(0, now - startAt)}`,
    `platform=${process.platform}`,
    `node=${process.version}`,
    `cwd=${process.cwd()}`,
  ];

  if (childPid) {
    lines.push("process table snapshot:");
    if (process.platform === "win32") {
      lines.push(safeCommandOutput(`tasklist /FI "PID eq ${childPid}"`));
    } else {
      lines.push(safeCommandOutput(`ps -o pid,ppid,pgid,stat,etime,command -p ${childPid}`));
    }
  }

  if (signal === "SIGKILL") {
    lines.push("note=SIGKILL cannot be trapped by target process; source is external");
    lines.push(...collectKillHints());
  }

  appendCrashLog(lines);
}

function checkPort(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1000);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => {
      resolve(false);
    });
    socket.connect(port, host);
  });
}

async function isPortInUse(port) {
  const checks = await Promise.all(
    LOCALHOST_PROBE_HOSTS.map((host) => checkPort(port, host)),
  );
  return checks.some(Boolean);
}

async function findAvailablePort(start, maxAttempts = 20) {
  for (let i = 0; i < maxAttempts; i += 1) {
    const candidate = start + i;
    if (!(await isPortInUse(candidate))) {
      return candidate;
    }
  }
  return null;
}

function listListeningPids(port) {
  try {
    if (process.platform === "win32") {
      const output = execSync(`netstat -ano -p tcp | findstr /R /C:":${port} .*LISTENING"`, {
        stdio: ["ignore", "pipe", "ignore"],
      })
        .toString()
        .trim();
      if (!output) return [];
      const pids = output
        .split(/\r?\n/)
        .map((line) => line.trim().split(/\s+/).pop() || "")
        .filter(Boolean);
      return [...new Set(pids)];
    }
    const output = execSync(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t`, {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    if (!output) return [];
    const pids = output
      .split(/\s+/)
      .map((pid) => pid.trim())
      .filter(Boolean);
    return [...new Set(pids)];
  } catch {
    return [];
  }
}

async function waitForPortRelease(port, timeoutMs = PORT_RELEASE_TIMEOUT_MS) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!(await isPortInUse(port))) {
      return true;
    }
    await sleep(200);
  }
  return !(await isPortInUse(port));
}

async function killPortListeners(port) {
  const pids = listListeningPids(port);
  if (pids.length === 0) {
    return { killedAny: false, verifiedFree: !(await isPortInUse(port)) };
  }

  if (process.platform === "win32") {
    let killedAny = false;
    for (const pid of pids) {
      try {
        execSync(`taskkill /PID ${pid} /T /F`, { stdio: ["ignore", "ignore", "ignore"] });
        killedAny = true;
      } catch {
        // ignore and continue
      }
    }
    const verifiedFree = await waitForPortRelease(port, FORCE_KILL_VERIFY_MS);
    return { killedAny, verifiedFree };
  }

  for (const pid of pids) {
    try {
      process.kill(Number(pid), "SIGTERM");
    } catch {
      // ignore
    }
  }

  const earlyRelease = await waitForPortRelease(port, FORCE_KILL_GRACE_MS);
  if (earlyRelease) {
    return { killedAny: true, verifiedFree: true };
  }

  for (const pid of pids) {
    try {
      process.kill(Number(pid), "SIGKILL");
    } catch {
      // ignore
    }
  }

  const verifiedFree = await waitForPortRelease(port, FORCE_KILL_VERIFY_MS);
  return { killedAny: true, verifiedFree };
}

function readProcessCommand(pid) {
  try {
    return execSync(`ps -o command= -p ${pid}`, {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return "";
  }
}

function readProcessInfo(pid) {
  if (process.platform === "win32") {
    return null;
  }

  try {
    const output = execSync(`ps -o ppid=,command= -p ${pid}`, {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();

    if (!output) return null;
    const match = output.match(/^(\d+)\s+([\s\S]+)$/);
    if (!match) return null;

    const ppid = Number(match[1]);
    const command = match[2].trim();
    const parentCommand = Number.isFinite(ppid) && ppid > 0 ? readProcessCommand(ppid) : "";

    return {
      pid: Number(pid),
      ppid,
      command,
      parentCommand,
    };
  } catch {
    return null;
  }
}

function isLikelyClawpadListener(info) {
  if (!info) return false;
  const command = String(info.command || "").toLowerCase();
  const parentCommand = String(info.parentCommand || "").toLowerCase();

  if (command.includes("clawpad") || parentCommand.includes("clawpad")) {
    return true;
  }

  if (
    command.includes(".next/standalone/server.js") &&
    (parentCommand.includes("clawpad") || command.includes("node_modules/clawpad"))
  ) {
    return true;
  }

  if (command.includes("next-server") && parentCommand.includes("clawpad")) {
    return true;
  }

  return false;
}

async function maybeReplaceExistingClawpadListener(port) {
  if (process.env.CLAWPAD_DISABLE_AUTO_PORT_REPLACE === "1") {
    return { attempted: false, reason: "disabled" };
  }

  if (process.platform === "win32") {
    return { attempted: false, reason: "unsupported-platform" };
  }

  const pids = listListeningPids(port);
  if (pids.length === 0) {
    return { attempted: false, reason: "no-listener" };
  }

  const infos = pids.map((pid) => readProcessInfo(pid)).filter(Boolean);
  if (infos.length === 0) {
    return { attempted: false, reason: "no-process-info" };
  }

  const allClawpad = infos.every((info) => isLikelyClawpadListener(info));
  if (!allClawpad) {
    return { attempted: false, reason: "non-clawpad-listener" };
  }

  const kill = await killPortListeners(port);
  return {
    attempted: true,
    infos,
    ...kill,
  };
}

function resolveUserPath(input) {
  if (!input || !input.trim()) return input;
  if (input.startsWith("~")) {
    return path.resolve(input.replace(/^~(?=$|[\\/])/, os.homedir()));
  }
  return path.resolve(input);
}

function normalizeHost(host) {
  const hostMap = {
    loopback: "127.0.0.1",
    localhost: "127.0.0.1",
    "0.0.0.0": "127.0.0.1",
    "::": "127.0.0.1",
    "::1": "127.0.0.1",
  };
  return hostMap[host] || host;
}

function loadOptionalJson5() {
  try {
    // Avoid static resolution in bundlers
    const req = eval("require");
    const mod = req("json5");
    if (mod && typeof mod.parse === "function") {
      return mod;
    }
  } catch {
    // optional
  }
  return null;
}

function stripComments(input) {
  let out = "";
  let inString = false;
  let stringChar = "";
  let inLineComment = false;
  let inBlockComment = false;
  let escaped = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    const next = input[i + 1];

    if (inLineComment) {
      if (ch === "\n") {
        inLineComment = false;
        out += ch;
      }
      continue;
    }

    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i += 1;
      }
      continue;
    }

    if (inString) {
      out += ch;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === stringChar) {
        inString = false;
        stringChar = "";
      }
      continue;
    }

    if (ch === "\"" || ch === "'") {
      inString = true;
      stringChar = ch;
      out += ch;
      continue;
    }

    if (ch === "/" && next === "/") {
      inLineComment = true;
      i += 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlockComment = true;
      i += 1;
      continue;
    }

    out += ch;
  }

  return out;
}

function stripTrailingCommas(input) {
  let out = "";
  let inString = false;
  let stringChar = "";
  let escaped = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];

    if (inString) {
      out += ch;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === stringChar) {
        inString = false;
        stringChar = "";
      }
      continue;
    }

    if (ch === "\"" || ch === "'") {
      inString = true;
      stringChar = ch;
      out += ch;
      continue;
    }

    if (ch === ",") {
      let j = i + 1;
      while (j < input.length && /\s/.test(input[j])) {
        j += 1;
      }
      const next = input[j];
      if (next === "}" || next === "]") {
        continue;
      }
    }

    out += ch;
  }

  return out;
}

function parseConfigRaw(raw) {
  const json5 = loadOptionalJson5();
  if (json5) {
    try {
      return json5.parse(raw);
    } catch {
      // fall through
    }
  }
  try {
    return JSON.parse(raw);
  } catch {
    // fall through
  }
  const sanitized = stripTrailingCommas(stripComments(raw));
  return JSON.parse(sanitized);
}

function stringifyConfig(config) {
  const json5 = loadOptionalJson5();
  if (json5 && typeof json5.stringify === "function") {
    try {
      return json5.stringify(config, null, 2);
    } catch {
      // fall through
    }
  }
  return JSON.stringify(config, null, 2);
}

function resolveOpenClawStateDir() {
  const override = process.env.OPENCLAW_STATE_DIR || process.env.CLAWDBOT_STATE_DIR;
  if (override && override.trim()) {
    return resolveUserPath(override);
  }
  const windowsCandidate = getWindowsStateDirCandidates().find((candidate) =>
    fs.existsSync(candidate),
  );
  if (windowsCandidate) {
    return windowsCandidate;
  }
  return path.join(os.homedir(), ".openclaw");
}

function resolveOpenClawConfigPath() {
  const override = process.env.OPENCLAW_CONFIG_PATH || process.env.CLAWDBOT_CONFIG_PATH;
  if (override && override.trim()) {
    return resolveUserPath(override);
  }
  return path.join(resolveOpenClawStateDir(), "openclaw.json");
}

function findOpenClawConfigPath() {
  const explicit = process.env.OPENCLAW_CONFIG_PATH || process.env.CLAWDBOT_CONFIG_PATH;
  if (explicit && explicit.trim()) {
    const resolved = resolveUserPath(explicit);
    return fs.existsSync(resolved) ? resolved : null;
  }
  const stateDir = resolveOpenClawStateDir();
  const windowsStateDirs = getWindowsStateDirCandidates();
  const candidates = [
    path.join(stateDir, "openclaw.json"),
    path.join(stateDir, "clawdbot.json"),
    ...windowsStateDirs.flatMap((dir) => [
      path.join(dir, "openclaw.json"),
      path.join(dir, "clawdbot.json"),
    ]),
    path.join(os.homedir(), ".openclaw", "openclaw.json"),
    path.join(os.homedir(), ".clawdbot", "clawdbot.json"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function loadOpenClawConfig() {
  const configPath = findOpenClawConfigPath() || resolveOpenClawConfigPath();
  if (!fs.existsSync(configPath)) {
    return { configPath, config: {} };
  }
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    const config = parseConfigRaw(raw);
    if (config && typeof config === "object") {
      return { configPath, config };
    }
  } catch {
    // ignore parse errors
  }
  return { configPath, config: {} };
}

function writeOpenClawConfig(configPath, config) {
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const serialized = stringifyConfig(config);
  fs.writeFileSync(configPath, `${serialized}\n`, "utf-8");
}

function resolveClawpadPagesDir(config) {
  const explicit = process.env.CLAWPAD_PAGES_DIR;
  if (explicit && explicit.trim()) {
    return resolveUserPath(explicit);
  }

  const pluginDir =
    config?.plugins?.entries?.["openclaw-plugin"]?.config?.pagesDir ||
    config?.plugins?.entries?.["openclaw-plugin"]?.config?.pages_dir;
  if (typeof pluginDir === "string" && pluginDir.trim()) {
    return resolveUserPath(pluginDir);
  }

  const legacyDir = path.join(resolveOpenClawStateDir(), "pages");
  if (fs.existsSync(legacyDir)) {
    return legacyDir;
  }

  const workspace = config?.agents?.defaults?.workspace;
  if (typeof workspace === "string" && workspace.trim()) {
    return path.join(resolveUserPath(workspace), "pages");
  }

  return legacyDir;
}

function isPluginInstalled(config) {
  if (!config || typeof config !== "object") return false;
  const entries = config.plugins?.entries || {};
  const installs = config.plugins?.installs || {};
  return Boolean(entries["openclaw-plugin"] || installs["openclaw-plugin"]);
}

function ensureAgentsNote(workspaceDir, pagesDir) {
  if (!workspaceDir) return false;
  const agentsPath = path.join(workspaceDir, "AGENTS.md");
  if (!fs.existsSync(agentsPath)) return false;
  const existing = fs.readFileSync(agentsPath, "utf-8");
  if (existing.includes("<!-- clawpad:begin -->")) {
    return false;
  }
  const block = [
    "",
    "<!-- clawpad:begin -->",
    "## ClawPad Docs",
    `ClawPad documents live at: ${pagesDir}`,
    "Use this path for plans, notes, and shared documents.",
    "When asked to write docs, create or update markdown files under this path.",
    "<!-- clawpad:end -->",
    "",
  ].join("\n");
  fs.writeFileSync(agentsPath, `${existing.trimEnd()}\n${block}`, "utf-8");
  return true;
}

function promptYesNo(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      const normalized = String(answer || "").trim().toLowerCase();
      resolve(normalized === "y" || normalized === "yes");
    });
  });
}

function hasOpenClawBinary() {
  try {
    execSync("openclaw --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function detectQmdBinary() {
  try {
    const qmdPath = execSync("command -v qmd", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    if (qmdPath) return qmdPath;
  } catch {
    // ignore
  }

  if (process.platform === "darwin") {
    const candidate = "/opt/homebrew/bin/qmd";
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
}

function ensureQmdInstalled() {
  if (process.env.CLAWPAD_SKIP_QMD === "1") {
    console.log("  ↩︎ Skipping QMD install (CLAWPAD_SKIP_QMD=1).");
    return { installed: false, path: detectQmdBinary() };
  }

  const existing = detectQmdBinary();
  if (existing) {
    return { installed: true, path: existing };
  }

  if (process.platform === "darwin") {
    try {
      execSync("brew --version", { stdio: "ignore" });
      console.log("  ⏳ Installing QMD with Homebrew...");
      execSync("brew install qmd", { stdio: "inherit" });
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      console.warn(`  ⚠️  QMD Homebrew install failed: ${message}`);
    }
  } else if (process.platform === "linux") {
    try {
      console.log("  ⏳ Installing QMD from upstream installer...");
      execSync(`curl -fsSL ${QMD_INSTALL_SCRIPT_URL} | bash`, { stdio: "inherit" });
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      console.warn(`  ⚠️  QMD installer failed: ${message}`);
    }
  } else {
    console.log(`  ↩︎ QMD auto-install not supported on ${process.platform}.`);
  }

  const afterInstall = detectQmdBinary();
  if (afterInstall) {
    return { installed: true, path: afterInstall };
  }
  return { installed: false, path: null };
}

function getOnboardingSentinelPath() {
  return path.join(resolveOpenClawStateDir(), "clawpad", "onboarding-complete.json");
}

function hasCompletedOnboarding() {
  return fs.existsSync(getOnboardingSentinelPath());
}

function resolveWorkspaceDir(config) {
  const workspace = config?.agents?.defaults?.workspace;
  if (typeof workspace === "string" && workspace.trim()) {
    return resolveUserPath(workspace);
  }
  return path.join(resolveOpenClawStateDir(), "workspace");
}

function resolveWorkspacePagesDir(config) {
  const workspaceDir = resolveWorkspaceDir(config);
  return path.join(workspaceDir, "pages");
}

function isDirEmpty(dir) {
  try {
    const entries = fs.readdirSync(dir);
    return entries.length === 0;
  } catch {
    return true;
  }
}

function copyDir(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(from, to);
      continue;
    }
    if (entry.isFile()) {
      if (fs.existsSync(to)) {
        continue;
      }
      fs.copyFileSync(from, to);
    }
  }
}

function ensureBundledSkillInstalled(workspaceDir, skillName) {
  if (!workspaceDir || !skillName) {
    return { installed: false, reason: "invalid-input" };
  }

  const bundledSkillPath = path.join(ROOT_DIR, "skills", skillName);
  if (!fs.existsSync(bundledSkillPath)) {
    return { installed: false, reason: "missing-bundled-skill" };
  }

  const skillsDir = path.join(workspaceDir, "skills");
  const targetSkillPath = path.join(skillsDir, skillName);

  if (fs.existsSync(targetSkillPath)) {
    return { installed: false, reason: "already-installed" };
  }

  try {
    fs.mkdirSync(skillsDir, { recursive: true });
    copyDir(bundledSkillPath, targetSkillPath);
    return { installed: true, reason: "installed" };
  } catch (err) {
    return { installed: false, reason: (err && err.message) || "copy-failed" };
  }
}

function migrateLegacyPages(fromDir, toDir, mode) {
  if (!fs.existsSync(fromDir)) {
    return { ok: false, reason: "missing" };
  }
  const resolvedFrom = path.resolve(fromDir);
  const resolvedTo = path.resolve(toDir);
  if (resolvedFrom === resolvedTo) {
    return { ok: false, reason: "same" };
  }

  if (mode === "move" && !fs.existsSync(resolvedTo)) {
    const parent = path.dirname(resolvedTo);
    if (!fs.existsSync(parent)) {
      fs.mkdirSync(parent, { recursive: true });
    }
    try {
      fs.renameSync(resolvedFrom, resolvedTo);
      return { ok: true, mode: "move" };
    } catch {
      // fall back to copy
    }
  }

  copyDir(resolvedFrom, resolvedTo);

  if (mode === "move") {
    const backup = `${resolvedFrom}.backup-${Date.now()}`;
    try {
      fs.renameSync(resolvedFrom, backup);
      return { ok: true, mode: "move", backup };
    } catch {
      return { ok: true, mode: "copy" };
    }
  }

  return { ok: true, mode: "copy" };
}

async function maybeMigrateLegacyPages(config, resolvedPagesDir, options = {}) {
  const {
    hasExplicitPagesDir = false,
    migrateMode = null,
    autoYes = false,
    noPrompt = false,
  } = options;

  if (hasExplicitPagesDir) {
    return { pagesDir: resolvedPagesDir, migrated: false };
  }
  const legacyDir = path.join(resolveOpenClawStateDir(), "pages");
  if (!fs.existsSync(legacyDir)) {
    return { pagesDir: resolvedPagesDir, migrated: false };
  }
  const targetDir = resolvedPagesDir;
  const resolvedLegacy = path.resolve(legacyDir);
  const resolvedTarget = path.resolve(targetDir);
  if (resolvedLegacy === resolvedTarget) {
    return { pagesDir: resolvedPagesDir, migrated: false };
  }

  let mode = migrateMode;
  if (!mode) {
    if (autoYes) {
      mode = "move";
    } else if (noPrompt) {
      return { pagesDir: legacyDir, migrated: false };
    } else {
      const answer = await promptYesNo(
        `Legacy docs found at ${legacyDir}. Move to ${targetDir}? [y/N] `,
      );
      mode = answer ? "move" : "skip";
    }
  }

  if (mode === "skip") {
    return { pagesDir: legacyDir, migrated: false };
  }

  const migrated = migrateLegacyPages(legacyDir, targetDir, mode === "copy" ? "copy" : "move");
  return { pagesDir: targetDir, migrated: migrated.ok };
}

function applyIntegrationConfig(config, pagesDir, qmdPath) {
  const next = config && typeof config === "object" ? config : {};
  next.plugins = next.plugins || {};
  next.plugins.entries = next.plugins.entries || {};
  const entry = next.plugins.entries["openclaw-plugin"] || {};
  next.plugins.entries["openclaw-plugin"] = {
    ...entry,
    enabled: true,
    config: {
      ...(entry.config || {}),
      pagesDir,
    },
  };

  next.agents = next.agents || {};
  next.agents.defaults = next.agents.defaults || {};

  // OpenClaw 2026+ no longer recognizes agents.defaults.memory.
  // Only write this legacy key when explicitly forced.
  const hasLegacyMemoryKey =
    next.agents.defaults.memory &&
    typeof next.agents.defaults.memory === "object";
  const shouldWriteLegacyMemory =
    process.env.CLAWPAD_FORCE_LEGACY_MEMORY === "1";

  if (shouldWriteLegacyMemory) {
    const memory = next.agents.defaults.memory || {};
    const memoryQmd = memory.qmd || {};
    next.agents.defaults.memory = {
      ...memory,
      backend: "qmd",
      qmd: {
        ...memoryQmd,
        ...(qmdPath ? { bin: qmdPath } : {}),
      },
    };
  } else if (hasLegacyMemoryKey) {
    // If a prior ClawPad version wrote this legacy key but it's not forced now,
    // remove it to avoid OpenClaw config validation errors on modern versions.
    delete next.agents.defaults.memory;
  }

  const memorySearch = next.agents.defaults.memorySearch || {};
  const extraPaths = Array.isArray(memorySearch.extraPaths) ? [...memorySearch.extraPaths] : [];
  if (!extraPaths.includes(pagesDir)) {
    extraPaths.push(pagesDir);
  }
  next.agents.defaults.memorySearch = {
    ...memorySearch,
    extraPaths,
  };

  return next;
}

function needsIntegrationPatch(config, pagesDir, qmdPath) {
  const entry = config?.plugins?.entries?.["openclaw-plugin"];
  const configuredPages =
    entry?.config?.pagesDir || entry?.config?.pages_dir;
  const pluginEnabled = entry?.enabled === true;
  const extraPaths = config?.agents?.defaults?.memorySearch?.extraPaths;
  const hasExtraPath = Array.isArray(extraPaths) && extraPaths.includes(pagesDir);
  const hasLegacyMemoryKey = Boolean(
    config?.agents?.defaults?.memory &&
      typeof config.agents.defaults.memory === "object",
  );
  const forceLegacyMemory = process.env.CLAWPAD_FORCE_LEGACY_MEMORY === "1";

  const memoryBackend = config?.agents?.defaults?.memory?.backend;
  const configuredQmdBin = config?.agents?.defaults?.memory?.qmd?.bin;
  const qmdConfigured = memoryBackend === "qmd" && (!qmdPath || configuredQmdBin === qmdPath);

  const memoryReady = forceLegacyMemory ? qmdConfigured : true;
  const memoryCleanupNeeded = hasLegacyMemoryKey && !forceLegacyMemory;

  return !(pluginEnabled && configuredPages === pagesDir && hasExtraPath && memoryReady && !memoryCleanupNeeded);
}

async function integrateWithOpenClaw(pagesDir, qmdPath, options = {}) {
  const {
    shouldIntegrate = true,
    noPrompt = false,
    autoYes = false,
  } = options;

  if (!shouldIntegrate) return;
  if (!hasOpenClawBinary()) return;

  const { configPath, config } = loadOpenClawConfig();
  const pluginInstalled = isPluginInstalled(config);
  const workspaceDir = resolveWorkspaceDir(config);
  const hasLegacyMemoryKey = Boolean(
    config?.agents?.defaults?.memory &&
      typeof config.agents.defaults.memory === "object",
  );

  // Always clean the deprecated memory key for modern OpenClaw installs.
  // This prevents "config invalid" states that can break gateway UX.
  if (hasLegacyMemoryKey && process.env.CLAWPAD_FORCE_LEGACY_MEMORY !== "1") {
    try {
      delete config.agents.defaults.memory;
      writeOpenClawConfig(configPath, config);
      console.log("  ✅ Removed deprecated OpenClaw key: agents.defaults.memory");
    } catch (err) {
      console.warn(`  ⚠️  Failed to clean deprecated OpenClaw memory key: ${err?.message || err}`);
    }
  }

  const workspaceManagerSkill = ensureBundledSkillInstalled(workspaceDir, "workspace-manager");
  if (workspaceManagerSkill.installed) {
    console.log("  ✅ Installed workspace-manager skill in OpenClaw workspace.");
  }

  const needsConfigPatch = needsIntegrationPatch(config, pagesDir, qmdPath);
  const needsAgentsNote = fs.existsSync(path.join(workspaceDir, "AGENTS.md"));

  if (!pluginInstalled && noPrompt && !autoYes) {
    return;
  }

  let proceed = autoYes;
  if (!proceed && !noPrompt) {
    proceed = await promptYesNo(
      "Install OpenClaw integration (plugin + docs linking)? [y/N] ",
    );
  }
  if (!proceed) return;

  if (!pluginInstalled) {
    try {
      execSync("openclaw plugins install @clawpad/openclaw-plugin", { stdio: "inherit" });
    } catch (err) {
      console.error("  ❌ Failed to install OpenClaw plugin:", err.message);
      return;
    }
  }

  if (needsConfigPatch) {
    const patched = applyIntegrationConfig(config, pagesDir, qmdPath);
    writeOpenClawConfig(configPath, patched);
  }

  if (needsAgentsNote) {
    ensureAgentsNote(workspaceDir, pagesDir);
  }

  console.log("  ✅ OpenClaw integration configured. Restart the gateway to apply.");
}

function isWorkspaceEmpty(pagesDir) {
  try {
    const entries = fs
      .readdirSync(pagesDir, { withFileTypes: true })
      .filter((entry) => !entry.name.startsWith("."));
    return entries.length === 0;
  } catch {
    return true;
  }
}

function ensureSetupSignal(pagesDir, options = {}) {
  const signalPath = path.join(pagesDir, ".clawpad-needs-setup");
  const force = options.force === true;

  try {
    fs.mkdirSync(pagesDir, { recursive: true });

    if (!force && fs.existsSync(signalPath)) {
      const shouldClear =
        hasCompletedOnboarding() ||
        !isWorkspaceEmpty(pagesDir);
      if (shouldClear) {
        try {
          fs.rmSync(signalPath, { force: true });
        } catch {
          // best effort
        }
      }
    }

    if (!force && hasCompletedOnboarding()) {
      return false;
    }

    if (!force && !isWorkspaceEmpty(pagesDir)) {
      return false;
    }

    const payload = {
      created: new Date().toISOString(),
      reason: force ? "cli-setup-flag" : "first-run-empty-workspace",
    };
    fs.writeFileSync(signalPath, JSON.stringify(payload, null, 2), "utf-8");
    return true;
  } catch {
    return false;
  }
}

// ─── Build Check ─────────────────────────────────────────
function isBuilt() {
  const standaloneServer = path.join(ROOT_DIR, ".next", "standalone", "server.js");
  const buildManifest = path.join(ROOT_DIR, ".next", "standalone", ".next", "build-manifest.json");
  return fs.existsSync(standaloneServer) && fs.existsSync(buildManifest);
}

function build() {
  console.log("  ⏳ Building ClawPad (first run)...\n");
  try {
    execSync("npm run build", {
      cwd: ROOT_DIR,
      stdio: "inherit",
      env: { ...process.env },
    });
    console.log("\n  ✅ Build complete!\n");
  } catch (err) {
    console.error("\n  ❌ Build failed. Check the errors above.");
    process.exit(1);
  }
}

// ─── Browser ─────────────────────────────────────────────
function openBrowser(url) {
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";
  try {
    execSync(`${cmd} ${url}`, { stdio: "ignore" });
  } catch {
    // silently fail — not critical
  }
}

// ─── Main ────────────────────────────────────────────────
async function main(
  port,
  portExplicit,
  shouldOpen,
  shouldSetup,
  shouldIntegrate,
  autoYes,
  noPrompt,
  forcePort,
  migrateMode,
  hasExplicitPagesDir,
  listenHost,
) {
  printBanner();

  if (!Number.isFinite(port) || port <= 0) {
    console.error(`  ❌ Invalid port: ${port}`);
    process.exit(1);
  }
  if (!listenHost) {
    console.error("  ❌ Invalid host.");
    process.exit(1);
  }

  if (await isPortInUse(port)) {
    if (!forcePort) {
      const replaceResult = await maybeReplaceExistingClawpadListener(port);
      if (replaceResult.attempted && replaceResult.killedAny && replaceResult.verifiedFree) {
        console.log(`  ♻️  Replaced existing ClawPad listener on port ${port}.`);
      } else if (replaceResult.attempted && replaceResult.killedAny && !replaceResult.verifiedFree) {
        console.error(`  ❌ Found an existing ClawPad listener on port ${port} but could not free it.`);
      }
    }

    if (forcePort && (await isPortInUse(port))) {
      const forceResult = await killPortListeners(port);
      if (forceResult.killedAny && forceResult.verifiedFree) {
        console.log(`  ✅ Cleared existing listeners on port ${port}.`);
      } else if (forceResult.killedAny && !forceResult.verifiedFree) {
        console.error(`  ❌ Failed to free port ${port} after force-kill.`);
      } else if (process.platform === "win32") {
        console.error(`  ❌ Port ${port} is in use but no killable listener was detected.`);
        console.error("     Try running clawpad in an elevated terminal or choose another port.");
      } else {
        console.error(`  ❌ Port ${port} is in use and no listener PID could be resolved.`);
      }
    }

    if (await isPortInUse(port)) {
      if (!portExplicit) {
        const nextPort = await findAvailablePort(port + 1, 20);
        if (nextPort) {
          console.log(`  ⚠️  Port ${port} is in use. Using ${nextPort} instead.`);
          port = nextPort;
        } else {
          console.error(`  ❌ Port ${port} is in use and no free ports were found.`);
          process.exit(1);
        }
      } else {
        console.error(`  ❌ Port ${port} is already in use.`);
        console.error(`     Try a different port with -p <port> or use --force to kill it.`);
        process.exit(1);
      }
    }
  }

  // Detect gateway
  const gateway = await detectGateway();
  if (gateway) {
    console.log(`  🔗 Gateway detected at ${gateway.url} (via ${gateway.source})`);
  } else {
    console.log("  ⚡ No OpenClaw gateway detected (standalone mode)");
  }
  console.log();

  const { config } = loadOpenClawConfig();
  let pagesDir = resolveClawpadPagesDir(config);
  const migration = await maybeMigrateLegacyPages(config, pagesDir, {
    hasExplicitPagesDir,
    migrateMode,
    autoYes,
    noPrompt,
  });
  pagesDir = migration.pagesDir;
  if (!process.env.CLAWPAD_PAGES_DIR && pagesDir) {
    process.env.CLAWPAD_PAGES_DIR = pagesDir;
  }
  const qmd = ensureQmdInstalled();
  if (qmd.installed && qmd.path) {
    console.log(`  ✅ QMD available at ${qmd.path}`);
  } else {
    console.log("  ⚠️  QMD unavailable. Semantic search and QMD memory backend may be limited.");
  }
  await integrateWithOpenClaw(pagesDir, qmd.path, {
    shouldIntegrate,
    noPrompt,
    autoYes,
  });
  const setupSignalCreated = ensureSetupSignal(pagesDir, { force: shouldSetup });
  if (setupSignalCreated) {
    console.log("  📝 Setup signal detected. ClawPad will open onboarding.");
  }

  // Build if needed
  if (!isBuilt()) {
    build();
  }

  // Copy static assets into standalone dir (Next.js standalone doesn't include these)
  const standaloneDir = path.join(ROOT_DIR, ".next", "standalone");
  const staticSrc = path.join(ROOT_DIR, ".next", "static");
  const staticDest = path.join(standaloneDir, ".next", "static");
  const publicSrc = path.join(ROOT_DIR, "public");
  const publicDest = path.join(standaloneDir, "public");

  if (!fs.existsSync(staticDest) && fs.existsSync(staticSrc)) {
    fs.cpSync(staticSrc, staticDest, { recursive: true });
  }
  if (!fs.existsSync(publicDest) && fs.existsSync(publicSrc)) {
    fs.cpSync(publicSrc, publicDest, { recursive: true });
  }

  const serverPath = path.join(standaloneDir, "server.js");
  let server = null;
  let shuttingDown = false;
  let openTimer = null;
  let forceShutdownTimer = null;
  let startupRetries = 0;
  const MAX_STARTUP_RETRIES = 2;

  const clearOpenTimer = () => {
    if (openTimer) {
      clearTimeout(openTimer);
      openTimer = null;
    }
  };

  let crashCount = 0;
  let crashWindowStartedAt = 0;

  const handleServerClose = async (code, signal, sawAddrInUse, runningPort) => {
    clearOpenTimer();

    if (shuttingDown) {
      await waitForPortRelease(runningPort, PORT_RELEASE_TIMEOUT_MS);
      process.exit(code ?? 0);
      return;
    }

    if (sawAddrInUse) {
      if (!portExplicit && startupRetries < MAX_STARTUP_RETRIES) {
        const nextPort = await findAvailablePort(runningPort + 1, 20);
        if (nextPort) {
          startupRetries += 1;
          console.log(`  ⚠️  Startup conflict on ${runningPort}. Retrying on ${nextPort}.`);
          launchServer(nextPort);
          return;
        }
      }

      if (portExplicit) {
        console.error(`  ❌ Port ${runningPort} is already in use.`);
        console.error(`     Try a different port with -p <port> or use --force to kill it.`);
      } else {
        console.error(`  ❌ Port ${runningPort} is still in use and no fallback port is available.`);
      }
      process.exit(1);
      return;
    }

    const isCrash = signal != null || (typeof code === "number" && code !== 0);
    if (isCrash) {
      const now = Date.now();
      if (!crashWindowStartedAt || now - crashWindowStartedAt > CRASH_RESTART_WINDOW_MS) {
        crashWindowStartedAt = now;
        crashCount = 0;
      }
      crashCount += 1;
      const reason = signal ? `signal ${signal}` : `exit code ${code}`;

      if (crashCount <= MAX_CRASH_RESTARTS) {
        console.error(`  ⚠️  ClawPad server terminated unexpectedly (${reason}). Restarting (${crashCount}/${MAX_CRASH_RESTARTS})...`);
        const restartDelayMs = Math.min(2_500, 500 * crashCount);
        await sleep(restartDelayMs);
        launchServer(runningPort);
        return;
      }

      console.error(`  ❌ ClawPad server crashed repeatedly (${reason}). Giving up after ${MAX_CRASH_RESTARTS} restarts in ${Math.round(CRASH_RESTART_WINDOW_MS / 1000)}s.`);
      process.exit(typeof code === "number" ? code : 1);
      return;
    }

    process.exit(0);
  };

  const launchServer = (nextPort) => {
    port = nextPort;
    const runningPort = nextPort;
    const setupPath = shouldSetup || setupSignalCreated ? "/setup" : "";
    const browserHost = isWildcardHost(listenHost) ? "localhost" : listenHost;
    const localUrl = `http://${formatHostForUrl(browserHost)}:${port}${setupPath}`;
    console.log(`  🚀 Starting ClawPad at ${localUrl}`);
    if (isWildcardHost(listenHost)) {
      const lanIp = getPrimaryLanIpv4();
      if (lanIp) {
        console.log(`  🌐 Network URL: http://${lanIp}:${port}${setupPath}`);
      } else {
        console.log("  🌐 Network URL unavailable (no LAN IPv4 detected)");
      }
    }
    console.log("");

    let sawAddrInUse = false;
    const childStartedAt = Date.now();
    server = spawn(process.execPath, [serverPath], {
      cwd: standaloneDir,
      stdio: ["inherit", "inherit", "pipe"],
      env: {
        ...process.env,
        PORT: String(port),
        HOSTNAME: listenHost,
      },
    });

    if (server.stderr) {
      server.stderr.on("data", (chunk) => {
        const text = chunk.toString();
        process.stderr.write(text);
        if (/EADDRINUSE|address already in use/i.test(text)) {
          sawAddrInUse = true;
        }
      });
    }

    if (shouldOpen) {
      clearOpenTimer();
      openTimer = setTimeout(() => openBrowser(localUrl), 2000);
    }

    server.on("error", (err) => {
      console.error("  ❌ Failed to start server:", err.message);
      process.exit(1);
    });

    server.on("close", (code, signal) => {
      if (forceShutdownTimer) {
        clearTimeout(forceShutdownTimer);
        forceShutdownTimer = null;
      }

      const terminatedUnexpectedly = !shuttingDown && (signal != null || (typeof code === "number" && code !== 0));
      if (terminatedUnexpectedly) {
        recordCrashDiagnostics({
          signal,
          code,
          childPid: server?.pid ?? null,
          runningPort,
          startAt: childStartedAt,
        });
        console.error(`  🧭 Crash diagnostics written to ${CRASH_LOG_PATH}`);
      }

      void handleServerClose(code, signal, sawAddrInUse, runningPort);
    });
  };

  const requestShutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    clearOpenTimer();

    if (!server) {
      process.exit(0);
      return;
    }

    try {
      server.kill(signal);
    } catch {
      // ignore
    }

    forceShutdownTimer = setTimeout(() => {
      try {
        server?.kill("SIGKILL");
      } catch {
        // ignore
      }
    }, SHUTDOWN_GRACE_MS);

    if (typeof forceShutdownTimer.unref === "function") {
      forceShutdownTimer.unref();
    }
  };

  launchServer(port);

  // Forward signals for clean shutdown
  process.on("SIGINT", () => requestShutdown("SIGINT"));
  process.on("SIGTERM", () => requestShutdown("SIGTERM"));

  process.on("uncaughtException", (err) => {
    console.error("  ❌ Uncaught exception in launcher:", err);
    requestShutdown("SIGTERM");
  });

  process.on("unhandledRejection", (reason) => {
    console.error("  ❌ Unhandled promise rejection in launcher:", reason);
  });
}

bootstrap().catch((err) => {
  console.error("  ❌ Error:", err.message);
  process.exit(1);
});
