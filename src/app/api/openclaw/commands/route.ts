import { NextResponse } from "next/server";
import { listOpenClawChatCommands } from "@/lib/openclaw/commands";

export async function GET() {
  try {
    const commands = listOpenClawChatCommands();
    return NextResponse.json({ commands });
  } catch (error) {
    return NextResponse.json(
      { error: String(error), commands: [] },
      { status: 500 },
    );
  }
}
