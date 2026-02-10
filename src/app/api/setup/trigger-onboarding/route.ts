/**
 * POST /api/setup/trigger-onboarding
 *
 * Starts setup onboarding after the user chooses a workspace type.
 *
 * Responsibilities:
 * - Scaffold a workspace template locally (deterministic, immediate)
 * - Trigger OpenClaw onboarding prompt (first-install only unless forced)
 * - Clear the setup signal marker when setup work is complete
 */

import { NextResponse } from 'next/server';
import { bootstrapWorkspace, isWorkspaceBootstrapped } from '@/lib/files';
import { getPagesDir } from '@/lib/files/paths';
import {
  ensureWelcomeToClawPadPage,
  getWorkspaceUseCaseLabel,
  isWorkspaceUseCase,
  scaffoldWorkspaceTemplate,
  type ScaffoldResult,
  type WorkspaceUseCase,
} from '@/lib/setup/workspace-templates';
import {
  markOnboardingComplete,
  readOnboardingSentinel,
} from '@/lib/setup/onboarding-sentinel';
import { detectGateway } from '@/lib/gateway/detect';
import { gatewayWS } from '@/lib/gateway/ws-client';
import fs from 'fs/promises';
import path from 'path';

type ImportMode = 'copy' | 'derive' | 'both';

interface TriggerOnboardingBody {
  workspaceType?: string;
  customUseCase?: string;
  forceOnboarding?: boolean;
  importEnabled?: boolean;
  importMode?: ImportMode;
  importSourcePaths?: string[];
  importTargetSpaces?: string[];
}

interface SetupSignalPayload {
  created?: string;
  reason?: string;
}

interface ImportRequest {
  enabled: boolean;
  mode: ImportMode;
  sourcePaths: string[];
  targetSpaces: string[];
}

const MAX_IMPORT_PATHS = 12;
const MAX_IMPORT_TARGET_SPACES = 12;
const MAX_IMPORT_ITEM_LENGTH = 280;
const MAX_IMPORT_TOTAL_CHARS = 4_000;

async function readSetupSignal(): Promise<{ exists: boolean; payload: SetupSignalPayload | null }> {
  const signalPath = path.join(getPagesDir(), '.clawpad-needs-setup');

  try {
    const raw = await fs.readFile(signalPath, 'utf-8');
    const parsed = JSON.parse(raw) as SetupSignalPayload;
    return { exists: true, payload: parsed };
  } catch {
    return { exists: false, payload: null };
  }
}

async function clearSetupSignal(): Promise<void> {
  const signalPath = path.join(getPagesDir(), '.clawpad-needs-setup');
  await fs.rm(signalPath, { force: true }).catch(() => {});
}

function sanitizeCustomUseCase(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (!trimmed) return undefined;
  return trimmed.slice(0, 280);
}

function sanitizeImportMode(value: unknown): ImportMode {
  if (value === 'copy' || value === 'derive' || value === 'both') {
    return value;
  }
  return 'both';
}

function sanitizeStringList(
  value: unknown,
  options: { maxItems: number; maxItemLength: number; pattern?: RegExp },
): string[] {
  if (!Array.isArray(value)) return [];
  const normalized = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .map((item) => item.slice(0, options.maxItemLength))
    .filter((item) => (options.pattern ? options.pattern.test(item) : true));

  const unique = Array.from(new Set(normalized));
  return unique.slice(0, options.maxItems).sort((a, b) => a.localeCompare(b));
}

function sanitizeImportRequest(body: TriggerOnboardingBody): ImportRequest {
  const enabled = body.importEnabled === true;
  const mode = sanitizeImportMode(body.importMode);
  const sourcePaths = sanitizeStringList(body.importSourcePaths, {
    maxItems: MAX_IMPORT_PATHS,
    maxItemLength: MAX_IMPORT_ITEM_LENGTH,
  });
  const targetSpaces = sanitizeStringList(body.importTargetSpaces, {
    maxItems: MAX_IMPORT_TARGET_SPACES,
    maxItemLength: MAX_IMPORT_ITEM_LENGTH,
    pattern: /^[a-z0-9][a-z0-9-_/]*$/i,
  });

  const totalChars = sourcePaths.join('\n').length + targetSpaces.join('\n').length;
  if (totalChars > MAX_IMPORT_TOTAL_CHARS) {
    return {
      enabled,
      mode,
      sourcePaths: sourcePaths.slice(0, Math.floor(MAX_IMPORT_PATHS / 2)),
      targetSpaces,
    };
  }

  return { enabled, mode, sourcePaths, targetSpaces };
}

