"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Trophy, Minus, Plus, AlertTriangle } from "lucide-react";
import { correctMatchResult, type AffectedMatchPreview } from "@/lib/actions/match-correction";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type EditableMatch = {
  id: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeScore: number | null;
  awayScore: number | null;
  scoreDetails: string | null;
  homeTeam: { id: string; name: string } | null;
  awayTeam: { id: string; name: string } | null;
  winnerTeam: { id: string; name: string } | null;
};

type Props = {
  match: EditableMatch;
  matchLabel: string;
  onClose: () => void;
  onSuccess: (cascadedCount: number) => void;
};

// Caller is expected to mount this with `key={match.id}` and unmount when closing —
// that way each open starts with fresh state initialized from the match.
export function EditMatchResultDialog({ match, matchLabel, onClose, onSuccess }: Props) {
  const [homeScore, setHomeScore] = useState<number>(match.homeScore ?? 0);
  const [awayScore, setAwayScore] = useState<number>(match.awayScore ?? 0);
  const [scoreDetails, setScoreDetails] = useState<string>(match.scoreDetails ?? "");
  const [reason, setReason] = useState<string>("");
  const [cascadePreview, setCascadePreview] = useState<AffectedMatchPreview[] | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function determineWinner(): string | null {
    if (homeScore > awayScore && match.homeTeamId) return match.homeTeamId;
    if (awayScore > homeScore && match.awayTeamId) return match.awayTeamId;
    return null;
  }

  async function submit(confirmCascade: boolean) {
    const winner = determineWinner();
    if (!winner) {
      toast.error("Scores must differ to determine a winner");
      return;
    }
    if (!reason.trim()) {
      toast.error("Reason is required");
      return;
    }

    setIsSubmitting(true);
    const result = await correctMatchResult(
      match.id,
      {
        winnerTeamId: winner,
        homeScore,
        awayScore,
        scoreDetails: scoreDetails || undefined,
      },
      reason.trim(),
      confirmCascade
    );
    setIsSubmitting(false);

    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    if ("needsConfirmation" in result) {
      setCascadePreview(result.affectedMatches);
      return;
    }
    onSuccess(result.cascadedMatchCount);
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden max-h-[90vh] overflow-y-auto">
        <DialogHeader className="sr-only">
          <DialogTitle>Edit Match Result</DialogTitle>
          <DialogDescription>Correct an incorrectly entered match result</DialogDescription>
        </DialogHeader>
        {cascadePreview === null && (
          <>
            <div className="bg-foreground text-background px-6 pt-6 pb-5">
              <div className="text-center mb-4">
                <p className="text-xs uppercase tracking-widest text-background/50 font-medium">
                  Edit · {matchLabel}
                </p>
              </div>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <div className="text-center space-y-3">
                  <p className={cn(
                    "font-semibold text-sm truncate px-1 transition-colors",
                    homeScore > awayScore ? "text-background" : "text-background/60"
                  )}>
                    {match.homeTeam?.name}
                  </p>
                  <button
                    type="button"
                    className={cn(
                      "text-5xl font-bold tabular-nums leading-none transition-colors cursor-pointer hover:text-primary",
                      homeScore > awayScore ? "text-background" : "text-background/40"
                    )}
                    onClick={() => setHomeScore(homeScore + 1)}
                    disabled={isSubmitting}
                  >
                    {homeScore}
                  </button>
                  <div className="flex items-center justify-center gap-1">
                    <Button type="button" variant="ghost" size="icon"
                      className="h-7 w-7 rounded-full text-background/40 hover:text-background hover:bg-background/10"
                      onClick={() => setHomeScore(Math.max(0, homeScore - 1))}
                      disabled={isSubmitting}>
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon"
                      className="h-7 w-7 rounded-full text-background/40 hover:text-background hover:bg-background/10"
                      onClick={() => setHomeScore(homeScore + 1)}
                      disabled={isSubmitting}>
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="flex flex-col items-center gap-1 pt-1">
                  <span className="text-background/20 text-lg font-light">:</span>
                </div>
                <div className="text-center space-y-3">
                  <p className={cn(
                    "font-semibold text-sm truncate px-1 transition-colors",
                    awayScore > homeScore ? "text-background" : "text-background/60"
                  )}>
                    {match.awayTeam?.name}
                  </p>
                  <button
                    type="button"
                    className={cn(
                      "text-5xl font-bold tabular-nums leading-none transition-colors cursor-pointer hover:text-primary",
                      awayScore > homeScore ? "text-background" : "text-background/40"
                    )}
                    onClick={() => setAwayScore(awayScore + 1)}
                    disabled={isSubmitting}
                  >
                    {awayScore}
                  </button>
                  <div className="flex items-center justify-center gap-1">
                    <Button type="button" variant="ghost" size="icon"
                      className="h-7 w-7 rounded-full text-background/40 hover:text-background hover:bg-background/10"
                      onClick={() => setAwayScore(Math.max(0, awayScore - 1))}
                      disabled={isSubmitting}>
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon"
                      className="h-7 w-7 rounded-full text-background/40 hover:text-background hover:bg-background/10"
                      onClick={() => setAwayScore(awayScore + 1)}
                      disabled={isSubmitting}>
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
              <div className="h-6 mt-3 text-center">
                {determineWinner() && (
                  <p className="text-xs text-background/50 flex items-center justify-center gap-1.5">
                    <Trophy className="h-3 w-3" />
                    {homeScore > awayScore ? match.homeTeam?.name : match.awayTeam?.name} wins
                  </p>
                )}
              </div>
              <div className="text-center text-xs text-background/40 mt-2">
                Original: {match.homeScore ?? "-"} : {match.awayScore ?? "-"}
                {match.winnerTeam && <> · Winner was {match.winnerTeam.name}</>}
              </div>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="editScoreDetails" className="text-xs text-muted-foreground">
                  Score Details (optional)
                </Label>
                <Input
                  id="editScoreDetails"
                  placeholder="e.g., 6-4, 7-5"
                  value={scoreDetails}
                  onChange={(e) => setScoreDetails(e.target.value)}
                  disabled={isSubmitting}
                  className="h-10"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editReason" className="text-xs">
                  Reason for correction <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="editReason"
                  placeholder="e.g., scorer mistakenly recorded wrong winner"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={isSubmitting}
                  className="h-10"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Button
                  className="w-full h-11 font-semibold"
                  onClick={() => submit(false)}
                  disabled={isSubmitting || !determineWinner() || !reason.trim()}
                >
                  {isSubmitting ? "Checking..." : "Save Correction"}
                </Button>
                <Button
                  variant="ghost"
                  className="w-full h-10 text-muted-foreground"
                  onClick={onClose}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </>
        )}
        {cascadePreview !== null && (
          <div className="px-6 py-5 space-y-4">
            <div className="flex items-start gap-3 p-3 rounded-md bg-amber-50 border border-amber-200 text-amber-900">
              <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold mb-1">
                  {cascadePreview.length} downstream match{cascadePreview.length === 1 ? "" : "es"} will be affected
                </p>
                <p className="text-xs text-amber-800">
                  Matches that already played will be reset to PENDING. Their scores will be cleared and they must be re-played.
                </p>
              </div>
            </div>
            <div className="space-y-1.5 max-h-64 overflow-y-auto border rounded-md p-2">
              {cascadePreview.map((m) => (
                <div key={m.id} className="flex items-center gap-2 text-xs p-2 bg-secondary/30 rounded">
                  <Badge variant={m.willReset ? "destructive" : "outline"} className="text-[10px] shrink-0">
                    {m.willReset ? "RESET" : "CLEAR"}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {m.stageType === "QUALIFYING" ? "Q" : "M"} R{m.round} #{m.matchNumber}
                  </Badge>
                  <div className="truncate flex-1">
                    <span>{m.homeTeamName ?? "TBD"}</span>
                    <span className="text-muted-foreground mx-1">vs</span>
                    <span>{m.awayTeamName ?? "TBD"}</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0">{m.status}</Badge>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <Button
                variant="destructive"
                className="w-full h-11 font-semibold"
                onClick={() => submit(true)}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Applying..." : `Confirm — Reset ${cascadePreview.length} match${cascadePreview.length === 1 ? "" : "es"}`}
              </Button>
              <Button
                variant="ghost"
                className="w-full h-10"
                onClick={() => setCascadePreview(null)}
                disabled={isSubmitting}
              >
                Back
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
