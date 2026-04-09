import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  
  const tournament = await prisma.tournament.findFirst({
    where: {
      id,
      status: { in: ["ACTIVE", "COMPLETED"] },
    },
    select: {
      id: true,
      name: true,
    },
  });

  if (!tournament) {
    return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  }

  return NextResponse.json({ id: tournament.id, name: tournament.name });
}

