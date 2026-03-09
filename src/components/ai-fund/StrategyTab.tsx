/**
 * DL.AI Strategy Tab
 *
 * Overview of the DeepLearning.AI founder pipeline strategy.
 * Presents the 5-layer enrichment architecture, funnel math,
 * and execution roadmap.
 */

import { useState } from "react";
import {
  Layers,
  ChevronRight,
  Target,
  Users,
  Zap,
  Clock,
  CheckCircle2,
  Database,
  Filter,
  BarChart3,
  MessageSquare,
  AlertTriangle,
} from "lucide-react";
import type { AiFundWorkspace } from "@/types/ai-fund";

interface Props {
  workspace: AiFundWorkspace;
}

type SubView = "opportunity" | "pipeline" | "execution";

export default function StrategyTab({ workspace: _workspace }: Props) {
  const [activeView, setActiveView] = useState<SubView>("opportunity");

  const VIEW_TABS: { id: SubView; label: string; icon: React.ElementType }[] = [
    { id: "opportunity", label: "The Opportunity", icon: Target },
    { id: "pipeline", label: "Pipeline Architecture", icon: Layers },
    { id: "execution", label: "Execution Plan", icon: Clock },
  ];

  const renderOpportunity = () => (
    <div className="space-y-6">
      <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 text-xs text-teal-800">
        The DeepLearning.AI user base is the largest pre-qualified, pre-warmed talent pool for AI Fund's mandate.
        Every person in it has voluntarily self-identified as someone who takes AI seriously enough to invest time
        learning from Andrew personally. No other sourcing channel starts with that baseline.
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { value: "~7M", label: "DL.AI Users", sub: "Largest AI learning community", color: "border-t-primary" },
          { value: "~900K", label: "Advanced Completers", sub: "MLOps, LLM, NLP, GANs", color: "border-t-teal-500" },
          { value: "~40K", label: "Founder Overlap", sub: "Currently founders at AI/ML cos", color: "border-t-violet-500" },
          { value: "~4K", label: "Target Zone", sub: "B2B AI, $500K-$20M, pre-Series B", color: "border-t-amber-500" },
          { value: "~400", label: "EEA Qualified", sub: "Score >=40 after signal overlay", color: "border-t-emerald-500" },
          { value: "~50", label: "Andrew Priority", sub: "Direct personal outreach", color: "border-t-red-500" },
        ].map((item, i) => (
          <div key={i} className={`bg-card border border-border rounded-xl p-4 border-t-4 ${item.color}`}>
            <div className="text-2xl font-bold text-foreground">{item.value}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mt-1">{item.label}</div>
            <div className="text-[10px] text-muted-foreground mt-1">{item.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <h4 className="text-xs font-bold text-foreground uppercase tracking-wider mb-3">Cold Pipeline Problems</h4>
          <ul className="space-y-1.5 text-xs text-muted-foreground list-disc list-inside">
            <li>No baseline relationship with Andrew</li>
            <li>No signal of interest in AI at the application layer</li>
            <li>Response rates to recruiter outreach: 8-15%</li>
            <li>Long qualification funnel</li>
            <li>Zero warmth — Andrew introduces himself and the concept simultaneously</li>
          </ul>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <h4 className="text-xs font-bold text-foreground uppercase tracking-wider mb-3">DL.AI Pipeline Advantages</h4>
          <ul className="space-y-1.5 text-xs text-muted-foreground list-disc list-inside">
            <li>Already know and trust Andrew — he's their teacher</li>
            <li>Self-selected for AI seriousness via coursework</li>
            <li>Response rates to Andrew personally: est. 60-80%</li>
            <li>Short qualification path</li>
            <li>Message writes itself: "I noticed you completed [course]..."</li>
          </ul>
        </div>
      </div>

      <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 text-xs text-violet-800">
        <strong>The conversion math:</strong> If Andrew sends 50 direct messages to Tier 1 candidates, a 70% response rate
        yields 35 conversations. If 30% advance to a real FIR discussion, that's 10+ qualified founder conversations
        from a single outreach batch.
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <strong>This is not a mass email blast.</strong> We use the database as a filter to identify the ~50 people
            for whom Andrew personally reaching out makes strategic sense. The database is intelligence infrastructure, not a broadcast list.
          </div>
        </div>
      </div>
    </div>
  );

  const renderPipeline = () => (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-800">
        All five layers run in parallel where possible. The output at each stage narrows the pool while adding enrichment depth.
        Final output is a scored, ranked list with Andrew-ready outreach notes per candidate.
      </div>

      {/* Flow visualization */}
      <div className="flex items-center gap-0 overflow-x-auto pb-2">
        {[
          { label: "Start", value: "DL.AI Users", sub: "~7M", color: "" },
          { label: "Layer 1", value: "Course Filter", sub: "~120K", color: "" },
          { label: "Layer 2 - Harmonic", value: "Founder Match", sub: "~4K", color: "" },
          { label: "Layer 3 - Clay", value: "Profile Build", sub: "~4K enriched", color: "" },
          { label: "Layer 4 - Exa", value: "Signal Verify", sub: "~400 scored", color: "" },
          { label: "Output", value: "Andrew List", sub: "Top 50", color: "bg-primary text-primary-foreground" },
        ].map((node, i) => (
          <div key={i} className="flex items-center">
            <div className={`rounded-lg border border-border p-3 min-w-[120px] text-center ${node.color || "bg-card"}`}>
              <div className={`text-[9px] uppercase tracking-wider font-bold ${node.color ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{node.label}</div>
              <div className={`text-xs font-bold mt-0.5 ${node.color ? "" : "text-foreground"}`}>{node.value}</div>
              <div className={`text-[10px] mt-0.5 ${node.color ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{node.sub}</div>
            </div>
            {i < 5 && <ChevronRight className="w-4 h-4 text-muted-foreground mx-1 flex-shrink-0" />}
          </div>
        ))}
      </div>

      {/* Layer details */}
      <div className="space-y-4">
        {[
          { num: "1", icon: Database, title: "DL.AI Database Filter", desc: "Filter by advanced specialization completion (MLOps, LLM, NLP, GANs, ML Engineering for Production), active technical role or founder title, recent course completion. ~7M → ~120K." },
          { num: "2", icon: Zap, title: "Harmonic Enrichment (Company Signal)", desc: "Match names/emails to company profiles. Filter: founder/co-founder title, company age 1-5 years, funding $500K-$20M, headcount 2-30, AI/SaaS/B2B tags. Headcount growth >20% as momentum indicator. ~120K → ~4K." },
          { num: "3", icon: Users, title: "Clay LinkedIn Enrichment (Profile Build)", desc: "Full LinkedIn profiles: title, employers, education, honors, publications, patents, GitHub. Flag profiles mentioning Tier 1 or Tier 2 EEA signals. ~4K profiles enriched." },
          { num: "4", icon: Filter, title: "Exa Websets (Deep Signal Verification)", desc: "Google Scholar citations, GitHub stars, competition result databases, fellowship alumni directories. Cross-reference and score each verified signal. ~400 candidates with EEA scores >=40pts." },
          { num: "5", icon: Target, title: "Warmth Overlay + Final Scoring", desc: "Apply warmth tier (0-20 pts) on top of EEA (0-80 pts). Sort descending. Top 50 → Andrew. Top 51-400 → recruiter pipeline with Andrew's name." },
        ].map((layer, i) => (
          <div key={i} className="flex gap-4 items-start">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-primary-foreground">{layer.num}</span>
            </div>
            <div className="bg-card border border-border rounded-xl p-4 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <layer.icon className="w-4 h-4 text-primary" />
                <h4 className="text-sm font-semibold text-foreground">{layer.title}</h4>
              </div>
              <p className="text-xs text-muted-foreground">{layer.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-xs text-emerald-800">
        <strong>Tool dependencies:</strong> Harmonic API (company enrichment), Clay (LinkedIn profile build + contact data),
        Exa Websets (semantic signal verification), Parallel Task Groups (batch enrichment).
        Runtime estimate: 2-4 hours with parallel processing.
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <strong>Before running:</strong> Confirm with legal that internal use of DL.AI user data for AI Fund
            founder recruiting is permitted under the platform's ToS and internal data governance policy.
          </div>
        </div>
      </div>
    </div>
  );

  const renderExecution = () => (
    <div className="space-y-6">
      {/* 30-day roadmap */}
      <div className="space-y-4">
        {[
          { week: "Week 1", title: "Data Access + Pipeline Setup", desc: "Legal sign-off on DL.AI data use. Pull advanced course completion list. Configure Clay table. Connect Harmonic API. Define Exa Websets criteria.", time: "3-4 days" },
          { week: "Week 1-2", title: "Layer 1 + 2 Filtering", desc: "Run DL.AI advanced course filter. Push ~120K filtered users through Harmonic. Output: ~4K candidate profiles.", time: "2-3 days automated, 1 day QA" },
          { week: "Week 2", title: "Clay + Exa Enrichment", desc: "Run Clay LinkedIn enrichment across ~4K profiles. Flag EEA signals. For flagged profiles (~400), run Exa Websets verification.", time: "3-4 days with parallel" },
          { week: "Week 2-3", title: "Warmth Overlay + Scoring", desc: "Apply warmth tier scoring. Sort by combined score. Review top 100. Identify top 50 for Andrew. Build scored HTML artifact.", time: "2-3 days" },
          { week: "Week 3", title: "Outreach Prep + Andrew Review", desc: "Draft personalized outreach for top 50. Present to Andrew. Target: 40+ approved for send.", time: "1 day drafting, 1 review" },
          { week: "Week 3-4", title: "Launch + Response Management", desc: "Send approved messages. Manage responses. Track reply rate, sentiment, conversion. Candidates 51-400 enter recruiter pipeline.", time: "Ongoing" },
        ].map((step, i) => (
          <div key={i} className="flex gap-4 items-start">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
              <span className="text-[9px] font-bold text-primary-foreground">{i + 1}</span>
            </div>
            <div className="bg-card border border-border rounded-xl p-4 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{step.week}</span>
                <span className="text-[10px] text-muted-foreground">({step.time})</span>
              </div>
              <h4 className="text-sm font-semibold text-foreground mb-1">{step.title}</h4>
              <p className="text-xs text-muted-foreground">{step.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Success Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { value: "70%+", label: "Target Reply Rate", sub: "Andrew's direct outreach to W1/W2" },
          { value: "35+", label: "Conversations", sub: "From first batch of 50 messages" },
          { value: "10+", label: "FIR Discussions", sub: "30% of conversations advancing" },
          { value: "3-5", label: "FIR Placements (Y1)", sub: "From first 2-3 outreach batches" },
          { value: "~4K", label: "Pipeline Asset", sub: "Enriched founder database" },
          { value: "<2 hrs", label: "Andrew's Weekly Time", sub: "Review messages + close convos" },
        ].map((item, i) => (
          <div key={i} className="bg-card border border-border rounded-xl p-4">
            <div className="text-xl font-bold text-foreground">{item.value}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mt-1">{item.label}</div>
            <div className="text-[10px] text-muted-foreground mt-1">{item.sub}</div>
          </div>
        ))}
      </div>

      {/* Refresh cadence */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-xs text-emerald-800">
        <strong>This pipeline compounds.</strong> Every new DL.AI course cohort adds candidates. Every AI Fund portfolio
        announcement increases warmth scores. The enrichment infrastructure runs quarterly refreshes automatically.
        By Month 6, the pipeline is self-refreshing.
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-secondary/30">
          <h3 className="text-sm font-semibold text-foreground">Refresh Triggers</h3>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-secondary/20">
              <th className="text-left px-4 py-2 font-semibold">Trigger</th>
              <th className="text-left px-4 py-2 font-semibold">Action</th>
              <th className="text-left px-4 py-2 font-semibold">Frequency</th>
            </tr>
          </thead>
          <tbody>
            {[
              { trigger: "New DL.AI specialization cohort", action: "Re-run Layer 1 on new completers, push through pipeline", freq: "Quarterly" },
              { trigger: "New AI Fund portfolio company", action: "Re-score all candidates for warmth bump", freq: "Per announcement" },
              { trigger: "Harmonic funding event", action: "Flag pipeline candidates with new funding", freq: "Real-time" },
              { trigger: "New publication / OSS project", action: "Exa monitor alerts on top 400 candidates", freq: "Weekly" },
              { trigger: "Andrew meets DL.AI founder organically", action: "Add to pipeline, tag W1, fast-track scoring", freq: "Ad hoc" },
            ].map((row, i) => (
              <tr key={i} className="border-b border-border/50 hover:bg-secondary/10">
                <td className="px-4 py-2.5 font-semibold text-foreground">{row.trigger}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{row.action}</td>
                <td className="px-4 py-2.5 text-foreground">{row.freq}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-foreground tracking-tight">DL.AI Pipeline Strategy</h2>
        <p className="text-xs text-muted-foreground mt-1">
          DeepLearning.AI as a talent intelligence asset for AI Fund founder sourcing
        </p>
      </div>

      <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-thin">
        {VIEW_TABS.map(tab => {
          const isActive = activeView === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveView(tab.id)}
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

      {activeView === "opportunity" && renderOpportunity()}
      {activeView === "pipeline" && renderPipeline()}
      {activeView === "execution" && renderExecution()}
    </div>
  );
}
