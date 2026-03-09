/**
 * Founder Finder Tab
 *
 * One-click sourcing pipeline that uses Exa Websets to find
 * Bay Area GenAI founders, scores them with the EEA engine,
 * and enriches with Parallel Task Groups.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  ClipboardCopy,
  Download,
  ExternalLink,
  Filter,
  Loader2,
  Search,
  Upload,
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
// Component
// ---------------------------------------------------------------------------

export default function FounderFinderTab({ workspace }: Props) {
  const [step, setStep] = useState<FounderPipelineStep>("idle");
  const [candidates, setCandidates] = useState<CandidateResult[]>([]);
  const [taskGroupId, setTaskGroupId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importingKey, setImportingKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Filters
  const [filterTier, setFilterTier] = useState<1 | 2 | 3 | null>(null);
  const [filterBayArea, setFilterBayArea] = useState(false);
  const [filterB2B, setFilterB2B] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Expanded cards
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  // Enrichment outreach hooks (populated after Parallel enrichment)
  const [outreachHooks, setOutreachHooks] = useState<Record<string, string>>({});

  // Poll interval ref
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup poll on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Run Pipeline
  // ---------------------------------------------------------------------------

  const runPipeline = useCallback(async () => {
    setError(null);
    setCandidates([]);
    setTaskGroupId(null);
    setOutreachHooks({});
    setExpandedCards(new Set());

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
              // Enrichment failed but we still have Exa results
              setStep("complete");
            }
          } catch {
            // Silently continue polling
          }
        }, 8000);
      } catch (enrichError) {
        // Enrichment failed — show Exa results without enrichment
        console.error("Enrichment failed:", enrichError);
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

  const handleImport = async (candidate: CandidateResult) => {
    const key = candidate.profileUrl || candidate.name;
    if (importingKey) return;

    try {
      setImportingKey(key);
      await workspace.addPerson({
        fullName: candidate.name,
        linkedinUrl: candidate.linkedinUrl || null,
        githubUrl: candidate.githubUrl || null,
        currentRole: candidate.title || null,
        currentCompany: candidate.company || null,
        location: candidate.location || null,
        bio: candidate.eeaScore.summary || null,
        personType: "fir",
        sourceChannel: "founder-finder",
        metadata: {
          eeaTier: candidate.eeaScore.tier,
          eeaScore: candidate.eeaScore.score,
          profileUrl: candidate.profileUrl,
        },
      });
    } catch (importError) {
      console.error("Import failed:", importError);
    } finally {
      setImportingKey(null);
    }
  };

  const isImported = (candidate: CandidateResult): boolean => {
    const candidateName = candidate.name.toLowerCase().trim();
    return workspace.people.some((p) => {
      if (candidate.linkedinUrl && p.linkedinUrl) {
        const a = candidate.linkedinUrl.toLowerCase().replace(/\/+$/, "");
        const b = p.linkedinUrl.toLowerCase().replace(/\/+$/, "");
        if (a === b) return true;
      }
      return p.fullName.toLowerCase().trim() === candidateName &&
        (p.currentCompany || "").toLowerCase().trim() === (candidate.company || "").toLowerCase().trim();
    });
  };

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
            disabled={isRunning}
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

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
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
      {step === "idle" && !hasResults && (
        <div className="py-16 text-center bg-card border border-border rounded-xl">
          <Search className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            Click "Find Founders" to search for exceptional GenAI founders.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Requires Exa API key configured in Settings.
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
                    {candidate.eeaScore.tier ? `T${candidate.eeaScore.tier}` : "—"}
                  </span>
                </div>

                {/* Score Bar */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-mono text-[#888]">EEA Score</span>
                    <span className="text-xs font-mono font-medium text-[#e8e8e8]">{candidate.eeaScore.score}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[#2a2a35]">
                    <div
                      className={`h-full rounded-full transition-all ${scoreBarColor(candidate.eeaScore.tier)}`}
                      style={{ width: `${candidate.eeaScore.score}%` }}
                    />
                  </div>
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
