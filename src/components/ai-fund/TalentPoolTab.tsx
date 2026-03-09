import { useEffect, useState } from "react";
import { ExternalLink, Filter, Plus, RefreshCw, Upload } from "lucide-react";
import type {
  AiFundAtsImportPreview,
  AiFundAtsImportRow,
  AiFundEvaluationCriterion,
  AiFundPerson,
  AiFundWorkspace,
  PersonType,
  ProcessStage,
} from "@/types/ai-fund";
import { computeCompositeScore, scoreColor, scoreLabel } from "@/lib/aifund-scoring";
import { fetchScoresForPerson, importTalentPoolCandidates } from "@/lib/ai-fund";
import { buildAtsImportPreview } from "@/lib/talent-pool-import";
import PersonDetail from "@/components/ai-fund/PersonDetail";

interface Props {
  workspace: AiFundWorkspace;
}

interface ScoreDraft {
  aiExcellence: string;
  technicalAbility: string;
  productInstinct: string;
  leadershipPotential: string;
  notes: string;
}

const PROCESS_STAGE_LABELS: Record<ProcessStage, string> = {
  identified: "Identified",
  researched: "Researched",
  contacted: "Contacted",
  engaged: "Engaged",
  applied: "Applied",
  interviewing: "Interviewing",
  offered: "Offered",
  accepted: "Accepted",
  declined: "Declined",
  residency: "Residency",
  graduated: "Graduated",
  archived: "Archived",
};

const EMPTY_SCORE_DRAFT: ScoreDraft = {
  aiExcellence: "",
  technicalAbility: "",
  productInstinct: "",
  leadershipPotential: "",
  notes: "",
};

