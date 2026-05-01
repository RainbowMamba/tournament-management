"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Download, AlertCircle, GripVertical } from "lucide-react";
import { toPng } from "html-to-image";
import { toast } from "sonner";
import { swapOrMoveScheduledMatch } from "@/lib/actions/schedule";
import { cn } from "@/lib/utils";

type Venue = {
  id: string;
  name: string;
  numCourts: number;
};

type ScheduledMatch = {
  id: string;
  scheduledAt: string;
  courtId: string;
  courtNumber: number;
  status: "PENDING" | "ON_COURT" | "COMPLETED";
  stageType: "QUALIFYING" | "MAIN";
  round: number;
  matchNumber: number;
  mainLabel: string | null;
  qualifyingGroupName: string | null;
  qualifyingIndexInGroup: number | null;
  homeTeamName: string | null;
  awayTeamName: string | null;
  homePlaceholder: { groupName: string; rank: number } | null;
  awayPlaceholder: { groupName: string; rank: number } | null;
  homeWinnerOfLabel: string | null;
  awayWinnerOfLabel: string | null;
};

type Props = {
  tournamentId: string;
  tournamentName: string;
  venues: Venue[];
  scheduledMatches: ScheduledMatch[];
  readonly?: boolean;
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function teamLabel(
  name: string | null,
  placeholder: { groupName: string; rank: number } | null,
  winnerOfLabel: string | null,
  formatWinnerOf: (label: string) => string,
  tbdLabel: string,
): string {
  if (name) return name;
  if (placeholder) {
    const suffix = placeholder.rank === 1 ? "1st" : placeholder.rank === 2 ? "2nd" : `${placeholder.rank}th`;
    return `${suffix} of ${placeholder.groupName}`;
  }
  if (winnerOfLabel) return formatWinnerOf(winnerOfLabel);
  return tbdLabel;
}

function getCellLabel(
  match: ScheduledMatch,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  if (match.stageType === "MAIN") {
    return match.mainLabel ?? `R${match.round} #${match.matchNumber}`;
  }
  if (match.qualifyingGroupName && match.qualifyingIndexInGroup) {
    return t("groupMatchLabel", {
      group: match.qualifyingGroupName,
      index: match.qualifyingIndexInGroup,
    });
  }
  return `Q #${match.matchNumber}`;
}

function MatchCellContent({
  match,
  t,
  tCommon,
  showHandle,
}: {
  match: ScheduledMatch;
  t: ReturnType<typeof useTranslations>;
  tCommon: ReturnType<typeof useTranslations>;
  showHandle?: boolean;
}) {
  const formatWinnerOf = (label: string) => t("winnerOf", { label });
  const home = teamLabel(
    match.homeTeamName,
    match.homePlaceholder,
    match.homeWinnerOfLabel,
    formatWinnerOf,
    tCommon("tbd"),
  );
  const away = teamLabel(
    match.awayTeamName,
    match.awayPlaceholder,
    match.awayWinnerOfLabel,
    formatWinnerOf,
    tCommon("tbd"),
  );
  const cellLabel = getCellLabel(match, t);
  return (
    <>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-muted-foreground font-medium">{cellLabel}</span>
        {showHandle && (
          <GripVertical className="h-3 w-3 text-muted-foreground/50" />
        )}
      </div>
      <div className="font-medium">{home}</div>
      <div className="text-xs text-muted-foreground">{tCommon("vs")}</div>
      <div className="font-medium">{away}</div>
    </>
  );
}

function DroppableCell({
  cellKey,
  match,
  isMain,
  isCompleted,
  isDragOrigin,
  children,
}: {
  cellKey: string;
  match: ScheduledMatch | null;
  isMain: boolean;
  isCompleted: boolean;
  isDragOrigin: boolean;
  children: React.ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `cell:${cellKey}` });
  return (
    <td
      ref={setNodeRef}
      className={cn(
        "border px-3 py-2 align-top transition-colors",
        match && "min-w-[180px]",
        match && isCompleted && "bg-muted/40 text-muted-foreground",
        match && !isCompleted && isMain && "bg-primary/5",
        match && !isCompleted && !isMain && "bg-amber-500/5",
        !match && "text-center text-muted-foreground min-w-[120px]",
        isOver && !isDragOrigin && "ring-2 ring-primary/50 bg-primary/10",
        isDragOrigin && "opacity-30",
      )}
    >
      {children}
    </td>
  );
}

