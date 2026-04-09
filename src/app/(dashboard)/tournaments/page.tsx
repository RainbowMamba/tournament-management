import Link from "next/link";
import { getTournaments, TournamentListItem } from "@/lib/actions/tournament";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Trophy, Users, Calendar, MapPin } from "lucide-react";
import { getTranslations } from "next-intl/server";

const statusColors: Record<TournamentListItem["status"], string> = {
  DRAFT: "bg-muted text-muted-foreground",
  ACTIVE: "bg-primary/10 text-primary",
  COMPLETED: "bg-secondary text-secondary-foreground",
};

export default async function TournamentsPage() {
  const tournaments = await getTournaments();
  const t = await getTranslations('tournaments');
  const tCommon = await getTranslations('common');

  const statusLabels: Record<TournamentListItem["status"], string> = {
    DRAFT: t('status.draft'),
    ACTIVE: t('status.active'),
    COMPLETED: t('status.completed'),
  };

  return (
    <div className="container mx-auto px-4 md:px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground mt-1">
            {t('subtitle')}
          </p>
        </div>
        <Link href="/tournaments/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            {t('newTournament')}
          </Button>
        </Link>
      </div>

      {tournaments.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Trophy className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">{t('empty.title')}</h3>
            <p className="text-muted-foreground text-center mb-6 max-w-sm">
              {t('empty.description')}
            </p>
            <Link href="/tournaments/new">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                {t('createTournament')}
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {tournaments.map((tournament) => (
            <Link key={tournament.id} href={`/tournaments/${tournament.id}`}>
              <Card className="h-full transition-all hover:shadow-md hover:border-primary/20">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="line-clamp-1">{tournament.name}</CardTitle>
                      {tournament.location && (
                        <CardDescription className="flex items-center gap-1 mt-1">
                          <MapPin className="h-3 w-3" />
                          {tournament.location}
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
                  <div className="mt-3 flex items-center gap-2">
                    {tournament.hasQualifying && (
                      <Badge variant="outline" className="text-xs">
                        {t('qualifying')}
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-xs">
                      {tournament._count.tournamentCourts} {tournament._count.tournamentCourts === 1 ? tCommon('court') : tCommon('courts')}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
