"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { StaffVerificationDialog } from "@/components/tournament/staff-verification-dialog";
import { TournamentTabsStaff } from "@/components/tournament/tournament-tabs-staff";
import { TournamentHeaderStaff } from "@/components/tournament/tournament-header-staff";

type TournamentData = {
  id: string;
  name: string;
  location: string | null;
  startDate: Date | null;
  status: "DRAFT" | "ACTIVE" | "COMPLETED";
  hasQualifying: boolean;
  tiebreakerPriority: "HEAD_TO_HEAD" | "GAMES_WON";
  courts: Array<{
    id: string;
    name: string;
    numCourts: number;
    location?: string | null;
  }>;
  stages: Array<{
    id: string;
    type: "QUALIFYING" | "MAIN";
    numGroups: number | null;
    teamsPerGroup: number | null;
    teamsAdvancing: number | null;
    totalTeams: number | null;
    groups: Array<{
      id: string;
      name: string;
      index: number;
      teams: Array<{
        id: string;
        name: string;
        seed: number | null;
      }>;
    }>;
  }>;
  teams: Array<{
    id: string;
    name: string;
    seed: number | null;
    groupId: string | null;
  }>;
  matches: Array<{
    id: string;
    round: number;
    matchNumber: number;
    status: "PENDING" | "ON_COURT" | "COMPLETED";
    stageId: string;
    groupId: string | null;
    courtId: string | null;
    courtNumber: number | null;
    homeTeamId: string | null;
    awayTeamId: string | null;
    winnerTeamId: string | null;
    homeScore: number | null;
    awayScore: number | null;
    scoreDetails: string | null;
    homeTeam: { id: string; name: string } | null;
    awayTeam: { id: string; name: string } | null;
    winnerTeam: { id: string; name: string } | null;
    court: { id: string; name: string; numCourts: number } | null;
    homePlaceholderGroupId: string | null;
    homePlaceholderRank: number | null;
    homePlaceholderGroup: { id: string; name: string } | null;
    awayPlaceholderGroupId: string | null;
    awayPlaceholderRank: number | null;
    awayPlaceholderGroup: { id: string; name: string } | null;
  }>;
};

type Props = {
  tournamentId: string;
  tournament?: TournamentData;
};

export function StaffTournamentPageClient({ tournamentId, tournament: initialTournament }: Props) {
  const router = useRouter();
  const t = useTranslations('staff');
  const [tournament, setTournament] = useState<TournamentData | null>(initialTournament || null);
  const [showVerification, setShowVerification] = useState(!initialTournament);
  const [tournamentName, setTournamentName] = useState<string>("");

  // Sync tournament state when prop changes (e.g., after router.refresh())
  useEffect(() => {
    if (initialTournament) {
      setTournament(initialTournament);
    }
  }, [initialTournament]);

  useEffect(() => {
    async function loadTournamentInfo() {
      if (!showVerification) return;
      
      try {
        const response = await fetch(`/api/staff/tournament-info/${tournamentId}`);
        if (response.ok) {
          const info = await response.json();
          setTournamentName(info.name || "Tournament");
        } else {
          setTournamentName("Tournament");
        }
      } catch {
        setTournamentName("Tournament");
      }
    }

    loadTournamentInfo();
  }, [tournamentId, showVerification]);

  async function handleVerified() {
    setShowVerification(false);
    // Reload page to fetch tournament data from server
    router.refresh();
  }

  if (showVerification) {
    return (
      <div className="container mx-auto px-4 md:px-6 py-8">
        <StaffVerificationDialog
          tournamentId={tournamentId}
          tournamentName={tournamentName}
          open={showVerification}
          onVerified={handleVerified}
          onClose={() => router.back()}
        />
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <p className="text-muted-foreground">{t('verifyAccessPrompt')}</p>
        </div>
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="container mx-auto px-4 md:px-6 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/3" />
          <div className="h-64 bg-muted rounded" />
        </div>
      </div>
    );
  }

  return (
    <>
      <TournamentHeaderStaff tournament={tournament} />
      <TournamentTabsStaff tournament={tournament} />
    </>
  );
}

