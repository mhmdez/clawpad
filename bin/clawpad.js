#!/usr/bin/env node

const { execSync, spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");
const net = require("net");

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

// ─── Help ────────────────────────────────────────────────
function printHelp() {
  console.log(`
  ClawPad — The workspace for OpenClaw

  Usage:
    clawpad [options]

  Options:
    -p, --port <port>   Port to listen on (default: ${DEFAULT_PORT})
    --no-open           Don't auto-open the browser
    -h, --help          Show this help message

  Examples:
    clawpad                 Start on port ${DEFAULT_PORT}
    clawpad -p 4000         Start on port 4000
    clawpad --no-open       Start without opening browser
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
  const configPaths = [
    path.join(os.homedir(), ".openclaw", "openclaw.json"),
    path.join(os.homedir(), ".clawdbot", "clawdbot.json"),
  ];

  for (const configPath of configPaths) {
    try {
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        const gwPort = config.gateway?.port || GATEWAY_DEFAULT_PORT;
        return {
          url: `ws://127.0.0.1:${gwPort}`,
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
