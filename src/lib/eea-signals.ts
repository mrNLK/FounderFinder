/**
 * EEA (Evidence of Exceptional Ability) Signal Definitions
 *
 * Comprehensive reference data for identifying top 5% technical talent.
 * Used by the EEA Signals reference tab and scoring overlays.
 */

// ---------------------------------------------------------------------------
// Signal Tier Definitions
// ---------------------------------------------------------------------------

export type SignalTier = 1 | 2;
export type SignalCategory =
  | "publication"
  | "patent"
  | "competition"
  | "fellowship"
  | "industry_award"
  | "open_source"
  | "founder";

export type WarmthTier = "W1" | "W2" | "W3" | "W4";

export interface EEASignal {
  id: string;
  category: SignalCategory;
  tier: SignalTier;
  label: string;
  description: string;
  points: number;
  selectivity: string;
  linkedinSearchTerms: string[];
  verificationMethod: string;
  falsePositiveNote?: string;
}

export interface WarmthTierDef {
  tier: WarmthTier;
  label: string;
  points: number;
  color: string;
  signals: string[];
}

export interface ConferenceInfo {
  abbreviation: string;
  fullName: string;
  acceptanceRate: string;
  oralRate?: string;
  signalStrength: number; // 1-5 stars
  tier: string;
  searchTerms: string[];
  notes?: string;
}

export interface FalsePositive {
  signal: string;
  problem: string;
  action: string;
}

// ---------------------------------------------------------------------------
// Publication Conferences
// ---------------------------------------------------------------------------

export const CONFERENCES: ConferenceInfo[] = [
  // Tier 1 - The Big 3 of ML
  { abbreviation: "NeurIPS", fullName: "Conference on Neural Information Processing Systems", acceptanceRate: "25.8%", oralRate: "0.4%", signalStrength: 5, tier: "1", searchTerms: ["NeurIPS", "NIPS"], notes: "Oral presentation = top 0.5% of all ML researchers who submitted" },
  { abbreviation: "ICML", fullName: "International Conference on Machine Learning", acceptanceRate: "27.5%", oralRate: "1.0%", signalStrength: 5, tier: "1", searchTerms: ["ICML"] },
  { abbreviation: "ICLR", fullName: "International Conference on Learning Representations", acceptanceRate: "31%", oralRate: "1.2%", signalStrength: 5, tier: "1", searchTerms: ["ICLR"] },
  // Tier 1B - Computer Vision
  { abbreviation: "CVPR", fullName: "Conference on Computer Vision and Pattern Recognition", acceptanceRate: "22.1%", oralRate: "0.8%", signalStrength: 5, tier: "1B", searchTerms: ["CVPR"], notes: "Single most prestigious venue for vision research" },
  { abbreviation: "ICCV", fullName: "International Conference on Computer Vision", acceptanceRate: "26.8%", signalStrength: 4, tier: "1B", searchTerms: ["ICCV"] },
  { abbreviation: "ECCV", fullName: "European Conference on Computer Vision", acceptanceRate: "27.9%", signalStrength: 4, tier: "1B", searchTerms: ["ECCV"] },
  // Tier 2 - NLP
  { abbreviation: "ACL", fullName: "Association for Computational Linguistics", acceptanceRate: "23.5%", signalStrength: 4, tier: "2-NLP", searchTerms: ["ACL 20"], notes: "\"Findings of ACL\" is significantly weaker than \"ACL\"" },
  { abbreviation: "EMNLP", fullName: "Empirical Methods in NLP", acceptanceRate: "20.8%", signalStrength: 4, tier: "2-NLP", searchTerms: ["EMNLP"], notes: "Has a \"Findings\" tier — weaker than main" },
  { abbreviation: "NAACL", fullName: "North American Chapter of ACL", acceptanceRate: "~23%", signalStrength: 4, tier: "2-NLP", searchTerms: ["NAACL"] },
  // Tier 2 - Systems for ML
  { abbreviation: "MLSys", fullName: "Machine Learning and Systems", acceptanceRate: "~23.5%", signalStrength: 5, tier: "2-Systems", searchTerms: ["MLSys"], notes: "Bridges ML research and production systems — high signal for AI Fund" },
  { abbreviation: "OSDI", fullName: "Operating Systems Design and Implementation", acceptanceRate: "~18%", signalStrength: 5, tier: "2-Systems", searchTerms: ["OSDI"], notes: "TensorFlow, MapReduce, Spanner first published here" },
  { abbreviation: "SOSP", fullName: "Symposium on Operating Systems Principles", acceptanceRate: "~16-17%", signalStrength: 5, tier: "2-Systems", searchTerms: ["SOSP"] },
  // Tier 2 - General AI
  { abbreviation: "AAAI", fullName: "Association for the Advancement of AI", acceptanceRate: "23.75%", signalStrength: 4, tier: "2-General", searchTerms: ["AAAI"] },
  { abbreviation: "IJCAI", fullName: "International Joint Conference on AI", acceptanceRate: "14.1%", signalStrength: 4, tier: "2-General", searchTerms: ["IJCAI"], notes: "More selective than most at 14.1%" },
  { abbreviation: "KDD", fullName: "Knowledge Discovery and Data Mining", acceptanceRate: "22.1%", signalStrength: 4, tier: "2-General", searchTerms: ["KDD"] },
];

