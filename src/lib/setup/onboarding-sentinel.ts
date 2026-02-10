import fs from "fs/promises";
import path from "path";
import { getOpenClawDir } from "@/lib/files/paths";

export interface OnboardingSentinelPayload {
  createdAt: string;
  source?: string;
}

export function getOnboardingSentinelPath(): string {
  return path.join(getOpenClawDir(), "clawpad", "onboarding-complete.json");
}

export async function readOnboardingSentinel(): Promise<{
  exists: boolean;
  payload: OnboardingSentinelPayload | null;
}> {
  const filePath = getOnboardingSentinelPath();
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const payload = JSON.parse(raw) as OnboardingSentinelPayload;
    if (!payload || typeof payload.createdAt !== "string") {
      return { exists: true, payload: null };
    }
    return { exists: true, payload };
  } catch {
    return { exists: false, payload: null };
  }
}

export async function markOnboardingComplete(source?: string): Promise<void> {
  const filePath = getOnboardingSentinelPath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const payload: OnboardingSentinelPayload = {
    createdAt: new Date().toISOString(),
    ...(source ? { source } : {}),
  };
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf-8");
}
