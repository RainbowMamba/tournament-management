import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...\n");

  // Create a demo user
  const hashedPassword = await hash("demo1234", 12);
  
  const demoUser = await prisma.user.upsert({
    where: { email: "demo@tournament.app" },
    update: {},
    create: {
      email: "demo@tournament.app",
      name: "Demo User",
      password: hashedPassword,
    },
  });

  console.log(`✅ Created demo user: ${demoUser.email}`);

  // Create shared venues (these can be used by any tournament)
  // Each venue can have multiple courts
  const venueData = [
    { name: "Central Tennis Club", location: "123 Main Street", numCourts: 4 },
    { name: "Sports Complex", location: "456 Stadium Road", numCourts: 6 },
    { name: "Community Center", location: "789 Park Avenue", numCourts: 2 },
  ];

  const venues = [];
  for (const data of venueData) {
    const venue = await prisma.court.upsert({
      where: { name: data.name },
      update: { location: data.location, numCourts: data.numCourts },
      create: data,
    });
    venues.push(venue);
  }

  console.log(`✅ Created ${venues.length} venues with a total of ${venues.reduce((sum, v) => sum + v.numCourts, 0)} courts`);

  // Create a sample tournament with qualifying
  const tournament = await prisma.tournament.upsert({
    where: { id: "sample-tournament-1" },
    update: {},
    create: {
      id: "sample-tournament-1",
      name: "Summer Open 2025",
      location: "Central Tennis Club",
      hasQualifying: true,
      status: "DRAFT",
      ownerId: demoUser.id,
    },
  });

  console.log(`✅ Created sample tournament: ${tournament.name}`);

  // Assign first 2 venues to the tournament
  const venuesToAssign = venues.slice(0, 2);
  for (const venue of venuesToAssign) {
    await prisma.tournamentCourt.upsert({
      where: {
        tournamentId_courtId: {
          tournamentId: tournament.id,
          courtId: venue.id,
        },
      },
      update: {},
      create: {
        tournamentId: tournament.id,
        courtId: venue.id,
      },
    });
  }

  console.log(`✅ Assigned ${venuesToAssign.length} venues (${venuesToAssign.reduce((sum, v) => sum + v.numCourts, 0)} courts) to tournament`);

  console.log("\n🎾 Seeding complete!");
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
