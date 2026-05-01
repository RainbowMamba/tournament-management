"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowLeft, MoreHorizontal, Play, Pause, CheckCircle, Trash2, MapPin, Calendar, Zap, Copy, Key, RefreshCw } from "lucide-react";
import { deleteTournament, updateTournamentStatus, generateStaffCode } from "@/lib/actions/tournament";
import { generateMatches, generateMainDraw } from "@/lib/actions/match";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useState } from "react";

const statusColors = {
  DRAFT: "bg-muted text-muted-foreground",
  ACTIVE: "bg-primary/10 text-primary",
  COMPLETED: "bg-secondary text-secondary-foreground",
} as const;

type Props = {
  tournament: {
    id: string;
    name: string;
    location: string | null;
    startDate: Date | null;
    status: "DRAFT" | "ACTIVE" | "COMPLETED";
    hasQualifying: boolean;
    staffCode: string | null;
    matches: Array<{ id: string; stageId: string }>;
    stages: Array<{ id: string; type: "QUALIFYING" | "MAIN" }>;
  };
};

export function TournamentHeader({ tournament }: Props) {
  const router = useRouter();
  const t = useTranslations('tournaments');
  const tHeader = useTranslations('tournaments.header');

  const [staffCode, setStaffCode] = useState<string | null>(tournament.staffCode);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showCodeDialog, setShowCodeDialog] = useState(false);

  const statusLabels = {
    DRAFT: t('status.draft'),
    ACTIVE: t('status.active'),
    COMPLETED: t('status.completed'),
  } as const;

  const qualifyingStage = tournament.stages.find((s) => s.type === "QUALIFYING");
  const mainStage = tournament.stages.find((s) => s.type === "MAIN");

  const hasQualifyingMatches = qualifyingStage
    ? tournament.matches.some((m) => m.stageId === qualifyingStage.id)
    : false;
  const hasMainMatches = mainStage
    ? tournament.matches.some((m) => m.stageId === mainStage.id)
    : false;

  const needsMatchGeneration = tournament.hasQualifying
    ? !hasQualifyingMatches
    : !hasMainMatches;

  const canGenerateMainDraw = tournament.hasQualifying && hasQualifyingMatches && !hasMainMatches;

  async function handleStatusChange(status: "DRAFT" | "ACTIVE" | "COMPLETED") {
    const result = await updateTournamentStatus(tournament.id, status);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(tHeader('statusUpdated', { status: statusLabels[status] }));
      router.refresh();
    }
  }

  async function handleDelete() {
    if (!confirm(tHeader('deleteConfirm'))) return;

    const result = await deleteTournament(tournament.id);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(tHeader('deleted'));
      router.push("/tournaments");
    }
  }

  async function handleGenerateMatches() {
    const result = await generateMatches(tournament.id);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(tHeader('matchesGenerated'));
      router.refresh();
    }
  }

  async function handleGenerateMainDraw() {
    const result = await generateMainDraw(tournament.id);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(tHeader('mainDrawGenerated'));
      router.refresh();
    }
  }

  async function handleGenerateStaffCode() {
    setIsGenerating(true);
    const result = await generateStaffCode(tournament.id);
    setIsGenerating(false);

    if (result.error) {
      toast.error(result.error);
    } else if (result.code) {
      setStaffCode(result.code);
      setShowCodeDialog(true);
      toast.success(tHeader('codeGeneratedSuccess'));
    }
  }

  function handleCopyCode() {
    if (staffCode) {
      navigator.clipboard.writeText(staffCode);
      toast.success(tHeader('codeCopied'));
    }
  }

  return (
    <div className="mb-8">
      <Link href="/tournaments">
        <Button variant="ghost" className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t('backToTournaments')}
        </Button>
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{tournament.name}</h1>
            <Badge className={statusColors[tournament.status]} variant="secondary">
              {statusLabels[tournament.status]}
            </Badge>
          </div>
          <div className="flex items-center gap-4 mt-2 text-muted-foreground">
            {tournament.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                {tournament.location}
              </span>
            )}
            {tournament.startDate && (
              <span className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {format(new Date(tournament.startDate), "MMM d, yyyy")}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {needsMatchGeneration && (
            <Button onClick={handleGenerateMatches}>
              <Zap className="mr-2 h-4 w-4" />
              {tHeader('generateMatches')}
            </Button>
          )}

          {canGenerateMainDraw && (
            <Button onClick={handleGenerateMainDraw} variant="secondary">
              <Zap className="mr-2 h-4 w-4" />
              {tHeader('generateMainDraw')}
            </Button>
          )}

          {tournament.status === "DRAFT" && (
            <Button
              onClick={() => handleStatusChange("ACTIVE")}
              size="lg"
              className="shadow-md"
            >
              <Play className="mr-2 h-4 w-4 fill-current" />
              {tHeader('startTournament')}
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {tournament.status === "ACTIVE" && (
                <>
                  <DropdownMenuItem onClick={() => handleStatusChange("COMPLETED")}>
                    <CheckCircle className="mr-2 h-4 w-4" />
                    {tHeader('completeTournament')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleStatusChange("DRAFT")}>
                    <Pause className="mr-2 h-4 w-4" />
                    {tHeader('backToDraft')}
                  </DropdownMenuItem>
                </>
              )}
              {tournament.status === "COMPLETED" && (
                <DropdownMenuItem onClick={() => handleStatusChange("ACTIVE")}>
                  <Play className="mr-2 h-4 w-4" />
                  {tHeader('reopenTournament')}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {tHeader('deleteTournament')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Staff Access Section */}
      <div className="mt-6 p-4 border rounded-lg bg-muted/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Key className="h-4 w-4 text-muted-foreground" />
            <div>
              <h3 className="font-semibold text-sm">{tHeader('staffCode')}</h3>
              <p className="text-xs text-muted-foreground">
                {tHeader('staffCodeDescription')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {staffCode ? (
              <>
                <div className="flex items-center gap-2 px-3 py-2 bg-background border rounded-md">
                  <code className="text-sm font-mono font-semibold">{staffCode}</code>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={handleCopyCode}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateStaffCode}
                  disabled={isGenerating}
                >
                  <RefreshCw className={`mr-2 h-3 w-3 ${isGenerating ? "animate-spin" : ""}`} />
                  {tHeader('regenerate')}
                </Button>
              </>
            ) : (
              <Button
                variant="default"
                size="sm"
                onClick={handleGenerateStaffCode}
                disabled={isGenerating}
              >
                <Key className="mr-2 h-3 w-3" />
                {isGenerating ? tHeader('generating') : tHeader('generateCode')}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Code Display Dialog */}
      <Dialog open={showCodeDialog} onOpenChange={setShowCodeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tHeader('codeGenerated')}</DialogTitle>
            <DialogDescription>
              {tHeader('codeGeneratedDescription')}
            </DialogDescription>
          </DialogHeader>
          {staffCode && (
            <div className="py-4">
              <div className="flex items-center justify-center gap-2 p-4 bg-muted rounded-lg">
                <code className="text-2xl font-mono font-bold">{staffCode}</code>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleCopyCode}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground text-center mt-2">
                {tHeader('staffAccessUrl')} /staff/tournaments/{tournament.id}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
