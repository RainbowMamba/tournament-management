"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { generateInitialCourtSchedule } from "@/lib/actions/schedule";
import type {
  QualifyingCourtStrategy,
  QualifyingTimeStrategy,
} from "@/lib/tournament/schedule";

type Venue = {
  id: string;
  name: string;
  numCourts: number;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tournamentId: string;
  venues: Venue[];
  hasQualifying: boolean;
  hasMain: boolean;
};

function defaultStartTime(): string {
  // Round up to next hour, format as YYYY-MM-DDTHH:mm for datetime-local
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AutoScheduleDialog({
  open,
  onOpenChange,
  tournamentId,
  venues,
  hasQualifying,
  hasMain,
}: Props) {
  const t = useTranslations("courtView.autoSchedule");
  const tCommon = useTranslations("common");
  const router = useRouter();

  const [qualifyingStart, setQualifyingStart] = useState<string>(defaultStartTime);
  const [mainStart, setMainStart] = useState<string>(defaultStartTime);
  const [mainAfterQualifying, setMainAfterQualifying] = useState<boolean>(true);
  const [qualifyingDuration, setQualifyingDuration] = useState<number>(30);
  const [mainDuration, setMainDuration] = useState<number>(45);
  const [courtStrategy, setCourtStrategy] = useState<QualifyingCourtStrategy>("any");
  const [timeStrategy, setTimeStrategy] = useState<QualifyingTimeStrategy>("any");

  // Per-venue court range selection (1..numCourts by default)
  const [courtRanges, setCourtRanges] = useState<Record<string, { from: number; to: number }>>(
    () =>
      Object.fromEntries(
        venues.map((v) => [v.id, { from: 1, to: v.numCourts }]),
      ),
  );

  const [submitting, setSubmitting] = useState(false);

  const selectedCourts = useMemo(() => {
    const out: { courtId: string; courtNumber: number }[] = [];
    for (const venue of venues) {
      const range = courtRanges[venue.id];
      if (!range) continue;
      const from = Math.max(1, Math.min(range.from, venue.numCourts));
      const to = Math.max(from, Math.min(range.to, venue.numCourts));
      for (let n = from; n <= to; n++) {
        out.push({ courtId: venue.id, courtNumber: n });
      }
    }
    return out;
  }, [courtRanges, venues]);

  async function handleSubmit() {
    if (selectedCourts.length === 0) {
      toast.error(t("noCourtsSelected"));
      return;
    }
    if (qualifyingDuration <= 0 || mainDuration <= 0) {
      toast.error(t("invalidDuration"));
      return;
    }

    setSubmitting(true);
    const result = await generateInitialCourtSchedule({
      tournamentId,
      qualifyingStartTime: hasQualifying ? qualifyingStart : null,
      qualifyingDurationMin: qualifyingDuration,
      mainStartTime: hasMain && !mainAfterQualifying ? mainStart : null,
      mainDurationMin: mainDuration,
      selectedCourts,
      qualifyingOptions: hasQualifying
        ? { courtStrategy, timeStrategy }
        : undefined,
    });
    setSubmitting(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success(t("successToast", { count: result.scheduledCount ?? 0 }));
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-5">
          {hasQualifying && (
            <div className="space-y-2">
              <Label htmlFor="qualifyingStart">{t("qualifyingStart")}</Label>
              <Input
                id="qualifyingStart"
                type="datetime-local"
                value={qualifyingStart}
                onChange={(e) => setQualifyingStart(e.target.value)}
              />
            </div>
          )}

          {hasQualifying && (
            <div className="space-y-2">
              <Label htmlFor="qualifyingDuration">{t("qualifyingDuration")}</Label>
              <Input
                id="qualifyingDuration"
                type="number"
                min={1}
                value={qualifyingDuration}
                onChange={(e) => setQualifyingDuration(parseInt(e.target.value) || 0)}
              />
            </div>
          )}

          {hasQualifying && (
            <div className="space-y-2">
              <Label htmlFor="courtStrategy">{t("courtStrategyLabel")}</Label>
              <Select
                value={courtStrategy}
                onValueChange={(v) => setCourtStrategy(v as QualifyingCourtStrategy)}
              >
                <SelectTrigger id="courtStrategy">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">{t("courtStrategy.any")}</SelectItem>
                  <SelectItem value="group-stick">{t("courtStrategy.groupStick")}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {courtStrategy === "group-stick"
                  ? t("courtStrategy.groupStickHint")
                  : t("courtStrategy.anyHint")}
              </p>
            </div>
          )}

          {hasQualifying && (
            <div className="space-y-2">
              <Label htmlFor="timeStrategy">{t("timeStrategyLabel")}</Label>
              <Select
                value={timeStrategy}
                onValueChange={(v) => setTimeStrategy(v as QualifyingTimeStrategy)}
              >
                <SelectTrigger id="timeStrategy">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">{t("timeStrategy.any")}</SelectItem>
                  <SelectItem value="consecutive">{t("timeStrategy.consecutive")}</SelectItem>
                  <SelectItem value="distributed">{t("timeStrategy.distributed")}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {timeStrategy === "consecutive"
                  ? t("timeStrategy.consecutiveHint")
                  : timeStrategy === "distributed"
                    ? t("timeStrategy.distributedHint")
                    : t("timeStrategy.anyHint")}
              </p>
            </div>
          )}

          {hasMain && hasQualifying && (
            <div className="flex items-center justify-between">
              <Label htmlFor="mainAfterQualifying" className="cursor-pointer">
                {t("mainAfterQualifying")}
              </Label>
              <Switch
                id="mainAfterQualifying"
                checked={mainAfterQualifying}
                onCheckedChange={setMainAfterQualifying}
              />
            </div>
          )}

          {hasMain && (!hasQualifying || !mainAfterQualifying) && (
            <div className="space-y-2">
              <Label htmlFor="mainStart">{t("mainStart")}</Label>
              <Input
                id="mainStart"
                type="datetime-local"
                value={mainStart}
                onChange={(e) => setMainStart(e.target.value)}
              />
            </div>
          )}

          {hasMain && (
            <div className="space-y-2">
              <Label htmlFor="mainDuration">{t("mainDuration")}</Label>
              <Input
                id="mainDuration"
                type="number"
                min={1}
                value={mainDuration}
                onChange={(e) => setMainDuration(parseInt(e.target.value) || 0)}
              />
            </div>
          )}

          <div className="space-y-3">
            <Label>{t("courtsToUse")}</Label>
            <div className="space-y-3">
              {venues.map((venue) => {
                const range = courtRanges[venue.id] || { from: 1, to: venue.numCourts };
                return (
                  <div key={venue.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{venue.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {t("totalCourts", { count: venue.numCourts })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        max={venue.numCourts}
                        value={range.from}
                        onChange={(e) =>
                          setCourtRanges((prev) => ({
                            ...prev,
                            [venue.id]: {
                              ...range,
                              from: Math.max(1, Math.min(parseInt(e.target.value) || 1, venue.numCourts)),
                            },
                          }))
                        }
                        className="w-20"
                      />
                      <span className="text-muted-foreground">~</span>
                      <Input
                        type="number"
                        min={range.from}
                        max={venue.numCourts}
                        value={range.to}
                        onChange={(e) =>
                          setCourtRanges((prev) => ({
                            ...prev,
                            [venue.id]: {
                              ...range,
                              to: Math.max(range.from, Math.min(parseInt(e.target.value) || range.from, venue.numCourts)),
                            },
                          }))
                        }
                        className="w-20"
                      />
                      <span className="text-xs text-muted-foreground">
                        {t("rangeHelper", { count: Math.max(0, range.to - range.from + 1) })}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("totalSelected", { count: selectedCourts.length })}
            </p>
          </div>

          <p className="text-xs text-muted-foreground border-t pt-3">{t("overwriteWarning")}</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {tCommon("cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || selectedCourts.length === 0}>
            {submitting ? t("generating") : t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
