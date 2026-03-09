/**
 * Find Founders Tab — Core Sourcing Pipeline
 *
 * Surfaces technically exceptional GenAI founders for AI Fund's FIR program.
 * Pipeline: Exa search → EEA scoring → Parallel enrichment → ranked results.
 *
 * All external API calls go through Supabase Edge Functions (aifund-intelligence).
 * Never fabricates LinkedIn or GitHub URLs — only surfaces URLs returned by APIs.
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
  RefreshCw,
  Settings2,
  Plus,
  UserPlus,
} from "lucide-react";
import type { AiFundWorkspace, AiFundProviderIntelligenceSummary } from "@/types/ai-fund";
import { scoreCandidate, type EEAScore } from "@/lib/eea-scorer";
import { createIntelligenceRun } from "@/lib/ai-fund";
import { runAiFundIntelligence } from "@/lib/aifund-settings";

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
  source: "exa" | "parallel" | "github" | "manual";
}

type PipelineStage = "idle" | "searching" | "scoring" | "enriching" | "complete" | "error";

// ---------------------------------------------------------------------------
// Search Query Templates
// ---------------------------------------------------------------------------

const SEARCH_QUERIES = [
  {
    id: "genai-founders-bay-area",
    label: "GenAI Founders — Bay Area",
    query: "generative AI startup founder B2B enterprise application layer Mountain View San Francisco Palo Alto NeurIPS ICML Stanford MIT",
    provider: "exa" as const,
  },
  {
    id: "ml-engineers-competitions",
    label: "ML Engineers — Competition Winners",
    query: "machine learning engineer IOI IMO Kaggle Grandmaster Codeforces competitive programming AI startup founder",
    provider: "exa" as const,
  },
  {
    id: "ai-researchers-founders",
    label: "AI Researchers → Founders",
    query: "AI researcher co-founder startup NeurIPS ICML ICLR paper published B2B SaaS enterprise generative AI LLM",
    provider: "exa" as const,
  },
  {
    id: "deeplearning-ai-alumni",
    label: "DL.AI Advanced Completers",
    query: "deeplearning.ai MLOps specialization LLM founder startup AI company technical co-founder",
    provider: "exa" as const,
  },
  {
    id: "oss-ml-founders",
    label: "Open Source ML → Founders",
    query: "open source machine learning framework creator founder startup GitHub stars PyTorch TensorFlow Hugging Face LangChain",
    provider: "github" as const,
  },
  {
    id: "custom",
    label: "Custom Query",
    query: "",
    provider: "exa" as const,
  },
];

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

function detectFounder(text: string): boolean {
  const lower = text.toLowerCase();
  return ["founder", "co-founder", "cofounder", "ceo", "cto", "chief"].some(t => lower.includes(t));
}

function detectB2B(text: string): CandidateResult["b2bFocus"] {
  const lower = text.toLowerCase();
  const b2b = ["b2b", "enterprise", "saas", "business"].some(t => lower.includes(t));
  const b2c = ["b2c", "consumer", "social", "gaming"].some(t => lower.includes(t));
  if (b2b && b2c) return "Both";
  if (b2b) return "B2B";
  if (b2c) return "B2C";
  return "Unclear";
}

function detectTechnicalDepth(text: string): CandidateResult["technicalDepth"] {
  const lower = text.toLowerCase();
  const deep = ["phd", "researcher", "engineer", "neurips", "icml", "iclr", "cvpr", "arxiv",
    "machine learning", "deep learning", "transformer", "neural", "kaggle", "codeforces",
    "ioi", "imo", "competitive programming"].some(t => lower.includes(t));
  if (deep) return "Deep technical";
  const pm = ["product manager", "pm", "product lead"].some(t => lower.includes(t));
  if (pm) return "Technical PM";
  return "Unclear";
}

function extractLocation(text: string): string {
  // Look for common location patterns
  const patterns = [
    /(?:based in|located in|lives in|from)\s+([A-Z][a-zA-Z\s,]+(?:CA|NY|MA|WA|TX))/i,
    /(San Francisco|Palo Alto|Mountain View|New York|Boston|Seattle|Austin|Berkeley|San Jose|Menlo Park)(?:\s*,\s*[A-Z]{2})?/i,
    /(Bay Area|Silicon Valley)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1].trim();
  }
  return "";
}

function extractName(title: string, text: string): string {
  // Try to extract a person name from the title or text
  // The Exa results often have the person's name in the title
  const namePatterns = [
    /^([A-Z][a-z]+ [A-Z][a-z]+)/,  // "John Smith - Title"
    /([A-Z][a-z]+ [A-Z][a-z]+)(?:\s*[-|])/,
  ];
  for (const p of namePatterns) {
    const m = title.match(p);
    if (m) return m[1];
  }
  // Fallback: first capitalized word pair in text
  const textMatch = text.match(/(?:^|\n)([A-Z][a-z]+ [A-Z][a-z]+)/);
  if (textMatch) return textMatch[1];
  return title.split(/[-|]/)[0].trim().slice(0, 40);
}

function extractCompany(text: string): string {
  const patterns = [
    /(?:founder|co-founder|ceo|cto)\s+(?:of|at)\s+([A-Z][a-zA-Z0-9\s]+?)(?:\s*[,.|])/i,
    /(?:at|@)\s+([A-Z][a-zA-Z0-9]+(?:\s[A-Z][a-zA-Z0-9]+)?)/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1].trim();
  }
  return "";
}

function extractLinkedInUrl(text: string, url: string): string | null {
  // Only return URLs that actually came from the API
  if (url.includes("linkedin.com/in/")) return url;
  const match = text.match(/(https?:\/\/(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

function extractGithubUrl(text: string, url: string): string | null {
  if (url.includes("github.com/")) return url;
  const match = text.match(/(https?:\/\/github\.com\/[a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

function generateOutreachHook(name: string, signals: EEAScore): string | undefined {
  if (signals.matchedTier1.length > 0) {
    const top = signals.matchedTier1[0];
    return `Your ${top} background caught our attention — that level of technical depth is exactly what we look for in Founder in Residence candidates at AI Fund.`;
  }
  if (signals.matchedTier2.length >= 2) {
    return `The combination of ${signals.matchedTier2[0]} and ${signals.matchedTier2[1]} tells us a lot about your technical trajectory — worth a conversation about what we're building at AI Fund.`;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Result Parsing
// ---------------------------------------------------------------------------

function parseProviderResults(summary: AiFundProviderIntelligenceSummary, source: "exa" | "github"): CandidateResult[] {
  const items = summary.items || [];
  return items.map(item => {
    const url = item.url || "";
    const snippet = item.snippet || "";
    const fullText = [item.title, item.subtitle || "", snippet, ...(item.tags || [])].join(" ");
    const name = extractName(item.title, fullText);
    const company = extractCompany(fullText);
    const location = extractLocation(fullText);
    const eeaScore = scoreCandidate([fullText]);
    const linkedinUrl = extractLinkedInUrl(fullText, url);
    const githubUrl = extractGithubUrl(fullText, url);

    return {
      id: crypto.randomUUID(),
      name,
      title: item.subtitle || "",
      company,
      linkedinUrl,
      githubUrl,
      location,
      isFounder: detectFounder(fullText),
      b2bFocus: detectB2B(fullText),
      technicalDepth: detectTechnicalDepth(fullText),
      eeaSignals: fullText,
      eeaScore,
      profileUrl: url,
      snippet: snippet.slice(0, 300) || item.title,
      outreachHook: generateOutreachHook(name, eeaScore),
      enriched: false,
      bayAreaConfirmed: isBayArea(location || fullText),
      source,
    };
  });
}

// ---------------------------------------------------------------------------
// CSV Export
// ---------------------------------------------------------------------------

function exportCSV(candidates: CandidateResult[]): void {
  const headers = [
    "name", "title", "company", "location", "linkedin_url", "github_url",
    "eea_tier", "eea_score", "tier1_signals", "tier2_signals", "false_positive_flags",
    "b2b_focus", "technical_depth", "outreach_hook", "eea_summary", "profile_url", "source",
  ];

  const rows = candidates.map(c => [
    c.name, c.title, c.company, c.location,
    c.linkedinUrl || "", c.githubUrl || "",
    c.eeaScore.tier?.toString() || "", c.eeaScore.score.toString(),
    c.eeaScore.matchedTier1.join("; "), c.eeaScore.matchedTier2.join("; "),
    c.eeaScore.falsePositiveFlags.join("; "),
    c.b2bFocus, c.technicalDepth,
    c.outreachHook || "", c.eeaScore.summary, c.profileUrl, c.source,
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
// Component
// ---------------------------------------------------------------------------

export default function FindFoundersTab({ workspace }: Props) {
  const [candidates, setCandidates] = useState<CandidateResult[]>([]);
  const [stage, setStage] = useState<PipelineStage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [selectedQuery, setSelectedQuery] = useState(SEARCH_QUERIES[0].id);
  const [customQuery, setCustomQuery] = useState("");
  const [resultLimit, setResultLimit] = useState(20);
  const [showQueryConfig, setShowQueryConfig] = useState(false);

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

  const getActiveQuery = () => {
    const template = SEARCH_QUERIES.find(q => q.id === selectedQuery);
    if (!template) return { query: "", provider: "exa" as const };
    if (template.id === "custom") return { query: customQuery, provider: template.provider };
    return { query: template.query, provider: template.provider };
  };

  // ── REAL PIPELINE ──────────────────────────────────────────────────────
  const runPipeline = useCallback(async () => {
    const { query, provider } = getActiveQuery();
    if (!query.trim()) {
      setError("Please enter a search query.");
      return;
    }

    setStage("searching");
    setError(null);
    setCandidates([]);

    try {
      // Stage 1: Create intelligence run and search via Exa/GitHub
      const run = await createIntelligenceRun({
        provider,
        queryParams: { query, limit: resultLimit },
      });

      const { resultsSummary } = await runAiFundIntelligence({
        runId: run.id,
        query,
        limit: resultLimit,
      });

      // Stage 2: Score results with EEA engine
      setStage("scoring");

      const providerSummary = resultsSummary as AiFundProviderIntelligenceSummary;
      const parsed = parseProviderResults(providerSummary, provider === "github" ? "github" : "exa");

      // Score and rank
      parsed.sort((a, b) => b.eeaScore.score - a.eeaScore.score);
      setCandidates(parsed);

      // Stage 3: Enrichment (run Parallel for top candidates in background)
      setStage("enriching");

      const tier1and2 = parsed.filter(c => c.eeaScore.tier === 1 || c.eeaScore.tier === 2);
      if (tier1and2.length > 0) {
        try {
          const enrichRun = await createIntelligenceRun({
            provider: "parallel",
            queryParams: {
              query: `Deep profile research on AI founders: ${tier1and2.slice(0, 5).map(c => c.name).join(", ")}. Find their publications, patents, competition results, fellowships, and current company details.`,
              limit: 5,
            },
          });

          const enrichResult = await runAiFundIntelligence({
            runId: enrichRun.id,
            query: `Deep profile research on AI founders: ${tier1and2.slice(0, 5).map(c => c.name).join(", ")}. Find publications, patents, competition medals, fellowships, open source projects, and company funding details.`,
            limit: 5,
          });

          // Merge enrichment data back into candidates
          const enrichItems = (enrichResult.resultsSummary as AiFundProviderIntelligenceSummary).items || [];
          if (enrichItems.length > 0) {
            setCandidates(prev => prev.map(c => {
              // Find enrichment that mentions this candidate
              const enrichMatch = enrichItems.find(e => {
                const text = [e.title, e.subtitle || "", e.snippet || ""].join(" ").toLowerCase();
                return text.includes(c.name.toLowerCase().split(" ")[0]);
              });

              if (enrichMatch) {
                const enrichText = [enrichMatch.title, enrichMatch.subtitle || "", enrichMatch.snippet || ""].join(" ");
                const reScore = scoreCandidate([c.eeaSignals, enrichText]);
                return {
                  ...c,
                  enriched: true,
                  eeaScore: reScore.score > c.eeaScore.score ? reScore : c.eeaScore,
                  eeaSignals: c.eeaSignals + " " + enrichText,
                  outreachHook: generateOutreachHook(c.name, reScore.score > c.eeaScore.score ? reScore : c.eeaScore) || c.outreachHook,
                };
              }
              return { ...c, enriched: true };
            }));
          } else {
            setCandidates(prev => prev.map(c => ({ ...c, enriched: true })));
          }
        } catch (enrichErr) {
          // Enrichment failure is non-fatal — results still usable
          console.warn("Parallel enrichment failed:", enrichErr);
          setCandidates(prev => prev.map(c => ({ ...c, enriched: true })));
        }
      } else {
        setCandidates(prev => prev.map(c => ({ ...c, enriched: true })));
      }

      setStage("complete");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Pipeline failed";
      setError(msg);
      setStage("error");
    }
  }, [selectedQuery, customQuery, resultLimit]);

  // ── Import to Talent Pool ──────────────────────────────────────────────
  const importCandidate = async (candidate: CandidateResult) => {
    try {
      await workspace.addPerson({
        fullName: candidate.name,
        currentRole: candidate.title,
        currentCompany: candidate.company,
        location: candidate.location,
        linkedinUrl: candidate.linkedinUrl || undefined,
        githubUrl: candidate.githubUrl || undefined,
        websiteUrl: candidate.profileUrl || undefined,
        personType: candidate.isFounder ? "fir" : "ve",
        processStage: "identified",
        sourceChannel: candidate.source,
        bio: candidate.eeaScore.summary,
      });
    } catch {
      // silently fail — workspace.addPerson handles errors internally
    }
  };

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
            onClick={() => setShowQueryConfig(!showQueryConfig)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
          >
            <Settings2 className="w-3.5 h-3.5" />
            Configure
          </button>
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
                {stage === "searching" ? "Searching..." : stage === "scoring" ? "Scoring EEA..." : "Enriching..."}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Query Configuration */}
      {showQueryConfig && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Search Configuration</h3>
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-muted-foreground">Results:</label>
              <select
                value={resultLimit}
                onChange={e => setResultLimit(parseInt(e.target.value))}
                className="text-xs px-2 py-1 bg-secondary/50 border border-border rounded-lg"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {SEARCH_QUERIES.map(q => (
              <button
                key={q.id}
                onClick={() => setSelectedQuery(q.id)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-colors ${
                  selectedQuery === q.id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-secondary/50 text-muted-foreground border-border hover:bg-secondary"
                }`}
              >
                {q.label}
                {q.provider === "github" && <span className="ml-1 opacity-60">(GitHub)</span>}
              </button>
            ))}
          </div>

          {selectedQuery === "custom" && (
            <textarea
              value={customQuery}
              onChange={e => setCustomQuery(e.target.value)}
              placeholder="Enter custom search query for Exa..."
              rows={2}
              className="w-full px-3 py-2 text-xs bg-secondary/50 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
          )}

          {selectedQuery !== "custom" && (
            <div className="text-[10px] text-muted-foreground bg-secondary/30 rounded-lg px-3 py-2 font-mono">
              {SEARCH_QUERIES.find(q => q.id === selectedQuery)?.query}
            </div>
          )}
        </div>
      )}

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
          {candidates.length > 0 && stage !== "complete" && (
            <p className="text-[10px] text-muted-foreground mt-2">
              {candidates.length} candidates found so far. Showing partial results...
            </p>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-xs text-red-700 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <div>{error}</div>
            {error.includes("configured") && (
              <p className="mt-1 text-red-600">
                Go to <strong>Settings</strong> tab to configure your Exa and Parallel API keys.
              </p>
            )}
          </div>
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
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-bold text-foreground">{candidate.name}</h3>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge.classes}`}>
                          {badge.label}
                        </span>
                        {!candidate.enriched && (
                          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-secondary text-muted-foreground animate-pulse">
                            Enriching...
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        {(candidate.title || candidate.company) && (
                          <span className="flex items-center gap-1">
                            <Building2 className="w-3 h-3" />
                            {[candidate.title, candidate.company].filter(Boolean).join(" at ")}
                          </span>
                        )}
                        {candidate.location && (
                          <span className={`flex items-center gap-1 ${candidate.bayAreaConfirmed ? "text-blue-600 font-semibold" : ""}`}>
                            <MapPin className="w-3 h-3" />
                            {candidate.location}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {candidate.linkedinUrl && (
                      <a href={candidate.linkedinUrl} target="_blank" rel="noopener noreferrer"
                        className="p-1.5 rounded-lg bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                        <Linkedin className="w-4 h-4" />
                      </a>
                    )}
                    {candidate.githubUrl && (
                      <a href={candidate.githubUrl} target="_blank" rel="noopener noreferrer"
                        className="p-1.5 rounded-lg bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                        <Github className="w-4 h-4" />
                      </a>
                    )}
                    {candidate.profileUrl && (
                      <a href={candidate.profileUrl} target="_blank" rel="noopener noreferrer"
                        className="p-1.5 rounded-lg bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                    <button
                      onClick={() => importCandidate(candidate)}
                      className="p-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
                      title="Import to Talent Pool"
                    >
                      <UserPlus className="w-4 h-4" />
                    </button>
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

                {/* Badges */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {candidate.isFounder && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">Founder</span>
                  )}
                  {candidate.b2bFocus === "B2B" && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-100 text-violet-700 border border-violet-200">B2B</span>
                  )}
                  {candidate.technicalDepth === "Deep technical" && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-100 text-cyan-700 border border-cyan-200">Deep Technical</span>
                  )}
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
                <p className="text-xs text-muted-foreground mb-2">{candidate.eeaScore.summary}</p>

                {/* Snippet */}
                {candidate.snippet && (
                  <p className="text-[11px] text-muted-foreground/80 mb-3 line-clamp-2">{candidate.snippet}</p>
                )}

                {/* Expandable Tier 2 */}
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
          <p className="text-xs text-muted-foreground max-w-md mx-auto mb-4">
            The pipeline searches via Exa for technically exceptional GenAI founders,
            scores them against 150+ EEA signals, enriches top candidates with Parallel,
            and ranks results by verifiable evidence of exceptional ability.
          </p>
          <p className="text-[10px] text-muted-foreground max-w-md mx-auto mb-6">
            Requires Exa API key configured in Settings. Parallel enrichment is optional but recommended.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => { setShowQueryConfig(true); }}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-xl bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
            >
              <Settings2 className="w-3.5 h-3.5" />
              Configure Search
            </button>
            <button
              onClick={runPipeline}
              className="inline-flex items-center gap-2 px-6 py-2.5 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
            >
              <Search className="w-4 h-4" />
              Find Founders
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
