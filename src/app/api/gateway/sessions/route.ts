import { NextResponse } from "next/server";
import { detectGateway } from "@/lib/gateway/detect";

export async function GET() {
  try {
    const config = await detectGateway();
    if (!config) {
      return NextResponse.json(
        { error: "No gateway configuration found" },
        { status: 503 },
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch(`${config.url}/api/sessions`, {
        signal: controller.signal,
        headers: {
          ...(config.token
            ? { Authorization: `Bearer ${config.token}` }
            : {}),
          Accept: "application/json",
        },
      });
      clearTimeout(timeout);

      if (!res.ok) {
        return NextResponse.json(
          { error: `Gateway returned ${res.status}`, sessions: [] },
          { status: res.status },
        );
      }

      const data = await res.json();
      // Gateway may return { sessions: [...] } or just [...]
      const sessions = Array.isArray(data) ? data : data.sessions ?? [];
      return NextResponse.json({ sessions });
    } catch {
      clearTimeout(timeout);
      return NextResponse.json(
        { error: "Gateway not reachable", sessions: [] },
        { status: 503 },
      );
    }
  } catch (error) {
    return NextResponse.json(
      { error: String(error), sessions: [] },
      { status: 500 },
    );
  }
}
