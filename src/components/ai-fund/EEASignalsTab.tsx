/**
 * EEA Signals Reference Tab
 *
 * Interactive guide to the 150+ verifiable credentials for identifying
 * top 5% technical talent. Organized by category with search, filtering,
 * and LinkedIn syntax helpers.
 */

import { useState } from "react";
import {
  BookOpen,
  Award,
  FileText,
  Code2,
  GraduationCap,
  Trophy,
  GitBranch,
  Briefcase,
  AlertTriangle,
  Search,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Star,
  Flame,
  Target,
} from "lucide-react";
import type { AiFundWorkspace } from "@/types/ai-fund";
import {
  TIER_1_SIGNALS,
  TIER_2_SIGNALS,
  CONFERENCES,
  PRESENTATION_TYPES,
  FALSE_POSITIVES,
  WARMTH_TIERS,
  PATENT_COMPANY_CONTEXT,
  PATENT_GENAI_CATEGORIES,
  COMPETITION_TIERS,
  FELLOWSHIP_DETAILS,
  CITATION_THRESHOLDS,
  LINKEDIN_SEARCH_SYNTAX,
  OUTREACH_ROUTING,
  type SignalCategory,
  type EEASignal,
} from "@/lib/eea-signals";

interface Props {
  workspace: AiFundWorkspace;
}

type SubTab = "overview" | "publications" | "patents" | "competitions" | "fellowships" | "awards" | "founder" | "false_positives" | "linkedin" | "warmth" | "scoring";

const SUB_TABS: { id: SubTab; label: string; icon: React.ElementType }[] = [
  { id: "overview", label: "Overview", icon: Target },
  { id: "publications", label: "Publications", icon: BookOpen },
  { id: "patents", label: "Patents", icon: FileText },
  { id: "competitions", label: "Competitions", icon: Trophy },
  { id: "fellowships", label: "Fellowships", icon: GraduationCap },
  { id: "awards", label: "Awards & OSS", icon: Award },
  { id: "founder", label: "Founder Signals", icon: Briefcase },
  { id: "warmth", label: "Warmth Tiers", icon: Flame },
  { id: "scoring", label: "Scoring Rubric", icon: Star },
  { id: "false_positives", label: "False Positives", icon: AlertTriangle },
  { id: "linkedin", label: "LinkedIn Syntax", icon: Search },
];

const CATEGORY_ICONS: Record<SignalCategory, React.ElementType> = {
  publication: BookOpen,
  patent: FileText,
  competition: Trophy,
  fellowship: GraduationCap,
  industry_award: Award,
  open_source: GitBranch,
  founder: Briefcase,
};

const CATEGORY_COLORS: Record<SignalCategory, string> = {
  publication: "bg-blue-50 text-blue-700 border-blue-200",
  patent: "bg-violet-50 text-violet-700 border-violet-200",
  competition: "bg-amber-50 text-amber-700 border-amber-200",
  fellowship: "bg-emerald-50 text-emerald-700 border-emerald-200",
  industry_award: "bg-rose-50 text-rose-700 border-rose-200",
  open_source: "bg-cyan-50 text-cyan-700 border-cyan-200",
  founder: "bg-orange-50 text-orange-700 border-orange-200",
};