function buildImportInstructions(importRequest: ImportRequest): string {
  if (!importRequest.enabled || importRequest.sourcePaths.length === 0) {
    return '';
  }

  const modeDescription =
    importRequest.mode === 'copy'
      ? 'Copy documents as-is into the workspace structure.'
      : importRequest.mode === 'derive'
        ? 'Create new derived docs based on source documents.'
        : 'Do both: copy selected docs and create derived docs.';
  const targetSpaces = importRequest.targetSpaces.length > 0
    ? importRequest.targetSpaces.map((space) => `- ${space}`).join('\n')
    : '- Use the most relevant spaces for each imported document';
  const sourcePaths = importRequest.sourcePaths.map((p) => `- ${p}`).join('\n');

  return `

Document import requested during setup:
- Import mode: ${importRequest.mode}
- Instruction: ${modeDescription}
- Source paths:
${sourcePaths}
- Preferred target spaces:
${targetSpaces}

After creating baseline spaces, process these source paths and report what was copied or derived.`;
}

function buildOnboardingPrompt(
  workspaceType: WorkspaceUseCase | null,
  importRequest: ImportRequest,
  customUseCase?: string,
): string {
  const importInstructions = buildImportInstructions(importRequest);

  if (!workspaceType) {
    return `[ClawPad Onboarding] A user completed ClawPad setup and needs workspace onboarding now.

Use the workspace-manager flow and run it conversationally:

1. Welcome briefly (2-3 sentences max).
2. Ask what they primarily use ClawPad for:
   - 🏗️ Engineering & DevOps
   - 🔬 Research & Academia
   - 🏢 Business & Consulting
   - ✍️ Creative & Writing
   - 📝 Personal Knowledge (PARA)
   - Other
3. Wait for their answer, then create the matching workspace structure.
4. Explain what was created and offer one concrete next step.
5. Ask whether they want semantic search help (QMD) after workspace setup is done.

Implementation constraints:
- Write docs directly under ~/.openclaw/pages/<space>/<file>.md (ClawPad watches this path).
- Include _space.yml metadata for each created space when appropriate.
- Keep responses concise and actionable.
- If files/spaces already exist, avoid destructive rewrites and continue incrementally.${importInstructions}`;
  }

  const selectedLabel = getWorkspaceUseCaseLabel(workspaceType);
  const customContext = workspaceType === 'other' && customUseCase
    ? `\nUser provided context for "Other": ${customUseCase}`
    : '';

  return `[ClawPad Onboarding] A user completed setup and already selected their workspace type.

Selected workspace type: ${selectedLabel}.${customContext}

Use the workspace-manager flow, but do NOT ask which workspace type they want.

Required sequence:
1. Welcome briefly (2-3 sentences max).
2. Confirm you are setting up the selected type now.
3. Create/update the matching workspace structure immediately.
4. Explain what was created and offer one concrete next step.
5. Ask whether they want semantic search help (QMD) after workspace setup is done.

Implementation constraints:
- Write docs directly under ~/.openclaw/pages/<space>/<file>.md (ClawPad watches this path).
- Include _space.yml metadata for each created space when appropriate.
- Keep responses concise and actionable.
- If files/spaces already exist, avoid destructive rewrites and continue incrementally.${importInstructions}`;
}

