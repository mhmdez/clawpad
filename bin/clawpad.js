#!/usr/bin/env node

const { execSync, spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");
const net = require("net");
const readline = require("readline");

// ─── Constants ───────────────────────────────────────────
const DEFAULT_PORT = 3333;
const GATEWAY_DEFAULT_PORT = 18789;
const ROOT_DIR = path.resolve(__dirname, "..");

// ─── Arg Parsing ─────────────────────────────────────────
const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  printHelp();
  process.exit(0);
}

const portIdx = Math.max(args.indexOf("-p"), args.indexOf("--port"));
const port =
  portIdx !== -1 && args[portIdx + 1]
    ? parseInt(args[portIdx + 1], 10)
    : parseInt(process.env.PORT || String(DEFAULT_PORT), 10);

const shouldOpen = !args.includes("--no-open");
const shouldIntegrate = !args.includes("--no-integrate");
const autoYes = args.includes("--yes");
const noPrompt = args.includes("--no-prompt");
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

// ─── Help ────────────────────────────────────────────────
function printHelp() {
  console.log(`
  ClawPad — The workspace for OpenClaw

  Usage:
    clawpad [options]

  Options:
    -p, --port <port>   Port to listen on (default: ${DEFAULT_PORT})
    --no-open           Don't auto-open the browser
    --pages-dir <dir>   Override docs directory (default: auto)
    --migrate[=mode]    Migrate legacy docs (mode: move|copy)
    --no-integrate      Skip OpenClaw integration prompt
    --yes               Auto-approve integration steps
    --no-prompt         Disable integration prompt (skip changes)
    -h, --help          Show this help message

  Examples:
    clawpad                 Start on port ${DEFAULT_PORT}
    clawpad -p 4000         Start on port 4000
    clawpad --no-open       Start without opening browser
    clawpad --yes           Auto-integrate with OpenClaw if detected
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
          token: config.gateway?.auth?.token,
          source: path.basename(configPath),
        };
      }
    } catch {
      // ignore parse errors
    }
  }

  // 3. Probe default port
  const isOpen = await checkPort(GATEWAY_DEFAULT_PORT);
  if (isOpen) {
    return {
      url: `ws://127.0.0.1:${GATEWAY_DEFAULT_PORT}`,
      source: "probe",
    };
  }

  return null;
}

function checkPort(port) {
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
    socket.connect(port, "127.0.0.1");
  });
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
  const candidates = [
    path.join(stateDir, "openclaw.json"),
    path.join(stateDir, "clawdbot.json"),
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
    config?.plugins?.entries?.clawpad?.config?.pagesDir ||
    config?.plugins?.entries?.clawpad?.config?.pages_dir;
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
  return Boolean(entries.clawpad || installs.clawpad);
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

async function maybeMigrateLegacyPages(config, resolvedPagesDir) {
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

function applyIntegrationConfig(config, pagesDir) {
  const next = config && typeof config === "object" ? config : {};
  next.plugins = next.plugins || {};
  next.plugins.entries = next.plugins.entries || {};
  const entry = next.plugins.entries.clawpad || {};
  next.plugins.entries.clawpad = {
    ...entry,
    enabled: true,
    config: {
      ...(entry.config || {}),
      pagesDir,
    },
  };

  next.agents = next.agents || {};
  next.agents.defaults = next.agents.defaults || {};
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

function needsIntegrationPatch(config, pagesDir) {
  const entry = config?.plugins?.entries?.clawpad;
  const configuredPages =
    entry?.config?.pagesDir || entry?.config?.pages_dir;
  const pluginEnabled = entry?.enabled === true;
  const extraPaths = config?.agents?.defaults?.memorySearch?.extraPaths;
  const hasExtraPath = Array.isArray(extraPaths) && extraPaths.includes(pagesDir);

  return !(pluginEnabled && configuredPages === pagesDir && hasExtraPath);
}

async function integrateWithOpenClaw(pagesDir) {
  if (!shouldIntegrate) return;
  if (!hasOpenClawBinary()) return;

  const { configPath, config } = loadOpenClawConfig();
  const pluginInstalled = isPluginInstalled(config);
  const workspaceDir = resolveWorkspaceDir(config);

  const needsConfigPatch = needsIntegrationPatch(config, pagesDir);
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
    const patched = applyIntegrationConfig(config, pagesDir);
    writeOpenClawConfig(configPath, patched);
  }

  if (needsAgentsNote) {
    ensureAgentsNote(workspaceDir, pagesDir);
  }

  console.log("  ✅ OpenClaw integration configured. Restart the gateway to apply.");
}

// ─── Build Check ─────────────────────────────────────────
function isBuilt() {
  const standaloneServer = path.join(ROOT_DIR, ".next", "standalone", "server.js");
  const buildManifest = path.join(ROOT_DIR, ".next", "build-manifest.json");
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
async function main() {
  printBanner();

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
  const migration = await maybeMigrateLegacyPages(config, pagesDir);
  pagesDir = migration.pagesDir;
  if (!process.env.CLAWPAD_PAGES_DIR && pagesDir) {
    process.env.CLAWPAD_PAGES_DIR = pagesDir;
  }
  await integrateWithOpenClaw(pagesDir);

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

  const url = `http://localhost:${port}`;
  console.log(`  🚀 Starting ClawPad at ${url}\n`);

  // Start the standalone server
  const serverPath = path.join(standaloneDir, "server.js");
  const server = spawn(process.execPath, [serverPath], {
    cwd: standaloneDir,
    stdio: "inherit",
    env: {
      ...process.env,
      PORT: String(port),
      HOSTNAME: "localhost",
    },
  });

  if (shouldOpen) {
    setTimeout(() => openBrowser(url), 2000);
  }

  server.on("error", (err) => {
    console.error("  ❌ Failed to start server:", err.message);
    process.exit(1);
  });

  server.on("close", (code) => {
    process.exit(code ?? 0);
  });

  // Forward signals for clean shutdown
  process.on("SIGINT", () => server.kill("SIGINT"));
  process.on("SIGTERM", () => server.kill("SIGTERM"));
}

main().catch((err) => {
  console.error("  ❌ Error:", err.message);
  process.exit(1);
});
