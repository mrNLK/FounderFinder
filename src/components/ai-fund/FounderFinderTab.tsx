/**
 * FounderFinder Tab
 *
 * EEA-driven sourcing pipeline UI.
 * Calls Supabase Edge Functions for Exa sourcing + Parallel enrichment.
 * Shows partial results from Exa immediately while Parallel runs in background.
 */

import { useState, useCallback, useMemo } from "react";
import {
  Search,
  Download,
  Loader2,
  ExternalLink,
  Copy,
  Check,
  AlertTriangle,
  MapPin,
  Building2,
  Cpu,
  Trophy,
  RefreshCw,
  Filter,
  X,
  UserPlus,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { scoreCandidate } from "@/lib/eea-scorer";
import type {
  CandidateResult,
  PipelineState,
  PipelineStep,
  ParallelEnrichmentResult,
  HarmonicSourceResponse,
  SourceChannel,
} from "@/types/founder-finder";
import type { AiFundPerson } from "@/types/ai-fund";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";

async function callEdgeFunction<T>(
  name: string,
  options: { method?: string; body?: unknown; params?: Record<string, string> } = {}
): Promise<T> {
  const session = (await supabase.auth.getSession()).data.session;
  if (!session) throw new Error("Not authenticated");

  const url = new URL(`${SUPABASE_URL}/functions/v1/${name}`);
  if (options.params) {
    for (const [k, v] of Object.entries(options.params)) {
      url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url.toString(), {
    method: options.method || (options.body ? "POST" : "GET"),
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY || "",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Edge function ${name} failed (${res.status}): ${text}`);
  }

  return res.json();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Step label map
// ---------------------------------------------------------------------------

const BAY_AREA_TERMS = ["san francisco", "bay area", "sf", "palo alto", "mountain view", "menlo park", "sunnyvale", "santa clara", "berkeley", "oakland", "san jose", "redwood city", "silicon valley"];

const STEP_LABELS: Record<PipelineStep, string> = {
  idle: "Ready",
  sourcing_exa: "Running Exa Webset sourcing...",
  sourcing_harmonic: "Running Harmonic founder extraction...",
  sourcing_both: "Running Exa + Harmonic in parallel...",
  creating_webset: "Creating Exa Webset with 5 query variants...",
  polling_webset: "Searching for candidates (this takes 2-4 min)...",
  retrieving_items: "Retrieving and deduplicating results...",
  scoring: "Running EEA scoring engine on merged pipeline...",
  enriching: "Submitting to Parallel for deep enrichment...",
  polling_enrichment: "Parallel deep research running (2-5 min)...",
  merging: "Merging enrichment data and re-scoring...",
  complete: "Pipeline complete",
  error: "Error",
};

// ---------------------------------------------------------------------------
// Tier badge component
// ---------------------------------------------------------------------------

function TierBadge({ tier, score }: { tier: 1 | 2 | 3 | null; score: number }) {
  const config = tier === 1
    ? { bg: "bg-emerald-500/15", border: "border-emerald-500/30", text: "text-emerald-400", label: "Tier 1" }
    : tier === 2
    ? { bg: "bg-amber-500/15", border: "border-amber-500/30", text: "text-amber-400", label: "Tier 2" }
    : tier === 3
    ? { bg: "bg-zinc-500/15", border: "border-zinc-500/30", text: "text-zinc-400", label: "Tier 3" }
    : { bg: "bg-zinc-800/50", border: "border-zinc-700/30", text: "text-zinc-500", label: "No EEA" };

  return (
    <div className="flex items-center gap-2">
      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${config.bg} ${config.border} ${config.text}`}>
        {config.label}
      </span>
      <div className="flex items-center gap-1.5">
        <div className="w-16 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              tier === 1 ? "bg-emerald-500" : tier === 2 ? "bg-amber-500" : "bg-zinc-600"
            }`}
            style={{ width: `${score}%` }}
          />
        </div>
        <span className="text-[10px] text-zinc-500 font-mono tabular-nums">{score}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Signal pill component
// ---------------------------------------------------------------------------

function SignalPill({ label, tier }: { label: string; tier: 1 | 2 }) {
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
        tier === 1
          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
          : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
      }`}
    >
      {label}
    </span>
  );
}

function dedupeStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const results: string[] = [];

  for (const value of values) {
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (!trimmed) continue;
    const normalized = trimmed.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    results.push(trimmed);
  }

  return results;
}

function getSourceLabel(candidate: CandidateResult): string | null {
  if (!candidate.source) {
    return null;
  }

  if (candidate.source === "multi") {
    const channels = candidate.sourceChannels || [];
    if (channels.length > 0) {
      return channels.map((channel) => channel === "huggingface" ? "HF" : channel[0].toUpperCase() + channel.slice(1)).join("+");
    }
    return "Multi-source";
  }

  if (candidate.source === "huggingface") {
    return "HuggingFace";
  }

  if (candidate.source === "replicate") {
    return "Replicate";
  }

  if (candidate.source === "harmonic") {
    return "Harmonic";
  }

  return "Exa";
}

// ---------------------------------------------------------------------------
// Candidate card component
// ---------------------------------------------------------------------------

