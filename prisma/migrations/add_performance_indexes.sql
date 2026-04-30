-- Performance indexes for Match table
-- Apply via Supabase dashboard SQL editor or psql

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Match_nextMatchId_idx" ON "Match"("nextMatchId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Match_homeTeamId_idx" ON "Match"("homeTeamId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Match_awayTeamId_idx" ON "Match"("awayTeamId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Match_homePlaceholderGroupId_idx" ON "Match"("homePlaceholderGroupId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Match_awayPlaceholderGroupId_idx" ON "Match"("awayPlaceholderGroupId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Match_tournamentId_status_idx" ON "Match"("tournamentId", "status");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Match_courtId_courtNumber_idx" ON "Match"("courtId", "courtNumber");
