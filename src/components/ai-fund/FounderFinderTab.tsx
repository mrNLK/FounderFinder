/**
 * Founder Finder Tab
 *
 * One-click sourcing pipeline that uses Exa Websets to find
 * Bay Area GenAI founders, scores them with the EEA engine,
 * and enriches with Parallel Task Groups.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Brain,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  ClipboardCopy,
  Copy,
  Download,
  ExternalLink,
  Filter,
  Info,
  Loader2,
  Search,
  Sparkles,
  Tags,
  Upload,
  Users,
  X,
} from "lucide-react";
import type {
  AiFundWorkspace,
} from "@/types/ai-fund";
import type {
  CandidateResult,
  FounderPipelineStep,
  ParallelEnrichmentResult,
  B2BFocus,
  TechnicalDepth,
} from "@/types/founder-finder";
import { scoreCandidate } from "@/lib/eea-scorer";
import {
  startFounderSource,
  startFounderEnrich,
  pollFounderEnrich,
  mergeEnrichmentResults,
  exportCandidatesCsv,
  downloadCsv,
} from "@/lib/founder-finder";
import { normalizeComparableUrl } from "@/lib/url-utils";
import type { DuplicateGroup, SignalClassification, ExtractedEntities } from "@/lib/huggingface";
import { findDuplicateCandidates, classifySignals, extractEntities } from "@/lib/huggingface";

interface Props {
  workspace: AiFundWorkspace;
}

// ---------------------------------------------------------------------------
// Pipeline Step Labels
// ---------------------------------------------------------------------------

const STEP_LABELS: Record<FounderPipelineStep, string> = {
  idle: "Ready",
  sourcing: "Searching Exa Websets...",
  scoring: "Scoring EEA signals...",
  enriching: "Enriching with Parallel...",
  merging: "Merging enrichment results...",
  complete: "Pipeline complete",
  error: "Pipeline error",
};

// ---------------------------------------------------------------------------
// Tier Badge Styles
// ---------------------------------------------------------------------------

function tierBadge(tier: 1 | 2 | 3 | null): { label: string; className: string } {
  switch (tier) {
    case 1:
      return {
        label: "Tier 1 — Immediate Outreach",
        className: "bg-[#00e5a020] text-[#00e5a0] border-[#00e5a040]",
      };
    case 2:
      return {
        label: "Tier 2 — Build the Case",
        className: "bg-[#f5a62320] text-[#f5a623] border-[#f5a62340]",
      };
    case 3:
      return {
        label: "Tier 3 — Weak Signal",
        className: "bg-[#ffffff10] text-[#888] border-[#ffffff20]",
      };
    default:
      return {
        label: "Unscored",
        className: "bg-[#ffffff10] text-[#555] border-[#ffffff10]",
      };
  }
}

function scoreBarColor(tier: 1 | 2 | 3 | null): string {
  switch (tier) {
    case 1: return "bg-[#00e5a0]";
    case 2: return "bg-[#f5a623]";
    case 3: return "bg-[#888]";
    default: return "bg-[#555]";
  }
}

// ---------------------------------------------------------------------------
// Score Breakdown
// ---------------------------------------------------------------------------

function scoreBreakdown(eeaScore: CandidateResult["eeaScore"]): string {
  const parts: string[] = [];

  if (eeaScore.matchedTier1.length > 0) {
    parts.push(`Base: 85 (Tier 1 signal)`);
    if (eeaScore.matchedTier1.length > 1) {
      parts.push(`+${(eeaScore.matchedTier1.length - 1) * 5} (${eeaScore.matchedTier1.length - 1} additional T1)`);
    }
  } else if (eeaScore.matchedTier2.length > 0) {
    parts.push(`Base: 40 + ${eeaScore.matchedTier2.length} × 8 = ${40 + eeaScore.matchedTier2.length * 8}`);
  }

  // We can't know exact bonuses from the score alone, but we can indicate them
  if (eeaScore.falsePositiveFlags.length > 0) {
    parts.push(`−${eeaScore.falsePositiveFlags.length * 10} (${eeaScore.falsePositiveFlags.length} FP flag${eeaScore.falsePositiveFlags.length > 1 ? "s" : ""})`);
  }

  parts.push(`Final: ${eeaScore.score}/100`);
  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function FounderFinderTab({ workspace }: Props) {
  const [step, setStep] = useState<FounderPipelineStep>("idle");
  const [candidates, setCandidates] = useState<CandidateResult[]>([]);
  const [taskGroupId, setTaskGroupId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importingKey, setImportingKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [enrichmentFailed, setEnrichmentFailed] = useState(false);
  const [batchImporting, setBatchImporting] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
  const [showScoreBreakdown, setShowScoreBreakdown] = useState<string | null>(null);

  // Filters
  const [filterTier, setFilterTier] = useState<1 | 2 | 3 | null>(null);
  const [filterBayArea, setFilterBayArea] = useState(false);
  const [filterB2B, setFilterB2B] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Expanded cards
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  // Enrichment outreach hooks (populated after Parallel enrichment)
  const [outreachHooks, setOutreachHooks] = useState<Record<string, string>>({});

  // HF enhancement state
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [hfClassifications, setHfClassifications] = useState<SignalClassification[]>([]);
  const [hfEntities, setHfEntities] = useState<ExtractedEntities[]>([]);
  const [hfAction, setHfAction] = useState<"dedup" | "classify" | "ner" | null>(null);
  const [hfError, setHfError] = useState<string | null>(null);

  // Poll interval ref
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup poll on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Pre-flight checks
  // ---------------------------------------------------------------------------

  const exaConfigured = useMemo(() => {
    const exa = workspace.settings?.integrations?.exa;
    if (!exa) return false;
    return !!exa.configured;
  }, [workspace.settings]);

  const parallelConfigured = useMemo(() => {
    const parallel = workspace.settings?.integrations?.parallel;
    if (!parallel) return false;
    return !!parallel.configured;
  }, [workspace.settings]);

  // ---------------------------------------------------------------------------
  // Run Pipeline
  // ---------------------------------------------------------------------------

  const runPipeline = useCallback(async () => {
    setError(null);
    setCandidates([]);
    setTaskGroupId(null);
    setOutreachHooks({});
    setExpandedCards(new Set());
    setEnrichmentFailed(false);
    setBatchProgress(null);
    setShowScoreBreakdown(null);

    try {
      // Step 1: Source from Exa Websets
      setStep("sourcing");
      const sourceResult = await startFounderSource({ count: 20, appendQueries: true });

      if (!sourceResult.candidates || sourceResult.candidates.length === 0) {
        setStep("complete");
        return;
      }

      // Step 2: Score with EEA engine
      setStep("scoring");
      const scored = sourceResult.candidates.map((c) => {
        const signals = [
          c.eeaSignals,
          c.title,
          c.company,
          c.location,
          c.snippet,
        ].filter(Boolean);

        const eeaScore = scoreCandidate(signals);
        const b2bFocus = normalizeBFocus(c.b2bFocus);
        const technicalDepth = normalizeTechDepth(c.technicalDepth);

        return {
          ...c,
          b2bFocus,
          technicalDepth,
          eeaScore,
        } satisfies CandidateResult;
      });

      // Sort by score descending
      scored.sort((a, b) => b.eeaScore.score - a.eeaScore.score);
      setCandidates(scored);

      // Step 3: Start Parallel enrichment (non-blocking)
      setStep("enriching");
      try {
        const enrichInput = scored.slice(0, 30).map((c) => ({
          name: c.name,
          company: c.company,
          title: c.title,
          profileUrl: c.profileUrl,
          linkedinUrl: c.linkedinUrl,
          existingSignals: c.eeaSignals,
        }));

        const enrichResult = await startFounderEnrich(enrichInput);
        setTaskGroupId(enrichResult.taskGroupId);

        // Poll for enrichment completion
        pollRef.current = setInterval(async () => {
          try {
            const status = await pollFounderEnrich(enrichResult.taskGroupId);

            if (status.status === "completed" && status.results) {
              if (pollRef.current) clearInterval(pollRef.current);
              pollRef.current = null;

              setStep("merging");
              const enrichments = status.results as ParallelEnrichmentResult[];
              setCandidates((prev) => {
                const merged = mergeEnrichmentResults(prev, enrichments);
                // Re-score with enriched signals
                const rescored = merged.map((c) => {
                  const signals = [
                    c.eeaSignals,
                    c.title,
                    c.company,
                    c.location,
                    c.snippet,
                  ].filter(Boolean);
                  return { ...c, eeaScore: scoreCandidate(signals) };
                });
                rescored.sort((a, b) => b.eeaScore.score - a.eeaScore.score);
                return rescored;
              });

              // Extract outreach hooks
              const hooks: Record<string, string> = {};
              for (const e of enrichments) {
                if (e.outreach_hook) {
                  hooks[e.name.toLowerCase().trim()] = e.outreach_hook;
                }
              }
              setOutreachHooks(hooks);

              setStep("complete");
            } else if (status.status === "error") {
              if (pollRef.current) clearInterval(pollRef.current);
              pollRef.current = null;
              setEnrichmentFailed(true);
              setStep("complete");
            }
          } catch {
            // Silently continue polling
          }
        }, 8000);
      } catch (enrichError) {
        // Enrichment failed — show Exa results without enrichment
        console.error("Enrichment failed:", enrichError);
        setEnrichmentFailed(true);
        setStep("complete");
      }
    } catch (pipelineError) {
      console.error("Pipeline failed:", pipelineError);
      setError(pipelineError instanceof Error ? pipelineError.message : "Pipeline failed");
      setStep("error");
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function normalizeBFocus(raw: string): B2BFocus {
    const lower = raw.toLowerCase().trim();
    if (lower === "b2b") return "B2B";
    if (lower === "b2c") return "B2C";
    if (lower === "both") return "Both";
    return "Unclear";
  }

  function normalizeTechDepth(raw: string): TechnicalDepth {
    const lower = raw.toLowerCase().trim();
    if (lower.includes("deep")) return "Deep technical";
    if (lower.includes("technical pm")) return "Technical PM";
    if (lower.includes("non")) return "Non-technical";
    return "Unclear";
  }

  const toggleExpanded = (key: string) => {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleCopy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      // Clipboard not available
    }
  };

  const handleExport = () => {
    const csv = exportCandidatesCsv(filteredCandidates);
    downloadCsv(csv, `founder-finder-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const buildPersonPayload = (candidate: CandidateResult) => ({
    fullName: candidate.name,
    linkedinUrl: candidate.linkedinUrl || null,
    githubUrl: candidate.githubUrl || null,
    currentRole: candidate.title || null,
    currentCompany: candidate.company || null,
    location: candidate.location || null,
    bio: candidate.eeaScore.summary || null,
    personType: "fir" as const,
    sourceChannel: "founder-finder",
    metadata: {
      eeaTier: candidate.eeaScore.tier,
      eeaScore: candidate.eeaScore.score,
      eeaMatchedTier1: candidate.eeaScore.matchedTier1,
      eeaMatchedTier2: candidate.eeaScore.matchedTier2,
      falsePositiveFlags: candidate.eeaScore.falsePositiveFlags,
      eeaSummary: candidate.eeaScore.summary,
      profileUrl: candidate.profileUrl,
    },
  });

  const handleImport = async (candidate: CandidateResult) => {
    const key = candidate.profileUrl || candidate.name;
    if (importingKey) return;

    try {
      setImportingKey(key);
      await workspace.addPerson(buildPersonPayload(candidate));
    } catch (importError) {
      console.error("Import failed:", importError);
    } finally {
      setImportingKey(null);
    }
  };

  const handleBatchImportTier1 = useCallback(async () => {
    const tier1 = candidates.filter((c) => c.eeaScore.tier === 1 && !isImported(c));
    if (tier1.length === 0 || batchImporting) return;

    setBatchImporting(true);
    setBatchProgress({ done: 0, total: tier1.length });

    for (let i = 0; i < tier1.length; i++) {
      try {
        await workspace.addPerson(buildPersonPayload(tier1[i]));
      } catch (err) {
        console.error(`Batch import failed for ${tier1[i].name}:`, err);
      }
      setBatchProgress({ done: i + 1, total: tier1.length });
    }

    setBatchImporting(false);
    setBatchProgress(null);
  }, [candidates, batchImporting, workspace]);

  const isImported = (candidate: CandidateResult): boolean => {
    const candidateLinkedIn = normalizeComparableUrl(candidate.linkedinUrl);
    const candidateGitHub = normalizeComparableUrl(candidate.githubUrl);
    const candidateName = candidate.name.toLowerCase().trim();
    const candidateCompany = (candidate.company || "").toLowerCase().trim();

    return workspace.people.some((p) => {
      const personLinkedIn = normalizeComparableUrl(p.linkedinUrl);
      const personGitHub = normalizeComparableUrl(p.githubUrl);

      if (candidateLinkedIn && personLinkedIn === candidateLinkedIn) return true;
      if (candidateGitHub && personGitHub === candidateGitHub) return true;

      return (
        p.fullName.toLowerCase().trim() === candidateName &&
        (p.currentCompany || "").toLowerCase().trim() === candidateCompany
      );
    });
  };

  // ---------------------------------------------------------------------------
  // HF Enhancement Handlers
  // ---------------------------------------------------------------------------

  const hfConfigured = useMemo(() => {
    const hf = workspace.settings?.integrations?.huggingface;
    return !!hf?.configured;
  }, [workspace.settings]);

  const handleFindDuplicates = useCallback(async () => {
    if (!hfConfigured || candidates.length < 2) return;
    setHfAction("dedup");
    setHfError(null);
    try {
      const dedupInput = candidates.map((c, i) => ({
        id: c.profileUrl || String(i),
        name: c.name,
        company: c.company,
        title: c.title,
        location: c.location,
      }));
      const groups = await findDuplicateCandidates(dedupInput);
      setDuplicateGroups(groups);
    } catch (err: unknown) {
      setHfError(err instanceof Error ? err.message : "Dedup failed");
    } finally {
      setHfAction(null);
    }
  }, [candidates, hfConfigured]);

  const handleClassifySignals = useCallback(async () => {
    if (!hfConfigured || candidates.length === 0) return;
    setHfAction("classify");
    setHfError(null);
    try {
      const signals = candidates
        .flatMap((c) => c.eeaSignals.split(" | ").map((s) => s.trim()))
        .filter((s) => s.length > 10)
        .slice(0, 50);
      const classifications = await classifySignals(signals);
      setHfClassifications(classifications);
    } catch (err: unknown) {
      setHfError(err instanceof Error ? err.message : "Classification failed");
    } finally {
      setHfAction(null);
    }
  }, [candidates, hfConfigured]);

  const handleExtractEntities = useCallback(async () => {
    if (!hfConfigured || candidates.length === 0) return;
    setHfAction("ner");
    setHfError(null);
    try {
      const texts = candidates
        .map((c) => c.eeaSignals)
        .filter((s) => s.length > 10)
        .slice(0, 20);
      const entities = await extractEntities(texts);
      setHfEntities(entities);
    } catch (err: unknown) {
      setHfError(err instanceof Error ? err.message : "NER extraction failed");
    } finally {
      setHfAction(null);
    }
  }, [candidates, hfConfigured]);

  // ---------------------------------------------------------------------------
  // Filtered & Sorted Candidates
  // ---------------------------------------------------------------------------

  const filteredCandidates = candidates.filter((c) => {
    if (filterTier !== null && c.eeaScore.tier !== filterTier) return false;
    if (filterBayArea) {
      const loc = c.location.toLowerCase();
      const bayAreaTerms = ["bay area", "san francisco", "sf", "palo alto", "mountain view", "menlo park", "sunnyvale", "santa clara", "berkeley", "oakland", "san jose"];
      if (!bayAreaTerms.some((t) => loc.includes(t))) return false;
    }
    if (filterB2B && c.b2bFocus !== "B2B" && c.b2bFocus !== "Both") return false;
    return true;
  });

  const isRunning = step === "sourcing" || step === "scoring" || step === "enriching" || step === "merging";
  const hasResults = candidates.length > 0;
  const tier1Count = candidates.filter((c) => c.eeaScore.tier === 1 && !isImported(c)).length;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Founder Finder</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Surface exceptional GenAI founders for AI Fund's FIR program
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasResults && tier1Count > 0 && (
            <button
              onClick={() => void handleBatchImportTier1()}
              disabled={batchImporting || isRunning}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#00e5a040] bg-[#00e5a010] text-sm font-medium text-[#00e5a0] hover:bg-[#00e5a020] disabled:opacity-50 transition-colors"
            >
              {batchImporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {batchProgress ? `${batchProgress.done}/${batchProgress.total}` : "..."}
                </>
              ) : (
                <>
                  <Users className="w-4 h-4" />
                  Import All Tier 1 ({tier1Count})
                </>
              )}
            </button>
          )}
          {hasResults && (
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-secondary transition-colors"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          )}
          <button
            onClick={runPipeline}
            disabled={isRunning || !exaConfigured}
            title={!exaConfigured ? "Configure Exa API key in Settings first" : undefined}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {isRunning ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
            {isRunning ? STEP_LABELS[step] : "Find Founders"}
          </button>
        </div>
      </div>

      {/* Pre-flight: Exa not configured */}
      {!exaConfigured && step === "idle" && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-400 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Exa API key not configured. Add it in the{" "}
            <span className="font-medium text-amber-300">Settings</span> tab to use Founder Finder.
          </span>
        </div>
      )}

      {/* Pre-flight: Parallel not configured (warning only) */}
      {exaConfigured && !parallelConfigured && step === "idle" && !hasResults && (
        <div className="rounded-xl border border-border bg-background px-4 py-3 text-xs text-muted-foreground flex items-start gap-2">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            Parallel API key not configured. Enrichment (outreach hooks, deep signals) will be skipped.
          </span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Enrichment failure warning */}
      {enrichmentFailed && step === "complete" && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-400 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Enrichment unavailable — showing Exa results only. Outreach hooks and deep signals require a configured Parallel API key.
          </span>
        </div>
      )}

      {/* HF Enhancement Toolbar */}
      {hasResults && step === "complete" && hfConfigured && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            <Sparkles className="w-3.5 h-3.5" />
            Hugging Face Enhancements
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void handleFindDuplicates()}
              disabled={hfAction !== null}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
            >
              {hfAction === "dedup" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
              {hfAction === "dedup" ? "Finding dupes..." : `Smart Dedup (${candidates.length})`}
            </button>
            <button
              onClick={() => void handleClassifySignals()}
              disabled={hfAction !== null}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
            >
              {hfAction === "classify" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Brain className="h-3.5 w-3.5" />}
              {hfAction === "classify" ? "Classifying..." : "Classify Signals"}
            </button>
            <button
              onClick={() => void handleExtractEntities()}
              disabled={hfAction !== null}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
            >
              {hfAction === "ner" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Tags className="h-3.5 w-3.5" />}
              {hfAction === "ner" ? "Extracting..." : "Extract Entities"}
            </button>
          </div>

          {hfError && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {hfError}
            </div>
          )}

          {/* Dedup results */}
          {duplicateGroups.length > 0 && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
              <p className="text-xs font-medium text-amber-400 mb-1">
                {duplicateGroups.length} duplicate group{duplicateGroups.length > 1 ? "s" : ""} found
              </p>
              {duplicateGroups.map((group, i) => {
                const names = group.ids.map((id) => {
                  const c = candidates.find((c) => (c.profileUrl || "") === id);
                  return c?.name || id;
                });
                return (
                  <p key={i} className="text-xs text-amber-300/80">
                    {names.join(" ~ ")} (similarity: {group.similarity})
                  </p>
                );
              })}
            </div>
          )}

          {/* Classification results */}
          {hfClassifications.length > 0 && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
              <p className="text-xs font-medium text-primary mb-1">
                {hfClassifications.length} signal{hfClassifications.length > 1 ? "s" : ""} classified
              </p>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {hfClassifications.slice(0, 20).map((c, i) => (
                  <p key={i} className="text-xs text-muted-foreground">
                    <span className="rounded-full border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary mr-1">
                      {c.label}
                    </span>
                    <span className="text-foreground/80">{c.signal.slice(0, 80)}</span>
                    <span className="text-muted-foreground ml-1">({c.score})</span>
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* NER results */}
          {hfEntities.length > 0 && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
              <p className="text-xs font-medium text-primary mb-1">
                Entities extracted from {hfEntities.length} signal{hfEntities.length > 1 ? "s" : ""}
              </p>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {hfEntities.filter((e) => e.organizations.length > 0 || e.persons.length > 0).slice(0, 15).map((e, i) => (
                  <div key={i} className="text-xs text-muted-foreground">
                    {e.organizations.length > 0 && (
                      <span>
                        <span className="text-[10px] text-emerald-400 mr-1">ORG:</span>
                        {e.organizations.join(", ")}
                      </span>
                    )}
                    {e.persons.length > 0 && (
                      <span className="ml-2">
                        <span className="text-[10px] text-blue-400 mr-1">PER:</span>
                        {e.persons.join(", ")}
                      </span>
                    )}
                    {e.locations.length > 0 && (
                      <span className="ml-2">
                        <span className="text-[10px] text-yellow-400 mr-1">LOC:</span>
                        {e.locations.join(", ")}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Progress */}
      {isRunning && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
          <div className="flex items-center gap-3">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">{STEP_LABELS[step]}</p>
              <div className="flex gap-2 mt-2">
                {(["sourcing", "scoring", "enriching"] as const).map((s) => {
                  const stepOrder = { sourcing: 0, scoring: 1, enriching: 2, merging: 2, complete: 3, error: -1, idle: -1 };
                  const current = stepOrder[step] ?? -1;
                  const target = stepOrder[s] ?? -1;
                  const isDone = current > target;
                  const isActive = current === target;
                  return (
                    <div key={s} className="flex items-center gap-1.5 text-xs">
                      {isDone ? (
                        <CheckCircle className="w-3 h-3 text-primary" />
                      ) : isActive ? (
                        <Loader2 className="w-3 h-3 animate-spin text-primary" />
                      ) : (
                        <div className="w-3 h-3 rounded-full border border-border" />
                      )}
                      <span className={isDone || isActive ? "text-foreground" : "text-muted-foreground"}>
                        {s === "sourcing" ? "Exa" : s === "scoring" ? "EEA" : "Parallel"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      {hasResults && (
        <div className="space-y-3">
          <button
            onClick={() => setShowFilters((v) => !v)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Filter className="w-4 h-4" />
            Filters
            {(filterTier !== null || filterBayArea || filterB2B) && (
              <span className="rounded-full bg-primary/20 text-primary px-2 py-0.5 text-[10px] font-medium">
                Active
              </span>
            )}
          </button>

          {showFilters && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setFilterTier(filterTier === 1 ? null : 1)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  filterTier === 1
                    ? "bg-[#00e5a020] text-[#00e5a0] border-[#00e5a040]"
                    : "bg-background border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                Tier 1 Only
              </button>
              <button
                onClick={() => setFilterTier(filterTier === 2 ? null : 2)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  filterTier === 2
                    ? "bg-[#f5a62320] text-[#f5a623] border-[#f5a62340]"
                    : "bg-background border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                Tier 2 Only
              </button>
              <button
                onClick={() => setFilterBayArea((v) => !v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  filterBayArea
                    ? "bg-primary/10 text-primary border-primary/20"
                    : "bg-background border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                Bay Area Only
              </button>
              <button
                onClick={() => setFilterB2B((v) => !v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  filterB2B
                    ? "bg-primary/10 text-primary border-primary/20"
                    : "bg-background border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                B2B Only
              </button>
              {(filterTier !== null || filterBayArea || filterB2B) && (
                <button
                  onClick={() => { setFilterTier(null); setFilterBayArea(false); setFilterB2B(false); }}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-3 h-3" /> Clear
                </button>
              )}
              <span className="text-xs text-muted-foreground ml-2">
                {filteredCandidates.length} of {candidates.length} candidates
              </span>
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {step === "idle" && !hasResults && exaConfigured && (
        <div className="py-16 text-center bg-card border border-border rounded-xl">
          <Search className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            Click "Find Founders" to search for exceptional GenAI founders.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Uses Exa Websets with 5 search queries and 9 enrichment columns.
          </p>
        </div>
      )}

      {/* Results Grid */}
      {filteredCandidates.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredCandidates.map((candidate) => {
            const badge = tierBadge(candidate.eeaScore.tier);
            const cardKey = candidate.profileUrl || candidate.name;
            const isExpanded = expandedCards.has(cardKey);
            const alreadyImported = isImported(candidate);
            const outreachHook = outreachHooks[candidate.name.toLowerCase().trim()] || null;
            const showBreakdown = showScoreBreakdown === cardKey;

            return (
              <div
                key={cardKey}
                className="rounded-xl border border-[#2a2a35] bg-[#13131a] p-5 space-y-3"
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#e8e8e8] truncate">{candidate.name}</p>
                    <p className="text-xs text-[#888] truncate mt-0.5">
                      {[candidate.title, candidate.company].filter(Boolean).join(" at ")}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${badge.className}`}>
                    {candidate.eeaScore.tier ? `T${candidate.eeaScore.tier}` : "\u2014"}
                  </span>
                </div>

                {/* Score Bar */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <button
                      onClick={() => setShowScoreBreakdown(showBreakdown ? null : cardKey)}
                      className="flex items-center gap-1 text-[10px] font-mono text-[#888] hover:text-[#e8e8e8] transition-colors"
                      title="Click to see score breakdown"
                    >
                      EEA Score
                      <Info className="w-2.5 h-2.5" />
                    </button>
                    <span className="text-xs font-mono font-medium text-[#e8e8e8]">{candidate.eeaScore.score}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[#2a2a35]">
                    <div
                      className={`h-full rounded-full transition-all ${scoreBarColor(candidate.eeaScore.tier)}`}
                      style={{ width: `${candidate.eeaScore.score}%` }}
                    />
                  </div>
                  {showBreakdown && (
                    <pre className="mt-2 text-[10px] font-mono text-[#888] leading-relaxed whitespace-pre-wrap bg-[#0d0d12] rounded-md px-2 py-1.5 border border-[#2a2a35]">
                      {scoreBreakdown(candidate.eeaScore)}
                    </pre>
                  )}
                </div>

                {/* Tier Badge */}
                <div className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-medium ${badge.className}`}>
                  {badge.label}
                </div>

                {/* Location + Badges */}
                <div className="flex flex-wrap gap-1.5">
                  {candidate.location && (
                    <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] text-[#888]">
                      {candidate.location}
                    </span>
                  )}
                  {candidate.b2bFocus === "B2B" && (
                    <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] text-primary font-medium">
                      B2B
                    </span>
                  )}
                  {candidate.technicalDepth === "Deep technical" && (
                    <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] text-primary font-medium">
                      Deep Technical
                    </span>
                  )}
                  {candidate.isFounder && (
                    <span className="rounded-full border border-[#00e5a040] bg-[#00e5a020] px-2 py-0.5 text-[10px] text-[#00e5a0] font-medium">
                      Founder
                    </span>
                  )}
                </div>

                {/* Tier 1 Signals */}
                {candidate.eeaScore.matchedTier1.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {candidate.eeaScore.matchedTier1.map((signal) => (
                      <span
                        key={signal}
                        className="rounded-full border border-[#00e5a040] bg-[#00e5a010] px-2 py-0.5 text-[10px] text-[#00e5a0]"
                      >
                        {signal}
                      </span>
                    ))}
                  </div>
                )}

                {/* Tier 2 Signals (collapsed) */}
                {candidate.eeaScore.matchedTier2.length > 0 && (
                  <div>
                    <button
                      onClick={() => toggleExpanded(cardKey)}
                      className="flex items-center gap-1 text-[10px] text-[#888] hover:text-[#e8e8e8] transition-colors"
                    >
                      {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      {candidate.eeaScore.matchedTier2.length} Tier 2 signal{candidate.eeaScore.matchedTier2.length > 1 ? "s" : ""}
                    </button>
                    {isExpanded && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {candidate.eeaScore.matchedTier2.map((signal) => (
                          <span
                            key={signal}
                            className="rounded-full border border-[#f5a62330] bg-[#f5a62310] px-2 py-0.5 text-[10px] text-[#f5a623]"
                          >
                            {signal}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* False Positive Flags */}
                {candidate.eeaScore.falsePositiveFlags.length > 0 && (
                  <div className="space-y-1">
                    {candidate.eeaScore.falsePositiveFlags.map((flag) => (
                      <div key={flag} className="flex items-start gap-1.5 text-[10px] text-amber-400">
                        <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                        <span>{flag}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* EEA Summary */}
                <p className="text-xs leading-relaxed text-[#888]">{candidate.eeaScore.summary}</p>

                {/* Outreach Hook */}
                {outreachHook && (
                  <div className="rounded-lg border border-border bg-background px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs text-[#e8e8e8] leading-relaxed italic">{outreachHook}</p>
                      <button
                        onClick={() => handleCopy(outreachHook, cardKey)}
                        className="shrink-0 text-[#888] hover:text-primary transition-colors"
                        title="Copy outreach hook"
                      >
                        {copiedKey === cardKey ? (
                          <CheckCircle className="w-3.5 h-3.5 text-primary" />
                        ) : (
                          <ClipboardCopy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* Action Row */}
                <div className="flex items-center gap-2 pt-1 border-t border-[#2a2a35]">
                  {candidate.linkedinUrl && (
                    <a
                      href={candidate.linkedinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-[#888] hover:text-[#e8e8e8] border border-[#2a2a35] hover:border-[#444] transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" />
                      LinkedIn
                    </a>
                  )}
                  {!candidate.linkedinUrl && (
                    <span className="text-[10px] text-[#555]">No verified LinkedIn</span>
                  )}
                  {candidate.githubUrl && (
                    <a
                      href={candidate.githubUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-[#888] hover:text-[#e8e8e8] border border-[#2a2a35] hover:border-[#444] transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" />
                      GitHub
                    </a>
                  )}
                  <div className="flex-1" />
                  <button
                    onClick={() => void handleImport(candidate)}
                    disabled={alreadyImported || importingKey === cardKey}
                    className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-primary hover:bg-primary/10 border border-primary/20 disabled:opacity-50 transition-colors"
                  >
                    {importingKey === cardKey ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Upload className="w-3 h-3" />
                    )}
                    {alreadyImported ? "Imported" : "Import"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Complete with no results */}
      {step === "complete" && candidates.length === 0 && (
        <div className="py-12 text-center bg-card border border-border rounded-xl">
          <p className="text-sm text-muted-foreground">
            No candidates found. Try adjusting your search parameters.
          </p>
        </div>
      )}
    </div>
  );
}
