"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createTournament, CreateTournamentInput } from "@/lib/actions/tournament";
import { getAvailableCourts, createCourt } from "@/lib/actions/court";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, Trophy, Users, Layers, X, Plus, Upload, Download, LayoutGrid, MapPin, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import Papa from "papaparse";
import * as XLSX from "xlsx";

type WizardStep = "basics" | "format" | "teams" | "review";

type AvailableCourt = {
  id: string;
  name: string;
  location: string | null;
  numCourts: number;
  occupiedCount: number;
  availableCount: number;
  isFullyOccupied: boolean;
  occupiedBy: string[];
};

const steps: { id: WizardStep; icon: React.ReactNode }[] = [
  { id: "basics", icon: <Trophy className="h-4 w-4" /> },
  { id: "format", icon: <Layers className="h-4 w-4" /> },
  { id: "teams", icon: <Users className="h-4 w-4" /> },
  { id: "review", icon: <Check className="h-4 w-4" /> },
];

export default function NewTournamentPage() {
  const router = useRouter();
  const t = useTranslations('tournaments.create');
  const tCommon = useTranslations('common');
  const tVenue = useTranslations('tournaments.create.addVenue');
  const [currentStep, setCurrentStep] = useState<WizardStep>("basics");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [startDate, setStartDate] = useState("");
  const [selectedCourtIds, setSelectedCourtIds] = useState<string[]>([]);
  const [hasQualifying, setHasQualifying] = useState(false);
  const [totalParticipants, setTotalParticipants] = useState(8);
  const [numGroups, setNumGroups] = useState(2);
  const [teamsAdvancing, setTeamsAdvancing] = useState(2);
  const [totalTeams, setTotalTeams] = useState(8); // For direct main draw
  const [tiebreakerPriority, setTiebreakerPriority] = useState<"HEAD_TO_HEAD" | "GAMES_WON">("HEAD_TO_HEAD");
  const [teams, setTeams] = useState<string[]>([]);
  const [newTeamName, setNewTeamName] = useState("");

  // Courts state
  const [availableCourts, setAvailableCourts] = useState<AvailableCourt[]>([]);
  const [isLoadingCourts, setIsLoadingCourts] = useState(true);
  const [isAddCourtOpen, setIsAddCourtOpen] = useState(false);
  const [newCourtName, setNewCourtName] = useState("");
  const [newCourtLocation, setNewCourtLocation] = useState("");
  const [newCourtNumCourts, setNewCourtNumCourts] = useState(1);
  const [isCreatingCourt, setIsCreatingCourt] = useState(false);

  // CSV/Excel import state (Teams step)
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [csvReplaceExisting, setCsvReplaceExisting] = useState(true);
  const [csvImportedTeams, setCsvImportedTeams] = useState<string[]>([]);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [csvWarnings, setCsvWarnings] = useState<string[]>([]);

  // Load available courts on mount
  useEffect(() => {
    async function loadCourts() {
      setIsLoadingCourts(true);
      const courts = await getAvailableCourts();
      setAvailableCourts(courts);
      setIsLoadingCourts(false);
    }
    loadCourts();
  }, []);

  // Calculate group distribution for qualifying format
  // Example: 10 teams in 4 groups = [3, 3, 2, 2]
  function getGroupDistribution(total: number, groups: number): number[] {
    if (groups <= 0) return [];
    const baseSize = Math.floor(total / groups);
    const remainder = total % groups;
    return Array.from({ length: groups }, (_, i) => 
      i < remainder ? baseSize + 1 : baseSize
    );
  }

  const groupDistribution = hasQualifying 
    ? getGroupDistribution(totalParticipants, numGroups) 
    : [];
  
  const minTeamsInGroup = groupDistribution.length > 0 
    ? Math.min(...groupDistribution) 
    : 0;
  
  const expectedTeamCount = hasQualifying ? totalParticipants : totalTeams;

  const currentStepIndex = steps.findIndex((s) => s.id === currentStep);

  function goNext() {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < steps.length) {
      setCurrentStep(steps[nextIndex].id);
    }
  }

  function goPrev() {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(steps[prevIndex].id);
    }
  }

  function canProceed(): boolean {
    switch (currentStep) {
      case "basics":
        return name.trim().length > 0 && selectedCourtIds.length >= 1;
      case "format":
        if (hasQualifying) {
          // Need at least 2 teams, valid groups, and min 2 teams per group (for round-robin)
          const isValidDistribution = minTeamsInGroup >= 2;
          const isValidAdvancing = teamsAdvancing >= 1 && teamsAdvancing <= minTeamsInGroup;
          return totalParticipants >= 4 && numGroups >= 1 && isValidDistribution && isValidAdvancing;
        }
        return totalTeams >= 2;
      case "teams":
        return teams.length === expectedTeamCount;
      case "review":
        return true;
      default:
        return false;
    }
  }

  function toggleCourt(courtId: string) {
    setSelectedCourtIds((prev) =>
      prev.includes(courtId)
        ? prev.filter((id) => id !== courtId)
        : [...prev, courtId]
    );
  }

  async function handleCreateCourt() {
    if (!newCourtName.trim()) return;

    setIsCreatingCourt(true);
    const result = await createCourt({
      name: newCourtName.trim(),
      location: newCourtLocation.trim() || undefined,
      numCourts: newCourtNumCourts,
    });

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(tVenue('success'));
      // Add the new venue to the list and select it
      if (result.court) {
        setAvailableCourts((prev) => [
          ...prev,
          {
            id: result.court!.id,
            name: result.court!.name,
            location: result.court!.location,
            numCourts: result.court!.numCourts,
            occupiedCount: 0,
            availableCount: result.court!.numCourts,
            isFullyOccupied: false,
            occupiedBy: [],
          },
        ]);
        setSelectedCourtIds((prev) => [...prev, result.court!.id]);
      }
      setIsAddCourtOpen(false);
      setNewCourtName("");
      setNewCourtLocation("");
      setNewCourtNumCourts(1);
    }
    setIsCreatingCourt(false);
  }

  function addTeam() {
    if (newTeamName.trim() && teams.length < expectedTeamCount) {
      setTeams([...teams, newTeamName.trim()]);
      setNewTeamName("");
    }
  }

  function removeTeam(index: number) {
    setTeams(teams.filter((_, i) => i !== index));
  }

  function generatePlaceholderTeams() {
    const placeholders = Array.from(
      { length: expectedTeamCount },
      (_, i) => `Team ${i + 1}`
    );
    setTeams(placeholders);
  }

  function resetCsvImportState() {
    setCsvFileName(null);
    setCsvImportedTeams([]);
    setCsvErrors([]);
    setCsvWarnings([]);
    // Clear the file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function getDuplicateNamesCaseInsensitive(names: string[]): string[] {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const name of names) {
      const key = name.trim().toLowerCase();
      if (!key) continue;
      if (seen.has(key)) duplicates.add(name.trim());
      else seen.add(key);
    }
    return Array.from(duplicates);
  }

  function extractTeamNamesFromRows(rows: Array<Array<string | undefined>>): string[] {
    // Detect header & column index
    let startRow = 0;
    let nameColIndex = 0;
    const headerRow = rows[0] ?? [];
    const headerIndex = headerRow.findIndex(
      (cell) => (cell ?? "").toString().trim().toLowerCase() === "name"
    );
    if (headerIndex >= 0) {
      nameColIndex = headerIndex;
      startRow = 1;
    }

    const importedNames: string[] = [];
    for (let i = startRow; i < rows.length; i++) {
      const raw = rows[i]?.[nameColIndex];
      const name = (raw ?? "").toString().trim();
      if (!name) continue;
      importedNames.push(name);
    }
    return importedNames;
  }

  async function handleFileImport(file: File | null) {
    resetCsvImportState();
    if (!file) return;

    setCsvFileName(file.name);

    const nextErrors: string[] = [];
    const nextWarnings: string[] = [];

    const isXlsx =
      file.name.endsWith(".xlsx") ||
      file.name.endsWith(".xls") ||
      file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      file.type === "application/vnd.ms-excel";

    let rows: Array<Array<string | undefined>> = [];

    try {
      if (isXlsx) {
        // Parse Excel file
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
          nextErrors.push("No sheets found in the Excel file.");
          setCsvErrors(nextErrors);
          return;
        }
        const worksheet = workbook.Sheets[firstSheetName];
        rows = XLSX.utils.sheet_to_json<string[]>(worksheet, {
          header: 1,
          defval: "",
        }) as Array<Array<string | undefined>>;
      } else {
        // Parse CSV file
        const text = await file.text();
        const parsed = Papa.parse<string[]>(text, {
          skipEmptyLines: "greedy",
        });

        if (parsed.errors?.length) {
          const firstFew = parsed.errors.slice(0, 3).map((e) => e.message);
          nextErrors.push(...firstFew);
        }

        rows = (parsed.data ?? []) as unknown as Array<Array<string | undefined>>;
      }
    } catch {
      nextErrors.push("Could not read the file. Please check the format.");
      setCsvErrors(nextErrors);
      return;
    }

    const importedNames = extractTeamNamesFromRows(rows);

    if (importedNames.length === 0) {
      nextErrors.push("No team names found in the file.");
    }

    const duplicates = getDuplicateNamesCaseInsensitive(importedNames);
    if (duplicates.length > 0) {
      nextErrors.push(
        `Duplicate team names found (case-insensitive): ${duplicates.slice(0, 10).join(", ")}${
          duplicates.length > 10 ? "…" : ""
        }`
      );
    }

    if (importedNames.length > expectedTeamCount) {
      nextErrors.push(
        `Too many teams: expected ${expectedTeamCount}, found ${importedNames.length}.`
      );
    } else if (importedNames.length < expectedTeamCount) {
      nextWarnings.push(
        `File has ${importedNames.length} teams; you still need ${
          expectedTeamCount - importedNames.length
        } more to continue.`
      );
    }

    setCsvImportedTeams(importedNames);
    setCsvErrors(nextErrors);
    setCsvWarnings(nextWarnings);
  }

  function applyImportedTeams() {
    if (csvErrors.length > 0) return;

    if (csvReplaceExisting) {
      setTeams(csvImportedTeams);
      toast.success(t('teams.importApplied'));
      return;
    }

    const combined = [...teams, ...csvImportedTeams];
    if (combined.length > expectedTeamCount) {
      toast.error(t('teams.exceedError', { count: expectedTeamCount }));
      return;
    }

    setTeams(combined);
    toast.success(t('teams.importAppended'));
  }

  function downloadCsvTemplate() {
    const header = "name";
    const rows = Array.from({ length: expectedTeamCount }, (_, i) => `Team ${i + 1}`);
    const csv = [header, ...rows].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `teams-template-${expectedTeamCount}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function handleSubmit() {
    setIsSubmitting(true);

    const input: CreateTournamentInput = {
      name,
      location: location || undefined,
      startDate: startDate || undefined,
      courtIds: selectedCourtIds,
      hasQualifying,
      numGroups: hasQualifying ? numGroups : undefined,
      groupDistribution: hasQualifying ? groupDistribution : undefined,
      teamsAdvancing: hasQualifying ? teamsAdvancing : undefined,
      tiebreakerPriority: hasQualifying ? tiebreakerPriority : undefined,
      totalTeams: hasQualifying ? totalParticipants : totalTeams,
      teams,
    };

    const result = await createTournament(input);

    if (result?.error) {
      toast.error(result.error);
      setIsSubmitting(false);
    }
    // On success, the server action redirects
  }

  // Reset teams when format changes
  function handleFormatChange(newHasQualifying: boolean) {
    setHasQualifying(newHasQualifying);
    setTeams([]);
    resetCsvImportState();
  }

  function handleTotalParticipantsChange(value: number) {
    setTotalParticipants(value);
    // Recalculate min teams per group and adjust teamsAdvancing if needed
    const newDistribution = getGroupDistribution(value, numGroups);
    const newMin = newDistribution.length > 0 ? Math.min(...newDistribution) : 0;
    if (teamsAdvancing > newMin) {
      setTeamsAdvancing(Math.max(1, newMin));
    }
    setTeams([]);
    resetCsvImportState();
  }

  function handleGroupsChange(value: number) {
    setNumGroups(value);
    // Recalculate min teams per group and adjust teamsAdvancing if needed
    const newDistribution = getGroupDistribution(totalParticipants, value);
    const newMin = newDistribution.length > 0 ? Math.min(...newDistribution) : 0;
    if (teamsAdvancing > newMin) {
      setTeamsAdvancing(Math.max(1, newMin));
    }
    setTeams([]);
    resetCsvImportState();
  }

  function handleTeamsAdvancingChange(value: number) {
    setTeamsAdvancing(value);
    resetCsvImportState();
  }

  function handleTotalTeamsChange(value: number) {
    setTotalTeams(value);
    setTeams([]);
    resetCsvImportState();
  }

  // Get selected courts info for review
  const selectedCourts = availableCourts.filter((c) => selectedCourtIds.includes(c.id));

  return (
    <div className="container mx-auto max-w-3xl px-4 md:px-6 py-8">
      <div className="mb-8">
        <Button
          variant="ghost"
          onClick={() => router.push("/tournaments")}
          className="mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t('backToTournaments')}
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground mt-1">
          {t('subtitle')}
        </p>
      </div>

      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <div
                className={cn(
                  "flex items-center justify-center w-10 h-10 rounded-full border-2 transition-colors",
                  currentStepIndex > index
                    ? "bg-primary border-primary text-primary-foreground"
                    : currentStepIndex === index
                    ? "border-primary text-primary"
                    : "border-muted text-muted-foreground"
                )}
              >
                {currentStepIndex > index ? (
                  <Check className="h-5 w-5" />
                ) : (
                  step.icon
                )}
              </div>
              <span
                className={cn(
                  "ml-2 text-sm font-medium hidden sm:inline",
                  currentStepIndex >= index
                    ? "text-foreground"
                    : "text-muted-foreground"
                )}
              >
                {t(`steps.${step.id}`)}
              </span>
              {index < steps.length - 1 && (
                <div
                  className={cn(
                    "w-12 sm:w-24 h-0.5 mx-2 sm:mx-4",
                    currentStepIndex > index ? "bg-primary" : "bg-muted"
                  )}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <Card>
        <CardHeader>
          <CardTitle>
            {currentStep === "basics" && t('basics.title')}
            {currentStep === "format" && t('format.title')}
            {currentStep === "teams" && t('teams.title')}
            {currentStep === "review" && t('review.title')}
          </CardTitle>
          <CardDescription>
            {currentStep === "basics" && t('basics.description')}
            {currentStep === "format" && t('format.description')}
            {currentStep === "teams" && t('teams.description', { count: expectedTeamCount })}
            {currentStep === "review" && t('review.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Basics Step */}
          {currentStep === "basics" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="name">{t('basics.nameLabel')}</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('basics.namePlaceholder')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="location">{t('basics.locationLabel')}</Label>
                <Input
                  id="location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder={t('basics.locationPlaceholder')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="startDate">{t('basics.startDateLabel')}</Label>
                <DatePicker
                  value={startDate}
                  onChange={setStartDate}
                  placeholder={t('basics.startDatePlaceholder')}
                />
              </div>

              {/* Court Selection */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>{t('basics.selectVenuesLabel')}</Label>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {t('basics.selectVenuesDescription')}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsAddCourtOpen(true)}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    {t('basics.registerNew')}
                  </Button>
                </div>

                {isLoadingCourts ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : availableCourts.length === 0 ? (
                  <div className="border-2 border-dashed rounded-lg p-6 text-center">
                    <LayoutGrid className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground mb-3">
                      {t('basics.noCourts')}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsAddCourtOpen(true)}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      {t('basics.registerFirstCourt')}
                    </Button>
                  </div>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {availableCourts.map((court) => {
                      const isSelected = selectedCourtIds.includes(court.id);
                      return (
                        <button
                          key={court.id}
                          type="button"
                          onClick={() => toggleCourt(court.id)}
                          className={cn(
                            "flex items-start gap-3 p-3 rounded-lg border text-left transition-all",
                            isSelected
                              ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                              : "border-border hover:border-muted-foreground/50 hover:bg-muted/50"
                          )}
                        >
                          <div
                            className={cn(
                              "mt-0.5 h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0",
                              isSelected
                                ? "border-primary bg-primary"
                                : "border-muted-foreground/30"
                            )}
                          >
                            {isSelected && (
                              <Check className="h-3 w-3 text-primary-foreground" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium text-sm">{court.name}</span>
                              <Badge variant="outline" className="text-xs shrink-0">
                                {t('basics.courtCount', { count: court.numCourts })}
                              </Badge>
                            </div>
                            {court.location && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                <MapPin className="h-3 w-3" />
                                {court.location}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground mt-1">
                              {t('basics.availableCount', { available: court.availableCount, total: court.numCourts })}
                              {court.occupiedBy.length > 0 && (
                                <span className="ml-1">
                                  · {t('basics.usedBy')}: {court.occupiedBy.slice(0, 2).join(", ")}
                                  {court.occupiedBy.length > 2 && ` +${court.occupiedBy.length - 2}`}
                                </span>
                              )}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {selectedCourtIds.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {t('basics.venuesSelected', { count: selectedCourtIds.length })}
                  </p>
                )}
              </div>
            </>
          )}

          {/* Format Step */}
          {currentStep === "format" && (
            <>
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="space-y-1">
                  <Label htmlFor="hasQualifying" className="text-base">
                    {t('format.includeQualifying')}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {t('format.includeQualifyingDescription')}
                  </p>
                </div>
                <Switch
                  id="hasQualifying"
                  checked={hasQualifying}
                  onCheckedChange={handleFormatChange}
                />
              </div>

              {hasQualifying ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="totalParticipants">{t('format.totalParticipants')}</Label>
                    <Input
                      id="totalParticipants"
                      type="number"
                      min={4}
                      max={64}
                      value={totalParticipants}
                      onChange={(e) =>
                        handleTotalParticipantsChange(parseInt(e.target.value) || 4)
                      }
                    />
                    <p className="text-sm text-muted-foreground">
                      {t('format.totalParticipantsDescription')}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="numGroups">{t('format.numGroups')}</Label>
                    <Input
                      id="numGroups"
                      type="number"
                      min={1}
                      max={Math.min(8, Math.floor(totalParticipants / 2))}
                      value={numGroups}
                      onChange={(e) =>
                        handleGroupsChange(parseInt(e.target.value) || 1)
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="teamsAdvancing">{t('format.teamsAdvancing')}</Label>
                    <Input
                      id="teamsAdvancing"
                      type="number"
                      min={1}
                      max={minTeamsInGroup}
                      value={teamsAdvancing}
                      onChange={(e) =>
                        handleTeamsAdvancingChange(parseInt(e.target.value) || 1)
                      }
                    />
                  </div>

                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="tiebreakerPriority">{t('format.tiebreakerPriority')}</Label>
                    <Select
                      value={tiebreakerPriority}
                      onValueChange={(value: "HEAD_TO_HEAD" | "GAMES_WON") => setTiebreakerPriority(value)}
                    >
                      <SelectTrigger id="tiebreakerPriority">
                        <SelectValue placeholder={t('format.tiebreakerPlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="HEAD_TO_HEAD">
                          {t('format.headToHeadFirst')}
                        </SelectItem>
                        <SelectItem value="GAMES_WON">
                          {t('format.gamesWonFirst')}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-sm text-muted-foreground">
                      {t('format.tiebreakerDescription')}
                    </p>
                  </div>
                  
                  {/* Group Distribution Display */}
                  <div className="sm:col-span-2 p-4 bg-secondary/50 rounded-lg space-y-3">
                    <div>
                      <p className="text-sm font-medium mb-2">{t('format.groupDistribution')}:</p>
                      <div className="flex flex-wrap gap-2">
                        {groupDistribution.map((count, idx) => (
                          <Badge
                            key={idx}
                            variant={count < Math.max(...groupDistribution) ? "outline" : "secondary"}
                            className="text-sm"
                          >
                            {t('format.groupLabel', { letter: String.fromCharCode(65 + idx), count })}
                          </Badge>
                        ))}
                      </div>
                      {groupDistribution.some((c, _, arr) => c !== arr[0]) && (
                        <p className="text-xs text-muted-foreground mt-2">
                          ⚠️ {t('format.unevenDistribution')}
                        </p>
                      )}
                    </div>
                    <div className="border-t pt-3 space-y-1">
                      <p className="text-sm">
                        <strong>{t('format.totalTeamsLabel')}:</strong> {t('format.teamsInGroups', { teams: totalParticipants, groups: numGroups })}
                      </p>
                      <p className="text-sm">
                        <strong>{t('format.advancingLabel')}:</strong> {t('format.advancingSummary', { top: teamsAdvancing, total: numGroups * teamsAdvancing })}
                      </p>
                    </div>
                    {minTeamsInGroup < 2 && (
                      <p className="text-sm text-destructive">
                        ⚠️ {t('format.minTeamsWarning')}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="totalTeams">{t('format.totalTeams')}</Label>
                  <Input
                    id="totalTeams"
                    type="number"
                    min={2}
                    max={64}
                    value={totalTeams}
                    onChange={(e) =>
                      handleTotalTeamsChange(parseInt(e.target.value) || 2)
                    }
                  />
                  <p className="text-sm text-muted-foreground">
                    {t('format.directMainDrawDescription')}
                  </p>
                </div>
              )}
            </>
          )}

          {/* Teams Step */}
          {currentStep === "teams" && (
            <>
              <div className="border rounded-lg p-4 space-y-3 bg-secondary/30">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{t('teams.importTitle')}</p>
                    <p className="text-sm text-muted-foreground">
                      {t('teams.expectedTeams')}: <span className="font-medium">{expectedTeamCount}</span>. {t('teams.importDescription')}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={downloadCsvTemplate}>
                    <Download className="mr-2 h-4 w-4" />
                    {t('teams.downloadTemplate')}
                  </Button>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <Label htmlFor="teamsFile" className="sr-only">
                      {t('teams.uploadLabel')}
                    </Label>
                    <Input
                      ref={fileInputRef}
                      id="teamsFile"
                      type="file"
                      accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                      onChange={(e) => handleFileImport(e.target.files?.[0] ?? null)}
                    />
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        id="csvReplaceExisting"
                        checked={csvReplaceExisting}
                        onCheckedChange={setCsvReplaceExisting}
                      />
                      <Label htmlFor="csvReplaceExisting" className="text-sm">
                        {t('teams.replaceCurrentTeams')}
                      </Label>
                    </div>

                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={applyImportedTeams}
                      disabled={csvImportedTeams.length === 0 || csvErrors.length > 0}
                    >
                      <Upload className="mr-2 h-4 w-4" />
                      {t('teams.useImported')}
                    </Button>
                  </div>
                </div>

                {(csvFileName || csvImportedTeams.length > 0) && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-muted-foreground">
                          {csvFileName ? (
                            <>
                              {t('teams.file')}: <span className="font-medium text-foreground">{csvFileName}</span>
                            </>
                          ) : (
                            t('teams.filePreview')
                          )}
                        </p>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={resetCsvImportState}
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                          title={t('teams.clearFile')}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <Badge variant="secondary">{t('teams.importedCount', { count: csvImportedTeams.length })}</Badge>
                    </div>

                    {csvImportedTeams.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {csvImportedTeams.slice(0, 12).map((t, idx) => (
                          <Badge key={`${t}-${idx}`} variant="outline">
                            {t}
                          </Badge>
                        ))}
                        {csvImportedTeams.length > 12 && (
                          <Badge variant="secondary">+{csvImportedTeams.length - 12} more</Badge>
                        )}
                      </div>
                    )}

                    {csvErrors.length > 0 && (
                      <div className="text-sm text-destructive space-y-1">
                        {csvErrors.map((err, i) => (
                          <p key={i}>• {err}</p>
                        ))}
                      </div>
                    )}

                    {csvWarnings.length > 0 && (
                      <div className="text-sm text-muted-foreground space-y-1">
                        {csvWarnings.map((w, i) => (
                          <p key={i}>• {w}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Input
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  placeholder={t('teams.enterTeamName')}
                  onKeyDown={(e) => e.key === "Enter" && addTeam()}
                  disabled={teams.length >= expectedTeamCount}
                />
                <Button
                  onClick={addTeam}
                  disabled={!newTeamName.trim() || teams.length >= expectedTeamCount}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {t('teams.teamsAdded', { current: teams.length, total: expectedTeamCount })}
                </p>
                {teams.length < expectedTeamCount && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={generatePlaceholderTeams}
                  >
                    {t('teams.autoFill')}
                  </Button>
                )}
              </div>

              {teams.length > 0 && (
                <div className="border rounded-lg divide-y max-h-64 overflow-y-auto">
                  {teams.map((team, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between px-3 py-2"
                    >
                      <span className="flex items-center gap-2">
                        <span className="text-muted-foreground text-sm w-6">
                          {index + 1}.
                        </span>
                        {team}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeTeam(index)}
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Review Step */}
          {currentStep === "review" && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="p-4 bg-secondary/30 rounded-lg">
                  <p className="text-sm text-muted-foreground">{t('review.tournament')}</p>
                  <p className="font-semibold">{name}</p>
                  {location && (
                    <p className="text-sm text-muted-foreground mt-1">
                      📍 {location}
                    </p>
                  )}
                  {startDate && (
                    <p className="text-sm text-muted-foreground mt-1">
                      📅 {new Date(startDate).toLocaleDateString("en-US", {
                        weekday: "long",
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                  )}
                </div>
                <div className="p-4 bg-secondary/30 rounded-lg">
                  <p className="text-sm text-muted-foreground">{t('review.venuesAndCourts')}</p>
                  <p className="font-semibold">
                    {t('review.venuesSummary', { venues: selectedCourts.length, courts: selectedCourts.reduce((sum, c) => sum + c.numCourts, 0) })}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selectedCourts.map((court) => (
                      <Badge key={court.id} variant="outline" className="text-xs">
                        {court.name} ({court.numCourts})
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="p-4 bg-secondary/30 rounded-lg">
                  <p className="text-sm text-muted-foreground">{t('review.format')}</p>
                  <p className="font-semibold">
                    {hasQualifying
                      ? t('review.qualifyingFormat', { groups: numGroups })
                      : t('review.directMainDraw')}
                  </p>
                  {hasQualifying && (
                    <>
                      <p className="text-xs text-muted-foreground mt-1">
                        {groupDistribution.map((count, idx) =>
                          `${String.fromCharCode(65 + idx)}:${count}`
                        ).join(", ")}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {t('review.advancingSummary', { top: teamsAdvancing, total: numGroups * teamsAdvancing })}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {t('review.tiebreaker')}: {tiebreakerPriority === "HEAD_TO_HEAD" ? t('review.h2hFirst') : t('review.gamesWonFirst')}
                      </p>
                    </>
                  )}
                </div>
                <div className="p-4 bg-secondary/30 rounded-lg">
                  <p className="text-sm text-muted-foreground">{t('review.teams')}</p>
                  <p className="font-semibold">{t('review.teamCount', { count: teams.length })}</p>
                </div>
              </div>

              <div className="p-4 border rounded-lg">
                <p className="text-sm text-muted-foreground mb-2">{t('review.teamList')}</p>
                <div className="flex flex-wrap gap-2">
                  {teams.map((team, index) => (
                    <Badge key={index} variant="secondary">
                      {team}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between mt-6">
        <Button
          variant="outline"
          onClick={goPrev}
          disabled={currentStepIndex === 0}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {tCommon('previous')}
        </Button>

        {currentStep === "review" ? (
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? t('creating') : t('createTournament')}
            <Check className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={goNext} disabled={!canProceed()}>
            {tCommon('next')}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Add Venue Dialog */}
      <Dialog open={isAddCourtOpen} onOpenChange={setIsAddCourtOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tVenue('title')}</DialogTitle>
            <DialogDescription>
              {tVenue('description')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="newCourtName">{tVenue('nameLabel')}</Label>
              <Input
                id="newCourtName"
                value={newCourtName}
                onChange={(e) => setNewCourtName(e.target.value)}
                placeholder={tVenue('namePlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newCourtLocation">{tVenue('locationLabel')}</Label>
              <Input
                id="newCourtLocation"
                value={newCourtLocation}
                onChange={(e) => setNewCourtLocation(e.target.value)}
                placeholder={tVenue('locationPlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newCourtNumCourts">{tVenue('numCourtsLabel')}</Label>
              <Input
                id="newCourtNumCourts"
                type="number"
                min={1}
                max={50}
                value={newCourtNumCourts}
                onChange={(e) => setNewCourtNumCourts(parseInt(e.target.value) || 1)}
              />
              <p className="text-sm text-muted-foreground">
                {tVenue('numCourtsDescription')}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsAddCourtOpen(false);
                setNewCourtName("");
                setNewCourtLocation("");
                setNewCourtNumCourts(1);
              }}
            >
              {tCommon('cancel')}
            </Button>
            <Button
              onClick={handleCreateCourt}
              disabled={!newCourtName.trim() || isCreatingCourt}
            >
              {isCreatingCourt ? tVenue('creating') : tVenue('addVenue')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
