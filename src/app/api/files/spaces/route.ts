import { NextResponse } from "next/server";
import { listSpaces, createSpace } from "@/lib/files";

export async function GET() {
  try {
    const spaces = await listSpaces();
    return NextResponse.json(spaces);
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
    return NextResponse.json(space, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
