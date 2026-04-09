"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { login } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { LanguageSelector } from "@/components/language-selector";

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const t = useTranslations('auth.login');

  async function handleSubmit(formData: FormData) {
    setIsLoading(true);
    const result = await login(formData);
    if (result?.error) {
      toast.error(result.error);
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-secondary/20 to-background p-4">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent" />

      {/* Language Selector */}
      <div className="absolute top-4 right-4 z-10">
        <LanguageSelector />
      </div>

      <Card className="w-full max-w-md relative">
        <CardHeader className="space-y-1 text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <svg
              className="h-6 w-6 text-primary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <circle cx="12" cy="12" r="10" strokeWidth={2} />
              <path strokeWidth={2} d="M12 2a10 10 0 0 0 0 20M2 12h20" />
            </svg>
          </div>
          <CardTitle className="text-2xl font-bold">{t('title')}</CardTitle>
          <CardDescription>
            {t('subtitle')}
          </CardDescription>
        </CardHeader>
        <form action={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t('email')}</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder={t('emailPlaceholder')}
                required
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t('password')}</Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder={t('passwordPlaceholder')}
                required
                disabled={isLoading}
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4 pt-6">
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? t('submitting') : t('submit')}
            </Button>
            <p className="text-sm text-muted-foreground text-center">
              {t('noAccount')}{" "}
              <Link href="/signup" className="text-primary hover:underline font-medium">
                {t('signUp')}
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

