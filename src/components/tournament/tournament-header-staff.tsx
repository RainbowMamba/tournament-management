import Link from "next/link";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, MapPin, Calendar, Users } from "lucide-react";

const statusColors = {
  DRAFT: "bg-muted text-muted-foreground",
  ACTIVE: "bg-primary/10 text-primary",
  COMPLETED: "bg-secondary text-secondary-foreground",
} as const;

const statusLabels = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  COMPLETED: "Completed",
} as const;

type Props = {
  tournament: {
    id: string;
    name: string;
    location: string | null;
    startDate: Date | null;
    status: "DRAFT" | "ACTIVE" | "COMPLETED";
    hasQualifying: boolean;
    teams: Array<{ id: string }>;
    matches: Array<{ id: string }>;
  };
};

export function TournamentHeaderStaff({ tournament }: Props) {
  const teamCount = tournament.teams?.length ?? 0;
  const matchCount = tournament.matches?.length ?? 0;

  return (
    <div className="mb-8">
      <Link href="/staff/tournaments">
        <Button variant="ghost" className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Tournaments
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
              {teamCount} teams
            </span>
            {matchCount > 0 && (
              <span className="text-sm">
                {matchCount} matches
              </span>
            )}
          </div>
        </div>

        <Badge variant="outline" className="gap-1.5 px-3 py-1.5">
          <Users className="h-4 w-4" />
          Staff Mode
        </Badge>
      </div>
    </div>
  );
}

