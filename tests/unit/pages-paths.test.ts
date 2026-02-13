import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getPagesDir } from "@/lib/files/paths";

test("getPagesDir uses openclaw-plugin pagesDir config", async () => {
  const previousOpenClawDir = process.env.CLAWPAD_OPENCLAW_DIR;
  const previousConfigPath = process.env.OPENCLAW_CONFIG_PATH;
  const previousPagesDir = process.env.CLAWPAD_PAGES_DIR;

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "clawpad-pages-path-plugin-"));
  const configuredPagesDir = path.join(tempRoot, "workspace", "pages");
  const configPath = path.join(tempRoot, "openclaw.json");

  process.env.CLAWPAD_OPENCLAW_DIR = tempRoot;
  process.env.OPENCLAW_CONFIG_PATH = configPath;
  delete process.env.CLAWPAD_PAGES_DIR;

  try {
    await fs.mkdir(configuredPagesDir, { recursive: true });
    await fs.writeFile(
      configPath,
      JSON.stringify(
        {
          plugins: {
            entries: {
              "openclaw-plugin": {
                config: { pagesDir: configuredPagesDir },
              },
            },
          },
        },
        null,
        2,
      ),
      "utf-8",
    );

    assert.equal(getPagesDir(), configuredPagesDir);
  } finally {
    if (previousOpenClawDir === undefined) {
      delete process.env.CLAWPAD_OPENCLAW_DIR;
    } else {
      process.env.CLAWPAD_OPENCLAW_DIR = previousOpenClawDir;
    }

    if (previousConfigPath === undefined) {
      delete process.env.OPENCLAW_CONFIG_PATH;
    } else {
      process.env.OPENCLAW_CONFIG_PATH = previousConfigPath;
    }

    if (previousPagesDir === undefined) {
      delete process.env.CLAWPAD_PAGES_DIR;
    } else {
      process.env.CLAWPAD_PAGES_DIR = previousPagesDir;
    }

    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("getPagesDir prefers populated workspace pages over empty legacy pages", async () => {
  const previousOpenClawDir = process.env.CLAWPAD_OPENCLAW_DIR;
  const previousConfigPath = process.env.OPENCLAW_CONFIG_PATH;
  const previousPagesDir = process.env.CLAWPAD_PAGES_DIR;

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "clawpad-pages-path-precedence-"));
  const legacyPagesDir = path.join(tempRoot, "pages");
  const workspaceDir = path.join(tempRoot, "workspace");
  const workspacePagesDir = path.join(workspaceDir, "pages");
  const configPath = path.join(tempRoot, "openclaw.json");

  process.env.CLAWPAD_OPENCLAW_DIR = tempRoot;
  process.env.OPENCLAW_CONFIG_PATH = configPath;
  delete process.env.CLAWPAD_PAGES_DIR;

  try {
    await fs.mkdir(legacyPagesDir, { recursive: true });
    await fs.mkdir(workspacePagesDir, { recursive: true });
    await fs.writeFile(path.join(workspacePagesDir, "welcome.md"), "# Welcome\n", "utf-8");
    await fs.writeFile(
      configPath,
      JSON.stringify(
        {
          agents: {
            defaults: {
              workspace: workspaceDir,
            },
          },
        },
        null,
        2,
      ),
      "utf-8",
    );

    assert.equal(getPagesDir(), workspacePagesDir);
  } finally {
    if (previousOpenClawDir === undefined) {
      delete process.env.CLAWPAD_OPENCLAW_DIR;
    } else {
      process.env.CLAWPAD_OPENCLAW_DIR = previousOpenClawDir;
    }

    if (previousConfigPath === undefined) {
      delete process.env.OPENCLAW_CONFIG_PATH;
    } else {
      process.env.OPENCLAW_CONFIG_PATH = previousConfigPath;
    }

    if (previousPagesDir === undefined) {
      delete process.env.CLAWPAD_PAGES_DIR;
    } else {
      process.env.CLAWPAD_PAGES_DIR = previousPagesDir;
    }

    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
