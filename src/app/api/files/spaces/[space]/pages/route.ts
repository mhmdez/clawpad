import { NextResponse } from "next/server";
import { listPages, listSpaces } from "@/lib/files";

function decodeMaybe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ space: string }> },
) {
  try {
    const { space: rawSpace } = await params;
    const url = new URL(request.url);
    const recursive = url.searchParams.get("recursive") === "true";

    const decodedSpace = decodeMaybe(rawSpace);
    const candidates = Array.from(new Set([rawSpace, decodedSpace]));
    let pages = null as Awaited<ReturnType<typeof listPages>> | null;
    let firstError: Error | null = null;

    for (const candidate of candidates) {
      try {
        pages = await listPages(candidate, { recursive });
        break;
      } catch (err) {
        const message = (err as Error).message;
        if (!message.includes("not found")) {
          throw err;
        }
        firstError = err as Error;
      }
    }

    if (!pages) {
      const byPathOrName = (await listSpaces()).find((space) => {
        if (space.path === rawSpace || space.path === decodedSpace) return true;
        return (
          space.name.localeCompare(rawSpace, undefined, { sensitivity: "base" }) === 0 ||
          space.name.localeCompare(decodedSpace, undefined, { sensitivity: "base" }) === 0
        );
      });

      if (byPathOrName) {
        pages = await listPages(byPathOrName.path, { recursive });
      } else if (firstError) {
        throw firstError;
      }
    }

    if (!pages) {
      throw new Error(`Space "${rawSpace}" not found`);
    }

    return NextResponse.json(pages);
  } catch (err) {
    const message = (err as Error).message;
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
