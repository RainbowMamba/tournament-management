import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function clearDatabase() {
  console.log("🗑️  Clearing all data from database...\n");

  try {
    // Delete in order to respect foreign key constraints
    await prisma.match.deleteMany();
    console.log("✅ Deleted all matches");

    await prisma.team.deleteMany();
    console.log("✅ Deleted all teams");

    await prisma.group.deleteMany();
    console.log("✅ Deleted all groups");

    await prisma.stage.deleteMany();
    console.log("✅ Deleted all stages");

    await prisma.tournamentCourt.deleteMany();
    console.log("✅ Deleted all tournament-court associations");

    await prisma.tournament.deleteMany();
    console.log("✅ Deleted all tournaments");

    await prisma.court.deleteMany();
    console.log("✅ Deleted all venues");

    await prisma.user.deleteMany();
    console.log("✅ Deleted all users");

    console.log("\n✨ Database cleared successfully!");
  } catch (error) {
    console.error("❌ Error clearing database:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

clearDatabase();