async function triggerOpenClaw(prompt: string): Promise<{
  triggered: boolean;
  method?: 'ws-rpc' | 'hooks-wake';
  runId?: string;
  message?: string;
}> {
  const config = await detectGateway();
  if (!config?.token) {
    return {
      triggered: false,
      message: 'Gateway token missing. User can continue in ClawPad and start chat manually.',
    };
  }

  try {
    await gatewayWS.ensureConnected(5_000);
    const ack = await gatewayWS.sendRPC<{ runId?: string }>('chat.send', {
      sessionKey: 'main',
      message: prompt,
      idempotencyKey: `onboarding-${Date.now()}`,
    }, 10_000);

    return {
      triggered: true,
      method: 'ws-rpc',
      runId: ack?.runId,
    };
  } catch (wsErr) {
    console.warn('[trigger-onboarding] WS RPC failed, trying HTTP fallback:', wsErr);
  }

  try {
    const res = await fetch(`${config.url}/hooks/wake`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.token}`,
      },
      body: JSON.stringify({
        text: prompt,
        mode: 'now',
      }),
    });

    if (res.ok) {
      return { triggered: true, method: 'hooks-wake' };
    }

    if ([404, 403, 405].includes(res.status)) {
      return {
        triggered: false,
        message: 'Agent trigger not available. User can continue manually in chat.',
      };
    }

    return {
      triggered: false,
      message: `Agent hook failed with status ${res.status}.`,
    };
  } catch (err) {
    console.error('[trigger-onboarding] All methods failed:', err);
    return {
      triggered: false,
      message: 'Could not reach agent. User can continue manually in chat.',
    };
  }
}

async function scaffoldWorkspace(
  workspaceType: WorkspaceUseCase | null,
  customUseCase?: string,
): Promise<{ mode: 'selected-template' | 'starter-bootstrap' | 'already-exists'; result: ScaffoldResult | null }> {
  const alreadyBootstrapped = await isWorkspaceBootstrapped();
  if (alreadyBootstrapped) {
    return { mode: 'already-exists', result: null };
  }

  if (workspaceType) {
    const result = await scaffoldWorkspaceTemplate(workspaceType, customUseCase);
    return { mode: 'selected-template', result };
  }

  await bootstrapWorkspace();
  return { mode: 'starter-bootstrap', result: null };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as TriggerOnboardingBody;
    const customUseCase = sanitizeCustomUseCase(body.customUseCase);
    const importRequest = sanitizeImportRequest(body);
    const requestedType = body.workspaceType;
    const workspaceType: WorkspaceUseCase | null =
      typeof requestedType === 'string' && isWorkspaceUseCase(requestedType)
        ? requestedType
        : null;

    const setupSignal = await readSetupSignal();
    const onboardingSentinel = await readOnboardingSentinel();
    const setupReason = setupSignal.payload?.reason;
    const forceOnboarding = body.forceOnboarding === true;
    const triggerEligible = forceOnboarding || (
      !onboardingSentinel.exists &&
      setupSignal.exists &&
      (setupReason === 'first-run-empty-workspace' || !setupReason)
    );

    const scaffold = await scaffoldWorkspace(workspaceType, customUseCase);
    const welcomePage = await ensureWelcomeToClawPadPage();
    await markOnboardingComplete('setup-trigger-onboarding');
    await clearSetupSignal();

    if (!triggerEligible) {
      return NextResponse.json({
        success: true,
        onboardingTriggered: false,
        triggerEligible,
        triggerReason: 'not-first-install',
        scaffoldMode: scaffold.mode,
        scaffoldResult: scaffold.result,
        welcomePage,
        importRequest,
      });
    }

    const prompt = buildOnboardingPrompt(workspaceType, importRequest, customUseCase);
    const triggerResult = await triggerOpenClaw(prompt);

    return NextResponse.json({
      success: true,
      onboardingTriggered: triggerResult.triggered,
      triggerEligible,
      triggerReason: 'first-install',
      onboardingPrompt: prompt,
      triggerMethod: triggerResult.method,
      runId: triggerResult.runId,
      triggerMessage: triggerResult.message,
      scaffoldMode: scaffold.mode,
      scaffoldResult: scaffold.result,
      welcomePage,
      importRequest,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
