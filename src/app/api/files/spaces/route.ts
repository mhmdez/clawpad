import { NextResponse } from "next/server";
import { listSpaces, createSpace } from "@/lib/files";
import { ROOT_SPACE_PATH } from "@/lib/files/constants";

export async function GET() {
  try {
    const spaces = await listSpaces();
    return NextResponse.json(
      spaces.map((space) => ({
        ...space,
        kind: space.path === ROOT_SPACE_PATH ? "root" : "space",
      })),
    );
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, icon, color } = body as {
      name: string;
      icon?: string;
      color?: string;
    };
    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    const space = await createSpace(name, { name, icon, color });
    return NextResponse.json({ ...space, kind: "space" }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