function parseScore(value: string): number | null {
  if (!value.trim()) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sourceChannelLabel(workspace: AiFundWorkspace, value: string | null): string | null {
  if (!value) {
    return null;
  }

  if (value === "manual_entry") {
    return "Manual Entry";
  }

  if (value === "harmonic_founder_search") {
    return "Harmonic Founder Search";
  }

  if (value === "lever_applicant_import" || value === "ats_applicant_import") {
    return "Lever Applicant Import";
  }

  return workspace.settings.sourcingChannels.find((channel) => channel.id === value)?.label || value;
}

export default function TalentPoolTab({ workspace }: Props) {
  const { people, loading, addPerson, refresh, refreshPersonEnrichment } = workspace;
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<PersonType | "all">("all");
  const [filterStage, setFilterStage] = useState<ProcessStage | "all">("all");
  const [scores, setScores] = useState<Record<string, number | null>>({});
  const [refreshingPersonId, setRefreshingPersonId] = useState<string | null>(null);
  const [scoringPersonId, setScoringPersonId] = useState<string | null>(null);
  const [scoreDraft, setScoreDraft] = useState<ScoreDraft>(EMPTY_SCORE_DRAFT);
  const [scoreError, setScoreError] = useState<string | null>(null);
  const [scoreSubmitting, setScoreSubmitting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<AiFundAtsImportPreview | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<string | null>(null);
  const [previewBuilding, setPreviewBuilding] = useState(false);
  const [importSubmitting, setImportSubmitting] = useState(false);

  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formLinkedin, setFormLinkedin] = useState("");
  const [formRole, setFormRole] = useState("");
  const [formCompany, setFormCompany] = useState("");
  const [formType, setFormType] = useState<PersonType>("fir");
  const [formSourceChannel, setFormSourceChannel] = useState("manual_entry");

  useEffect(() => {
    const loadScores = async (): Promise<void> => {
      const scoreMap: Record<string, number | null> = {};

      for (const person of people) {
        try {
          const personScores = await fetchScoresForPerson(person.id);
          scoreMap[person.id] = personScores.length > 0 ? personScores[0].compositeScore : null;
        } catch {
          scoreMap[person.id] = null;
        }
      }

      setScores(scoreMap);
    };

    if (people.length > 0) {
      void loadScores();
      return;
    }

    setScores({});
  }, [people]);

  const getEnrichmentStatus = (person: AiFundPerson): {
    label: string;
    className: string;
  } | null => {
    if (!person.linkedinUrl) {
      return null;
    }

    if (person.harmonicPersonId || person.harmonicEnrichedAt) {
      return {
        label: "Harmonic Enriched",
        className: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
      };
    }

    return {
      label: "LinkedIn Added",
      className: "border-blue-500/20 bg-blue-500/10 text-blue-400",
    };
  };

  const handleCreate = async (): Promise<void> => {
    if (!formName.trim()) {
      return;
    }

    await addPerson({
      fullName: formName.trim(),
      email: formEmail.trim() || null,
      linkedinUrl: formLinkedin.trim() || null,
      currentRole: formRole.trim() || null,
      currentCompany: formCompany.trim() || null,
      personType: formType,
      sourceChannel: formSourceChannel,
    });

    setFormName("");
    setFormEmail("");
    setFormLinkedin("");
    setFormRole("");
    setFormCompany("");
    setFormType("fir");
    setFormSourceChannel("manual_entry");
    setShowForm(false);
  };

  const handleRefreshHarmonic = async (personId: string): Promise<void> => {
    try {
      setRefreshingPersonId(personId);
      await refreshPersonEnrichment(personId);
    } finally {
      setRefreshingPersonId(null);
    }
  };

  const startScoring = (personId: string): void => {
    setScoringPersonId(personId);
    setScoreDraft(EMPTY_SCORE_DRAFT);
    setScoreError(null);
  };

  const handleSaveScore = async (): Promise<void> => {
    if (!scoringPersonId) {
      return;
    }

    setScoreSubmitting(true);
    setScoreError(null);

    try {
      const aiExcellence = parseScore(scoreDraft.aiExcellence);
      const technicalAbility = parseScore(scoreDraft.technicalAbility);
      const productInstinct = parseScore(scoreDraft.productInstinct);
      const leadershipPotential = parseScore(scoreDraft.leadershipPotential);

      const createdScore = await workspace.scoreCandidate({
        personId: scoringPersonId,
        aiExcellence,
        technicalAbility,
        productInstinct,
        leadershipPotential,
        notes: scoreDraft.notes.trim() || null,
      });

      if (!createdScore) {
        throw new Error("Failed to save score");
      }

      setScores((prev) => ({
        ...prev,
        [scoringPersonId]: createdScore.compositeScore ??
          computeCompositeScore({
            aiExcellence,
            technicalAbility,
            productInstinct,
            leadershipPotential,
          }),
      }));
      setScoringPersonId(null);
      setScoreDraft(EMPTY_SCORE_DRAFT);
    } catch (err: unknown) {
      setScoreError(err instanceof Error ? err.message : "Failed to save score");
    } finally {
      setScoreSubmitting(false);
    }
  };

  const resetImportState = (): void => {
    setImportFile(null);
    setImportPreview(null);
    setImportError(null);
    setImportSummary(null);
    setPreviewBuilding(false);
    setImportSubmitting(false);
  };

  const handleBuildImportPreview = async (): Promise<void> => {
    if (!importFile) {
      return;
    }

    setPreviewBuilding(true);
    setImportError(null);
    setImportSummary(null);

    try {
      const preview = await buildAtsImportPreview(importFile, people);
      setImportPreview(preview);
    } catch (error: unknown) {
      setImportPreview(null);
      setImportError(error instanceof Error ? error.message : "Failed to parse ATS file");
    } finally {
      setPreviewBuilding(false);
    }
  };

  const handleImportCandidates = async (): Promise<void> => {
    if (!importPreview) {
      return;
    }

    const rowsToCreate = importPreview.rows.filter((row: AiFundAtsImportRow) => row.decision === "create");
    if (rowsToCreate.length === 0) {
      setImportSummary("No new candidates to import.");
      return;
    }

    setImportSubmitting(true);
    setImportError(null);
    setImportSummary(null);

    try {
      const summary = await importTalentPoolCandidates({
        rows: importPreview.rows.map((row: AiFundAtsImportRow) => ({
          localId: row.localId,
          fullName: row.fullName,
          email: row.email,
          currentRole: row.currentRole,
          currentCompany: row.currentCompany,
          location: row.location,
          personType: row.personType,
          processStage: row.processStage,
          sourceChannel: row.sourceChannel,
          decision: row.decision,
          metadata: row.metadata,
        })),
      });

      await refresh();
      setImportSummary(
        `Imported ${summary.createdCount} candidates. Skipped ${summary.skippedCount}, duplicates ${summary.duplicateCount}, archived ${summary.archivedCount}.`,
      );
      setShowImport(false);
      setImportFile(null);
      setImportPreview(null);
    } catch (error: unknown) {
      setImportError(error instanceof Error ? error.message : "Failed to import ATS candidates");
    } finally {
      setImportSubmitting(false);
    }
  };

  const filtered = people.filter((person) => {
    if (filterType !== "all" && person.personType !== filterType) {
      return false;
    }

    if (filterStage !== "all" && person.processStage !== filterStage) {
      return false;
    }

    return true;
  });

  const selectedPerson = selectedPersonId
    ? people.find((person) => person.id === selectedPersonId) || null
    : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-pulse text-sm text-muted-foreground">Loading talent pool...</div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Talent Pool</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {people.length} candidate{people.length !== 1 ? "s" : ""} tracked
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setShowImport(!showImport);
              if (showForm) {
                setShowForm(false);
              }
              if (showImport) {
                resetImportState();
              }
            }}
            className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary/80"
          >
            <Upload className="h-4 w-4" />
            Import Lever CSV
          </button>
          <button
            onClick={() => {
              setShowForm(!showForm);
              if (showImport) {
                setShowImport(false);
                resetImportState();
              }
            }}
            className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Add Person
          </button>
        </div>
      </div>

      {importSummary && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
          {importSummary}
        </div>
      )}

      {importError && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {importError}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <select
          value={filterType}
          onChange={(event) => setFilterType(event.target.value as PersonType | "all")}
          className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground"
        >
          <option value="all">All Types</option>
          <option value="fir">FIR</option>
          <option value="ve">VE</option>
          <option value="both">Both</option>
        </select>
        <select
          value={filterStage}
          onChange={(event) => setFilterStage(event.target.value as ProcessStage | "all")}
          className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground"
        >
          <option value="all">All Stages</option>
          {Object.entries(PROCESS_STAGE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      {showForm && (
        <div className="space-y-3 rounded-xl border border-border bg-card p-5">
          <div className="grid gap-3 md:grid-cols-2">
            <input
              type="text"
              placeholder="Full name"
              value={formName}
              onChange={(event) => setFormName(event.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <input
              type="email"
              placeholder="Email"
              value={formEmail}
              onChange={(event) => setFormEmail(event.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <input
              type="url"
              placeholder="LinkedIn URL"
              value={formLinkedin}
              onChange={(event) => setFormLinkedin(event.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <input
              type="text"
              placeholder="Current role"
              value={formRole}
              onChange={(event) => setFormRole(event.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <input
              type="text"
              placeholder="Current company"
              value={formCompany}
              onChange={(event) => setFormCompany(event.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <select
              value={formType}
              onChange={(event) => setFormType(event.target.value as PersonType)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            >
              <option value="fir">FIR</option>
              <option value="ve">VE</option>
              <option value="both">Both</option>
            </select>
            <select
              value={formSourceChannel}
              onChange={(event) => setFormSourceChannel(event.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground md:col-span-2"
            >
              <option value="manual_entry">Manual Entry</option>
              {workspace.settings.sourcingChannels.filter((channel) => channel.enabled).map((channel) => (
                <option key={channel.id} value={channel.id}>
                  {channel.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={!formName.trim()}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              Add
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="rounded-lg bg-secondary px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {showImport && (
        <div className="space-y-4 rounded-xl border border-border bg-card p-5">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Bulk Import ATS Applicants</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Upload the Lever CSV or spreadsheet export and import unique applicants into the Talent Pool. Best source: Opportunity Summary.csv.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">CSV or spreadsheet</span>
              <input
                type="file"
                accept=".csv,.xlsx"
                onChange={(event) => {
                  setImportFile(event.target.files?.[0] || null);
                  setImportPreview(null);
                  setImportError(null);
                }}
                className="block w-full text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-sm file:font-medium"
              />
            </label>
            <button
              onClick={() => void handleBuildImportPreview()}
              disabled={!importFile || previewBuilding}
              className="self-end rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {previewBuilding ? "Building preview..." : "Build Preview"}
            </button>
            <button
              onClick={() => {
                setShowImport(false);
                resetImportState();
              }}
              className="self-end rounded-lg bg-secondary px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Cancel
            </button>
          </div>

          {importPreview && (
            <div className="space-y-4 border-t border-border pt-4">
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span>{importPreview.importSchemaLabel} detected</span>
                {importPreview.isPreferredLeverExport && (
                  <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300">
                    Preferred Lever export
                  </span>
                )}
                <span>{importPreview.rowCount} applicants in file</span>
                <span>{importPreview.createCount} new</span>
                <span>{importPreview.skipCount} duplicates</span>
                <span>{importPreview.archivedCount} archived</span>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-border/70 bg-background px-3 py-3">
                  <p className="text-xs font-medium text-foreground">Top postings</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {importPreview.postings.map((entry) => (
                      <span
                        key={`posting:${entry.label}`}
                        className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground"
                      >
                        {entry.label} ({entry.count})
                      </span>
                    ))}
                  </div>
                </div>
                <div className="rounded-lg border border-border/70 bg-background px-3 py-3">
                  <p className="text-xs font-medium text-foreground">Top departments</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {importPreview.departments.map((entry) => (
                      <span
                        key={`department:${entry.label}`}
                        className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground"
                      >
                        {entry.label} ({entry.count})
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-3 max-h-[28rem] overflow-y-auto pr-1">
                {importPreview.rows.slice(0, 30).map((row: AiFundAtsImportRow) => (
                  <div key={row.localId} className="rounded-lg border border-border/70 bg-background px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{row.fullName}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {[row.currentRole, row.currentCompany, row.location].filter(Boolean).join(" • ") || "No role or company info"}
                        </p>
                        {row.duplicateReason && (
                          <p className="mt-2 text-[11px] text-amber-300">{row.duplicateReason}</p>
                        )}
                        {row.matches.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {row.matches.map((match) => (
                              <span
                                key={`${row.localId}:${match.personId}`}
                                className="rounded-full border border-amber-500/20 px-2 py-0.5 text-[11px] text-amber-100"
                              >
                                {match.fullName}{match.currentCompany ? ` @ ${match.currentCompany}` : ""}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                        <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
                          {row.personType}
                        </span>
                        <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
                          {PROCESS_STAGE_LABELS[row.processStage]}
                        </span>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] uppercase ${
                            row.decision === "create"
                              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                              : "border-amber-500/20 bg-amber-500/10 text-amber-200"
                          }`}
                        >
                          {row.decision}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {importPreview.rowCount > 30 && (
                <p className="text-xs text-muted-foreground">
                  Showing the first 30 preview rows.
                </p>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => void handleImportCandidates()}
                  disabled={importPreview.createCount === 0 || importSubmitting}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {importSubmitting ? "Importing..." : `Import ${importPreview.createCount} Candidates`}
                </button>
                <button
                  onClick={resetImportState}
                  className="rounded-lg bg-secondary px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  Clear Preview
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {selectedPerson && (
        <PersonDetail
          person={selectedPerson}
          workspace={workspace}
          onClose={() => setSelectedPersonId(null)}
        />
      )}

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-12 text-center">
          <p className="text-sm text-muted-foreground">
            {people.length === 0 ? "No candidates yet." : "No matches for the current filters."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((person) => {
            const enrichmentStatus = getEnrichmentStatus(person);
            const currentScore = scores[person.id];
            return (
              <div
                key={person.id}
                className="space-y-3 rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:border-primary/30"
              >
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedPersonId(person.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedPersonId(person.id);
                    }
                  }}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg outline-none transition-colors focus-visible:ring-1 focus-visible:ring-primary ${
                    selectedPersonId === person.id ? "bg-primary/5" : ""
                  }`}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {person.fullName.charAt(0).toUpperCase()}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-foreground">{person.fullName}</p>
                      {person.linkedinUrl && (
                        <a
                          href={person.linkedinUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(event) => event.stopPropagation()}
                          className="text-muted-foreground transition-colors hover:text-primary"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {[person.currentRole, person.currentCompany].filter(Boolean).join(" @ ") || "No role info"}
                    </p>

                    <div className="mt-2 flex flex-wrap gap-2">
                      {enrichmentStatus && (
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] uppercase ${enrichmentStatus.className}`}>
                          {enrichmentStatus.label}
                        </span>
                      )}
                      {person.sourceChannel && (
                        <span className="inline-flex rounded-full border border-border px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
                          {sourceChannelLabel(workspace, person.sourceChannel)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">
                      {person.personType}
                    </span>
                    <span className="rounded bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                      {PROCESS_STAGE_LABELS[person.processStage]}
                    </span>
                    <span className={`text-xs font-semibold ${scoreColor(currentScore)}`}>
                      {currentScore !== undefined && currentScore !== null
                        ? `${currentScore.toFixed(1)} - ${scoreLabel(currentScore)}`
                        : "Unscored"}
                    </span>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        startScoring(person.id);
                      }}
                      className="rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Score
                    </button>
                    {person.linkedinUrl && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleRefreshHarmonic(person.id);
                        }}
                        disabled={refreshingPersonId === person.id}
                        className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${refreshingPersonId === person.id ? "animate-spin" : ""}`} />
                        {refreshingPersonId === person.id ? "Refreshing..." : "Refresh Harmonic"}
                      </button>
                    )}
                  </div>
                </div>

                {scoringPersonId === person.id && (
                  <div className="rounded-lg border border-border/70 bg-background px-3 py-3">
                    {(() => {
                      const eeaMeta = person.metadata as Record<string, unknown> | null;
                      const eeaScore = eeaMeta?.eeaScore as number | undefined;
                      const eeaTier = eeaMeta?.eeaTier as number | undefined;
                      const eeaSignals = eeaMeta?.eeaSignals as string | undefined;
                      const eeaSummary = eeaMeta?.eeaSummary as string | undefined;
                      if (eeaScore !== undefined || eeaSignals) {
                        return (
                          <div className="mb-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">EEA Signal</span>
                              {eeaTier && (
                                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${eeaTier === 1 ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-primary/10 text-primary border border-primary/20"}`}>
                                  Tier {eeaTier}
                                </span>
                              )}
                              {eeaScore !== undefined && (
                                <span className="text-[10px] text-muted-foreground">{eeaScore}/100</span>
                              )}
                            </div>
                            {eeaSignals && <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">{eeaSignals}</p>}
                            {eeaSummary && <p className="mt-1 text-[11px] text-muted-foreground/70 leading-relaxed line-clamp-1">{eeaSummary}</p>}
                          </div>
                        );
                      }
                      return null;
                    })()}
                    <div className="grid gap-3 md:grid-cols-2">
                      {workspace.settings.evaluationCriteria.map((criterion: AiFundEvaluationCriterion) => (
                        <div key={criterion.id}>
                          <label className="mb-1 block text-xs text-muted-foreground">
                            {criterion.label} ({criterion.weight}%)
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="4"
                            step="0.5"
                            value={scoreDraft[criterion.id]}
                            onChange={(event) => setScoreDraft((prev) => ({
                              ...prev,
                              [criterion.id]: event.target.value,
                            }))}
                            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                          <p className="mt-1 text-[11px] text-muted-foreground">{criterion.description}</p>
                        </div>
                      ))}
                    </div>

                    <div className="mt-3">
                      <label className="mb-1 block text-xs text-muted-foreground">Notes</label>
                      <textarea
                        rows={3}
                        value={scoreDraft.notes}
                        onChange={(event) => setScoreDraft((prev) => ({ ...prev, notes: event.target.value }))}
                        className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>

                    {scoreError && (
                      <div className="mt-3 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                        {scoreError}
                      </div>
                    )}

                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={handleSaveScore}
                        disabled={scoreSubmitting}
                        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                      >
                        {scoreSubmitting ? "Saving..." : "Save Score"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setScoringPersonId(null);
                          setScoreDraft(EMPTY_SCORE_DRAFT);
                          setScoreError(null);
                        }}
                        className="rounded-lg bg-secondary px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
