"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { getCourts, createCourt, updateCourt, deleteCourt, type CourtWithUsage } from "@/lib/actions/court";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { Plus, MoreHorizontal, Pencil, Trash2, LayoutGrid, MapPin, Trophy, Play, Loader2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

export default function CourtsPage() {
  const router = useRouter();
  const t = useTranslations('venues');
  const tCreate = useTranslations('tournaments.create.addVenue');
  const tCommon = useTranslations('common');

  const [courts, setCourts] = useState<CourtWithUsage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Dialog states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedCourt, setSelectedCourt] = useState<CourtWithUsage | null>(null);

  // Form states
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [numCourts, setNumCourts] = useState(1);

  useEffect(() => {
    loadCourts();
  }, []);

  async function loadCourts() {
    setIsLoading(true);
    const data = await getCourts();
    setCourts(data);
    setIsLoading(false);
  }

  function resetForm() {
    setName("");
    setLocation("");
    setNumCourts(1);
  }

  function openEditDialog(court: CourtWithUsage) {
    setSelectedCourt(court);
    setName(court.name);
    setLocation(court.location || "");
    setNumCourts(court.numCourts);
    setIsEditOpen(true);
  }

  function openDeleteDialog(court: CourtWithUsage) {
    setSelectedCourt(court);
    setIsDeleteOpen(true);
  }

  async function handleCreate() {
    setIsSubmitting(true);
    const result = await createCourt({ name, location: location || undefined, numCourts });

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(tCreate('success'));
      setIsCreateOpen(false);
      resetForm();
      loadCourts();
    }
    setIsSubmitting(false);
  }

  async function handleUpdate() {
    if (!selectedCourt) return;

    setIsSubmitting(true);
    const result = await updateCourt(selectedCourt.id, { name, location: location || undefined, numCourts });

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(t('edit.success'));
      setIsEditOpen(false);
      setSelectedCourt(null);
      resetForm();
      loadCourts();
    }
    setIsSubmitting(false);
  }

  async function handleDelete() {
    if (!selectedCourt) return;

    setIsSubmitting(true);
    const result = await deleteCourt(selectedCourt.id);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(t('delete.success'));
      setIsDeleteOpen(false);
      setSelectedCourt(null);
      loadCourts();
    }
    setIsSubmitting(false);
  }

  return (
    <div className="container mx-auto px-4 md:px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground mt-1">
            {t('subtitle')}
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t('addVenue')}
        </Button>
      </div>

      {/* Courts Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : courts.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <LayoutGrid className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">{t('empty.title')}</h3>
            <p className="text-muted-foreground text-center mb-6 max-w-sm">
              {t('empty.description')}
            </p>
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {t('empty.addFirst')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {courts.map((court) => {
            const hasLiveMatch = court.activeMatches.some((m) => m.status === "ON_COURT");
            const occupiedCount = court.occupiedCourtNumbers.length;
            const availableCount = court.numCourts - occupiedCount;

            return (
              <Card
                key={court.id}
                className={cn(
                  "relative overflow-hidden transition-all",
                  hasLiveMatch && "ring-2 ring-primary/50"
                )}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-lg flex items-center gap-2">
                        {court.name}
                        {hasLiveMatch && (
                          <Badge className="bg-primary/10 text-primary animate-pulse">
                            <Play className="h-3 w-3 mr-1 fill-current" />
                            {t('live')}
                          </Badge>
                        )}
                      </CardTitle>
                      {court.location && (
                        <CardDescription className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {court.location}
                        </CardDescription>
                      )}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEditDialog(court)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          {tCommon('edit')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => openDeleteDialog(court)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {tCommon('delete')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {/* Court availability */}
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">{t('courtsLabel')}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {availableCount} / {court.numCourts} {tCommon('available')}
                        </span>
                      </div>
                    </div>

                    {/* Court status indicators */}
                    <div className="flex flex-wrap gap-1.5">
                      {Array.from({ length: court.numCourts }, (_, i) => i + 1).map((num) => {
                        const match = court.activeMatches.find((m) => m.courtNumber === num);
                        const isPlaying = match?.status === "ON_COURT";
                        const isScheduled = match?.status === "PENDING";

                        return (
                          <div
                            key={num}
                            className={cn(
                              "flex items-center gap-1 px-2 py-1 rounded text-xs font-medium",
                              isPlaying
                                ? "bg-primary/10 text-primary"
                                : isScheduled
                                ? "bg-amber-500/10 text-amber-600"
                                : "bg-secondary text-muted-foreground"
                            )}
                            title={
                              match
                                ? `${match.tournament.name}: ${match.homeTeam?.name || tCommon('tbd')} vs ${match.awayTeam?.name || tCommon('tbd')}`
                                : `${tCommon('court')} ${num} - ${tCommon('available')}`
                            }
                          >
                            <Circle
                              className={cn(
                                "h-2 w-2",
                                isPlaying
                                  ? "fill-primary"
                                  : isScheduled
                                  ? "fill-amber-500"
                                  : "fill-muted-foreground/30"
                              )}
                            />
                            #{num}
                          </div>
                        );
                      })}
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-4 text-sm pt-2 border-t">
                      <div className="flex items-center gap-1.5">
                        <Trophy className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">
                          {court._count.tournaments} {tCommon('tournaments')}
                        </span>
                      </div>
                    </div>

                    {/* Tournaments using this venue */}
                    {court.tournaments.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-xs text-muted-foreground">{t('usedBy')}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {court.tournaments.slice(0, 3).map((tc) => (
                            <Badge key={tc.tournament.id} variant="outline" className="text-xs">
                              {tc.tournament.name}
                            </Badge>
                          ))}
                          {court.tournaments.length > 3 && (
                            <Badge variant="secondary" className="text-xs">
                              +{court.tournaments.length - 3} {t('more')}
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Venue Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tCreate('title')}</DialogTitle>
            <DialogDescription>
              {tCreate('subtitle')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">{tCreate('venueName')} *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={tCreate('venueNamePlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">{tCreate('location')}</Label>
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder={tCreate('locationPlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="numCourts">{tCreate('numCourts')} *</Label>
              <Input
                id="numCourts"
                type="number"
                min={1}
                max={50}
                value={numCourts}
                onChange={(e) => setNumCourts(parseInt(e.target.value) || 1)}
              />
              <p className="text-sm text-muted-foreground">
                {tCreate('numCourtsHelp')}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsCreateOpen(false);
                resetForm();
              }}
            >
              {tCommon('cancel')}
            </Button>
            <Button onClick={handleCreate} disabled={!name.trim() || isSubmitting}>
              {isSubmitting ? tCreate('adding') : tCreate('addButton')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Venue Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('edit.title')}</DialogTitle>
            <DialogDescription>
              {t('edit.subtitle')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">{tCreate('venueName')} *</Label>
              <Input
                id="edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={tCreate('venueNamePlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-location">{tCreate('location')}</Label>
              <Input
                id="edit-location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder={tCreate('locationPlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-numCourts">{tCreate('numCourts')} *</Label>
              <Input
                id="edit-numCourts"
                type="number"
                min={1}
                max={50}
                value={numCourts}
                onChange={(e) => setNumCourts(parseInt(e.target.value) || 1)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsEditOpen(false);
                setSelectedCourt(null);
                resetForm();
              }}
            >
              {tCommon('cancel')}
            </Button>
            <Button onClick={handleUpdate} disabled={!name.trim() || isSubmitting}>
              {isSubmitting ? t('edit.saving') : t('edit.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Venue Dialog */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('delete.title')}</DialogTitle>
            <DialogDescription>
              {t('delete.confirm', { name: selectedCourt?.name || '' })}
            </DialogDescription>
          </DialogHeader>
          {selectedCourt && selectedCourt._count.tournaments > 0 && (
            <div className="py-4">
              <p className="text-sm text-destructive">
                {t('delete.warning', { count: selectedCourt._count.tournaments })}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsDeleteOpen(false);
                setSelectedCourt(null);
              }}
            >
              {tCommon('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isSubmitting || (selectedCourt?._count.tournaments ?? 0) > 0}
            >
              {isSubmitting ? t('delete.deleting') : t('delete.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
