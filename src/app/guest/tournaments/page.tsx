import Link from "next/link";
import { getPublicTournaments } from "@/lib/actions/tournament";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, Users, Calendar, MapPin, Search } from "lucide-react";
import { GuestTournamentSearch } from "./search";
import { getTranslations } from "next-intl/server";

const statusColors = {
  DRAFT: "bg-muted text-muted-foreground",
  ACTIVE: "bg-primary/10 text-primary",
  COMPLETED: "bg-secondary text-secondary-foreground",
} as const;

type Props = {
  searchParams: Promise<{ search?: string }>;
};

export default async function GuestTournamentsPage({ searchParams }: Props) {
  const { search } = await searchParams;
  const tournaments = await getPublicTournaments(search);
  const t = await getTranslations('guest');
  const tCommon = await getTranslations('common');
  const tTournaments = await getTranslations('tournaments');

  const statusLabels = {
    DRAFT: tTournaments('status.draft'),
    ACTIVE: tTournaments('status.active'),
    COMPLETED: tTournaments('status.completed'),
  } as const;

  return (
    <div className="container mx-auto px-4 md:px-6 py-8">
      <div className="flex flex-col gap-6 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground mt-1">
            {t('subtitle')}
          </p>
        </div>

        {/* Search */}
        <GuestTournamentSearch initialSearch={search} />
      </div>

      {tournaments.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
              {search ? (
                <Search className="h-8 w-8 text-muted-foreground" />
              ) : (
                <Trophy className="h-8 w-8 text-muted-foreground" />
              )}
            </div>
            <h3 className="text-lg font-semibold mb-2">
              {search ? t('noTournamentsSearch') : t('noTournaments')}
            </h3>
            <p className="text-muted-foreground text-center max-w-sm">
              {search
                ? t('noMatchSearch', { search })
                : t('noTournamentsText')
              }
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {search && (
            <p className="text-sm text-muted-foreground mb-4">
              {t('foundCount', { count: tournaments.length, search })}
            </p>
          )}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {tournaments.map((tournament) => (
              <Link key={tournament.id} href={`/guest/tournaments/${tournament.id}`}>
                <Card className="h-full transition-all hover:shadow-md hover:border-primary/20">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <CardTitle className="line-clamp-1">{tournament.name}</CardTitle>
                        {tournament.location && (
                          <CardDescription className="flex items-center gap-1 mt-1">
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span className="truncate">{tournament.location}</span>
                          </CardDescription>
                        )}
                      </div>
                      <Badge className={statusColors[tournament.status]} variant="secondary">
                        {statusLabels[tournament.status]}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Users className="h-4 w-4" />
                        {tournament._count.teams} {tCommon('teams')}
                      </div>
                      {tournament.startDate && (
                        <div className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          {new Date(tournament.startDate).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      {tournament.hasQualifying && (
                        <Badge variant="outline" className="text-xs">
                          {tTournaments('qualifying')}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs">
                        {tournament._count.tournamentCourts} {tournament._count.tournamentCourts === 1 ? tCommon('court') : tCommon('courts')}
                      </Badge>
                      {tournament._count.matches > 0 && (
                        <Badge variant="outline" className="text-xs">
                          {tournament._count.matches} {tCommon('matches')}
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
