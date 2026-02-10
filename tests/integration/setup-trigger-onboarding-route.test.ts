import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ensureDirectories, isWorkspaceBootstrapped } from '@/lib/files';
import { POST as postTriggerOnboardingRoute } from '@/app/api/setup/trigger-onboarding/route';

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

test('trigger-onboarding scaffolds selected template and is eligible on first install signal', async () => {
  const previousPagesDir = process.env.CLAWPAD_PAGES_DIR;
  const previousOpenClawDir = process.env.CLAWPAD_OPENCLAW_DIR;
  const previousGatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  const previousGatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN;
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'clawpad-trigger-onboarding-first-'));
  const pagesDir = path.join(tempRoot, 'pages');
  const signalPath = path.join(pagesDir, '.clawpad-needs-setup');
  const sentinelPath = path.join(tempRoot, 'clawpad', 'onboarding-complete.json');

  process.env.CLAWPAD_OPENCLAW_DIR = tempRoot;
  process.env.CLAWPAD_PAGES_DIR = pagesDir;
  process.env.OPENCLAW_GATEWAY_URL = 'http://127.0.0.1:9';
  delete process.env.OPENCLAW_GATEWAY_TOKEN;

  try {
    await ensureDirectories();
    await fs.writeFile(
      signalPath,
      JSON.stringify({ created: new Date().toISOString(), reason: 'first-run-empty-workspace' }),
      'utf-8',
    );

    const req = new Request('http://localhost/api/setup/trigger-onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceType: 'business-consulting' }),
    });

    const res = await postTriggerOnboardingRoute(req);
    assert.equal(res.status, 200);

    const body = (await res.json()) as {
      success: boolean;
      onboardingTriggered: boolean;
      triggerEligible: boolean;
      triggerReason: string;
      scaffoldMode: string;
      onboardingPrompt?: string;
    };

    assert.equal(body.success, true);
    assert.equal(body.triggerEligible, true);
    assert.equal(body.triggerReason, 'first-install');
    assert.equal(body.onboardingTriggered, false);
    assert.equal(body.scaffoldMode, 'selected-template');
    assert.equal(typeof body.onboardingPrompt, 'string');
    assert.match(body.onboardingPrompt ?? '', /Selected workspace type:/);

    assert.equal(await isWorkspaceBootstrapped(), true);
    assert.equal(await exists(path.join(pagesDir, 'clients')), true);
    assert.equal(await exists(path.join(pagesDir, 'projects')), true);
    assert.equal(await exists(path.join(pagesDir, 'clients', 'welcome.md')), true);
    assert.equal(await exists(path.join(pagesDir, 'welcome-to-clawpad.md')), true);
    assert.equal(await exists(sentinelPath), true);
    assert.equal(await exists(signalPath), false);
  } finally {
    if (previousPagesDir === undefined) {
      delete process.env.CLAWPAD_PAGES_DIR;
    } else {
      process.env.CLAWPAD_PAGES_DIR = previousPagesDir;
    }

    if (previousOpenClawDir === undefined) {
      delete process.env.CLAWPAD_OPENCLAW_DIR;
    } else {
      process.env.CLAWPAD_OPENCLAW_DIR = previousOpenClawDir;
    }

    if (previousGatewayToken === undefined) {
      delete process.env.OPENCLAW_GATEWAY_TOKEN;
    } else {
      process.env.OPENCLAW_GATEWAY_TOKEN = previousGatewayToken;
    }

    if (previousGatewayUrl === undefined) {
      delete process.env.OPENCLAW_GATEWAY_URL;
    } else {
      process.env.OPENCLAW_GATEWAY_URL = previousGatewayUrl;
    }

    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('trigger-onboarding skips agent trigger for non-first-install signals', async () => {
  const previousPagesDir = process.env.CLAWPAD_PAGES_DIR;
  const previousOpenClawDir = process.env.CLAWPAD_OPENCLAW_DIR;
  const previousGatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  const previousGatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN;
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'clawpad-trigger-onboarding-manual-'));
  const pagesDir = path.join(tempRoot, 'pages');
  const signalPath = path.join(pagesDir, '.clawpad-needs-setup');
  const sentinelPath = path.join(tempRoot, 'clawpad', 'onboarding-complete.json');

  process.env.CLAWPAD_OPENCLAW_DIR = tempRoot;
  process.env.CLAWPAD_PAGES_DIR = pagesDir;
  process.env.OPENCLAW_GATEWAY_URL = 'http://127.0.0.1:9';
  process.env.OPENCLAW_GATEWAY_TOKEN = 'dummy-token';

  try {
    await ensureDirectories();
    await fs.writeFile(
      signalPath,
      JSON.stringify({ created: new Date().toISOString(), reason: 'cli-setup-flag' }),
      'utf-8',
    );

    const req = new Request('http://localhost/api/setup/trigger-onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceType: 'engineering-devops' }),
    });

    const res = await postTriggerOnboardingRoute(req);
    assert.equal(res.status, 200);

    const body = (await res.json()) as {
      success: boolean;
      onboardingTriggered: boolean;
      triggerEligible: boolean;
      triggerReason: string;
      scaffoldMode: string;
    };

    assert.equal(body.success, true);
    assert.equal(body.triggerEligible, false);
    assert.equal(body.triggerReason, 'not-first-install');
    assert.equal(body.onboardingTriggered, false);
    assert.equal(body.scaffoldMode, 'selected-template');

    assert.equal(await exists(path.join(pagesDir, 'infrastructure')), true);
    assert.equal(await exists(path.join(pagesDir, 'infrastructure', 'welcome.md')), true);
    assert.equal(await exists(path.join(pagesDir, 'welcome-to-clawpad.md')), true);
    assert.equal(await exists(sentinelPath), true);
    assert.equal(await exists(signalPath), false);
  } finally {
    if (previousPagesDir === undefined) {
      delete process.env.CLAWPAD_PAGES_DIR;
    } else {
      process.env.CLAWPAD_PAGES_DIR = previousPagesDir;
    }

    if (previousOpenClawDir === undefined) {
      delete process.env.CLAWPAD_OPENCLAW_DIR;
    } else {
      process.env.CLAWPAD_OPENCLAW_DIR = previousOpenClawDir;
    }

    if (previousGatewayToken === undefined) {
      delete process.env.OPENCLAW_GATEWAY_TOKEN;
    } else {
      process.env.OPENCLAW_GATEWAY_TOKEN = previousGatewayToken;
    }

    if (previousGatewayUrl === undefined) {
      delete process.env.OPENCLAW_GATEWAY_URL;
    } else {
      process.env.OPENCLAW_GATEWAY_URL = previousGatewayUrl;
    }

    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('trigger-onboarding skips first-install trigger when onboarding sentinel already exists', async () => {
  const previousPagesDir = process.env.CLAWPAD_PAGES_DIR;
  const previousOpenClawDir = process.env.CLAWPAD_OPENCLAW_DIR;
  const previousGatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  const previousGatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN;
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'clawpad-trigger-onboarding-sentinel-'));
  const pagesDir = path.join(tempRoot, 'pages');
  const signalPath = path.join(pagesDir, '.clawpad-needs-setup');
  const sentinelPath = path.join(tempRoot, 'clawpad', 'onboarding-complete.json');

  process.env.CLAWPAD_OPENCLAW_DIR = tempRoot;
  process.env.CLAWPAD_PAGES_DIR = pagesDir;
  process.env.OPENCLAW_GATEWAY_URL = 'http://127.0.0.1:9';
  delete process.env.OPENCLAW_GATEWAY_TOKEN;

  try {
    await ensureDirectories();
    await fs.mkdir(path.dirname(sentinelPath), { recursive: true });
    await fs.writeFile(
      sentinelPath,
      JSON.stringify({ createdAt: new Date().toISOString(), source: 'test' }),
      'utf-8',
    );
    await fs.writeFile(
      signalPath,
      JSON.stringify({ created: new Date().toISOString(), reason: 'first-run-empty-workspace' }),
      'utf-8',
    );

    const req = new Request('http://localhost/api/setup/trigger-onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceType: 'engineering-devops' }),
    });

    const res = await postTriggerOnboardingRoute(req);
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      triggerEligible: boolean;
      triggerReason: string;
    };

    assert.equal(body.triggerEligible, false);
    assert.equal(body.triggerReason, 'not-first-install');
  } finally {
    if (previousPagesDir === undefined) {
      delete process.env.CLAWPAD_PAGES_DIR;
    } else {
      process.env.CLAWPAD_PAGES_DIR = previousPagesDir;
    }

    if (previousOpenClawDir === undefined) {
      delete process.env.CLAWPAD_OPENCLAW_DIR;
    } else {
      process.env.CLAWPAD_OPENCLAW_DIR = previousOpenClawDir;
    }

    if (previousGatewayUrl === undefined) {
      delete process.env.OPENCLAW_GATEWAY_URL;
    } else {
      process.env.OPENCLAW_GATEWAY_URL = previousGatewayUrl;
    }

    if (previousGatewayToken === undefined) {
      delete process.env.OPENCLAW_GATEWAY_TOKEN;
    } else {
      process.env.OPENCLAW_GATEWAY_TOKEN = previousGatewayToken;
    }

    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('trigger-onboarding injects import instructions into onboarding prompt', async () => {
  const previousPagesDir = process.env.CLAWPAD_PAGES_DIR;
  const previousOpenClawDir = process.env.CLAWPAD_OPENCLAW_DIR;
  const previousGatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  const previousGatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN;
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'clawpad-trigger-onboarding-import-'));
  const pagesDir = path.join(tempRoot, 'pages');
  const signalPath = path.join(pagesDir, '.clawpad-needs-setup');

  process.env.CLAWPAD_OPENCLAW_DIR = tempRoot;
  process.env.CLAWPAD_PAGES_DIR = pagesDir;
  process.env.OPENCLAW_GATEWAY_URL = 'http://127.0.0.1:9';
  delete process.env.OPENCLAW_GATEWAY_TOKEN;

  try {
    await ensureDirectories();
    await fs.writeFile(
      signalPath,
      JSON.stringify({ created: new Date().toISOString(), reason: 'first-run-empty-workspace' }),
      'utf-8',
    );

    const req = new Request('http://localhost/api/setup/trigger-onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceType: 'business-consulting',
        importEnabled: true,
        importMode: 'both',
        importSourcePaths: ['/Users/test/Documents', '~/Desktop/notes'],
        importTargetSpaces: ['clients', 'projects'],
      }),
    });

    const res = await postTriggerOnboardingRoute(req);
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      triggerEligible: boolean;
      onboardingPrompt?: string;
      importRequest?: { enabled: boolean; mode: string };
    };

    assert.equal(body.triggerEligible, true);
    assert.equal(body.importRequest?.enabled, true);
    assert.equal(body.importRequest?.mode, 'both');
    assert.match(body.onboardingPrompt ?? '', /Document import requested during setup/);
    assert.match(body.onboardingPrompt ?? '', /Import mode: both/);
    assert.match(body.onboardingPrompt ?? '', /Users\/test\/Documents/);
  } finally {
    if (previousPagesDir === undefined) {
      delete process.env.CLAWPAD_PAGES_DIR;
    } else {
      process.env.CLAWPAD_PAGES_DIR = previousPagesDir;
    }

    if (previousOpenClawDir === undefined) {
      delete process.env.CLAWPAD_OPENCLAW_DIR;
    } else {
      process.env.CLAWPAD_OPENCLAW_DIR = previousOpenClawDir;
    }

    if (previousGatewayUrl === undefined) {
      delete process.env.OPENCLAW_GATEWAY_URL;
    } else {
      process.env.OPENCLAW_GATEWAY_URL = previousGatewayUrl;
    }

    if (previousGatewayToken === undefined) {
      delete process.env.OPENCLAW_GATEWAY_TOKEN;
    } else {
      process.env.OPENCLAW_GATEWAY_TOKEN = previousGatewayToken;
    }

    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
