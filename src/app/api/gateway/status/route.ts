import { NextResponse } from "next/server";
import { detectGateway } from "@/lib/gateway/detect";

type GatewayStatusReason = "gateway_unreachable" | "server_unreachable" | null;

export async function GET() {
  try {
    const config = await detectGateway();
    if (!config) {
      return NextResponse.json({
        connected: false,
        reason: "gateway_unreachable" as GatewayStatusReason,
        error: "No gateway configuration found",
      });
    }

    // Ping the gateway's health endpoint
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const res = await fetch(`${config.url}/health`, {
        signal: controller.signal,
        headers: config.token
          ? { Authorization: `Bearer ${config.token}` }
          : {},
      });
      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        return NextResponse.json({
          connected: true,
          reason: null as GatewayStatusReason,
          url: config.url,
          agentName: config.agentName,
          source: config.source,
          gateway: data,
        });
      }

      return NextResponse.json({
        connected: false,
        reason: "gateway_unreachable" as GatewayStatusReason,
        url: config.url,
        source: config.source,
        error: `Gateway responded with ${res.status}`,
      });
    } catch {
      clearTimeout(timeout);
      return NextResponse.json({
        connected: false,
        reason: "gateway_unreachable" as GatewayStatusReason,
        url: config.url,
        source: config.source,
        error: "Gateway not reachable",
      });
    }
  } catch (error) {
    return NextResponse.json(
      {
        connected: false,
        reason: "server_unreachable" as GatewayStatusReason,
        error: String(error),
      },
      { status: 500 },
    );
  }
}