export default function EEASignalsTab({ workspace }: Props) {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>("overview");
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["tier1", "tier2"]));
  void workspace;

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleSection = (id: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filterSignals = (signals: EEASignal[]) => {
    if (!searchQuery.trim()) return signals;
    const q = searchQuery.toLowerCase();
    return signals.filter(s =>
      s.label.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.linkedinSearchTerms.some(t => t.toLowerCase().includes(q))
    );
  };

  const renderSignalCard = (signal: EEASignal) => {
    const Icon = CATEGORY_ICONS[signal.category];
    const colorClass = CATEGORY_COLORS[signal.category];
    return (
      <div key={signal.id} className="bg-card border border-border rounded-xl p-4 hover:shadow-sm transition-shadow">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg border ${colorClass}`}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="text-sm font-semibold text-foreground">{signal.label}</h4>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                signal.tier === 1
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-blue-100 text-blue-700"
              }`}>
                TIER {signal.tier}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary">
                {signal.points} pts
              </span>
            </div>
            <p className="text-xs text-muted-foreground mb-2">{signal.description}</p>
            <div className="flex flex-wrap gap-2 text-[10px]">
              <span className="text-muted-foreground">Selectivity: <strong className="text-foreground">{signal.selectivity}</strong></span>
              <span className="text-muted-foreground">Verify: <strong className="text-foreground">{signal.verificationMethod}</strong></span>
            </div>
            {signal.falsePositiveNote && (
              <div className="mt-2 flex items-start gap-1.5 text-[10px] text-amber-600 bg-amber-50 px-2 py-1 rounded">
                <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                <span>{signal.falsePositiveNote}</span>
              </div>
            )}
            <div className="mt-2 flex flex-wrap gap-1">
              {signal.linkedinSearchTerms.slice(0, 4).map((term, i) => (
                <button
                  key={i}
                  onClick={() => handleCopy(term, `${signal.id}-${i}`)}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors cursor-pointer"
                >
                  {copiedId === `${signal.id}-${i}` ? <Check className="w-2.5 h-2.5 text-emerald-500" /> : <Copy className="w-2.5 h-2.5" />}
                  {term}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderOverview = () => (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">How This Works</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          150+ verifiable credentials across seven categories, calibrated for AI Fund's target profile: technically excellent builders
          who can lead B2B generative AI companies. <strong>Tier 1 signals</strong> (any single one = top 5%, immediate outreach).
          <strong> Tier 2 signals</strong> (combinations of 2-3 build the case). The EEA score (0-80 pts) combines with a warmth score
          (0-20 pts) to create a 100-point combined score that determines outreach routing.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-foreground">{TIER_1_SIGNALS.length}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mt-1">Tier 1 Signals</div>
          <div className="text-[10px] text-emerald-600 mt-0.5">Any single = top 5%</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-foreground">{TIER_2_SIGNALS.length}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mt-1">Tier 2 Signals</div>
          <div className="text-[10px] text-blue-600 mt-0.5">Combine 2-3 for case</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-foreground">{CONFERENCES.length}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mt-1">Conferences Mapped</div>
          <div className="text-[10px] text-violet-600 mt-0.5">With acceptance rates</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-foreground">{FALSE_POSITIVES.length}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mt-1">False Positives</div>
          <div className="text-[10px] text-amber-600 mt-0.5">Known overestimates</div>
        </div>
      </div>

      {/* Quick reference - Tier 1 */}
      <div>
        <button
          onClick={() => toggleSection("tier1")}
          className="flex items-center gap-2 mb-3 group cursor-pointer"
        >
          {expandedSections.has("tier1") ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          <h3 className="text-sm font-semibold text-foreground">Tier 1 Signals — Any single confirms top 5%</h3>
          <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">IMMEDIATE OUTREACH</span>
        </button>
        {expandedSections.has("tier1") && (
          <div className="grid gap-3">
            {filterSignals(TIER_1_SIGNALS).map(renderSignalCard)}
          </div>
        )}
      </div>

      {/* Quick reference - Tier 2 */}
      <div>
        <button
          onClick={() => toggleSection("tier2")}
          className="flex items-center gap-2 mb-3 group cursor-pointer"
        >
          {expandedSections.has("tier2") ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          <h3 className="text-sm font-semibold text-foreground">Tier 2 Signals — Combinations build the case</h3>
          <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">COMBINE 2-3</span>
        </button>
        {expandedSections.has("tier2") && (
          <div className="grid gap-3">
            {filterSignals(TIER_2_SIGNALS).map(renderSignalCard)}
          </div>
        )}
      </div>
    </div>
  );

  const renderPublications = () => (
    <div className="space-y-6">
      {/* Conference Hierarchy */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-secondary/30">
          <h3 className="text-sm font-semibold text-foreground">Conference Hierarchy</h3>
          <p className="text-[10px] text-muted-foreground mt-0.5">ML/AI conferences ranked by prestige and selectivity</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-secondary/20">
                <th className="text-left px-4 py-2 font-semibold text-foreground">Conference</th>
                <th className="text-left px-4 py-2 font-semibold text-foreground">Full Name</th>
                <th className="text-left px-4 py-2 font-semibold text-foreground">Accept Rate</th>
                <th className="text-left px-4 py-2 font-semibold text-foreground">Oral Rate</th>
                <th className="text-left px-4 py-2 font-semibold text-foreground">Tier</th>
                <th className="text-left px-4 py-2 font-semibold text-foreground">Signal</th>
              </tr>
            </thead>
            <tbody>
              {CONFERENCES.map((c, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-secondary/10 transition-colors">
                  <td className="px-4 py-2.5 font-semibold text-foreground">{c.abbreviation}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{c.fullName}</td>
                  <td className="px-4 py-2.5 font-mono text-foreground">{c.acceptanceRate}</td>
                  <td className="px-4 py-2.5 font-mono text-foreground">{c.oralRate || "—"}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      c.tier === "1" ? "bg-emerald-100 text-emerald-700" :
                      c.tier === "1B" ? "bg-emerald-50 text-emerald-600" :
                      "bg-blue-100 text-blue-700"
                    }`}>{c.tier}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    {"★".repeat(c.signalStrength)}{"☆".repeat(5 - c.signalStrength)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Presentation Type Hierarchy */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-secondary/30">
          <h3 className="text-sm font-semibold text-foreground">Presentation Type Matters Enormously</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-secondary/20">
                <th className="text-left px-4 py-2 font-semibold">Type</th>
                <th className="text-left px-4 py-2 font-semibold">Selection Rate</th>
                <th className="text-left px-4 py-2 font-semibold">Signal</th>
                <th className="text-left px-4 py-2 font-semibold">Points</th>
              </tr>
            </thead>
            <tbody>
              {PRESENTATION_TYPES.map((p, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-secondary/10">
                  <td className="px-4 py-2.5 font-semibold text-foreground">{p.type}</td>
                  <td className="px-4 py-2.5 font-mono">{p.selectionRate}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{p.signal}</td>
                  <td className="px-4 py-2.5 font-bold text-primary">{p.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Citation Thresholds */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">Citation Thresholds for Early-Career GenAI Talent</h3>
        <p className="text-[10px] text-muted-foreground mb-3">For 3-10 years post-PhD candidates AI Fund targets:</p>
        <div className="space-y-2">
          {CITATION_THRESHOLDS.map((c, i) => (
            <div key={i} className="flex items-center gap-3 text-xs">
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap ${
                i === 3 ? "bg-emerald-100 text-emerald-700" :
                i === 2 ? "bg-blue-100 text-blue-700" :
                i === 1 ? "bg-violet-100 text-violet-700" :
                "bg-secondary text-secondary-foreground"
              }`}>{c.level}</span>
              <span className="text-muted-foreground">{c.criteria}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Publication Signals */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Publication EEA Signals</h3>
        <div className="grid gap-3">
          {filterSignals([...TIER_1_SIGNALS, ...TIER_2_SIGNALS].filter(s => s.category === "publication")).map(renderSignalCard)}
        </div>
      </div>
    </div>
  );

  const renderPatents = () => (
    <div className="space-y-6">
      {/* Company Context */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-secondary/30">
          <h3 className="text-sm font-semibold text-foreground">Company Context Determines Patent Value</h3>
          <p className="text-[10px] text-muted-foreground mt-0.5">Not all patents are created equal — filing culture varies dramatically</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-secondary/20">
                <th className="text-left px-4 py-2 font-semibold">Company</th>
                <th className="text-left px-4 py-2 font-semibold">Signal Per Patent</th>
                <th className="text-left px-4 py-2 font-semibold">Notes</th>
              </tr>
            </thead>
            <tbody>
              {PATENT_COMPANY_CONTEXT.map((p, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-secondary/10">
                  <td className="px-4 py-2.5 font-semibold text-foreground">{p.company}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      p.signal === "Very High" ? "bg-emerald-100 text-emerald-700" :
                      p.signal === "High" ? "bg-blue-100 text-blue-700" :
                      p.signal === "Medium-High" ? "bg-violet-100 text-violet-700" :
                      "bg-red-50 text-red-600"
                    }`}>{p.signal}</span>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{p.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* GenAI Patent Categories */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-secondary/30">
          <h3 className="text-sm font-semibold text-foreground">GenAI Patent Categories to Prioritize</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-secondary/20">
                <th className="text-left px-4 py-2 font-semibold">CPC Code</th>
                <th className="text-left px-4 py-2 font-semibold">Area</th>
                <th className="text-left px-4 py-2 font-semibold">Signal</th>
              </tr>
            </thead>
            <tbody>
              {PATENT_GENAI_CATEGORIES.map((p, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-secondary/10">
                  <td className="px-4 py-2.5 font-mono font-semibold text-foreground">{p.cpc}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{p.area}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      p.signal === "Highest" ? "bg-emerald-100 text-emerald-700" :
                      "bg-blue-100 text-blue-700"
                    }`}>{p.signal}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <strong>Patent count benchmarks for AI engineers:</strong> 1-5 patents = typical strong engineer at Google/Meta.
            6-15 = consistent innovation at Staff+ level. 15-50 = top 5% or Distinguished level.
            But context matters enormously — 3 patents at Anthropic may signal more than 30 at IBM.
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Patent EEA Signals</h3>
        <div className="grid gap-3">
          {filterSignals([...TIER_1_SIGNALS, ...TIER_2_SIGNALS].filter(s => s.category === "patent")).map(renderSignalCard)}
        </div>
      </div>
    </div>
  );

  const renderCompetitions = () => (
    <div className="space-y-6">
      {COMPETITION_TIERS.map((tier, i) => (
        <div key={i} className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-secondary/30 flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
              tier.tier === "S" ? "bg-emerald-100 text-emerald-700" :
              tier.tier === "A" ? "bg-blue-100 text-blue-700" :
              "bg-violet-100 text-violet-700"
            }`}>{tier.tier}-Tier</span>
            <h3 className="text-sm font-semibold text-foreground">{tier.label}</h3>
          </div>
          <div className="divide-y divide-border/50">
            {tier.competitions.map((c, j) => (
              <div key={j} className="px-4 py-3">
                <div className="text-xs font-semibold text-foreground">{c.name}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{c.detail}</div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Competition EEA Signals</h3>
        <div className="grid gap-3">
          {filterSignals([...TIER_1_SIGNALS, ...TIER_2_SIGNALS].filter(s => s.category === "competition")).map(renderSignalCard)}
        </div>
      </div>
    </div>
  );

  const renderFellowships = () => (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-secondary/30">
          <h3 className="text-sm font-semibold text-foreground">The Most Selective Fellowships</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-secondary/20">
                <th className="text-left px-4 py-2 font-semibold">Fellowship</th>
                <th className="text-left px-4 py-2 font-semibold">Acceptance</th>
                <th className="text-left px-4 py-2 font-semibold">Awards/Year</th>
                <th className="text-left px-4 py-2 font-semibold">LinkedIn Search</th>
              </tr>
            </thead>
            <tbody>
              {FELLOWSHIP_DETAILS.map((f, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-secondary/10">
                  <td className="px-4 py-2.5 font-semibold text-foreground">{f.name}</td>
                  <td className="px-4 py-2.5 font-mono">{f.acceptance}</td>
                  <td className="px-4 py-2.5">{f.perYear}</td>
                  <td className="px-4 py-2.5">
                    <button
                      onClick={() => handleCopy(f.searchTerm, `fellow-${i}`)}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-secondary text-secondary-foreground hover:bg-secondary/80 cursor-pointer"
                    >
                      {copiedId === `fellow-${i}` ? <Check className="w-2.5 h-2.5 text-emerald-500" /> : <Copy className="w-2.5 h-2.5" />}
                      {f.searchTerm}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Fellowship EEA Signals</h3>
        <div className="grid gap-3">
          {filterSignals([...TIER_1_SIGNALS, ...TIER_2_SIGNALS].filter(s => s.category === "fellowship")).map(renderSignalCard)}
        </div>
      </div>
    </div>
  );

  const renderAwards = () => (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">Awards & Industry Recognition</h3>
        <div className="grid gap-3">
          {filterSignals([...TIER_1_SIGNALS, ...TIER_2_SIGNALS].filter(s => s.category === "industry_award")).map(renderSignalCard)}
        </div>
      </div>
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">Open Source Prestige</h3>
        <div className="grid gap-3">
          {filterSignals([...TIER_1_SIGNALS, ...TIER_2_SIGNALS].filter(s => s.category === "open_source")).map(renderSignalCard)}
        </div>
      </div>
    </div>
  );

  const renderFounder = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Founder-Specific EEA Signals</h3>
        <div className="grid gap-3">
          {filterSignals([...TIER_1_SIGNALS, ...TIER_2_SIGNALS].filter(s => s.category === "founder")).map(renderSignalCard)}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">Revenue Traction Benchmarks</h3>
        <div className="space-y-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-secondary text-secondary-foreground">$1M ARR</span>
            <span>Real traction</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700">$5M ARR</span>
            <span>Strong product-market fit</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700">$10M+ ARR</span>
            <span>Category leader</span>
          </div>
        </div>
      </div>
    </div>
  );

  const renderWarmth = () => (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-xl p-4">
        <p className="text-xs text-muted-foreground">
          Warmth score adds 0-20 points to the EEA score. It does not replace technical qualification — it adjusts outreach
          sequencing and determines who Andrew reaches out to personally vs. who enters a recruiter-mediated flow.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {WARMTH_TIERS.map(tier => (
          <div key={tier.tier} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                tier.color === "red" ? "bg-red-100 text-red-700" :
                tier.color === "amber" ? "bg-amber-100 text-amber-700" :
                tier.color === "blue" ? "bg-blue-100 text-blue-700" :
                "bg-violet-100 text-violet-700"
              }`}>{tier.tier}</span>
              <h4 className="text-sm font-semibold text-foreground">{tier.label}</h4>
              <span className="text-xs font-bold text-primary ml-auto">+{tier.points} pts</span>
            </div>
            <div className="space-y-2">
              {tier.signals.map((sig, j) => (
                <div key={j} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${
                    tier.color === "red" ? "bg-red-400" :
                    tier.color === "amber" ? "bg-amber-400" :
                    tier.color === "blue" ? "bg-blue-400" :
                    "bg-violet-400"
                  }`} />
                  <span>{sig}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Outreach Routing */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-secondary/30">
          <h3 className="text-sm font-semibold text-foreground">Outreach Routing by Score</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-secondary/20">
                <th className="text-left px-4 py-2 font-semibold">EEA Score</th>
                <th className="text-left px-4 py-2 font-semibold">Warmth</th>
                <th className="text-left px-4 py-2 font-semibold">Combined</th>
                <th className="text-left px-4 py-2 font-semibold">Owner</th>
                <th className="text-left px-4 py-2 font-semibold">Approach</th>
              </tr>
            </thead>
            <tbody>
              {OUTREACH_ROUTING.map((r, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-secondary/10">
                  <td className="px-4 py-2.5 font-mono">{r.eeaRange}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      r.warmthTier === "W1" ? "bg-red-100 text-red-700" :
                      r.warmthTier === "W2" ? "bg-amber-100 text-amber-700" :
                      r.warmthTier === "W3" ? "bg-blue-100 text-blue-700" :
                      r.warmthTier === "W4" ? "bg-violet-100 text-violet-700" :
                      "bg-secondary text-secondary-foreground"
                    }`}>{r.warmthTier === "any" ? "Any" : r.warmthTier}</span>
                  </td>
                  <td className="px-4 py-2.5 font-bold text-foreground">{r.combinedRange}</td>
                  <td className="px-4 py-2.5 font-semibold text-foreground">{r.owner}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{r.approach}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderScoring = () => (
    <div className="space-y-6">
      <div className="grid md:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-4 border-t-4 border-t-primary">
          <div className="text-2xl font-bold text-foreground">80 pts</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mt-1">Max EEA Score</div>
          <div className="text-[10px] text-muted-foreground mt-2">Verified signals from publications, patents, competitions, fellowships, awards, OSS, and founder signals.</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 border-t-4 border-t-amber-400">
          <div className="text-2xl font-bold text-foreground">20 pts</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mt-1">Max Warmth Score</div>
          <div className="text-[10px] text-muted-foreground mt-2">DL.AI relationship proximity. W1 (direct: +20), W2 (brand: +12), W3 (user: +6), W4 (ecosystem: +3).</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 border-t-4 border-t-emerald-400">
          <div className="text-2xl font-bold text-foreground">100 pts</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mt-1">Max Combined Score</div>
          <div className="text-[10px] text-muted-foreground mt-2">EEA + Warmth = outreach priority. Top 50 get Andrew's direct outreach. 51-400 enter recruiter pipeline.</div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">Score Thresholds</h3>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-24 text-right">
              <span className="text-lg font-bold text-foreground">90-100</span>
            </div>
            <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full" style={{ width: "100%" }} />
            </div>
            <div className="w-48 text-xs text-muted-foreground">Andrew directly. Personal note.</div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-24 text-right">
              <span className="text-lg font-bold text-foreground">72-89</span>
            </div>
            <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full" style={{ width: "80%" }} />
            </div>
            <div className="w-48 text-xs text-muted-foreground">Andrew directly. DL.AI reference.</div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-24 text-right">
              <span className="text-lg font-bold text-foreground">56-71</span>
            </div>
            <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
              <div className="h-full bg-violet-500 rounded-full" style={{ width: "60%" }} />
            </div>
            <div className="w-48 text-xs text-muted-foreground">Mike. "Andrew asked me to reach out..."</div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-24 text-right">
              <span className="text-lg font-bold text-foreground">43-55</span>
            </div>
            <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
              <div className="h-full bg-amber-500 rounded-full" style={{ width: "40%" }} />
            </div>
            <div className="w-48 text-xs text-muted-foreground">Mike. Standard AI Fund pipeline.</div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-24 text-right">
              <span className="text-lg font-bold text-foreground">&lt;43</span>
            </div>
            <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
              <div className="h-full bg-secondary rounded-full" style={{ width: "20%" }} />
            </div>
            <div className="w-48 text-xs text-muted-foreground">Nurture list. Do not contact now.</div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderFalsePositives = () => (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            The three most common overestimates of candidate quality in AI recruiting: <strong>workshop papers masquerading as main conference papers</strong>,
            <strong> TEDx conflated with TED</strong>, and <strong>IBM patent volumes mistaken for innovation</strong>.
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-secondary/20">
                <th className="text-left px-4 py-2 font-semibold">Signal Seen</th>
                <th className="text-left px-4 py-2 font-semibold">The Problem</th>
                <th className="text-left px-4 py-2 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {FALSE_POSITIVES.map((fp, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-secondary/10">
                  <td className="px-4 py-2.5 font-semibold text-foreground whitespace-nowrap">{fp.signal}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{fp.problem}</td>
                  <td className="px-4 py-2.5 text-foreground">{fp.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderLinkedIn = () => (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-xl p-4 text-xs text-muted-foreground">
        Click any search term to copy it to your clipboard for use in Clay or Exa search queries.
      </div>

      {Object.entries(LINKEDIN_SEARCH_SYNTAX).map(([category, terms]) => (
        <div key={category} className="bg-card border border-border rounded-xl p-4">
          <h4 className="text-sm font-semibold text-foreground mb-3">{category}</h4>
          <div className="space-y-2">
            {terms.map((term, i) => (
              <button
                key={i}
                onClick={() => handleCopy(term, `linkedin-${category}-${i}`)}
                className="flex items-start gap-2 w-full text-left px-3 py-2 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors cursor-pointer group"
              >
                <Code2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-muted-foreground group-hover:text-primary" />
                <span className="text-xs font-mono text-foreground">{term}</span>
                <span className="ml-auto flex-shrink-0">
                  {copiedId === `linkedin-${category}-${i}` ? (
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100" />
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  const renderContent = () => {
    switch (activeSubTab) {
      case "overview": return renderOverview();
      case "publications": return renderPublications();
      case "patents": return renderPatents();
      case "competitions": return renderCompetitions();
      case "fellowships": return renderFellowships();
      case "awards": return renderAwards();
      case "founder": return renderFounder();
      case "warmth": return renderWarmth();
      case "scoring": return renderScoring();
      case "false_positives": return renderFalsePositives();
      case "linkedin": return renderLinkedIn();
      default: return renderOverview();
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-foreground tracking-tight">EEA Signal Reference</h2>
          <p className="text-xs text-muted-foreground mt-1">
            150+ verifiable credentials for identifying top 5% technical talent
          </p>
        </div>
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search signals..."
            className="pl-8 pr-3 py-1.5 text-xs bg-card border border-border rounded-lg w-48 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {/* Sub-tab navigation */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-thin">
        {SUB_TABS.map((tab) => {
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium whitespace-nowrap transition-all ${
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
            >
              <tab.icon className="w-3 h-3" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {renderContent()}
    </div>
  );
}