// ---------------------------------------------------------------------------
// Presentation Type Hierarchy
// ---------------------------------------------------------------------------

export const PRESENTATION_TYPES = [
  { type: "Best Paper Award", selectionRate: "0.01-0.04%", signal: "Career-defining", points: 25 },
  { type: "Oral presentation", selectionRate: "0.4-1.5%", signal: "Exceptional — top ~1%", points: 25 },
  { type: "Spotlight", selectionRate: "2-5%", signal: "Very strong — top ~3-5%", points: 15 },
  { type: "Poster (accepted paper)", selectionRate: "15-27%", signal: "Strong — main conference", points: 10 },
  { type: "Workshop paper", selectionRate: "30-60%", signal: "Moderate — not main conf.", points: 3 },
];

// ---------------------------------------------------------------------------
// Tier 1 EEA Signals (any single = top 5%)
// ---------------------------------------------------------------------------

export const TIER_1_SIGNALS: EEASignal[] = [
  {
    id: "pub-oral",
    category: "publication",
    tier: 1,
    label: "First-author oral at NeurIPS / ICML / ICLR",
    description: "Top 0.5% of all ML researchers who submitted that year",
    points: 25,
    selectivity: "0.4-1.5%",
    linkedinSearchTerms: ["oral presentation", "NeurIPS", "ICML", "ICLR"],
    verificationMethod: "Conference proceedings, OpenReview",
  },
  {
    id: "pub-best-paper",
    category: "publication",
    tier: 1,
    label: "Best Paper Award (any Tier 1-2 conf)",
    description: "2-6 awards from 10,000-21,000 submissions. Career-defining.",
    points: 25,
    selectivity: "0.01-0.04%",
    linkedinSearchTerms: ["Best Paper Award", "Outstanding Paper Award"],
    verificationMethod: "Conference website, proceedings",
  },
  {
    id: "comp-ioi-imo-gold",
    category: "competition",
    tier: 1,
    label: "IOI / IMO Gold Medal or ICPC World Finals Medal",
    description: "Top 0.01% of all programmers / mathematicians globally",
    points: 25,
    selectivity: "~28-50 per year globally",
    linkedinSearchTerms: ["IOI Gold", "International Olympiad in Informatics", "IMO Gold", "ICPC World Finals"],
    verificationMethod: "stats.ioinformatics.org, icpc.global, imo-official.org",
  },
  {
    id: "comp-kaggle-gm",
    category: "competition",
    tier: 1,
    label: "Kaggle Competition Grandmaster",
    description: "~300 worldwide from 23M+ users. Solo gold required.",
    points: 24,
    selectivity: "0.001%",
    linkedinSearchTerms: ["Kaggle Competition Grandmaster", "Kaggle Grandmaster"],
    verificationMethod: "kaggle.com/rankings",
  },
  {
    id: "fellow-elite",
    category: "fellowship",
    tier: 1,
    label: "Hertz / Knight-Hennessy / Gates Cambridge / Thiel Fellow",
    description: "<2% acceptance. Multi-round technical selection.",
    points: 22,
    selectivity: "<1-2%",
    linkedinSearchTerms: ["Hertz Fellow", "Knight-Hennessy Scholar", "Gates Cambridge Scholar", "Thiel Fellow"],
    verificationMethod: "Fellowship alumni directories",
  },
  {
    id: "fellow-ai-phd",
    category: "fellowship",
    tier: 1,
    label: "Google / Microsoft / Apple AI PhD Fellow",
    description: "University nomination required. 2-4 nominees per department.",
    points: 21,
    selectivity: "~15 per year per company",
    linkedinSearchTerms: ["Google PhD Fellow", "Microsoft Research PhD Fellow", "Apple Scholar in AI"],
    verificationMethod: "Company fellowship pages",
  },
  {
    id: "fellow-residency",
    category: "fellowship",
    tier: 1,
    label: "OpenAI / Google Brain / DeepMind Residency Alumnus",
    description: "Worked alongside frontier research teams. Highly competitive.",
    points: 21,
    selectivity: "Very few per cohort",
    linkedinSearchTerms: ["OpenAI Resident", "Google AI Resident", "Google Brain Resident", "DeepMind Resident"],
    verificationMethod: "LinkedIn experience section, company confirmation",
  },
  {
    id: "pub-foundational",
    category: "publication",
    tier: 1,
    label: "Author on foundational GenAI paper (1,000+ citations)",
    description: "Attention Is All You Need (173K+), BERT (90K+), LoRA (15K+), CoT (8K+), RAG (5K+)",
    points: 20,
    selectivity: "<100 people globally",
    linkedinSearchTerms: ["Attention Is All You Need", "BERT", "LoRA", "Chain-of-Thought"],
    verificationMethod: "Google Scholar, Semantic Scholar",
  },
  {
    id: "comp-neurips-winner",
    category: "competition",
    tier: 1,
    label: "NeurIPS / ICML Competition Track Winner",
    description: "16 competitions per year on frontier topics. Career-defining win.",
    points: 20,
    selectivity: "16 winning teams/year",
    linkedinSearchTerms: ["NeurIPS competition", "ICML competition", "competition winner"],
    verificationMethod: "Competition results pages",
  },
  {
    id: "award-acm-dissertation",
    category: "industry_award",
    tier: 1,
    label: "ACM Doctoral Dissertation Award",
    description: "Best PhD dissertation in computing worldwide.",
    points: 22,
    selectivity: "1 per year",
    linkedinSearchTerms: ["ACM Doctoral Dissertation Award"],
    verificationMethod: "ACM awards page",
  },
  {
    id: "founder-yc",
    category: "founder",
    tier: 1,
    label: "YC or a16z Speedrun Founder",
    description: "YC: 1-2% acceptance. Speedrun: <0.4%. 50%+ of recent YC batches are AI.",
    points: 20,
    selectivity: "1-2% (YC), <0.4% (Speedrun)",
    linkedinSearchTerms: ["Y Combinator", "YC W", "YC S", "a16z Speedrun"],
    verificationMethod: "YC company directory, a16z portfolio",
  },
  {
    id: "oss-major",
    category: "open_source",
    tier: 1,
    label: "Creator of 10K+ star open source ML project",
    description: "Top 0.01% of GitHub repos. Major framework territory.",
    points: 20,
    selectivity: "0.01% of repos",
    linkedinSearchTerms: ["open source", "GitHub", "creator", "maintainer"],
    verificationMethod: "GitHub star count, fork count, commit history",
    falsePositiveNote: "Stars can be purchased. Verify forks, issues, commit cadence.",
  },
  {
    id: "award-tr35",
    category: "industry_award",
    tier: 1,
    label: "MIT Technology Review Innovators Under 35 (TR35)",
    description: "35/year globally from 500+ nominees. Expert peer review.",
    points: 20,
    selectivity: "~7%",
    linkedinSearchTerms: ["MIT Technology Review", "TR35", "Innovators Under 35"],
    verificationMethod: "MIT Technology Review website",
  },
  {
    id: "patent-frontier",
    category: "patent",
    tier: 1,
    label: "Patent at OpenAI / Anthropic / DeepMind (any)",
    description: "These orgs file extremely selectively. Any patent = deep frontier involvement.",
    points: 20,
    selectivity: "Very few total patents at these orgs",
    linkedinSearchTerms: ["patent", "OpenAI", "Anthropic", "DeepMind"],
    verificationMethod: "Google Patents, USPTO",
  },
  {
    id: "founder-exit",
    category: "founder",
    tier: 1,
    label: "Prior startup exit >$50M",
    description: "Successful acquisition or IPO demonstrating execution ability.",
    points: 20,
    selectivity: "<5% of funded startups",
    linkedinSearchTerms: ["acquired", "exit", "IPO"],
    verificationMethod: "Crunchbase, press coverage",
  },
];

