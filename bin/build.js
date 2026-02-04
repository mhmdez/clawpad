#!/usr/bin/env node

const { execSync } = require("child_process");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");

console.log("  ⏳ Building ClawPad...\n");

try {
  execSync("npx next build --webpack", {
    cwd: rootDir,
    stdio: "inherit",
    env: { ...process.env },
  });
  console.log("\n  ✅ Build complete!");
} catch (err) {
  console.error("\n  ❌ Build failed.");
  process.exit(1);
}