function candidateToPersonFields(c: CandidateResult): Partial<AiFundPerson> {
  const eea = c.eeaScore;
  return {
    fullName: c.name,
    currentRole: c.title || null,
    currentCompany: c.company || null,
    linkedinUrl: c.linkedinUrl || null,
    githubUrl: c.githubUrl || null,
    location: c.location || null,
    bio: eea.summary || null,
    personType: c.isFounder ? "fir" : "both",
    processStage: "identified",
    sourceChannel: "founderfinder",
    tags: [
      ...(eea.tier === 1 ? ["tier-1"] : eea.tier === 2 ? ["tier-2"] : []),
      ...(c.b2bFocus === "B2B" ? ["b2b"] : []),
      ...(c.technicalDepth === "Deep technical" ? ["deep-technical"] : []),
    ],
    metadata: {
      eeaScore: eea.score,
      eeaTier: eea.tier,
      eeaSignals: [
        ...eea.matchedTier1.map((s) => `[T1] ${s}`),
        ...eea.matchedTier2.map((s) => `[T2] ${s}`),
      ].join("; "),
      eeaSummary: eea.summary,
      eeaMatchedTier1: eea.matchedTier1,
      eeaMatchedTier2: eea.matchedTier2,
      eeaFalsePositiveFlags: eea.falsePositiveFlags,
      b2bFocus: c.b2bFocus,
      technicalDepth: c.technicalDepth,
      isFounder: c.isFounder,
      sourceUrl: c.profileUrl,
      outreachHook: c.outreachHook || null,
      fundingStage: c.fundingStage || null,
      fundingTotal: c.fundingTotal || null,
      headcount: c.headcount || null,
      huggingFace: c.huggingFace || [],
      papersWithCode: c.papersWithCode || [],
      replicateSignals: c.replicateSignals || [],
      founderAvailabilitySignals: c.founderAvailabilitySignals || [],
      selectiveProgramSignals: c.selectiveProgramSignals || [],
      builtInPublicSignals: c.builtInPublicSignals || [],
      weightsAndBiases: c.weightsAndBiases || [],
      devpostSignals: c.devpostSignals || [],
      andrewAdjacency: c.andrewAdjacency || [],
    },
  };
}

