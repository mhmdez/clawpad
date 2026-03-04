import { NextResponse } from "next/server";
import {
  clearGatewayOverride,
  readGatewayOverride,
  writeGatewayOverride,
} from "@/lib/gateway/override";

function normalizeToken(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed ? trimmed : undefined;
}

export async function GET() {
  try {
    const override = await readGatewayOverride();
    return NextResponse.json({ override });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to read gateway config", detail: String(error) },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { url, token } = body as { url?: unknown; token?: unknown };
  if (typeof url !== "string" || !url.trim()) {
    return NextResponse.json(
      { error: "Gateway URL is required" },
      { status: 400 },
    );
  }

  try {
    const saved = await writeGatewayOverride({
      url,
      token: normalizeToken(token),
    });
    return NextResponse.json({
      ok: true,
      source: "clawpad.override",
      url: saved.url,
      tokenConfigured: Boolean(saved.token),
      updatedAt: saved.updatedAt,
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to save gateway config: ${String(error)}` },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  try {
    await clearGatewayOverride();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to clear gateway config: ${String(error)}` },
      { status: 500 },
    );
  }
}