// ---------------------------------------------------------------------------
// Tier 2 EEA Signals (combinations build the case)
// ---------------------------------------------------------------------------

export const TIER_2_SIGNALS: EEASignal[] = [
  {
    id: "pub-spotlight",
    category: "publication",
    tier: 2,
    label: "First-author spotlight at NeurIPS / ICML / ICLR",
    description: "Top 2-5% of submissions",
    points: 15,
    selectivity: "2-5%",
    linkedinSearchTerms: ["spotlight", "NeurIPS", "ICML", "ICLR"],
    verificationMethod: "Conference proceedings",
  },
  {
    id: "comp-medal-silver",
    category: "competition",
    tier: 2,
    label: "IOI / IMO Silver or Bronze Medal",
    description: "Still top 0.1% globally. All IOI/IMO medalists are elite.",
    points: 15,
    selectivity: "0.1%",
    linkedinSearchTerms: ["IOI Silver", "IOI Bronze", "IMO Silver", "IMO Bronze"],
    verificationMethod: "stats.ioinformatics.org, imo-official.org",
  },
  {
    id: "comp-cf-gm",
    category: "competition",
    tier: 2,
    label: "Codeforces Grandmaster (2400+)",
    description: "Top 0.6% of 1.69M+ active users. Best quantitative screening filter.",
    points: 14,
    selectivity: "0.6%",
    linkedinSearchTerms: ["Codeforces Grandmaster", "Codeforces rating"],
    verificationMethod: "codeforces.com/profile/[handle]",
  },
  {
    id: "founder-yc-speedrun",
    category: "founder",
    tier: 2,
    label: "YC / a16z Speedrun / OpenAI Converge Founder",
    description: "Top accelerator acceptance with AI focus.",
    points: 14,
    selectivity: "1-2%",
    linkedinSearchTerms: ["Y Combinator", "a16z Speedrun", "OpenAI Converge"],
    verificationMethod: "Accelerator directories",
  },
  {
    id: "fellow-nsf",
    category: "fellowship",
    tier: 2,
    label: "NSF GRFP / NDSEG Fellow",
    description: "~7-15% acceptance. Strong but not sufficient alone for top 5%.",
    points: 12,
    selectivity: "7-15%",
    linkedinSearchTerms: ["NSF Graduate Research Fellow", "NSF GRFP", "NDSEG Fellow"],
    verificationMethod: "Fellowship directories",
  },
  {
    id: "fellow-rhodes",
    category: "fellowship",
    tier: 2,
    label: "Rhodes or Marshall Scholar",
    description: "~3.5% acceptance. Prestigious academic fellowship.",
    points: 12,
    selectivity: "~3.5%",
    linkedinSearchTerms: ["Rhodes Scholar", "Marshall Scholar"],
    verificationMethod: "Fellowship websites",
  },
  {
    id: "oss-contributor",
    category: "open_source",
    tier: 2,
    label: "Core contributor to major ML framework",
    description: "PyTorch, TensorFlow, Hugging Face Transformers, LangChain, vLLM",
    points: 12,
    selectivity: "~50-200 per project",
    linkedinSearchTerms: ["PyTorch", "TensorFlow", "Hugging Face", "LangChain", "vLLM", "core contributor"],
    verificationMethod: "GitHub contributor graphs, commit history",
  },
  {
    id: "comp-kaggle-master",
    category: "competition",
    tier: 2,
    label: "Kaggle Competition Master",
    description: "1 gold + 2 silver medals. Clear top 5% ML ability.",
    points: 12,
    selectivity: "~0.01%",
    linkedinSearchTerms: ["Kaggle Competition Master", "Kaggle Master"],
    verificationMethod: "kaggle.com/rankings",
  },
  {
    id: "pub-hindex",
    category: "publication",
    tier: 2,
    label: "h-index >= 15 within 5 years of PhD",
    description: "Significant research output. Verify via Google Scholar.",
    points: 10,
    selectivity: "Top ~10% of PhD graduates in CS",
    linkedinSearchTerms: ["Google Scholar", "publications", "citations"],
    verificationMethod: "Google Scholar profile",
  },
  {
    id: "patent-apple-nvidia",
    category: "patent",
    tier: 2,
    label: "5+ patents at Apple or NVIDIA on AI topics",
    description: "Selective filers. 5+ indicates consistent innovation at Staff+ level.",
    points: 10,
    selectivity: "Top 5% of engineers at these companies",
    linkedinSearchTerms: ["patent", "Apple", "NVIDIA", "transformer", "inference"],
    verificationMethod: "Google Patents, USPTO",
  },
  {
    id: "comp-hackathon-grand",
    category: "competition",
    tier: 2,
    label: "TreeHacks / HackMIT Grand Prize Winner",
    description: "500+ applicants, <20% acceptance, $100K+ prize pools.",
    points: 10,
    selectivity: "~6.7% acceptance for entry, 1 winner",
    linkedinSearchTerms: ["TreeHacks", "HackMIT", "Grand Prize", "hackathon winner"],
    verificationMethod: "Hackathon websites, Devpost",
  },
  {
    id: "award-forbes-tech",
    category: "industry_award",
    tier: 2,
    label: "Forbes 30 Under 30 (Enterprise Technology or Science)",
    description: "Only technical categories carry signal. PR-driven in other categories.",
    points: 8,
    selectivity: "~4%",
    linkedinSearchTerms: ["Forbes 30 Under 30", "Enterprise Technology"],
    verificationMethod: "Forbes website",
    falsePositiveNote: "Non-technical categories are PR-driven. History of fraud among honorees.",
  },
  {
    id: "founder-series-a",
    category: "founder",
    tier: 2,
    label: "Series A+ from tier-1 VC",
    description: "Sequoia, a16z, Benchmark, Founders Fund backing.",
    points: 12,
    selectivity: "<5% of seed companies raise Series A",
    linkedinSearchTerms: ["Series A", "Sequoia", "a16z", "Benchmark", "Founders Fund"],
    verificationMethod: "Crunchbase, PitchBook",
  },
  {
    id: "award-ted-main",
    category: "industry_award",
    tier: 2,
    label: "TED main stage speaker",
    description: "~50 speakers/year through dedicated curation. 100x more selective than TEDx.",
    points: 10,
    selectivity: "~50/year",
    linkedinSearchTerms: ["TED speaker", "TED talk"],
    verificationMethod: "TED.com",
    falsePositiveNote: "TEDx is independently organized (~5/day globally). 100x less selective.",
  },
];

