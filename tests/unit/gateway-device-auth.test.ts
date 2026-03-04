import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  REQUIRED_OPERATOR_GATEWAY_SCOPES,
  clearStoredGatewayDeviceToken,
  hasRequiredGatewayScopes,
  loadOrCreateGatewayDeviceIdentity,
  loadStoredGatewayDeviceToken,
  scoreGatewayScopes,
  storeGatewayDeviceToken,
} from "@/lib/gateway/device-auth";

function makeEnv(stateDir: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    OPENCLAW_STATE_DIR: stateDir,
  };
}

test("storeGatewayDeviceToken preserves broader token scopes for same gateway", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "clawpad-device-auth-"));
  const env = makeEnv(tempDir);
  try {
    const identity = loadOrCreateGatewayDeviceIdentity(env);

    const storedBroad = storeGatewayDeviceToken({
      deviceId: identity.deviceId,
      role: "operator",
      token: "broad-token",
      scopes: ["operator.read", "operator.write", "operator.admin"],
      gatewayUrl: "http://127.0.0.1:18789",
      env,
    });
    assert.equal(storedBroad, true);

    const storedNarrow = storeGatewayDeviceToken({
      deviceId: identity.deviceId,
      role: "operator",
      token: "narrow-token",
      scopes: ["operator.admin"],
      gatewayUrl: "http://127.0.0.1:18789",
      env,
    });
    assert.equal(storedNarrow, false);

    const loaded = loadStoredGatewayDeviceToken({
      deviceId: identity.deviceId,
      role: "operator",
      gatewayUrl: "http://127.0.0.1:18789",
      requiredScopes: REQUIRED_OPERATOR_GATEWAY_SCOPES,
      env,
    });

    assert.ok(loaded);
    assert.equal(loaded?.token, "broad-token");
    assert.equal(hasRequiredGatewayScopes(loaded?.scopes, REQUIRED_OPERATOR_GATEWAY_SCOPES), true);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("loadStoredGatewayDeviceToken prefers matching gateway token and falls back to legacy role token", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "clawpad-device-auth-gateway-"));
  const env = makeEnv(tempDir);
  try {
    const identity = loadOrCreateGatewayDeviceIdentity(env);

    storeGatewayDeviceToken({
      deviceId: identity.deviceId,
      role: "operator",
      token: "legacy-token",
      scopes: ["operator.read", "operator.write"],
      env,
    });
    storeGatewayDeviceToken({
      deviceId: identity.deviceId,
      role: "operator",
      token: "gateway-a",
      scopes: ["operator.read", "operator.write", "operator.admin"],
      gatewayUrl: "ws://127.0.0.1:18789",
      env,
    });
    storeGatewayDeviceToken({
      deviceId: identity.deviceId,
      role: "operator",
      token: "gateway-b",
      scopes: ["operator.read", "operator.write"],
      gatewayUrl: "ws://127.0.0.1:18800",
      env,
    });

    const forGatewayA = loadStoredGatewayDeviceToken({
      deviceId: identity.deviceId,
      role: "operator",
      gatewayUrl: "http://127.0.0.1:18789",
      requiredScopes: REQUIRED_OPERATOR_GATEWAY_SCOPES,
      env,
    });
    assert.equal(forGatewayA?.token, "gateway-a");

    const forUnknownGateway = loadStoredGatewayDeviceToken({
      deviceId: identity.deviceId,
      role: "operator",
      gatewayUrl: "http://127.0.0.1:19999",
      requiredScopes: REQUIRED_OPERATOR_GATEWAY_SCOPES,
      env,
    });
    assert.equal(forUnknownGateway?.token, "legacy-token");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("clearStoredGatewayDeviceToken removes both gateway-scoped and legacy entries when requested", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "clawpad-device-auth-clear-"));
  const env = makeEnv(tempDir);
  try {
    const identity = loadOrCreateGatewayDeviceIdentity(env);

    storeGatewayDeviceToken({
      deviceId: identity.deviceId,
      role: "operator",
      token: "legacy-token",
      scopes: ["operator.read", "operator.write"],
      env,
    });
    storeGatewayDeviceToken({
      deviceId: identity.deviceId,
      role: "operator",
      token: "gateway-token",
      scopes: ["operator.read", "operator.write"],
      gatewayUrl: "http://127.0.0.1:18789",
      env,
    });

    const changed = clearStoredGatewayDeviceToken({
      deviceId: identity.deviceId,
      role: "operator",
      gatewayUrl: "http://127.0.0.1:18789",
      includeLegacyRoleEntry: true,
      env,
    });
    assert.equal(changed, true);

    const loaded = loadStoredGatewayDeviceToken({
      deviceId: identity.deviceId,
      role: "operator",
      gatewayUrl: "http://127.0.0.1:18789",
      requiredScopes: REQUIRED_OPERATOR_GATEWAY_SCOPES,
      env,
    });
    assert.equal(loaded, null);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("scoreGatewayScopes prioritizes read/write over admin-only scope sets", () => {
  const adminOnly = scoreGatewayScopes(["operator.admin"]);
  const readWrite = scoreGatewayScopes(["operator.read", "operator.write"]);
  assert.ok(readWrite > adminOnly);
});
