import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Trophy, ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";

export default async function GuestTournamentNotFound() {
  const t = await getTranslations('tournaments');

  return (
    <div className="container mx-auto px-4 md:px-6 py-8">
      <Card className="border-dashed max-w-md mx-auto">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Trophy className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">{t('notFound.guestTitle')}</h3>
          <p className="text-muted-foreground text-center mb-6 max-w-sm">
            {t('notFound.guestDescription')}
          </p>
          <Link href="/guest/tournaments">
            <Button>
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t('backToTournaments')}
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
