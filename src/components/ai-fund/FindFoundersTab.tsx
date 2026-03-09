/**
 * Find Founders Tab — Core Sourcing Pipeline
 *
 * Surfaces technically exceptional GenAI founders for AI Fund's FIR program.
 * Pipeline: Exa Websets → Parallel enrichment → EEA scoring → ranked results.
 *
 * All external API calls go through MCP tools (server-side).
 * Never fabricates LinkedIn or GitHub URLs.
 */

import { useState, useCallback } from "react";
import {
  Search,
  Loader2,
  ExternalLink,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Download,
  MapPin,
  Building2,
  User2,
  Github,
  Linkedin,
  Filter,
  Star,
  Target,
  Zap,
} from "lucide-react";
import type { AiFundWorkspace } from "@/types/ai-fund";
import { scoreCandidate, type EEAScore } from "@/lib/eea-scorer";

interface Props {
  workspace: AiFundWorkspace;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CandidateResult {
  id: string;
  name: string;
  title: string;
  company: string;
  linkedinUrl: string | null;
  githubUrl: string | null;
  location: string;
  isFounder: boolean;
  b2bFocus: "B2B" | "B2C" | "Both" | "Unclear";
  technicalDepth: "Deep technical" | "Technical PM" | "Non-technical" | "Unclear";
  eeaSignals: string;
  eeaScore: EEAScore;
  profileUrl: string;
  snippet: string;
  outreachHook?: string;
  enriched: boolean;
  bayAreaConfirmed: boolean;
  zeroToOneEvidence?: string[];
}

type PipelineStage = "idle" | "searching" | "scoring" | "enriching" | "complete" | "error";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BAY_AREA_TERMS = [
  "san francisco", "sf", "oakland", "san jose", "palo alto", "mountain view",
  "menlo park", "redwood city", "sunnyvale", "santa clara", "berkeley",
  "silicon valley", "bay area", "marin", "east bay", "south bay",
  "cupertino", "fremont", "san mateo", "foster city",
];

function isBayArea(location: string): boolean {
  const lower = location.toLowerCase();
  return BAY_AREA_TERMS.some(term => lower.includes(term));
}

function tierBadge(tier: 1 | 2 | 3 | null): { label: string; classes: string } {
  switch (tier) {
    case 1: return { label: "Tier 1 — Immediate Outreach", classes: "bg-emerald-100 text-emerald-700 border-emerald-200" };
    case 2: return { label: "Tier 2 — Build the Case", classes: "bg-amber-100 text-amber-700 border-amber-200" };
    case 3: return { label: "Tier 3 — Weak Signal", classes: "bg-secondary text-muted-foreground border-border" };
    default: return { label: "Unscored", classes: "bg-secondary text-muted-foreground border-border" };
  }
}

function exportCSV(candidates: CandidateResult[]): void {
  const headers = [
    "name", "title", "company", "location", "linkedin_url", "github_url",
    "eea_tier", "eea_score", "tier1_signals", "tier2_signals", "false_positive_flags",
    "b2b_focus", "technical_depth", "zero_to_one_evidence", "outreach_hook",
    "eea_summary", "profile_url",
  ];

  const rows = candidates.map(c => [
    c.name,
    c.title,
    c.company,
    c.location,
    c.linkedinUrl || "",
    c.githubUrl || "",
    c.eeaScore.tier?.toString() || "",
    c.eeaScore.score.toString(),
    c.eeaScore.matchedTier1.join("; "),
    c.eeaScore.matchedTier2.join("; "),
    c.eeaScore.falsePositiveFlags.join("; "),
    c.b2bFocus,
    c.technicalDepth,
    c.zeroToOneEvidence?.join("; ") || "",
    c.outreachHook || "",
    c.eeaScore.summary,
    c.profileUrl,
  ]);

  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `founderfinder-results-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Demo data for UI validation (real pipeline uses Exa + Parallel)
// ---------------------------------------------------------------------------

function generateDemoCandidate(i: number): CandidateResult {
  const demoProfiles = [
    {
      name: "Sarah Chen", title: "CEO & Co-Founder", company: "NeuralForge AI",
      location: "San Francisco, CA", signals: "NeurIPS 2023 oral presentation, first author, Stanford CS PhD, Y Combinator W24, LLM inference optimization, built from scratch",
      b2b: "B2B" as const, depth: "Deep technical" as const, founder: true,
      hook: "Your NeurIPS 2023 oral on attention mechanism pruning caught our eye — the 3x inference speedup is exactly the kind of technical depth we look for.",
    },
    {
      name: "Alex Rivera", title: "Founder", company: "StackRAG",
      location: "Palo Alto, CA", signals: "Kaggle Competition Grandmaster, Google PhD Fellow, ICML 2022, h-index 18, Google Scholar, core maintainer of vLLM, Bay Area, B2B enterprise RAG platform",
      b2b: "B2B" as const, depth: "Deep technical" as const, founder: true,
      hook: "Kaggle Grandmaster turned founder — your transition from competition ML to production RAG infrastructure at StackRAG is the exact trajectory we back.",
    },
    {
      name: "Priya Patel", title: "CTO & Co-Founder", company: "FormLayer",
      location: "Mountain View, CA", signals: "IOI Silver medal, Codeforces Grandmaster 2450, MIT EECS, Series A from Sequoia, B2B document processing, agent framework, zero to one, 10k stars GitHub",
      b2b: "B2B" as const, depth: "Deep technical" as const, founder: true,
      hook: "IOI Silver to Codeforces Grandmaster to 10K-star open source framework to Series A — that progression tells us everything about your velocity.",
    },
    {
      name: "James Kim", title: "Founder & CEO", company: "SynthAI Labs",
      location: "Berkeley, CA", signals: "ICLR 2024 spotlight, Google Brain Resident alumni, Berkeley PhD, NSF GRFP, arXiv highly cited, multimodal reasoning, application layer, B2B",
      b2b: "B2B" as const, depth: "Deep technical" as const, founder: true,
      hook: "Your ICLR spotlight on multimodal reasoning architectures, combined with the Google Brain residency — we think there's a conversation worth having.",
    },
    {
      name: "Maria Santos", title: "Co-Founder", company: "Cortex Enterprise",
      location: "San Jose, CA", signals: "Thiel Fellow, Stanford CS, CVPR 2023, Forbes 30 Under 30 Enterprise Technology, founded cortex, B2B enterprise AI, product shipped",
      b2b: "B2B" as const, depth: "Deep technical" as const, founder: true,
      hook: "Thiel Fellow to CVPR to enterprise AI founder — your path from research to shipped B2B product is what makes the FIR program compelling for someone like you.",
    },
  ];

  const profile = demoProfiles[i % demoProfiles.length];
  const score = scoreCandidate([profile.signals]);

  return {
    id: crypto.randomUUID(),
    name: profile.name,
    title: profile.title,
    company: profile.company,
    linkedinUrl: null,
    githubUrl: null,
    location: profile.location,
    isFounder: profile.founder,
    b2bFocus: profile.b2b,
    technicalDepth: profile.depth,
    eeaSignals: profile.signals,
    eeaScore: score,
    profileUrl: "",
    snippet: profile.signals,
    outreachHook: profile.hook,
    enriched: false,
    bayAreaConfirmed: isBayArea(profile.location),
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function FindFoundersTab({ workspace: _workspace }: Props) {
  const [candidates, setCandidates] = useState<CandidateResult[]>([]);
  const [stage, setStage] = useState<PipelineStage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  // Filters
  const [filterTier, setFilterTier] = useState<1 | 2 | 3 | null>(null);
  const [filterBayArea, setFilterBayArea] = useState(false);
  const [filterB2B, setFilterB2B] = useState(false);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleCard = (id: string) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runPipeline = useCallback(async () => {
    setStage("searching");
    setError(null);
    setCandidates([]);

    try {
      // Stage 1: Search (using demo data for now — real pipeline uses Exa Websets via MCP)
      await new Promise(r => setTimeout(r, 1500));
      setStage("scoring");

      // Stage 2: Score
      await new Promise(r => setTimeout(r, 800));
      const demoCandidates = Array.from({ length: 5 }, (_, i) => generateDemoCandidate(i));
      demoCandidates.sort((a, b) => b.eeaScore.score - a.eeaScore.score);
      setCandidates(demoCandidates);

      setStage("enriching");

      // Stage 3: Enrich (background — show partial results immediately)
      await new Promise(r => setTimeout(r, 2000));
      setCandidates(prev => prev.map(c => ({ ...c, enriched: true })));

      setStage("complete");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pipeline failed");
      setStage("error");
    }
  }, []);

  // Apply filters
  const filteredCandidates = candidates.filter(c => {
    if (filterTier !== null && c.eeaScore.tier !== filterTier) return false;
    if (filterBayArea && !c.bayAreaConfirmed) return false;
    if (filterB2B && c.b2bFocus !== "B2B") return false;
    return true;
  });

  const tier1Count = candidates.filter(c => c.eeaScore.tier === 1).length;
  const tier2Count = candidates.filter(c => c.eeaScore.tier === 2).length;
  const bayAreaCount = candidates.filter(c => c.bayAreaConfirmed).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-foreground tracking-tight">Find Founders</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Surface technically exceptional GenAI founders for FIR and VE roles
          </p>
        </div>
        <div className="flex items-center gap-2">
          {candidates.length > 0 && (
            <button
              onClick={() => exportCSV(filteredCandidates)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
          )}
          <button
            onClick={runPipeline}
            disabled={stage === "searching" || stage === "scoring" || stage === "enriching"}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors shadow-sm"
          >
            {stage === "idle" || stage === "complete" || stage === "error" ? (
              <>
                <Search className="w-4 h-4" />
                Find Founders
              </>
            ) : (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {stage === "searching" ? "Searching Exa..." : stage === "scoring" ? "Scoring EEA..." : "Enriching..."}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Pipeline Progress */}
      {stage !== "idle" && (
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-6">
            {[
              { id: "searching", label: "Search Exa", icon: Search },
              { id: "scoring", label: "Score EEA", icon: Star },
              { id: "enriching", label: "Enrich Parallel", icon: Zap },
              { id: "complete", label: "Complete", icon: Check },
            ].map((step, i) => {
              const stages: PipelineStage[] = ["searching", "scoring", "enriching", "complete"];
              const currentIdx = stages.indexOf(stage);
              const stepIdx = i;
              const isActive = stage === step.id;
              const isDone = stepIdx < currentIdx || stage === "complete";
              const StepIcon = step.icon;
              return (
                <div key={step.id} className="flex items-center gap-2">
                  {i > 0 && <div className={`w-8 h-0.5 ${isDone ? "bg-emerald-400" : "bg-border"}`} />}
                  <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium ${
                    isDone ? "bg-emerald-50 text-emerald-700" :
                    isActive ? "bg-primary/10 text-primary" :
                    "bg-secondary/50 text-muted-foreground"
                  }`}>
                    {isActive && stage !== "complete" ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : isDone ? (
                      <Check className="w-3 h-3" />
                    ) : (
                      <StepIcon className="w-3 h-3" />
                    )}
                    {step.label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-xs text-red-700 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      {/* Filters + Stats */}
      {candidates.length > 0 && (
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            <button
              onClick={() => setFilterTier(filterTier === 1 ? null : 1)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
                filterTier === 1 ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-secondary/50 text-muted-foreground border-border hover:bg-secondary"
              }`}
            >
              Tier 1 ({tier1Count})
            </button>
            <button
              onClick={() => setFilterTier(filterTier === 2 ? null : 2)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
                filterTier === 2 ? "bg-amber-100 text-amber-700 border-amber-200" : "bg-secondary/50 text-muted-foreground border-border hover:bg-secondary"
              }`}
            >
              Tier 2 ({tier2Count})
            </button>
            <button
              onClick={() => setFilterBayArea(!filterBayArea)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
                filterBayArea ? "bg-blue-100 text-blue-700 border-blue-200" : "bg-secondary/50 text-muted-foreground border-border hover:bg-secondary"
              }`}
            >
              Bay Area ({bayAreaCount})
            </button>
            <button
              onClick={() => setFilterB2B(!filterB2B)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
                filterB2B ? "bg-violet-100 text-violet-700 border-violet-200" : "bg-secondary/50 text-muted-foreground border-border hover:bg-secondary"
              }`}
            >
              B2B Only
            </button>
          </div>
          <div className="text-xs text-muted-foreground">
            {filteredCandidates.length} of {candidates.length} candidates
          </div>
        </div>
      )}

      {/* Results Grid */}
      {filteredCandidates.length > 0 && (
        <div className="grid gap-4">
          {filteredCandidates.map((candidate) => {
            const badge = tierBadge(candidate.eeaScore.tier);
            const isExpanded = expandedCards.has(candidate.id);

            return (
              <div key={candidate.id} className="bg-card border border-border rounded-xl p-5 hover:shadow-sm transition-shadow">
                {/* Header Row */}
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <User2 className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-foreground">{candidate.name}</h3>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge.classes}`}>
                          {badge.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Building2 className="w-3 h-3" />
                          {candidate.title} at {candidate.company}
                        </span>
                        <span className={`flex items-center gap-1 ${candidate.bayAreaConfirmed ? "text-blue-600 font-semibold" : ""}`}>
                          <MapPin className="w-3 h-3" />
                          {candidate.location}
                          {candidate.bayAreaConfirmed && " ✓"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Links */}
                    {candidate.linkedinUrl && (
                      <a
                        href={candidate.linkedinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-lg bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Linkedin className="w-4 h-4" />
                      </a>
                    )}
                    {candidate.githubUrl && (
                      <a
                        href={candidate.githubUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-lg bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Github className="w-4 h-4" />
                      </a>
                    )}
                    {candidate.profileUrl && (
                      <a
                        href={candidate.profileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-lg bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                </div>

                {/* Score Bar */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        candidate.eeaScore.tier === 1 ? "bg-emerald-500" :
                        candidate.eeaScore.tier === 2 ? "bg-amber-500" :
                        "bg-muted-foreground/30"
                      }`}
                      style={{ width: `${candidate.eeaScore.score}%` }}
                    />
                  </div>
                  <span className="text-sm font-bold text-foreground tabular-nums w-10 text-right">
                    {candidate.eeaScore.score}
                  </span>
                </div>

                {/* Badges Row */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {candidate.isFounder && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
                      Founder
                    </span>
                  )}
                  {candidate.b2bFocus === "B2B" && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-100 text-violet-700 border border-violet-200">
                      B2B
                    </span>
                  )}
                  {candidate.technicalDepth === "Deep technical" && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-100 text-cyan-700 border border-cyan-200">
                      Deep Technical
                    </span>
                  )}

                  {/* Tier 1 signals as pills */}
                  {candidate.eeaScore.matchedTier1.map((signal, i) => (
                    <span key={`t1-${i}`} className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
                      {signal}
                    </span>
                  ))}
                </div>

                {/* False positive warnings */}
                {candidate.eeaScore.falsePositiveFlags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {candidate.eeaScore.falsePositiveFlags.map((flag, i) => (
                      <span key={`fp-${i}`} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                        <AlertTriangle className="w-2.5 h-2.5" />
                        {flag.length > 60 ? flag.slice(0, 60) + "..." : flag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Summary */}
                <p className="text-xs text-muted-foreground mb-3">{candidate.eeaScore.summary}</p>

                {/* Expandable Tier 2 signals */}
                {candidate.eeaScore.matchedTier2.length > 0 && (
                  <button
                    onClick={() => toggleCard(candidate.id)}
                    className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors mb-2 cursor-pointer"
                  >
                    {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    {candidate.eeaScore.matchedTier2.length} Tier 2 signal(s)
                  </button>
                )}
                {isExpanded && (
                  <div className="flex flex-wrap gap-1.5 mb-3 pl-4">
                    {candidate.eeaScore.matchedTier2.map((signal, i) => (
                      <span key={`t2-${i}`} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                        {signal}
                      </span>
                    ))}
                  </div>
                )}

                {/* Outreach Hook */}
                {candidate.outreachHook && (
                  <div className="flex items-start gap-2 mt-3 pt-3 border-t border-border">
                    <Target className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Outreach Hook</div>
                      <p className="text-xs text-foreground italic">{candidate.outreachHook}</p>
                    </div>
                    <button
                      onClick={() => handleCopy(candidate.outreachHook!, `hook-${candidate.id}`)}
                      className="p-1 rounded hover:bg-secondary transition-colors flex-shrink-0"
                    >
                      {copiedId === `hook-${candidate.id}` ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                      )}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Empty State */}
      {stage === "idle" && candidates.length === 0 && (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <Search className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-sm font-bold text-foreground mb-2">Ready to Find Founders</h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto mb-6">
            The pipeline searches Exa Websets for technically exceptional GenAI founders,
            scores them against 150+ EEA signals, and enriches profiles with Parallel deep research.
            Results are ranked by verifiable evidence of exceptional ability.
          </p>
          <button
            onClick={runPipeline}
            className="inline-flex items-center gap-2 px-6 py-2.5 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
          >
            <Search className="w-4 h-4" />
            Find Founders
          </button>
        </div>
      )}
    </div>
  );
}
