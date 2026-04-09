import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Trophy, ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";

export default async function TournamentNotFound() {
  const t = await getTranslations('tournaments');

  return (
    <div className="container py-8">
      <Link href="/tournaments">
        <Button variant="ghost" className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t('backToTournaments')}
        </Button>
      </Link>

      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Trophy className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-2xl font-bold mb-2">{t('notFound.title')}</h2>
          <p className="text-muted-foreground text-center mb-6 max-w-sm">
            {t('notFound.description')}
          </p>
          <Link href="/tournaments">
            <Button>{t('notFound.viewAll')}</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