// ---------------------------------------------------------------------------
// False Positives
// ---------------------------------------------------------------------------

export const FALSE_POSITIVES: FalsePositive[] = [
  {
    signal: "\"NeurIPS 2024\" in profile",
    problem: "Could be a workshop paper (30-60% acceptance) vs. main conference (25%). 2-3x selectivity difference.",
    action: "Check for \"workshop\" in listing. Only score main conference papers.",
  },
  {
    signal: "\"ACL / EMNLP\" paper",
    problem: "\"Findings of ACL\" is significantly weaker than \"ACL.\" Often listed without distinction.",
    action: "Verify via ACL Anthology — check if Findings or main proceedings.",
  },
  {
    signal: "50+ patents at IBM / Samsung",
    problem: "Volume filing culture. IBM used to give bonuses per patent. Quantity != quality.",
    action: "Verify assignee, CPC code quality, and forward citation count on Google Patents.",
  },
  {
    signal: "\"TEDx Speaker\"",
    problem: "5+ TEDx events per day globally. Organizer-selected, not TED-curated. 100x less selective than TED.",
    action: "Do not score. Only score \"TED\" main stage appearances.",
  },
  {
    signal: "\"Forbes 30 Under 30\"",
    problem: "600/year across 20 categories. PR-driven. Non-technical categories carry no signal.",
    action: "Only score if in Enterprise Technology or Science category.",
  },
  {
    signal: "High GitHub stars",
    problem: "Stars can be purchased. Popular tutorials get stars without indicating technical depth.",
    action: "Verify fork count, issue engagement, commit cadence, and contributor count.",
  },
  {
    signal: "\"Kaggle Expert\"",
    problem: "2 bronze medals needed — top 10%. Common among active data scientists, not elite.",
    action: "Only score Kaggle Master and above. Expert is noise at this level.",
  },
  {
    signal: "Hackathon sponsor bounty prizes",
    problem: "\"Best Use of [API]\" prizes have very low bars. Many just wrap an API call.",
    action: "Only score Grand Prize or top overall placement.",
  },
  {
    signal: "Provisional patents only",
    problem: "Patent pending without grant is weak — never survived examination.",
    action: "Only score \"Patent Issued\" status.",
  },
  {
    signal: "Conference panel participation",
    problem: "Being on a panel is not being a keynote speaker. Much lower bar.",
    action: "Only score keynote, invited talks, and oral presentations.",
  },
];