function CandidateCard({
  candidate,
  onAddPerson,
}: {
  candidate: CandidateResult;
  onAddPerson?: (fields: Partial<AiFundPerson>) => Promise<AiFundPerson | null>;
}) {
  const [copiedHook, setCopiedHook] = useState(false);
  const [addedToPool, setAddedToPool] = useState(false);
  const [addingToPool, setAddingToPool] = useState(false);
  const eea = candidate.eeaScore;
  const sourceLabel = getSourceLabel(candidate);
  const primaryHook = candidate.outreachHook || eea.summary || `${candidate.name} at ${candidate.company}`;

  const handleCopyHook = useCallback(() => {
    navigator.clipboard.writeText(primaryHook);
    setCopiedHook(true);
    setTimeout(() => setCopiedHook(false), 2000);
  }, [primaryHook]);

  const handleAddToPool = useCallback(async () => {
    if (!onAddPerson || addingToPool || addedToPool) return;
    setAddingToPool(true);
    try {
      const person = await onAddPerson(candidateToPersonFields(candidate));
      if (person) {
        setAddedToPool(true);
      }
    } finally {
      setAddingToPool(false);
    }
  }, [onAddPerson, candidate, addingToPool, addedToPool]);

  return (
    <div className="rounded-xl border border-zinc-800/60 bg-[#13131a] p-4 space-y-3 hover:border-zinc-700/60 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-zinc-100 truncate">{candidate.name}</h3>
            {candidate.isFounder && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-500/10 text-violet-400 border border-violet-500/20">
                Founder
              </span>
            )}
            {sourceLabel && candidate.source !== "exa" && (
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                candidate.source === "multi"
                  ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                  : candidate.source === "huggingface"
                    ? "bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20"
                    : candidate.source === "replicate"
                      ? "bg-violet-500/10 text-violet-400 border border-violet-500/20"
                    : "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
              }`}>
                {sourceLabel}
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-400 truncate mt-0.5">
            {candidate.title}{candidate.company ? ` @ ${candidate.company}` : ""}
          </p>
        </div>
        <TierBadge tier={eea.tier} score={eea.score} />
      </div>

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-zinc-500">
        {candidate.location && (
          <span className="flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            {candidate.location}
          </span>
        )}
        {candidate.b2bFocus !== "Unclear" && (
          <span className="flex items-center gap-1">
            <Building2 className="w-3 h-3" />
            {candidate.b2bFocus}
          </span>
        )}
        {candidate.technicalDepth !== "Unclear" && (
          <span className="flex items-center gap-1">
            <Cpu className="w-3 h-3" />
            {candidate.technicalDepth}
          </span>
        )}
        {candidate.huggingFace && candidate.huggingFace.length > 0 && (
          <span className="flex items-center gap-1 text-fuchsia-400/80">
            HF {candidate.huggingFace.length}
          </span>
        )}
        {candidate.papersWithCode && candidate.papersWithCode.length > 0 && (
          <span className="flex items-center gap-1 text-indigo-300/80">
            PWC {candidate.papersWithCode.length}
          </span>
        )}
        {candidate.replicateSignals && candidate.replicateSignals.length > 0 && (
          <span className="flex items-center gap-1 text-violet-400/80">
            Replicate {candidate.replicateSignals.length}
          </span>
        )}
        {candidate.founderAvailabilitySignals && candidate.founderAvailabilitySignals.length > 0 && (
          <span className="flex items-center gap-1 text-amber-400/80">
            Availability {candidate.founderAvailabilitySignals.length}
          </span>
        )}
        {candidate.selectiveProgramSignals && candidate.selectiveProgramSignals.length > 0 && (
          <span className="flex items-center gap-1 text-emerald-300/80">
            Programs {candidate.selectiveProgramSignals.length}
          </span>
        )}
        {candidate.builtInPublicSignals && candidate.builtInPublicSignals.length > 0 && (
          <span className="flex items-center gap-1 text-sky-300/80">
            Public {candidate.builtInPublicSignals.length}
          </span>
        )}
        {candidate.fundingStage && (
          <span className="flex items-center gap-1 text-cyan-500/70">
            {candidate.fundingStage}
            {candidate.fundingTotal ? ` ($${(candidate.fundingTotal / 1_000_000).toFixed(1)}M)` : ""}
          </span>
        )}
      </div>

      {/* EEA signals */}
      {(eea.matchedTier1.length > 0 || eea.matchedTier2.length > 0) && (
        <div className="flex flex-wrap gap-1">
          {eea.matchedTier1.map((s) => (
            <SignalPill key={s} label={s} tier={1} />
          ))}
          {eea.matchedTier2.map((s) => (
            <SignalPill key={s} label={s} tier={2} />
          ))}
        </div>
      )}

      {/* False positive warnings */}
      {eea.falsePositiveFlags.length > 0 && (
        <div className="flex items-start gap-1.5 text-[11px] text-amber-400/80">
          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
          <span>{eea.falsePositiveFlags.join("; ")}</span>
        </div>
      )}

      {candidate.huggingFace && candidate.huggingFace.length > 0 && (
        <div className="flex items-start gap-1.5 text-[11px] text-fuchsia-300/80">
          <span className="mt-0.5 shrink-0">HF</span>
          <span>{candidate.huggingFace.slice(0, 2).join("; ")}</span>
        </div>
      )}

      {candidate.papersWithCode && candidate.papersWithCode.length > 0 && (
        <div className="flex items-start gap-1.5 text-[11px] text-indigo-300/80">
          <span className="mt-0.5 shrink-0">PWC</span>
          <span>{candidate.papersWithCode.slice(0, 2).join("; ")}</span>
        </div>
      )}

      {candidate.replicateSignals && candidate.replicateSignals.length > 0 && (
        <div className="flex items-start gap-1.5 text-[11px] text-violet-300/80">
          <span className="mt-0.5 shrink-0">Replicate</span>
          <span>{candidate.replicateSignals.slice(0, 2).join("; ")}</span>
        </div>
      )}

      {candidate.founderAvailabilitySignals && candidate.founderAvailabilitySignals.length > 0 && (
        <div className="flex items-start gap-1.5 text-[11px] text-amber-300/80">
          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
          <span>{candidate.founderAvailabilitySignals.slice(0, 2).join("; ")}</span>
        </div>
      )}

      {candidate.selectiveProgramSignals && candidate.selectiveProgramSignals.length > 0 && (
        <div className="flex items-start gap-1.5 text-[11px] text-emerald-300/80">
          <Trophy className="w-3 h-3 mt-0.5 shrink-0" />
          <span>{candidate.selectiveProgramSignals.slice(0, 2).join("; ")}</span>
        </div>
      )}

      {candidate.builtInPublicSignals && candidate.builtInPublicSignals.length > 0 && (
        <div className="flex items-start gap-1.5 text-[11px] text-sky-300/80">
          <span className="mt-0.5 shrink-0">Public</span>
          <span>{candidate.builtInPublicSignals.slice(0, 2).join("; ")}</span>
        </div>
      )}

      {candidate.weightsAndBiases && candidate.weightsAndBiases.length > 0 && (
        <div className="flex items-start gap-1.5 text-[11px] text-cyan-300/80">
          <span className="mt-0.5 shrink-0">W&B</span>
          <span>{candidate.weightsAndBiases.slice(0, 2).join("; ")}</span>
        </div>
      )}

      {candidate.andrewAdjacency && candidate.andrewAdjacency.length > 0 && (
        <div className="flex items-start gap-1.5 text-[11px] text-sky-300/80">
          <span className="mt-0.5 shrink-0">Warm</span>
          <span>{candidate.andrewAdjacency.slice(0, 2).join("; ")}</span>
        </div>
      )}

      {/* Summary */}
      {eea.summary && (
        <p className="text-[11px] text-zinc-500 leading-relaxed line-clamp-2">{eea.summary}</p>
      )}

      {candidate.outreachHook && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-zinc-500">Outreach hook</p>
          <p className="mt-1 text-[11px] text-zinc-300 leading-relaxed">{candidate.outreachHook}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        {candidate.linkedinUrl && (
          <a
            href={candidate.linkedinUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-800/50 hover:bg-zinc-800 transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            LinkedIn
          </a>
        )}
        {candidate.githubUrl && (
          <a
            href={candidate.githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-800/50 hover:bg-zinc-800 transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            GitHub
          </a>
        )}
        {candidate.profileUrl && (
          <a
            href={candidate.profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-800/50 hover:bg-zinc-800 transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            Source
          </a>
        )}
        {onAddPerson && (
          <button
            onClick={handleAddToPool}
            disabled={addingToPool || addedToPool}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
              addedToPool
                ? "text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 cursor-default"
                : addingToPool
                  ? "text-zinc-500 bg-zinc-800/50 cursor-wait"
                  : "text-primary hover:text-primary/80 bg-primary/10 hover:bg-primary/15 border border-primary/20"
            }`}
          >
            {addedToPool ? (
              <Check className="w-3 h-3" />
            ) : addingToPool ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <UserPlus className="w-3 h-3" />
            )}
            {addedToPool ? "In Pool" : addingToPool ? "Adding..." : "Add to Pool"}
          </button>
        )}
        <button
          onClick={handleCopyHook}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-800/50 hover:bg-zinc-800 transition-colors ml-auto"
        >
          {copiedHook ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          {copiedHook ? "Copied" : "Copy Hook"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Tab
// ---------------------------------------------------------------------------

export default function FounderFinderTab({
  onAddPerson,
}: {
  onAddPerson?: (fields: Partial<AiFundPerson>) => Promise<AiFundPerson | null>;
}) {
  const [pipeline, setPipeline] = useState<PipelineState>({ step: "idle", message: "" });
  const [candidates, setCandidates] = useState<CandidateResult[]>([]);
  const [filters, setFilters] = useState({
    tier1Only: false,
    bayAreaOnly: false,
    b2bOnly: false,
    foundersOnly: false,
  });

  // -----------------------------------------------------------------------
  // Pipeline execution
  // -----------------------------------------------------------------------

  const runPipeline = useCallback(async () => {
    setCandidates([]);

    try {
      // Step 1: Run Exa + Harmonic in parallel
      setPipeline({ step: "sourcing_both", message: STEP_LABELS.sourcing_both });

      type ExaSourceResult = {
        websetId: string;
        totalFound: number;
        sourceCounts?: {
          exa: number;
          huggingface: number;
          replicate: number;
          paperswithcode: number;
          curatedPrograms: number;
        };
        candidates: CandidateResult[];
      };

      const [exaResult, harmonicResult] = await Promise.allSettled([
        callEdgeFunction<ExaSourceResult>("founderfinder-source", {
          body: { searchConfig: { count: 20, appendQueries: true } },
        }),
        callEdgeFunction<HarmonicSourceResponse>("founderfinder-harmonic", {
          body: { limit: 15 },
        }),
      ]);

      // Collect Exa candidates
      const exaCandidates: CandidateResult[] = [];
      let huggingFaceCount = 0;
      let replicateCount = 0;
      let papersWithCodeCount = 0;
      let curatedProgramCount = 0;
      let websetId: string | undefined;
      if (exaResult.status === "fulfilled") {
        websetId = exaResult.value.websetId;
        huggingFaceCount = exaResult.value.sourceCounts?.huggingface ?? 0;
        replicateCount = exaResult.value.sourceCounts?.replicate ?? 0;
        papersWithCodeCount = exaResult.value.sourceCounts?.paperswithcode ?? 0;
        curatedProgramCount = exaResult.value.sourceCounts?.curatedPrograms ?? 0;
        for (const c of exaResult.value.candidates) {
          exaCandidates.push({
            ...c,
            source: c.source || "exa",
            sourceChannels: c.sourceChannels || [c.source || "exa"],
            huggingFace: c.huggingFace || [],
            papersWithCode: c.papersWithCode || [],
            replicateSignals: c.replicateSignals || [],
            arxivSignals: c.arxivSignals || [],
            founderAvailabilitySignals: c.founderAvailabilitySignals || [],
            andrewAdjacency: c.andrewAdjacency || [],
            weightsAndBiases: c.weightsAndBiases || [],
            devpostSignals: c.devpostSignals || [],
            builtInPublicSignals: c.builtInPublicSignals || [],
            selectiveProgramSignals: c.selectiveProgramSignals || [],
            outreachHook: c.outreachHook || null,
            eeaScore: { tier: null, score: 0, matchedTier1: [], matchedTier2: [], falsePositiveFlags: [], summary: "" },
          });
        }
      } else {
        console.error("Exa sourcing failed:", exaResult.reason);
      }

      // Collect Harmonic candidates
      const harmonicCandidates: CandidateResult[] = [];
      if (harmonicResult.status === "fulfilled") {
        for (const c of harmonicResult.value.candidates) {
          harmonicCandidates.push({
            ...c,
            sourceChannels: c.sourceChannels || ["harmonic"],
            huggingFace: c.huggingFace || [],
            papersWithCode: c.papersWithCode || [],
            replicateSignals: c.replicateSignals || [],
            arxivSignals: c.arxivSignals || [],
            founderAvailabilitySignals: c.founderAvailabilitySignals || [],
            andrewAdjacency: c.andrewAdjacency || [],
            weightsAndBiases: c.weightsAndBiases || [],
            devpostSignals: c.devpostSignals || [],
            builtInPublicSignals: c.builtInPublicSignals || [],
            selectiveProgramSignals: c.selectiveProgramSignals || [],
            outreachHook: c.outreachHook || null,
            eeaScore: { tier: null, score: 0, matchedTier1: [], matchedTier2: [], falsePositiveFlags: [], summary: "" },
          });
        }
      } else {
        console.error("Harmonic sourcing failed:", harmonicResult.reason);
      }

      // Step 2: Merge and deduplicate
      const allRaw = [...exaCandidates, ...harmonicCandidates];
      const seen = new Map<string, CandidateResult>();
      for (const c of allRaw) {
        const key = c.name.toLowerCase().trim();
        if (!key) continue;
        const existing = seen.get(key);
        if (existing) {
          // Merge: prefer the one with more data, mark as "both"
          existing.source = "multi";
          existing.sourceChannels = dedupeStrings([...(existing.sourceChannels || []), ...(c.sourceChannels || [c.source || "exa"])]) as SourceChannel[];
          existing.linkedinUrl = existing.linkedinUrl || c.linkedinUrl;
          existing.githubUrl = existing.githubUrl || c.githubUrl;
          existing.eeaSignals = [existing.eeaSignals, c.eeaSignals].filter(Boolean).join(" | ");
          existing.harmonicCompanyId = existing.harmonicCompanyId || c.harmonicCompanyId;
          existing.fundingStage = existing.fundingStage || c.fundingStage;
          existing.fundingTotal = existing.fundingTotal || c.fundingTotal;
          existing.headcount = existing.headcount || c.headcount;
          if (!existing.location && c.location) existing.location = c.location;
          if (existing.b2bFocus === "Unclear" && c.b2bFocus !== "Unclear") existing.b2bFocus = c.b2bFocus;
          if (existing.technicalDepth === "Unclear" && c.technicalDepth !== "Unclear") existing.technicalDepth = c.technicalDepth;
          if (!existing.isFounder && c.isFounder) existing.isFounder = true;
          existing.huggingFace = dedupeStrings([...(existing.huggingFace || []), ...(c.huggingFace || [])]);
          existing.papersWithCode = dedupeStrings([...(existing.papersWithCode || []), ...(c.papersWithCode || [])]);
          existing.replicateSignals = dedupeStrings([...(existing.replicateSignals || []), ...(c.replicateSignals || [])]);
          existing.arxivSignals = dedupeStrings([...(existing.arxivSignals || []), ...(c.arxivSignals || [])]);
          existing.founderAvailabilitySignals = dedupeStrings([...(existing.founderAvailabilitySignals || []), ...(c.founderAvailabilitySignals || [])]);
          existing.andrewAdjacency = dedupeStrings([...(existing.andrewAdjacency || []), ...(c.andrewAdjacency || [])]);
          existing.weightsAndBiases = dedupeStrings([...(existing.weightsAndBiases || []), ...(c.weightsAndBiases || [])]);
          existing.devpostSignals = dedupeStrings([...(existing.devpostSignals || []), ...(c.devpostSignals || [])]);
          existing.builtInPublicSignals = dedupeStrings([...(existing.builtInPublicSignals || []), ...(c.builtInPublicSignals || [])]);
          existing.selectiveProgramSignals = dedupeStrings([...(existing.selectiveProgramSignals || []), ...(c.selectiveProgramSignals || [])]);
          existing.outreachHook = existing.outreachHook || c.outreachHook || null;
        } else {
          seen.set(key, { ...c });
        }
      }
      const deduped = Array.from(seen.values());

      // Guard: if both channels returned 0 candidates, short-circuit
      if (deduped.length === 0) {
        setPipeline({
          step: "complete",
          message: "Pipeline complete (0 candidates found)",
          exaCount: 0,
          huggingFaceCount: 0,
          replicateCount: 0,
          papersWithCodeCount: 0,
          curatedProgramCount: 0,
          harmonicCount: 0,
        });
        return;
      }

      // Step 3: Client-side EEA scoring
      setPipeline({
        step: "scoring",
        message: STEP_LABELS.scoring,
        websetId,
        exaCount: exaCandidates.length,
        huggingFaceCount,
        replicateCount,
        papersWithCodeCount,
        curatedProgramCount,
        harmonicCount: harmonicCandidates.length,
      });

      const scored: CandidateResult[] = deduped.map((c) => {
        const signals = [
          c.eeaSignals,
          c.title,
          c.company,
          c.location,
          c.snippet,
          ...(c.huggingFace || []),
          ...(c.papersWithCode || []),
          ...(c.replicateSignals || []),
          ...(c.arxivSignals || []),
          ...(c.weightsAndBiases || []),
          ...(c.devpostSignals || []),
          ...(c.builtInPublicSignals || []),
          ...(c.selectiveProgramSignals || []),
        ].filter(Boolean);
        const eeaScore = scoreCandidate(signals);
        return { ...c, eeaScore };
      });

      scored.sort((a, b) =>
        b.eeaScore.score - a.eeaScore.score ||
        (b.founderAvailabilitySignals?.length || 0) - (a.founderAvailabilitySignals?.length || 0) ||
        (b.huggingFace?.length || 0) - (a.huggingFace?.length || 0) ||
        (b.papersWithCode?.length || 0) - (a.papersWithCode?.length || 0) ||
        (b.selectiveProgramSignals?.length || 0) - (a.selectiveProgramSignals?.length || 0)
      );
      setCandidates(scored);

      // Step 4: Submit Parallel enrichment
      setPipeline({
        step: "enriching",
        message: STEP_LABELS.enriching,
        websetId,
        exaCount: exaCandidates.length,
        huggingFaceCount,
        replicateCount,
        papersWithCodeCount,
        curatedProgramCount,
        harmonicCount: harmonicCandidates.length,
      });

      const enrichBody = {
        candidates: scored.slice(0, 50).map((c) => ({
          name: c.name,
          company: c.company,
          title: c.title,
          profileUrl: c.profileUrl,
          linkedinUrl: c.linkedinUrl,
          existingSignals: dedupeStrings([
            c.eeaSignals,
            ...(c.huggingFace || []),
            ...(c.papersWithCode || []),
            ...(c.replicateSignals || []),
            ...(c.founderAvailabilitySignals || []),
            ...(c.selectiveProgramSignals || []),
            ...(c.builtInPublicSignals || []),
            ...(c.weightsAndBiases || []),
            ...(c.devpostSignals || []),
          ]).join(" | "),
        })),
      };

      const enrichResult = await callEdgeFunction<{
        taskGroupId: string;
        url: string;
        candidateCount: number;
      }>("founderfinder-enrich", { body: enrichBody });

      // Step 5: Poll enrichment status
      setPipeline({
        step: "polling_enrichment",
        message: STEP_LABELS.polling_enrichment,
        websetId,
        taskGroupId: enrichResult.taskGroupId,
        exaCount: exaCandidates.length,
        huggingFaceCount,
        replicateCount,
        papersWithCodeCount,
        curatedProgramCount,
        harmonicCount: harmonicCandidates.length,
      });

      let enrichDone = false;
      let attempts = 0;
      const maxAttempts = 60;

      while (!enrichDone && attempts < maxAttempts) {
        await sleep(5000);
        attempts++;

        const statusResult = await callEdgeFunction<{
          status: string;
          taskGroupId: string;
          results?: ParallelEnrichmentResult[];
        }>("founderfinder-enrich-status", {
          params: { taskGroupId: enrichResult.taskGroupId },
        });

        if (statusResult.status === "completed" && statusResult.results) {
          setPipeline({
            step: "merging",
            message: STEP_LABELS.merging,
            websetId,
            taskGroupId: enrichResult.taskGroupId,
            exaCount: exaCandidates.length,
            huggingFaceCount,
            replicateCount,
            papersWithCodeCount,
            curatedProgramCount,
            harmonicCount: harmonicCandidates.length,
          });

          const enrichMap = new Map<string, ParallelEnrichmentResult>();
          for (const r of statusResult.results) {
            enrichMap.set(r.name.toLowerCase().trim(), r);
          }

          const merged = scored.map((c) => {
            const enrichData = enrichMap.get(c.name.toLowerCase().trim());
            if (!enrichData) return c;

            const allSignals = [
              c.eeaSignals,
              ...enrichData.publications,
              ...enrichData.patents,
              ...enrichData.competitive_programming,
              ...enrichData.fellowships,
              ...enrichData.open_source,
              ...enrichData.accelerator,
              ...enrichData.prior_exits,
              ...enrichData.conference_talks,
              ...enrichData.media_recognition,
              ...enrichData.b2b_signals,
              ...enrichData.zero_to_one_evidence,
              ...enrichData.huggingface,
              ...enrichData.papers_with_code,
              ...enrichData.replicate,
              ...enrichData.arxiv,
              ...enrichData.ai_grant,
              ...enrichData.entrepreneur_first,
              ...enrichData.pioneer,
              ...enrichData.south_park_commons,
              ...enrichData.weights_and_biases,
              ...enrichData.devpost,
              ...enrichData.built_in_public,
              enrichData.eea_summary,
            ].filter(Boolean);

            const newScore = scoreCandidate(allSignals);

            return {
              ...c,
              linkedinUrl: enrichData.linkedin_url || c.linkedinUrl,
              githubUrl: enrichData.github_url || c.githubUrl,
              eeaScore: newScore,
              eeaSignals: allSignals.join(" | "),
              huggingFace: dedupeStrings([...(c.huggingFace || []), ...enrichData.huggingface]),
              papersWithCode: dedupeStrings([...(c.papersWithCode || []), ...enrichData.papers_with_code]),
              replicateSignals: dedupeStrings([...(c.replicateSignals || []), ...enrichData.replicate]),
              arxivSignals: dedupeStrings([...(c.arxivSignals || []), ...enrichData.arxiv]),
              founderAvailabilitySignals: dedupeStrings([...(c.founderAvailabilitySignals || []), ...enrichData.founder_availability_signals]),
              andrewAdjacency: dedupeStrings([...(c.andrewAdjacency || []), ...enrichData.andrew_ng_adjacency, ...enrichData.south_park_commons]),
              weightsAndBiases: dedupeStrings([...(c.weightsAndBiases || []), ...enrichData.weights_and_biases]),
              devpostSignals: dedupeStrings([...(c.devpostSignals || []), ...enrichData.devpost]),
              builtInPublicSignals: dedupeStrings([...(c.builtInPublicSignals || []), ...enrichData.built_in_public]),
              selectiveProgramSignals: dedupeStrings([
                ...(c.selectiveProgramSignals || []),
                ...enrichData.ai_grant,
                ...enrichData.entrepreneur_first,
                ...enrichData.pioneer,
                ...enrichData.south_park_commons,
              ]),
              outreachHook: enrichData.outreach_hook || c.outreachHook || null,
            };
          });

          merged.sort((a, b) =>
            b.eeaScore.score - a.eeaScore.score ||
            (b.founderAvailabilitySignals?.length || 0) - (a.founderAvailabilitySignals?.length || 0) ||
            (b.huggingFace?.length || 0) - (a.huggingFace?.length || 0) ||
            (b.papersWithCode?.length || 0) - (a.papersWithCode?.length || 0) ||
            (b.selectiveProgramSignals?.length || 0) - (a.selectiveProgramSignals?.length || 0)
          );
          setCandidates(merged);
          enrichDone = true;
        } else if (statusResult.status === "failed") {
          console.error("Parallel enrichment failed");
          enrichDone = true;
        }
      }

      setPipeline({
        step: "complete",
        message: STEP_LABELS.complete,
        websetId,
        taskGroupId: enrichResult.taskGroupId,
        exaCount: exaCandidates.length,
        huggingFaceCount,
        replicateCount,
        papersWithCodeCount,
        curatedProgramCount,
        harmonicCount: harmonicCandidates.length,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setPipeline({ step: "error", message: msg, error: msg });
    }
  }, []);

  // -----------------------------------------------------------------------
  // Filtering
  // -----------------------------------------------------------------------

  const filtered = useMemo(() => {
    return candidates.filter((c) => {
      if (filters.tier1Only && c.eeaScore.tier !== 1) return false;
      if (filters.bayAreaOnly) {
        const loc = (c.location || "").toLowerCase();
        if (!BAY_AREA_TERMS.some((t) => loc.includes(t))) return false;
      }
      if (filters.b2bOnly && c.b2bFocus !== "B2B" && c.b2bFocus !== "Both") return false;
      if (filters.foundersOnly && !c.isFounder) return false;
      return true;
    });
  }, [candidates, filters]);

  // -----------------------------------------------------------------------
  // CSV Export
  // -----------------------------------------------------------------------

  const exportCSV = useCallback(() => {
    const headers = [
      "Name", "Title", "Company", "Location", "EEA Tier", "EEA Score",
      "Tier 1 Signals", "Tier 2 Signals", "False Positives", "B2B Focus",
      "Technical Depth", "Is Founder", "LinkedIn", "GitHub", "Profile URL", "Summary",
      "HuggingFace Signals", "Papers With Code", "Replicate Signals", "Founder Availability", "Selective Programs",
      "Built In Public", "Weights & Biases", "Devpost", "Andrew Adjacency", "Outreach Hook",
    ];

    const rows = filtered.map((c) => [
      c.name,
      c.title,
      c.company,
      c.location,
      c.eeaScore.tier ?? "None",
      c.eeaScore.score,
      c.eeaScore.matchedTier1.join("; "),
      c.eeaScore.matchedTier2.join("; "),
      c.eeaScore.falsePositiveFlags.join("; "),
      c.b2bFocus,
      c.technicalDepth,
      c.isFounder ? "Yes" : "No",
      c.linkedinUrl || "",
      c.githubUrl || "",
      c.profileUrl,
      c.eeaScore.summary,
      (c.huggingFace || []).join("; "),
      (c.papersWithCode || []).join("; "),
      (c.replicateSignals || []).join("; "),
      (c.founderAvailabilitySignals || []).join("; "),
      (c.selectiveProgramSignals || []).join("; "),
      (c.builtInPublicSignals || []).join("; "),
      (c.weightsAndBiases || []).join("; "),
      (c.devpostSignals || []).join("; "),
      (c.andrewAdjacency || []).join("; "),
      c.outreachHook || "",
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `founderfinder-pipeline-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filtered]);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  const isRunning = pipeline.step !== "idle" && pipeline.step !== "complete" && pipeline.step !== "error";
  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">FounderFinder</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            EEA-driven sourcing for AI Fund FIR candidates
          </p>
        </div>
        <div className="flex items-center gap-2">
          {candidates.length > 0 && (
            <button
              onClick={exportCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700/50 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
          )}
          <button
            onClick={runPipeline}
            disabled={isRunning}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isRunning ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : candidates.length > 0 ? (
              <RefreshCw className="w-3.5 h-3.5" />
            ) : (
              <Search className="w-3.5 h-3.5" />
            )}
            {isRunning ? "Running..." : candidates.length > 0 ? "Re-run Pipeline" : "Find Founders"}
          </button>
        </div>
      </div>

      {/* Progress banner */}
      {isRunning && (
        <div className="rounded-xl border border-zinc-800/60 bg-[#13131a] p-4">
          <div className="flex items-center gap-3">
            <Loader2 className="w-4 h-4 animate-spin text-emerald-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-zinc-200 font-medium">{pipeline.message}</p>
              {pipeline.websetId && (
                <p className="text-[11px] text-zinc-500 mt-0.5 font-mono">
                  Webset: {pipeline.websetId}
                  {pipeline.taskGroupId && ` | Task Group: ${pipeline.taskGroupId}`}
                </p>
              )}
            </div>
            {candidates.length > 0 && (
              <span className="text-xs text-zinc-500">
                {candidates.length} candidates loaded
                {pipeline.exaCount !== undefined && pipeline.harmonicCount !== undefined && (
                  <span className="ml-1">
                    (Exa: {pipeline.exaCount} | HF: {pipeline.huggingFaceCount ?? 0} | Harmonic: {pipeline.harmonicCount})
                    {pipeline.replicateCount !== undefined && ` | Replicate: ${pipeline.replicateCount}`}
                    {pipeline.papersWithCodeCount !== undefined && ` | PWC: ${pipeline.papersWithCodeCount}`}
                    {pipeline.curatedProgramCount !== undefined && ` | Programs: ${pipeline.curatedProgramCount}`}
                  </span>
                )}
              </span>
            )}
          </div>
          {/* Step progress dots */}
          <div className="flex items-center gap-1 mt-3">
            {(["sourcing", "scoring", "enriching", "polling_enrichment", "merging"] as const).map((dotStep) => {
              // Map displayed dots to the pipeline steps they represent
              const dotToSteps: Record<string, PipelineStep[]> = {
                sourcing: ["sourcing_both", "sourcing_exa", "sourcing_harmonic", "creating_webset", "polling_webset", "retrieving_items"],
                scoring: ["scoring"],
                enriching: ["enriching"],
                polling_enrichment: ["polling_enrichment"],
                merging: ["merging"],
              };
              const dotOrder = ["sourcing", "scoring", "enriching", "polling_enrichment", "merging"];
              const dotIdx = dotOrder.indexOf(dotStep);
              // Find which dot group the current pipeline step belongs to
              const currentDotIdx = dotOrder.findIndex((d) => dotToSteps[d]?.includes(pipeline.step));
              const isDone = currentDotIdx > dotIdx;
              const isCurrent = currentDotIdx === dotIdx;
              return (
                <div
                  key={dotStep}
                  className={`h-1 flex-1 rounded-full transition-colors ${
                    isDone ? "bg-emerald-500" : isCurrent ? "bg-emerald-500/50" : "bg-zinc-800"
                  }`}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Error banner */}
      {pipeline.step === "error" && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-red-300 font-medium">Pipeline failed</p>
            <p className="text-xs text-red-400/70 mt-0.5">{pipeline.error}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      {candidates.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="flex items-center gap-1 text-xs text-zinc-500">
            <Filter className="w-3 h-3" />
            Filters
          </span>
          {([
            { key: "tier1Only" as const, label: "Tier 1 Only", icon: Trophy },
            { key: "bayAreaOnly" as const, label: "Bay Area", icon: MapPin },
            { key: "b2bOnly" as const, label: "B2B", icon: Building2 },
            { key: "foundersOnly" as const, label: "Founders", icon: Cpu },
          ]).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setFilters((f) => ({ ...f, [key]: !f[key] }))}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
                filters[key]
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                  : "text-zinc-500 border-zinc-800 hover:border-zinc-700 hover:text-zinc-400"
              }`}
            >
              <Icon className="w-3 h-3" />
              {label}
            </button>
          ))}
          {activeFilterCount > 0 && (
            <button
              onClick={() => setFilters({ tier1Only: false, bayAreaOnly: false, b2bOnly: false, foundersOnly: false })}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <X className="w-3 h-3" />
              Clear
            </button>
          )}
          <span className="text-[11px] text-zinc-600 ml-auto">
            {filtered.length} of {candidates.length} candidates
          </span>
        </div>
      )}

      {/* Candidate grid */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((c, i) => (
            <CandidateCard key={`${c.name}-${i}`} candidate={c} onAddPerson={onAddPerson} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {pipeline.step === "idle" && candidates.length === 0 && (
        <div className="rounded-xl border border-zinc-800/60 bg-[#13131a] p-12 text-center">
          <Search className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
          <p className="text-sm text-zinc-400 font-medium">No candidates yet</p>
          <p className="text-xs text-zinc-600 mt-1 max-w-md mx-auto">
            Click "Find Founders" to run the dual-channel sourcing pipeline.
            Exa Websets (5 queries) + Harmonic (startup database, founder extraction) run in parallel.
            Results merge, dedupe, score on EEA, then deep-enrich via Parallel AI.
          </p>
        </div>
      )}

      {/* Complete state summary */}
      {pipeline.step === "complete" && candidates.length > 0 && (
        <div className="rounded-xl border border-zinc-800/60 bg-[#13131a] p-4">
          <div className="flex items-center gap-6 text-xs">
            <div>
              <span className="text-zinc-500">Total</span>
              <span className="ml-1.5 text-zinc-200 font-semibold">{candidates.length}</span>
            </div>
            <div>
              <span className="text-emerald-500">Tier 1</span>
              <span className="ml-1.5 text-zinc-200 font-semibold">
                {candidates.filter((c) => c.eeaScore.tier === 1).length}
              </span>
            </div>
            <div>
              <span className="text-amber-500">Tier 2</span>
              <span className="ml-1.5 text-zinc-200 font-semibold">
                {candidates.filter((c) => c.eeaScore.tier === 2).length}
              </span>
            </div>
            <div>
              <span className="text-zinc-500">Bay Area</span>
              <span className="ml-1.5 text-zinc-200 font-semibold">
                {candidates.filter((c) => {
                  const loc = (c.location || "").toLowerCase();
                  return BAY_AREA_TERMS.some((t) => loc.includes(t));
                }).length}
              </span>
            </div>
            <div>
              <span className="text-zinc-500">Founders</span>
              <span className="ml-1.5 text-zinc-200 font-semibold">
                {candidates.filter((c) => c.isFounder).length}
              </span>
            </div>
            <div>
              <span className="text-zinc-500">B2B</span>
              <span className="ml-1.5 text-zinc-200 font-semibold">
                {candidates.filter((c) => c.b2bFocus === "B2B" || c.b2bFocus === "Both").length}
              </span>
            </div>
            <div className="border-l border-zinc-800 pl-4 ml-2">
              <span className="text-zinc-600">Exa</span>
              <span className="ml-1.5 text-zinc-400 font-semibold">
                {candidates.filter((c) => c.sourceChannels?.includes("exa")).length}
              </span>
            </div>
            <div>
              <span className="text-fuchsia-500">HF</span>
              <span className="ml-1.5 text-zinc-400 font-semibold">
                {candidates.filter((c) => c.sourceChannels?.includes("huggingface")).length}
              </span>
            </div>
            <div>
              <span className="text-violet-500">Replicate</span>
              <span className="ml-1.5 text-zinc-400 font-semibold">
                {candidates.filter((c) => c.sourceChannels?.includes("replicate")).length}
              </span>
            </div>
            <div>
              <span className="text-indigo-400">PWC</span>
              <span className="ml-1.5 text-zinc-400 font-semibold">
                {candidates.filter((c) => (c.papersWithCode?.length || 0) > 0).length}
              </span>
            </div>
            <div>
              <span className="text-emerald-300">Programs</span>
              <span className="ml-1.5 text-zinc-400 font-semibold">
                {candidates.filter((c) => (c.selectiveProgramSignals?.length || 0) > 0).length}
              </span>
            </div>
            <div>
              <span className="text-cyan-600">Harmonic</span>
              <span className="ml-1.5 text-zinc-400 font-semibold">
                {candidates.filter((c) => c.sourceChannels?.includes("harmonic")).length}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
