import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, Users, Eye, Settings, UserCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { LanguageSelector } from "@/components/language-selector";

export default async function HomePage() {
  const t = await getTranslations('home');

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-secondary/20 to-background p-4">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent" />

      {/* Language Selector */}
      <div className="absolute top-4 right-4 z-10">
        <LanguageSelector />
      </div>

      <div className="relative max-w-3xl w-full space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Trophy className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground text-lg max-w-md mx-auto">
            {t('subtitle')}
          </p>
        </div>

        {/* Role Selection Cards */}
        <div className="grid gap-6 md:grid-cols-3">
          {/* Manager Card */}
          <Link href="/login" className="block">
            <Card className="h-full transition-all hover:shadow-lg hover:border-primary/40 hover:scale-[1.02] cursor-pointer group">
              <CardHeader className="text-center pb-2">
                <div className="mx-auto h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors">
                  <Settings className="h-7 w-7 text-primary" />
                </div>
                <CardTitle className="text-xl">{t('manager.title')}</CardTitle>
                <CardDescription>
                  {t('manager.description')}
                </CardDescription>
              </CardHeader>
              <CardContent className="text-center">
                <ul className="text-sm text-muted-foreground space-y-2">
                  <li className="flex items-center justify-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    {t('manager.feature1')}
                  </li>
                  <li className="flex items-center justify-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    {t('manager.feature2')}
                  </li>
                  <li className="flex items-center justify-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    {t('manager.feature3')}
                  </li>
                </ul>
              </CardContent>
            </Card>
          </Link>

          {/* Guest Card */}
          <Link href="/guest/tournaments" className="block">
            <Card className="h-full transition-all hover:shadow-lg hover:border-primary/40 hover:scale-[1.02] cursor-pointer group">
              <CardHeader className="text-center pb-2">
                <div className="mx-auto h-14 w-14 rounded-full bg-secondary flex items-center justify-center mb-3 group-hover:bg-secondary/80 transition-colors">
                  <Eye className="h-7 w-7 text-foreground" />
                </div>
                <CardTitle className="text-xl">{t('guest.title')}</CardTitle>
                <CardDescription>
                  {t('guest.description')}
                </CardDescription>
              </CardHeader>
              <CardContent className="text-center">
                <ul className="text-sm text-muted-foreground space-y-2">
                  <li className="flex items-center justify-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                    {t('guest.feature1')}
                  </li>
                  <li className="flex items-center justify-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                    {t('guest.feature2')}
                  </li>
                  <li className="flex items-center justify-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                    {t('guest.feature3')}
                  </li>
                </ul>
              </CardContent>
            </Card>
          </Link>

          {/* Staff Card */}
          <Link href="/staff/tournaments" className="block">
            <Card className="h-full transition-all hover:shadow-lg hover:border-primary/40 hover:scale-[1.02] cursor-pointer group">
              <CardHeader className="text-center pb-2">
                <div className="mx-auto h-14 w-14 rounded-full bg-primary/20 flex items-center justify-center mb-3 group-hover:bg-primary/30 transition-colors">
                  <UserCheck className="h-7 w-7 text-primary" />
                </div>
                <CardTitle className="text-xl">{t('staff.title')}</CardTitle>
                <CardDescription>
                  {t('staff.description')}
                </CardDescription>
              </CardHeader>
              <CardContent className="text-center">
                <ul className="text-sm text-muted-foreground space-y-2">
                  <li className="flex items-center justify-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    {t('staff.feature1')}
                  </li>
                  <li className="flex items-center justify-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    {t('staff.feature2')}
                  </li>
                  <li className="flex items-center justify-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    {t('staff.feature3')}
                  </li>
                </ul>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-muted-foreground">
          <Users className="inline h-4 w-4 mr-1" />
          {t('footer')}
        </p>
      </div>
    </div>
  );
}