// ---------------------------------------------------------------------------
// Warmth Tier Definitions
// ---------------------------------------------------------------------------

export const WARMTH_TIERS: WarmthTierDef[] = [
  {
    tier: "W1",
    label: "Direct Relationship",
    points: 20,
    color: "red",
    signals: [
      "Former Stanford CS229 or CS230 student (Andrew taught these personally)",
      "Co-author on Andrew's published research (Google Scholar co-author graph)",
      "Former Coursera or DeepLearning.AI full-time employee",
      "Former AI Fund or Landing AI employee",
      "Invited speaker at a DL.AI or AI Fund event",
      "Named DL.AI course instructor or contributor",
    ],
  },
  {
    tier: "W2",
    label: "Brand Familiarity",
    points: 12,
    color: "amber",
    signals: [
      "Featured or mentioned in The Batch newsletter",
      "Completed DL.AI short course as instructor/contributor",
      "Active DL.AI community forum contributor (top-tier posts)",
      "Publicly cited Andrew's research or courses in their own published work",
      "Attended an AI Fund portfolio company event or demo day",
    ],
  },
  {
    tier: "W3",
    label: "User Familiarity",
    points: 6,
    color: "blue",
    signals: [
      "Completed 2+ DL.AI specializations (MLOps, LLM, NLP, GANs)",
      "Completed original ML Specialization on Coursera with certificate",
      "Listed DL.AI certification on LinkedIn profile",
      "Follows @AndrewYNg on Twitter/X or in Andrew's LinkedIn network",
    ],
  },
  {
    tier: "W4",
    label: "Ecosystem Familiarity",
    points: 3,
    color: "purple",
    signals: [
      "Portfolio company overlap (worked at or customer of AI Fund portfolio co)",
      "Stanford AI Lab or CS dept connection (no direct Andrew overlap)",
      "Publicly mentioned AI Fund, Coursera, or Andrew in a post or talk",
      "Active in overlapping AI communities (MLOps Community, Hugging Face, AI Twitter)",
    ],
  },
];

