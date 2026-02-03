import { NextResponse } from "next/server";
import { detectGateway } from "@/lib/gateway/detect";

export async function GET() {
  try {
    const config = await detectGateway();
    return NextResponse.json(config);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to detect gateway", detail: String(error) },
      { status: 500 },
    );
  }
}
