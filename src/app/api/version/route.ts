import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

function parseSemver(input: string | undefined) {
  if (!input) return null;
  const match = input.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function compareSemver(a?: string, b?: string) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return 0;
  if (pa.major !== pb.major) return pa.major > pb.major ? 1 : -1;
  if (pa.minor !== pb.minor) return pa.minor > pb.minor ? 1 : -1;
  if (pa.patch !== pb.patch) return pa.patch > pb.patch ? 1 : -1;
  return 0;
}

export async function GET() {
  const pkgPath = path.join(process.cwd(), "package.json");
  let current = "0.0.0";
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    current = pkg.version || current;
  } catch {
    // ignore
  }

  let latest: string | undefined;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch("https://registry.npmjs.org/clawpad/latest", {
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      latest = data?.version;
    }
  } catch {
    // best effort
  }

  const updateAvailable = latest ? compareSemver(latest, current) > 0 : false;

  return NextResponse.json({ current, latest, updateAvailable });
}
