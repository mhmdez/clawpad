import { NextResponse } from "next/server";
import { gatewayWS } from "@/lib/gateway/ws-client";

export async function GET() {
  try {
    try {
      await gatewayWS.ensureConnected(3000);
    } catch {
      // Return cached features even if we couldn't connect right now.
    }

    return NextResponse.json({
      connected: gatewayWS.status === "connected",
      features: gatewayWS.getFeatures(),
    });
  } catch (error) {
    return NextResponse.json(
      { connected: false, error: String(error) },
      { status: 500 },
    );
  }
}