// ---------------------------------------------------------------------------
// Patent Context
// ---------------------------------------------------------------------------

export const PATENT_COMPANY_CONTEXT = [
  { company: "OpenAI / Anthropic", signal: "Very High", note: "Very few patents — any patent signals deep frontier involvement" },
  { company: "DeepMind", signal: "Very High", note: "800+ WIPO filings, highly selective and technically deep" },
  { company: "Apple", signal: "High", note: "Files extremely selectively on core innovations" },
  { company: "NVIDIA", signal: "High", note: "Targeted filing on GPU/inference optimization" },
  { company: "Google", signal: "Medium-High", note: "AI/ML patents tend to be substantive; general patents less so" },
  { company: "IBM", signal: "Low", note: "Historically 9K+/year with bonus incentives. Volume != quality" },
  { company: "Samsung", signal: "Low", note: "6,377 US patents in 2024 — many incremental or defensive" },
];

export const PATENT_GENAI_CATEGORIES = [
  { cpc: "G06N 3/04", area: "Neural network architectures (transformers, attention, MoE)", signal: "Highest" },
  { cpc: "G06N 3/08", area: "Learning methods (including RLHF)", signal: "Very High" },
  { cpc: "G06F 40/20", area: "Natural Language Processing", signal: "High" },
  { cpc: "G06V 10/70", area: "Computer Vision", signal: "High" },
];

