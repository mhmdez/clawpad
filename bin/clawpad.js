#!/usr/bin/env node

const { execSync, spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

// ─── Config ──────────────────────────────────────────────
const args = process.argv.slice(2);
const portFlag = args.indexOf("--port");
const port = portFlag !== -1 && args[portFlag + 1] ? args[portFlag + 1] : process.env.PORT || "3000";
const noOpen = args.includes("--no-open");
const rootDir = path.resolve(__dirname, "..");

// ─── Banner ──────────────────────────────────────────────
function printBanner() {
  const banner = `
  ┌─────────────────────────────────────┐
  │                                     │
  │      ╔═╗┬  ┌─┐┬ ┬╔═╗┌─┐┌┬┐       │
  │      ║  │  ├─┤│││╠═╝├─┤ ││        │
  │      ╚═╝┴─┘┴ ┴└┴┘╩  ┴ ┴─┴┘       │
  │                                     │
  │      The workspace for OpenClaw     │
  │                                     │
  └─────────────────────────────────────┘
  `;
  console.log(banner);
}

// ─── Helpers ─────────────────────────────────────────────
function isBuilt() {
  const nextDir = path.join(rootDir, ".next");
  const buildManifest = path.join(nextDir, "build-manifest.json");
  return fs.existsSync(nextDir) && fs.existsSync(buildManifest);
}

function build() {
  console.log("  ⏳ Building ClawPad (first run)...\n");
  try {
    execSync("npx next build", {
      cwd: rootDir,
      stdio: "inherit",
      env: { ...process.env },
    });
    console.log("\n  ✅ Build complete!\n");
  } catch (err) {
    console.error("\n  ❌ Build failed. Check the errors above.");
    process.exit(1);
  }
}

function openBrowser(url) {
  const platform = process.platform;
  const cmd =
    platform === "darwin" ? "open" : platform === "win32" ? "start" : "xdg-open";
  try {
    execSync(`${cmd} ${url}`, { stdio: "ignore" });
  } catch {
    // silently fail — not critical
  }
}

// ─── Main ────────────────────────────────────────────────
printBanner();

if (!isBuilt()) {
  build();
}

console.log(`  🚀 Starting ClawPad on http://localhost:${port}\n`);

const server = spawn("npx", ["next", "start", "-p", port], {
  cwd: rootDir,
  stdio: "inherit",
  env: { ...process.env },
  shell: true,
});

if (!noOpen) {
  // Give the server a moment to start before opening the browser
  setTimeout(() => openBrowser(`http://localhost:${port}`), 2000);
}

server.on("error", (err) => {
  console.error("  ❌ Failed to start server:", err.message);
  process.exit(1);
});

server.on("close", (code) => {
  process.exit(code ?? 0);
});

// Forward signals for clean shutdown
process.on("SIGINT", () => {
  server.kill("SIGINT");
});
process.on("SIGTERM", () => {
  server.kill("SIGTERM");
});
