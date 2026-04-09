"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X, Loader2 } from "lucide-react";

type Props = {
  initialSearch?: string;
};

export function StaffTournamentSearch({ initialSearch }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [searchValue, setSearchValue] = useState(initialSearch || "");
  const t = useTranslations('staff');
  const tCommon = useTranslations('common');

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams(searchParams);

    if (searchValue.trim()) {
      params.set("search", searchValue.trim());
    } else {
      params.delete("search");
    }

    startTransition(() => {
      router.push(`/staff/tournaments?${params.toString()}`);
    });
  }

  function handleClear() {
    setSearchValue("");
    startTransition(() => {
      router.push("/staff/tournaments");
    });
  }

  return (
    <form onSubmit={handleSearch} className="flex gap-2 max-w-md">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder={t('searchPlaceholder')}
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          className="pl-10 pr-10"
          disabled={isPending}
        />
        {searchValue && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            disabled={isPending}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          tCommon('search')
        )}
      </Button>
    </form>
  );
}
