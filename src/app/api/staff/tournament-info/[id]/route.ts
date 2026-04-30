import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isTournamentVerified } from "@/lib/staff-session";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!(await isTournamentVerified(id))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
