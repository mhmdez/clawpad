import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";

const execAsync = promisify(execFile);

export async function GET() {
  try {
    const { stdout } = await execAsync("qmd", ["--version"], { timeout: 5000 });
    const version = stdout.trim();
    return NextResponse.json({
      installed: true,
      version,
    });
  } catch {
    return NextResponse.json({
      installed: false,
      version: null,
    });
  }
}
