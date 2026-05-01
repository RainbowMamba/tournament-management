import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// One-shot backfill for the schedule/live-state separation.
// Copies the current courtId/courtNumber into the new scheduledCourtId/
// scheduledCourtNumber columns for any match that already has a scheduledAt.
// Run once after `prisma db push` adds the new columns.
async function main() {
  const result = await prisma.$executeRaw`
    UPDATE "Match"
    SET "scheduledCourtId" = "courtId",
        "scheduledCourtNumber" = "courtNumber"
    WHERE "scheduledAt" IS NOT NULL
      AND "courtId" IS NOT NULL
      AND "courtNumber" IS NOT NULL
      AND "scheduledCourtId" IS NULL
  `;
  console.log(`Backfilled ${result} matches.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
