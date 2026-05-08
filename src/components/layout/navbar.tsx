"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Trophy, LogOut, User, LayoutGrid, Home } from "lucide-react";
import { cn } from "@/lib/utils";
import { LanguageSelector } from "@/components/language-selector";
import { toast } from "sonner";

const LOGO_CLICK_KEY = "logo-click-streak";
const LOGO_CLICK_WINDOW_MS = 2000;
const LOGO_CLICK_THRESHOLD = 5;

function handleLogoClick() {
  const now = Date.now();
  const stored = sessionStorage.getItem(LOGO_CLICK_KEY);
  let count = 1;
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as { count: number; ts: number };
      if (now - parsed.ts < LOGO_CLICK_WINDOW_MS) {
        count = parsed.count + 1;
      }
    } catch {}
  }
  if (count >= LOGO_CLICK_THRESHOLD) {
    toast("2025 테니스부 주장단 포에버 🎾");
    sessionStorage.removeItem(LOGO_CLICK_KEY);
    return;
  }
  sessionStorage.setItem(LOGO_CLICK_KEY, JSON.stringify({ count, ts: now }));
}

export function Navbar() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const t = useTranslations('navbar');
  const tCommon = useTranslations('common');

  const initials = session?.user?.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase() || session?.user?.email?.[0]?.toUpperCase() || "U";

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 md:px-6 flex h-16 items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/tournaments" className="flex items-center gap-2" onClick={handleLogoClick}>
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <Trophy className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg hidden sm:inline-block">
              {tCommon('appName')}
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            <Link
              href="/tournaments"
              className={cn(
                "px-3 py-2 text-sm font-medium rounded-md transition-colors",
                pathname === "/tournaments" || pathname.startsWith("/tournaments/")
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
              )}
            >
              {t('tournaments')}
            </Link>
            <Link
              href="/courts"
              className={cn(
                "px-3 py-2 text-sm font-medium rounded-md transition-colors",
                pathname === "/courts"
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
              )}
            >
              {t('venues')}
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <LanguageSelector />
          <Link href="/">
            <Button variant="outline" size="sm" className="gap-2">
              <Home className="h-4 w-4" />
              <span className="hidden sm:inline">{t('home')}</span>
            </Button>
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <div className="flex items-center justify-start gap-2 p-2">
                <div className="flex flex-col space-y-1 leading-none">
                  {session?.user?.name && (
                    <p className="font-medium">{session.user.name}</p>
                  )}
                  {session?.user?.email && (
                    <p className="w-[200px] truncate text-sm text-muted-foreground">
                      {session.user.email}
                    </p>
                  )}
                </div>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="cursor-pointer text-destructive focus:text-destructive"
                onSelect={() => signOut({ callbackUrl: "/login" })}
              >
                <LogOut className="mr-2 h-4 w-4" />
                {tCommon('signOut')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

