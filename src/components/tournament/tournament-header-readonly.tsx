"use client";

import Link from "next/link";
import { format } from "date-fns";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, MapPin, Calendar, Users, Eye } from "lucide-react";

const statusColors = {
  DRAFT: "bg-muted text-muted-foreground",
  ACTIVE: "bg-primary/10 text-primary",
  COMPLETED: "bg-secondary text-secondary-foreground",
} as const;

type Props = {
  tournament: {
    id: string;
    name: string;
    location: string | null;
    startDate: Date | null;
    status: "DRAFT" | "ACTIVE" | "COMPLETED";
    hasQualifying: boolean;
    _count?: {
      teams: number;
      matches: number;
    };
    teams?: Array<{ id: string }>;
    matches?: Array<{ id: string }>;
  };
  backUrl?: string;
};

export function TournamentHeaderReadonly({ tournament, backUrl = "/guest/tournaments" }: Props) {
  const t = useTranslations('tournaments');
  const tCommon = useTranslations('common');

  const statusLabels = {
    DRAFT: t('status.draft'),
    ACTIVE: t('status.active'),
    COMPLETED: t('status.completed'),
  } as const;

  const teamCount = tournament._count?.teams ?? tournament.teams?.length ?? 0;
  const matchCount = tournament._count?.matches ?? tournament.matches?.length ?? 0;

  return (
    <div className="mb-8">
      <Link href={backUrl}>
        <Button variant="ghost" className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t('backToTournaments')}
        </Button>
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-bold tracking-tight">{tournament.name}</h1>
            <Badge className={statusColors[tournament.status]} variant="secondary">
              {statusLabels[tournament.status]}
            </Badge>
          </div>
          <div className="flex items-center gap-4 mt-2 text-muted-foreground flex-wrap">
            {tournament.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                {tournament.location}
              </span>
            )}
            {tournament.startDate && (
              <span className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {format(new Date(tournament.startDate), "MMM d, yyyy")}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              {teamCount} {tCommon('teams')}
            </span>
            {matchCount > 0 && (
              <span className="text-sm">
                {matchCount} {tCommon('matches')}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1.5 px-3 py-1.5">
            <Eye className="h-4 w-4" />
            {tCommon('viewOnly')}
          </Badge>
        </div>
      </div>
    </div>
  );
}
