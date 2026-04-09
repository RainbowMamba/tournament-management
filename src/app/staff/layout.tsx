import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, Home, Trophy } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { LanguageSelector } from "@/components/language-selector";

export default async function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getTranslations('staff');
  const tCommon = await getTranslations('common');

  return (
    <div className="min-h-screen bg-background">
      {/* Staff Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 md:px-6 flex h-14 items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/staff/tournaments" className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-primary" />
              <span className="font-semibold hidden sm:inline">{tCommon('appName')}</span>
            </Link>
            <Badge variant="secondary" className="gap-1">
              <Users className="h-3 w-3" />
              {t('mode')}
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            <LanguageSelector />
            <Link href="/">
              <Button variant="outline" size="sm" className="gap-2">
                <Home className="h-4 w-4" />
                <span className="hidden sm:inline">{t('backHome')}</span>
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main>{children}</main>
    </div>
  );
}

