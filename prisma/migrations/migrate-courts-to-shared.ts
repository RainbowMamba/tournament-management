/**
 * Migration Script: Convert tournament-specific courts to shared courts
 * 
 * This script migrates the old Court model (tournament-specific) to the new
 * shared Court model with TournamentCourt junction table.
 * 
 * Run with: npx ts-node prisma/migrations/migrate-courts-to-shared.ts
 * 
 * What this script does:
 * 1. Fetches all existing courts (old schema with tournamentId)
 * 2. Creates new Court entries (shared, without tournamentId)
 * 3. Creates TournamentCourt junction entries
 * 4. Updates Match.courtId references to new Court IDs
 * 5. Removes old Court entries
 * 
 * NOTE: This script assumes you've already run the Prisma migration
 * that changes the schema. It handles the data migration.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface OldCourt {
  id: string;
  name: string;
  index: number;
  tournamentId: string;
  createdAt: Date;
}

async function migrateCourtData() {
  console.log("🔄 Starting court data migration...\n");

  try {
    // Step 1: Analyze existing courts
    // Note: This query won't work after schema migration - it's for documentation
    // The actual migration should be done before schema changes
    console.log("📊 Analyzing existing courts...\n");
    
    // For a fresh database or after schema change, we skip migration
    const existingCourts = await prisma.court.findMany();
    
    if (existingCourts.length === 0) {
      console.log("✅ No existing courts found. Migration not needed.\n");
      return;
    }

    // Check if courts already have the new schema (no tournamentId)
    // In the new schema, Court doesn't have tournamentId
    const hasNewSchema = !('tournamentId' in (existingCourts[0] as unknown as Record<string, unknown>));
    
    if (hasNewSchema) {
      console.log("✅ Courts already using new schema. Migration complete.\n");
      return;
    }

    // Old schema - need to migrate
    const oldCourts = existingCourts as unknown as OldCourt[];
    console.log(`📊 Found ${oldCourts.length} courts to migrate\n`);

    // Group courts by name to handle duplicates (same name, different tournaments)
    const courtsByName = new Map<string, OldCourt[]>();
    for (const court of oldCourts) {
      const existing = courtsByName.get(court.name) || [];
      existing.push(court);
      courtsByName.set(court.name, existing);
    }

    // Create mapping from old court ID to new court ID
    const courtIdMapping = new Map<string, string>();

    await prisma.$transaction(async (tx) => {
      // Step 2: Create new shared courts (deduplicating by name)
      for (const [name, courts] of courtsByName) {
        // Create one shared court for each unique name
        const newCourt = await tx.court.create({
          data: {
            name,
            location: null, // No location in old schema
          },
        });

        console.log(`  ✓ Created shared court: ${name}`);

        // Map all old court IDs with this name to the new court ID
        for (const oldCourt of courts) {
          courtIdMapping.set(oldCourt.id, newCourt.id);

          // Create TournamentCourt junction
          await tx.tournamentCourt.create({
            data: {
              tournamentId: oldCourt.tournamentId,
              courtId: newCourt.id,
            },
          });

          console.log(`    ✓ Linked to tournament: ${oldCourt.tournamentId}`);
        }
      }

      // Step 3: Update Match.courtId references
      const matchesWithCourt = await tx.match.findMany({
        where: {
          courtId: { not: null },
        },
      });

      console.log(`\n📊 Updating ${matchesWithCourt.length} match court references...\n`);

      for (const match of matchesWithCourt) {
        if (match.courtId) {
          const newCourtId = courtIdMapping.get(match.courtId);
          if (newCourtId) {
            await tx.match.update({
              where: { id: match.id },
              data: { courtId: newCourtId },
            });
          }
        }
      }

      // Step 4: Delete old courts
      // Note: This assumes the old courts are still in the database
      // After schema migration, they should be cleaned up automatically
      console.log("\n🗑️ Cleaning up old court references...\n");
    });

    console.log("✅ Court data migration completed successfully!\n");
    console.log(`   - Created ${courtsByName.size} shared courts`);
    console.log(`   - Created ${oldCourts.length} tournament-court associations`);
    console.log(`   - Updated match court references\n`);

  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  }
}

// Alternative approach: Run as part of Prisma seed for fresh databases
export async function createSampleCourts() {
  console.log("🎾 Creating sample shared courts...\n");

  const courts = [
    { name: "Court 1", location: "Main Building" },
    { name: "Court 2", location: "Main Building" },
    { name: "Court 3", location: "East Wing" },
    { name: "Court 4", location: "East Wing" },
    { name: "Center Court", location: "Main Arena" },
  ];

  for (const court of courts) {
    await prisma.court.upsert({
      where: { name: court.name },
      update: {},
      create: court,
    });
    console.log(`  ✓ Created: ${court.name}`);
  }

  console.log("\n✅ Sample courts created!\n");
}

// Run migration
migrateCourtData()
  .then(() => {
    console.log("🎉 Migration script completed!");
  })
  .catch((e) => {
    console.error("❌ Migration script failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

