#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const STANDALONE_DIR = path.join(ROOT_DIR, ".next", "standalone");
const SERVER_ENTRY = path.join(STANDALONE_DIR, "server.js");

function copyDirIfNeeded(src, dest) {
  if (!fs.existsSync(src)) return;
  if (fs.existsSync(dest)) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}

function main() {
  if (!fs.existsSync(SERVER_ENTRY)) {
    console.error(
      `Standalone server not found at ${SERVER_ENTRY}. Run "npm run build" first.`,
    );
    process.exit(1);
  }

  copyDirIfNeeded(
    path.join(ROOT_DIR, ".next", "static"),
    path.join(STANDALONE_DIR, ".next", "static"),
  );
  copyDirIfNeeded(
    path.join(ROOT_DIR, "public"),
    path.join(STANDALONE_DIR, "public"),
  );

  console.log("Standalone assets prepared for desktop packaging.");
}

main();