function DraggableMatchCell({
  match,
  children,
}: {
  match: ScheduledMatch;
  children: React.ReactNode;
}) {
  const isCompleted = match.status === "COMPLETED";
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `match:${match.id}`,
    data: { match },
    disabled: isCompleted,
  });
  return (
    <div
      ref={setNodeRef}
      {...(isCompleted ? {} : listeners)}
      {...attributes}
      suppressHydrationWarning
      className={cn(
        !isCompleted && "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-30",
      )}
    >
      {children}
    </div>
  );
}

export function TimelineView({ tournamentId, tournamentName, venues, scheduledMatches, readonly = false }: Props) {
  const t = useTranslations("courtView.timeline");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const tableRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [activeDragMatch, setActiveDragMatch] = useState<ScheduledMatch | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  // Build the court-by-time grid (courts on X axis, time on Y axis).
  const { timeSlots, courtCols, matchByCell } = useMemo(() => {
    const uniqueTimes = Array.from(
      new Set(scheduledMatches.map((m) => m.scheduledAt)),
    ).sort();

    const cols: { courtId: string; venueName: string; courtNumber: number }[] = [];
    for (const venue of venues) {
      for (let n = 1; n <= venue.numCourts; n++) {
        cols.push({ courtId: venue.id, venueName: venue.name, courtNumber: n });
      }
    }

    const cellMap = new Map<string, ScheduledMatch>();
    for (const m of scheduledMatches) {
      cellMap.set(`${m.courtId}:${m.courtNumber}:${m.scheduledAt}`, m);
    }

    return { timeSlots: uniqueTimes, courtCols: cols, matchByCell: cellMap };
  }, [scheduledMatches, venues]);

  const usedCourtCols = useMemo(() => {
    const used = new Set(scheduledMatches.map((m) => `${m.courtId}:${m.courtNumber}`));
    return courtCols.filter((c) => used.has(`${c.courtId}:${c.courtNumber}`));
  }, [courtCols, scheduledMatches]);

  function handleDragStart(event: DragStartEvent) {
    const match = event.active.data.current?.match as ScheduledMatch | undefined;
    if (match) setActiveDragMatch(match);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const dragged = activeDragMatch;
    setActiveDragMatch(null);
    if (!dragged || !event.over) return;

    const overId = String(event.over.id);
    if (!overId.startsWith("cell:")) return;
    const [courtId, courtNumberStr, ...timeParts] = overId.slice("cell:".length).split(":");
    const targetCourtNumber = parseInt(courtNumberStr, 10);
    const targetScheduledAt = timeParts.join(":");

    if (
      dragged.courtId === courtId &&
      dragged.courtNumber === targetCourtNumber &&
      dragged.scheduledAt === targetScheduledAt
    ) {
      return;
    }

    const result = await swapOrMoveScheduledMatch({
      matchId: dragged.id,
      targetCourtId: courtId,
      targetCourtNumber,
      targetScheduledAt,
    });

    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(result.swapped ? t("swapped") : t("moved"));
    router.refresh();
  }

  async function handleDownload() {
    if (!tableRef.current) return;
    setDownloading(true);
    try {
      const dataUrl = await toPng(tableRef.current, {
        backgroundColor: "#ffffff",
        pixelRatio: 2,
        cacheBust: true,
      });
      const link = document.createElement("a");
      link.download = `${tournamentName.replace(/[^a-zA-Z0-9-_]/g, "_")}_schedule.png`;
      link.href = dataUrl;
      link.click();
    } catch (e) {
      console.error(e);
      toast.error(t("downloadError"));
    } finally {
      setDownloading(false);
    }
  }

  // Always-visible notice that the schedule may change.
  const noticeBanner = (
    <Card className="border-amber-500/50 bg-amber-500/5">
      <CardContent className="flex items-start gap-3 py-4">
        <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-sm text-amber-900 dark:text-amber-100">{t("changeNotice")}</p>
      </CardContent>
    </Card>
  );

  if (scheduledMatches.length === 0) {
    return (
      <div className="space-y-4">
        {noticeBanner}
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <AlertCircle className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">{t("empty")}</h3>
            <p className="text-muted-foreground text-center max-w-sm">{t("emptyDescription")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Suppress tournamentId unused warning when needed (used by server action).
  void tournamentId;

  const renderCell = (col: { courtId: string; courtNumber: number }, time: string) => {
    const cellKey = `${col.courtId}:${col.courtNumber}:${time}`;
    const match = matchByCell.get(cellKey) ?? null;
    const isMain = match?.stageType === "MAIN";
    const isCompleted = match?.status === "COMPLETED";
    const isDragOrigin = !readonly && activeDragMatch?.id === match?.id && match !== null;

    if (readonly) {
      return (
        <td
          key={`${col.courtId}:${col.courtNumber}`}
          className={cn(
            "border px-3 py-2 align-top",
            match && "min-w-[180px]",
            match && isCompleted && "bg-muted/40 text-muted-foreground",
            match && !isCompleted && isMain && "bg-primary/5",
            match && !isCompleted && !isMain && "bg-amber-500/5",
            !match && "text-center text-muted-foreground min-w-[120px]",
          )}
        >
          {match ? (
            <MatchCellContent match={match} t={t} tCommon={tCommon} />
          ) : (
            <span>—</span>
          )}
        </td>
      );
    }

    return (
      <DroppableCell
        key={`${col.courtId}:${col.courtNumber}`}
        cellKey={cellKey}
        match={match}
        isMain={isMain}
        isCompleted={isCompleted}
        isDragOrigin={isDragOrigin}
      >
        {match ? (
          <DraggableMatchCell match={match}>
            <MatchCellContent
              match={match}
              t={t}
              tCommon={tCommon}
              showHandle={!isCompleted}
            />
          </DraggableMatchCell>
        ) : (
          <span>—</span>
        )}
      </DroppableCell>
    );
  };

  const content = (
    <div className="space-y-4">
      {noticeBanner}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{readonly ? "" : t("dragHint")}</p>
        <Button onClick={handleDownload} disabled={downloading}>
          <Download className="h-4 w-4 mr-2" />
          {downloading ? t("downloading") : t("downloadPng")}
        </Button>
      </div>

      <div ref={tableRef} className="overflow-x-auto bg-white p-6 rounded-lg border">
        <h2 className="text-xl font-bold mb-1">{tournamentName}</h2>
        <p className="text-sm text-muted-foreground mb-4">{t("captionTitle")}</p>
        <table className="border-collapse text-sm">
          <thead>
            <tr>
              <th className="border bg-secondary/40 px-3 py-2 text-left font-semibold sticky left-0 z-10">
                {t("timeHeader")}
              </th>
              {usedCourtCols.map((col) => (
                <th
                  key={`${col.courtId}:${col.courtNumber}`}
                  className="border bg-secondary/40 px-3 py-2 text-center font-semibold whitespace-nowrap"
                >
                  {col.venueName} #{col.courtNumber}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {timeSlots.map((time) => (
              <tr key={time}>
                <td className="border px-3 py-2 font-medium whitespace-nowrap bg-secondary/20 sticky left-0 z-10 text-center">
                  {formatTime(time)}
                </td>
                {usedCourtCols.map((col) => renderCell(col, time))}
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-amber-500/20 border border-amber-500/30" />
            {t("legendQualifying")}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-primary/10 border border-primary/30" />
            {t("legendMain")}
          </div>
        </div>
      </div>
    </div>
  );

  if (readonly) return content;

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      {content}
      <DragOverlay>
        {activeDragMatch ? (
          <div
            className={cn(
              "px-3 py-2 border rounded shadow-lg text-sm bg-background min-w-[180px]",
              activeDragMatch.stageType === "MAIN" ? "bg-primary/10" : "bg-amber-500/10",
            )}
          >
            <MatchCellContent match={activeDragMatch} t={t} tCommon={tCommon} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
