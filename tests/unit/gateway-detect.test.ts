import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { detectGateway } from "@/lib/gateway/detect";

function restoreEnvVar(name: string, previous: string | undefined): void {
  if (previous === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = previous;
}

test("detectGateway prefers config token over OPENCLAW_GATEWAY_TOKEN when config is present", async () => {
  const prevConfigPath = process.env.OPENCLAW_CONFIG_PATH;
  const prevStateDir = process.env.OPENCLAW_STATE_DIR;
  const prevGatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  const prevGatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN;

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "clawpad-gateway-detect-"));
  const configPath = path.join(tempDir, "openclaw.json");

  await fs.writeFile(
    configPath,
    JSON.stringify({
      gateway: {
        bind: "127.0.0.1",
        port: 18789,
        auth: {
          token: "config-token",
        },
      },
    }),
    "utf8",
  );

  process.env.OPENCLAW_CONFIG_PATH = configPath;
  process.env.OPENCLAW_GATEWAY_TOKEN = "env-token";
  delete process.env.OPENCLAW_STATE_DIR;
  delete process.env.OPENCLAW_GATEWAY_URL;

  try {
    const config = await detectGateway();
    assert.ok(config);
    assert.equal(config?.token, "config-token");
    assert.equal(config?.source, "openclaw.json");
  } finally {
    restoreEnvVar("OPENCLAW_CONFIG_PATH", prevConfigPath);
    restoreEnvVar("OPENCLAW_STATE_DIR", prevStateDir);
    restoreEnvVar("OPENCLAW_GATEWAY_URL", prevGatewayUrl);
    restoreEnvVar("OPENCLAW_GATEWAY_TOKEN", prevGatewayToken);
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("detectGateway selects writable token from gateway.auth.tokens when direct token is read-only", async () => {
  const prevConfigPath = process.env.OPENCLAW_CONFIG_PATH;
  const prevStateDir = process.env.OPENCLAW_STATE_DIR;
  const prevGatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  const prevGatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN;

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "clawpad-gateway-detect-scopes-"));
  const configPath = path.join(tempDir, "openclaw.json");

  await fs.writeFile(
    configPath,
    JSON.stringify({
      gateway: {
        bind: "127.0.0.1",
        port: 18789,
        auth: {
          token: "direct-readonly-token",
          scopes: ["operator.read"],
          tokens: [
            { token: "token-read", scopes: ["operator.read"] },
            { token: "token-write", scopes: ["operator.write"] },
          ],
        },
      },
    }),
    "utf8",
  );

  process.env.OPENCLAW_CONFIG_PATH = configPath;
  delete process.env.OPENCLAW_STATE_DIR;
  delete process.env.OPENCLAW_GATEWAY_URL;
  delete process.env.OPENCLAW_GATEWAY_TOKEN;

  try {
    const config = await detectGateway();
    assert.ok(config);
    assert.equal(config?.token, "token-write");
  } finally {
    restoreEnvVar("OPENCLAW_CONFIG_PATH", prevConfigPath);
    restoreEnvVar("OPENCLAW_STATE_DIR", prevStateDir);
    restoreEnvVar("OPENCLAW_GATEWAY_URL", prevGatewayUrl);
    restoreEnvVar("OPENCLAW_GATEWAY_TOKEN", prevGatewayToken);
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
