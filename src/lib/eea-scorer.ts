/**
 * EEA Scoring Engine
 *
 * Scores candidates based on verifiable Evidence of Exceptional Ability signals.
 * Designed for AI Fund's Founder in Residence and Visiting Engineer pipelines.
 *
 * Scoring logic:
 * - Tier 1: any match = 85 + (5 per additional Tier 1 match, max 100)
 * - Tier 2: each match = +8 points starting from 40
 * - False positives: each = -10 points
 * - Bay Area confirmed: +5 bonus
 * - Founder / 0-to-1 signals: +5 bonus
 * - B2B + application layer signals: +5 bonus
 * - Cap at 100, floor at 0
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EEAScore = {
  tier: 1 | 2 | 3 | null;
  score: number;
  matchedTier1: string[];
  matchedTier2: string[];
  falsePositiveFlags: string[];
  summary: string;
};

// ---------------------------------------------------------------------------
// Signal Definitions
// ---------------------------------------------------------------------------

interface SignalPattern {
  label: string;
  patterns: string[][];  // each inner array = AND condition (all must match), outer = OR alternatives
}

const TIER_1_SIGNALS: SignalPattern[] = [
  { label: "IOI medalist", patterns: [["ioi"], ["international olympiad in informatics"]] },
  { label: "IMO medalist", patterns: [["imo"], ["international mathematical olympiad"]] },
  { label: "ICPC World Finals", patterns: [["icpc world finals"], ["acm icpc world"], ["icpc world champion"]] },
  { label: "Kaggle Grandmaster", patterns: [["kaggle competition grandmaster"], ["kaggle grandmaster"]] },
  { label: "NeurIPS oral/best paper", patterns: [["neurips", "oral"], ["neurips", "best paper"], ["neurips", "outstanding paper"]] },
  { label: "ICML oral/best paper", patterns: [["icml", "oral"], ["icml", "best paper"]] },
  { label: "ICLR oral/best paper", patterns: [["iclr", "oral"], ["iclr", "best paper"]] },
  { label: "Hertz Fellow", patterns: [["hertz fellow"]] },
  { label: "Knight-Hennessy Scholar", patterns: [["knight-hennessy scholar"], ["knight hennessy"]] },
  { label: "Gates Cambridge Scholar", patterns: [["gates cambridge scholar"], ["gates cambridge"]] },
  { label: "Thiel Fellow", patterns: [["thiel fellow"]] },
  { label: "Google PhD Fellow", patterns: [["google phd fellow"]] },
  { label: "Microsoft Research PhD Fellow", patterns: [["microsoft research phd fellow"]] },
  { label: "Apple Scholar in AI", patterns: [["apple scholar in ai"], ["apple scholar"]] },
  { label: "OpenAI Resident", patterns: [["openai resident"]] },
  { label: "Google Brain Resident", patterns: [["google brain resident"], ["google ai resident"]] },
  { label: "DeepMind Resident", patterns: [["deepmind resident"]] },
  { label: "Y Combinator", patterns: [["y combinator"], ["yc w"], ["yc s"], ["yc f"]] },
  { label: "a16z Speedrun", patterns: [["a16z speedrun"]] },
  { label: "OpenAI Converge", patterns: [["openai converge"]] },
  { label: "MIT TR35", patterns: [["mit technology review innovators under 35"], ["mit tr35"]] },
  { label: "ACM Doctoral Dissertation Award", patterns: [["acm doctoral dissertation award"]] },
  { label: "Prior exit >$50M", patterns: [["prior exit"], ["acquired for"], ["acquisition"]] },
  { label: "Major open source (10K+ stars)", patterns: [["10,000 stars"], ["10k stars"], ["core maintainer"]] },
];

const TIER_2_SIGNALS: SignalPattern[] = [
  { label: "NeurIPS paper", patterns: [["neurips"]] },
  { label: "ICML paper", patterns: [["icml"]] },
  { label: "ICLR paper", patterns: [["iclr"]] },
  { label: "CVPR paper", patterns: [["cvpr"]] },
  { label: "First author", patterns: [["first author"]] },
  { label: "Spotlight", patterns: [["spotlight"]] },
  { label: "IOI Silver/Bronze", patterns: [["ioi silver"], ["ioi bronze"], ["apio"]] },
  { label: "USAMO", patterns: [["usamo"]] },
  { label: "Putnam", patterns: [["putnam"]] },
  { label: "Codeforces Grandmaster", patterns: [["codeforces grandmaster"], ["codeforces 2400"]] },
  { label: "Kaggle Master", patterns: [["kaggle master"], ["kaggle competition master"]] },
  { label: "ICPC Regional/Finalist", patterns: [["icpc regional"], ["icpc regionals"], ["icpc finalist"]] },
  { label: "NSF GRFP", patterns: [["nsf grfp"], ["nsf graduate research fellow"]] },
  { label: "NDSEG Fellow", patterns: [["ndseg fellow"]] },
  { label: "Rhodes Scholar", patterns: [["rhodes scholar"]] },
  { label: "Marshall Scholar", patterns: [["marshall scholar"]] },
  { label: "VC-backed (Series A/B)", patterns: [["series a"], ["series b"], ["vc-backed"]] },
  { label: "TreeHacks winner", patterns: [["treehacks"]] },
  { label: "HackMIT winner", patterns: [["hackmit"]] },
  { label: "CalHacks winner", patterns: [["calhacks"]] },
  { label: "ETHGlobal winner", patterns: [["ethglobal"]] },
  { label: "High h-index", patterns: [["h-index"]] },
  { label: "Highly cited arXiv", patterns: [["arxiv"]] },
  { label: "MLSys paper", patterns: [["mlsys"]] },
  { label: "OSDI paper", patterns: [["osdi"]] },
  { label: "SOSP paper", patterns: [["sosp"]] },
  { label: "Google Scholar presence", patterns: [["google scholar"]] },
  { label: "Stanford", patterns: [["stanford"]] },
  { label: "MIT", patterns: [["mit"]] },
  { label: "Berkeley", patterns: [["berkeley"]] },
  { label: "CMU", patterns: [["cmu"]] },
];

interface FalsePositivePattern {
  label: string;
  check: (joined: string) => boolean;
}

const FALSE_POSITIVE_CHECKS: FalsePositivePattern[] = [
  {
    label: "Workshop paper listed as main conference — NeurIPS/ICML/ICLR workshop papers have 30-60% acceptance, not ~25%",
    check: (text) => {
      const confNames = ["neurips", "icml", "iclr"];
      for (const conf of confNames) {
        const confIdx = text.indexOf(conf);
        if (confIdx === -1) continue;
        const nearby = text.substring(Math.max(0, confIdx - 30), confIdx + conf.length + 30);
        if (nearby.includes("workshop")) return true;
      }
      return false;
    },
  },
  {
    label: "Findings of ACL/EMNLP — weaker tier than main conference proceedings",
    check: (text) => text.includes("findings of acl") || text.includes("findings of emnlp"),
  },
  {
    label: "TEDx is not TED main stage — 100x selectivity difference",
    check: (text) => text.includes("tedx"),
  },
  {
    label: "IBM patent volume filer — bonuses incentivize quantity over quality",
    check: (text) => {
      if (!text.includes("ibm") || !text.includes("patent")) return false;
      const patentMatches = text.match(/patent/gi);
      return (patentMatches?.length ?? 0) > 5;
    },
  },
  {
    label: "Forbes 30 Under 30 without Enterprise Tech or Science category — PR-driven, not technically credible",
    check: (text) => {
      if (!text.includes("forbes 30") && !text.includes("forbes thirty") && !text.includes("30 under 30")) return false;
      return !text.includes("enterprise tech") && !text.includes("enterprise technology") && !text.includes("science");
    },
  },
  {
    label: "Kaggle Expert/Contributor — not elite tier, top 10% at most",
    check: (text) => text.includes("kaggle expert") || text.includes("kaggle contributor"),
  },
  {
    label: "Hackathon sponsor bounty prize — 'Best Use of [API]' has very low bar",
    check: (text) => /best use of\s+\w+/i.test(text),
  },
  {
    label: "Provisional patent / patent pending — never survived examination",
    check: (text) => text.includes("provisional patent") || text.includes("patent pending"),
  },
];

// ---------------------------------------------------------------------------
// Matching Logic
// ---------------------------------------------------------------------------

function matchesPattern(joined: string, pattern: string[]): boolean {
  return pattern.every(term => joined.includes(term));
}

function findMatchedSignals(joined: string, signals: SignalPattern[]): string[] {
  const matched: string[] = [];
  for (const signal of signals) {
    for (const pattern of signal.patterns) {
      if (matchesPattern(joined, pattern)) {
        if (!matched.includes(signal.label)) {
          matched.push(signal.label);
        }
        break;
      }
    }
  }
  return matched;
}

// ---------------------------------------------------------------------------
// Hackathon winner proximity check
// ---------------------------------------------------------------------------

function checkHackathonWinnerProximity(joined: string, hackathon: string): boolean {
  const idx = joined.indexOf(hackathon);
  if (idx === -1) return true; // if found via pattern match, default to counting it
  const nearby = joined.substring(Math.max(0, idx - 50), idx + hackathon.length + 50);
  return nearby.includes("winner") || nearby.includes("grand prize") || nearby.includes("first place") || nearby.includes("1st place");
}

// ---------------------------------------------------------------------------
// University signal deduplication (only counts if combined with another Tier 2)
// ---------------------------------------------------------------------------

const UNIVERSITY_LABELS = ["Stanford", "MIT", "Berkeley", "CMU"];

// ---------------------------------------------------------------------------
// Main Scoring Function
// ---------------------------------------------------------------------------

export function scoreCandidate(signals: string[]): EEAScore {
  const joined = signals.join(" ").toLowerCase();

  // Find Tier 1 matches
  let matchedTier1 = findMatchedSignals(joined, TIER_1_SIGNALS);

  // Find Tier 2 matches
  let matchedTier2 = findMatchedSignals(joined, TIER_2_SIGNALS);

  // False positive check: workshop papers should demote Tier 1 conference signals
  const falsePositiveFlags: string[] = [];
  for (const fp of FALSE_POSITIVE_CHECKS) {
    if (fp.check(joined)) {
      falsePositiveFlags.push(fp.label);
    }
  }

  // If workshop false positive is flagged, demote any conference Tier 1 match
  if (falsePositiveFlags.some(f => f.includes("Workshop paper"))) {
    const confTier1Labels = ["NeurIPS oral/best paper", "ICML oral/best paper", "ICLR oral/best paper"];
    const demoted = matchedTier1.filter(l => confTier1Labels.includes(l));
    if (demoted.length > 0) {
      matchedTier1 = matchedTier1.filter(l => !confTier1Labels.includes(l));
      // Don't re-add to Tier 2 since the conference name is already there
    }
  }

  // Hackathon signals: only count if "winner" or "grand prize" is nearby
  const hackathonLabels = ["TreeHacks winner", "HackMIT winner", "CalHacks winner"];
  const hackathonTerms = ["treehacks", "hackmit", "calhacks"];
  matchedTier2 = matchedTier2.filter((label, idx) => {
    const hackIdx = hackathonLabels.indexOf(label);
    if (hackIdx === -1) return true;
    return checkHackathonWinnerProximity(joined, hackathonTerms[hackIdx]);
  });

  // ETHGlobal: only count if winner/finalist/prize nearby
  if (matchedTier2.includes("ETHGlobal winner")) {
    const ethIdx = joined.indexOf("ethglobal");
    if (ethIdx !== -1) {
      const nearby = joined.substring(Math.max(0, ethIdx - 50), ethIdx + 60);
      if (!nearby.includes("winner") && !nearby.includes("finalist") && !nearby.includes("prize")) {
        matchedTier2 = matchedTier2.filter(l => l !== "ETHGlobal winner");
      }
    }
  }

  // University signals: only count if combined with another non-university Tier 2
  const nonUniTier2 = matchedTier2.filter(l => !UNIVERSITY_LABELS.includes(l));
  if (nonUniTier2.length === 0) {
    matchedTier2 = matchedTier2.filter(l => !UNIVERSITY_LABELS.includes(l));
  }

  // Prior exit: only count for Tier 1 if >$50M is indicated
  if (matchedTier1.includes("Prior exit >$50M")) {
    if (!joined.includes("50m") && !joined.includes("$50") && !joined.includes("50 million") &&
        !joined.includes("100m") && !joined.includes("$100") && !joined.includes("billion")) {
      matchedTier1 = matchedTier1.filter(l => l !== "Prior exit >$50M");
      // Demote to Tier 2 as general exit signal
      if (!matchedTier2.includes("VC-backed (Series A/B)")) {
        matchedTier2.push("VC-backed (Series A/B)");
      }
    }
  }

  // Remove Tier 2 duplicates of Tier 1 signals (e.g., NeurIPS oral already matched in Tier 1)
  // Conference-level Tier 2 matches should not double-count if the specific Tier 1 matched
  const tier1ConferenceMap: Record<string, string[]> = {
    "NeurIPS oral/best paper": ["NeurIPS paper"],
    "ICML oral/best paper": ["ICML paper"],
    "ICLR oral/best paper": ["ICLR paper"],
    "IOI medalist": ["IOI Silver/Bronze"],
    "Kaggle Grandmaster": ["Kaggle Master"],
    "Y Combinator": ["VC-backed (Series A/B)"],
  };
  for (const [t1, t2s] of Object.entries(tier1ConferenceMap)) {
    if (matchedTier1.includes(t1)) {
      matchedTier2 = matchedTier2.filter(l => !t2s.includes(l));
    }
  }

  // ---------------------------------------------------------------------------
  // Compute Score
  // ---------------------------------------------------------------------------

  let score: number;
  let tier: 1 | 2 | 3 | null;

  if (matchedTier1.length > 0) {
    score = 85 + (matchedTier1.length - 1) * 5;
    tier = 1;
  } else if (matchedTier2.length > 0) {
    score = 40 + matchedTier2.length * 8;
    tier = matchedTier2.length >= 2 ? 2 : 3;
  } else {
    score = 0;
    tier = null;
  }

  // False positive penalty
  score -= falsePositiveFlags.length * 10;

  // Bonus: Bay Area confirmed
  if (joined.includes("bay area") || joined.includes("san francisco") || joined.includes("mountain view") ||
      joined.includes("palo alto") || joined.includes("menlo park") || joined.includes("sunnyvale") ||
      joined.includes("santa clara") || joined.includes("silicon valley") || joined.includes("berkeley, ca") ||
      joined.includes("redwood city") || joined.includes("san jose")) {
    score += 5;
  }

  // Bonus: Founder / 0-to-1 signals
  if (joined.includes("founded") || joined.includes("co-founder") || joined.includes("cofounder") ||
      joined.includes("0-to-1") || joined.includes("zero to one") || joined.includes("built from scratch")) {
    score += 5;
  }

  // Bonus: B2B + application layer
  if ((joined.includes("b2b") || joined.includes("enterprise") || joined.includes("saas")) &&
      (joined.includes("application") || joined.includes("product") || joined.includes("platform"))) {
    score += 5;
  }

  // Clamp
  score = Math.max(0, Math.min(100, score));

  // Adjust tier based on final score
  if (score >= 85) tier = 1;
  else if (score >= 60) tier = tier === 1 ? 1 : 2;
  else if (score >= 40) tier = tier ?? 3;
  else if (score > 0) tier = 3;
  else tier = null;

  // Generate summary
  let summary: string;
  if (tier === 1) {
    summary = `Top 5% candidate with ${matchedTier1.length} Tier 1 signal(s): ${matchedTier1.slice(0, 3).join(", ")}${matchedTier1.length > 3 ? ` and ${matchedTier1.length - 3} more` : ""}. Immediate outreach recommended.`;
  } else if (tier === 2) {
    summary = `Strong candidate with ${matchedTier2.length} Tier 2 signal(s): ${matchedTier2.slice(0, 3).join(", ")}${matchedTier2.length > 3 ? ` and ${matchedTier2.length - 3} more` : ""}. Build the case with additional verification.`;
  } else if (tier === 3) {
    const allSignals = [...matchedTier1, ...matchedTier2];
    summary = allSignals.length > 0
      ? `Weak signal — ${allSignals.length} indicator(s) found but insufficient for immediate outreach.`
      : "No verifiable EEA signals detected.";
  } else {
    summary = "No verifiable EEA signals detected in available data.";
  }

  if (falsePositiveFlags.length > 0) {
    summary += ` Note: ${falsePositiveFlags.length} false positive flag(s) detected.`;
  }

  return {
    tier,
    score,
    matchedTier1,
    matchedTier2,
    falsePositiveFlags,
    summary,
  };
}
