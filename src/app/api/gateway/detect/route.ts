import { NextResponse } from "next/server";
import { detectGateway } from "@/lib/gateway/detect";

export async function GET() {
  try {
    const config = await detectGateway();
    if (!config) {
      return NextResponse.json({ found: false });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    let found = false;
    try {
      const res = await fetch(`${config.url}/health`, {
        signal: controller.signal,
        headers: config.token ? { Authorization: `Bearer ${config.token}` } : {},
      });
      found = res.ok;
    } catch {
      found = false;
    } finally {
      clearTimeout(timeout);
    }

    return NextResponse.json({
      found,
      ...config,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to detect gateway", detail: String(error) },
      { status: 500 },
    );
  }
}