// ---------------------------------------------------------------------------
// Competition Details
// ---------------------------------------------------------------------------

export const COMPETITION_TIERS = [
  { tier: "S", label: "Top 0.01% globally", competitions: [
    { name: "IOI (International Olympiad in Informatics)", detail: "330-362 contestants/year from ~90 countries. Gold = top 8.3% of finalists (~28-34/year)" },
    { name: "ACM ICPC World Finals", detail: "~420 students from 50K+ initial competitors. Gold = ~12 students (0.03%)" },
    { name: "IMO (International Mathematical Olympiad)", detail: "~600 students/year from 100+ countries. Gold = ~50/year" },
  ]},
  { tier: "A", label: "Top 0.5-1%", competitions: [
    { name: "Codeforces Grandmaster (2400+)", detail: "~0.6% of 1.69M+ active users. IGM (2600+) = ~0.1%" },
    { name: "Google Code Jam (discontinued Feb 2023)", detail: "Finalists (top 25 from ~30K) = 0.08%. Historical results carry weight" },
    { name: "Meta Hacker Cup", detail: "Finalists (~25 from ~30K) = 0.08%" },
    { name: "USACO Camp / National Team", detail: "25-30 from 12K+ participants (~0.2%). 80% attend MIT/Stanford/Harvard/CMU" },
  ]},
  { tier: "B", label: "Top 2-5%", competitions: [
    { name: "AtCoder Yellow+ (2000+)", detail: "Top ~2% of 117K active users" },
    { name: "Topcoder Red (2200+)", detail: "Top ~1-2% of active competitors" },
    { name: "LeetCode Guardian (2200+)", detail: "Top ~5% of rated users" },
  ]},
];

// ---------------------------------------------------------------------------
// Fellowship Details
// ---------------------------------------------------------------------------

export const FELLOWSHIP_DETAILS = [
  { name: "Knight-Hennessy (Stanford)", acceptance: "~1%", perYear: "80-100", searchTerm: "Knight-Hennessy Scholar" },
  { name: "Gates Cambridge", acceptance: "~1.3%", perYear: "~90", searchTerm: "Gates Cambridge Scholar" },
  { name: "Paul & Daisy Soros", acceptance: "~1.2%", perYear: "30", searchTerm: "PD Soros Fellow" },
  { name: "Hertz Fellowship", acceptance: "~1.5-2%", perYear: "15-20", searchTerm: "Hertz Fellow" },
  { name: "Thiel Fellowship", acceptance: "<1%", perYear: "20-30", searchTerm: "Thiel Fellow" },
  { name: "Rhodes Scholarship", acceptance: "~3.5%", perYear: "32 US / ~100 global", searchTerm: "Rhodes Scholar" },
  { name: "Marshall Scholarship", acceptance: "~3.5%", perYear: "36-51", searchTerm: "Marshall Scholar" },
  { name: "NDSEG Fellowship", acceptance: "<7%", perYear: "~200 (historically)", searchTerm: "NDSEG Fellow" },
  { name: "NSF GRFP", acceptance: "~7-15%", perYear: "1,000-2,000", searchTerm: "NSF Graduate Research Fellow" },
];

// ---------------------------------------------------------------------------
// LinkedIn Search Syntax
// ---------------------------------------------------------------------------

export const LINKEDIN_SEARCH_SYNTAX: Record<string, string[]> = {
  "Publications": [
    '"NeurIPS" OR "ICML" OR "ICLR" OR "CVPR" combined with "oral" OR "spotlight" OR "best paper" OR "first author"',
    '"MLSys" OR "OSDI" OR "SOSP" (for systems talent)',
    '"Google Scholar" with citation counts in profile text',
  ],
  "Patents": [
    '"patent" combined with "transformer" OR "attention mechanism" OR "language model" OR "inference" OR "RLHF"',
    'Filter by company: "OpenAI" OR "Anthropic" OR "DeepMind"',
  ],
  "Competitions": [
    '"IOI" OR "International Olympiad in Informatics" OR "IMO" OR "ICPC World" OR "Codeforces Grandmaster" OR "Kaggle Grandmaster" OR "Kaggle Master" OR "USAMO" OR "Putnam Fellow"',
  ],
  "Fellowships": [
    '"Hertz Fellow" OR "Knight-Hennessy" OR "Thiel Fellow" OR "Google PhD Fellow" OR "NSF GRFP" OR "OpenAI Resident" OR "Google Brain Resident" OR "Apple Scholar"',
  ],
  "Founder signals": [
    '"Y Combinator" OR "YC W" OR "YC S" OR "a16z Speedrun" OR "Entrepreneur First" OR "OpenAI Converge" combined with "founder" OR "co-founder" OR "CEO"',
  ],
  "Industry recognition": [
    '"MIT Technology Review" OR "TR35" OR "Innovators Under 35" OR "ACM Fellow" OR "IEEE Fellow" combined with technical role titles',
  ],
};

// ---------------------------------------------------------------------------
// Outreach Routing
// ---------------------------------------------------------------------------

export interface OutreachRoute {
  eeaRange: string;
  warmthTier: WarmthTier | "any";
  combinedRange: string;
  owner: string;
  approach: string;
}

export const OUTREACH_ROUTING: OutreachRoute[] = [
  { eeaRange: "70-80", warmthTier: "W1", combinedRange: "90-100", owner: "Andrew directly", approach: "Personal note referencing shared history. Short. No pitch." },
  { eeaRange: "60-80", warmthTier: "W2", combinedRange: "72-92", owner: "Andrew directly", approach: "Warm reference to The Batch or DL.AI connection. One paragraph." },
  { eeaRange: "50-70", warmthTier: "W3", combinedRange: "56-76", owner: "Mike, Andrew's name in opening", approach: "\"Andrew asked me to reach out...\" opener." },
  { eeaRange: "40-60", warmthTier: "W4", combinedRange: "43-63", owner: "Mike, standard pipeline", approach: "AI Fund brand-forward. Andrew not directly invoked." },
  { eeaRange: "<40", warmthTier: "any", combinedRange: "<60", owner: "Nurture / later batch", approach: "Add to long-term pipeline. Do not contact now." },
];

// ---------------------------------------------------------------------------
// Citation Thresholds
// ---------------------------------------------------------------------------

export const CITATION_THRESHOLDS = [
  { level: "Strong signal", criteria: "h-index >= 10 with 1,000+ total Google Scholar citations" },
  { level: "Very strong", criteria: "h-index >= 15 with 2,000+ citations" },
  { level: "Exceptional", criteria: "h-index >= 25 or any single paper with 1,000+ citations" },
  { level: "Automatic top 0.1%", criteria: "Author on foundational GenAI paper (Attention, BERT, LoRA, CoT, RAG)" },
];

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

export function getAllSignals(): EEASignal[] {
  return [...TIER_1_SIGNALS, ...TIER_2_SIGNALS];
}

export function getSignalsByCategory(category: SignalCategory): EEASignal[] {
  return getAllSignals().filter(s => s.category === category);
}

export function getMaxEEAScore(): number {
  return 80;
}

export function getMaxWarmthScore(): number {
  return 20;
}

export function getMaxCombinedScore(): number {
  return 100;
}

export function computeEEAScore(signalIds: string[]): number {
  const all = getAllSignals();
  const matched = all.filter(s => signalIds.includes(s.id));
  const total = matched.reduce((sum, s) => sum + s.points, 0);
  return Math.min(total, getMaxEEAScore());
}

export function computeWarmthScore(tier: WarmthTier | null): number {
  if (!tier) return 0;
  const def = WARMTH_TIERS.find(t => t.tier === tier);
  return def?.points ?? 0;
}

export function computeCombinedScore(eeaScore: number, warmthTier: WarmthTier | null): number {
  return Math.min(eeaScore + computeWarmthScore(warmthTier), getMaxCombinedScore());
}

export function getOutreachRoute(eeaScore: number, warmthTier: WarmthTier | null): OutreachRoute {
  const combined = computeCombinedScore(eeaScore, warmthTier);
  if (combined >= 90 && warmthTier === "W1") return OUTREACH_ROUTING[0];
  if (combined >= 72 && warmthTier === "W2") return OUTREACH_ROUTING[1];
  if (combined >= 56 && warmthTier === "W3") return OUTREACH_ROUTING[2];
  if (combined >= 43) return OUTREACH_ROUTING[3];
  return OUTREACH_ROUTING[4];
}
