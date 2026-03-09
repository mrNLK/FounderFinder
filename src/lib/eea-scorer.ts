/**
 * EEA (Evidence of Exceptional Ability) Scoring Engine
 *
 * Scores founder candidates based on verifiable signals of exceptional
 * technical ability relevant to AI/ML. Completely separate from the
 * weighted composite scorer in aifund-scoring.ts.
 */

import type { EEAScore } from "@/types/founder-finder";

// ---------------------------------------------------------------------------
// Tier 1 Signals — any single one = score 85+, tier 1, immediate outreach
// ---------------------------------------------------------------------------

interface Tier1Signal {
  label: string;
  matchers: ((joined: string) => boolean)[];
}

const TIER_1_SIGNALS: Tier1Signal[] = [
  {
    label: "International Olympiad in Informatics",
    matchers: [
      (s) => s.includes("ioi") && !s.includes("ioi silver") && !s.includes("ioi bronze"),
      (s) => s.includes("international olympiad in informatics"),
    ],
  },
  {
    label: "International Mathematical Olympiad",
    matchers: [
      (s) => /\bimo\b/.test(s),
      (s) => s.includes("international mathematical olympiad"),
    ],
  },
  {
    label: "ICPC World Finals",
    matchers: [
      (s) => s.includes("icpc world finals"),
      (s) => s.includes("acm icpc world"),
      (s) => s.includes("icpc world champion"),
    ],
  },
  {
    label: "Kaggle Grandmaster",
    matchers: [
      (s) => s.includes("kaggle competition grandmaster"),
      (s) => s.includes("kaggle grandmaster"),
    ],
  },
  {
    label: "NeurIPS Oral/Best Paper",
    matchers: [
      (s) => s.includes("neurips") && (s.includes("oral") || s.includes("best paper") || s.includes("outstanding paper")),
    ],
  },
  {
    label: "ICML Oral/Best Paper",
    matchers: [
      (s) => s.includes("icml") && (s.includes("oral") || s.includes("best paper")),
    ],
  },
  {
    label: "ICLR Oral/Best Paper",
    matchers: [
      (s) => s.includes("iclr") && (s.includes("oral") || s.includes("best paper")),
    ],
  },
  {
    label: "Prestigious Fellowship",
    matchers: [
      (s) => s.includes("hertz fellow"),
      (s) => s.includes("knight-hennessy scholar"),
      (s) => s.includes("gates cambridge scholar"),
    ],
  },
  {
    label: "Thiel Fellow",
    matchers: [(s) => s.includes("thiel fellow")],
  },
  {
    label: "Top PhD Fellowship",
    matchers: [
      (s) => s.includes("google phd fellow"),
      (s) => s.includes("microsoft research phd fellow"),
      (s) => s.includes("apple scholar in ai"),
    ],
  },
  {
    label: "AI Lab Resident",
    matchers: [
      (s) => s.includes("openai resident"),
      (s) => s.includes("google brain resident"),
      (s) => s.includes("deepmind resident"),
    ],
  },
  {
    label: "Y Combinator",
    matchers: [
      (s) => s.includes("y combinator"),
      (s) => /\byc [wsf]\d{2}\b/.test(s),
      (s) => /\byc [wsf]20\d{2}\b/.test(s),
    ],
  },
  {
    label: "a16z Speedrun",
    matchers: [(s) => s.includes("a16z speedrun")],
  },
  {
    label: "OpenAI Converge",
    matchers: [(s) => s.includes("openai converge")],
  },
  {
    label: "MIT TR35",
    matchers: [
      (s) => s.includes("mit technology review innovators under 35"),
      (s) => s.includes("mit tr35"),
    ],
  },
  {
    label: "ACM Doctoral Dissertation Award",
    matchers: [(s) => s.includes("acm doctoral dissertation award")],
  },
  {
    label: "Prior Exit (>$50M)",
    matchers: [
      (s) => {
        const hasExit = s.includes("prior exit") || s.includes("acquired for") || s.includes("acquisition");
        if (!hasExit) return false;
        // Check for >$50M indicator
        const amountMatch = s.match(/\$(\d+(?:\.\d+)?)\s*(m|million|b|billion)/i);
        if (!amountMatch) return false;
        const value = parseFloat(amountMatch[1]);
        const unit = amountMatch[2].toLowerCase();
        const millions = unit.startsWith("b") ? value * 1000 : value;
        return millions > 50;
      },
    ],
  },
  {
    label: "Major Open Source (10k+ stars)",
    matchers: [
      (s) => s.includes("10,000 stars") || s.includes("10k stars"),
      (s) => s.includes("core maintainer"),
    ],
  },
];

// ---------------------------------------------------------------------------
// Tier 2 Signals — combinations of 2+ build the case
// ---------------------------------------------------------------------------

interface Tier2Signal {
  label: string;
  matchers: ((joined: string) => boolean)[];
  /** If true, requires another Tier 2 match to count */
  requiresCombination?: boolean;
}

const TIER_2_SIGNALS: Tier2Signal[] = [
  {
    label: "Top ML Conference",
    matchers: [
      (s) => s.includes("neurips"),
      (s) => s.includes("icml"),
      (s) => s.includes("iclr"),
      (s) => s.includes("cvpr"),
    ],
  },
  {
    label: "First Author",
    matchers: [(s) => s.includes("first author")],
  },
  {
    label: "Spotlight Paper",
    matchers: [(s) => s.includes("spotlight")],
  },
  {
    label: "IOI Silver/Bronze or APIO",
    matchers: [
      (s) => s.includes("ioi silver"),
      (s) => s.includes("ioi bronze"),
      (s) => s.includes("apio"),
    ],
  },
  {
    label: "USAMO/Putnam",
    matchers: [
      (s) => s.includes("usamo"),
      (s) => s.includes("putnam"),
    ],
  },
  {
    label: "Codeforces Grandmaster",
    matchers: [
      (s) => s.includes("codeforces grandmaster"),
      (s) => s.includes("codeforces 2400"),
    ],
  },
  {
    label: "Kaggle Master",
    matchers: [
      (s) => s.includes("kaggle master") && !s.includes("kaggle grandmaster"),
      (s) => s.includes("kaggle competition master"),
    ],
  },
  {
    label: "ICPC Regional/Finalist",
    matchers: [
      (s) => s.includes("icpc regional"),
      (s) => s.includes("icpc regionals"),
      (s) => s.includes("icpc finalist"),
    ],
  },
  {
    label: "NSF GRFP",
    matchers: [
      (s) => s.includes("nsf grfp"),
      (s) => s.includes("nsf graduate research fellow"),
    ],
  },
  {
    label: "NDSEG Fellow",
    matchers: [(s) => s.includes("ndseg fellow")],
  },
  {
    label: "Rhodes/Marshall Scholar",
    matchers: [
      (s) => s.includes("rhodes scholar"),
      (s) => s.includes("marshall scholar"),
    ],
  },
  {
    label: "VC-backed",
    matchers: [
      (s) => s.includes("series a"),
      (s) => s.includes("series b"),
      (s) => s.includes("vc-backed"),
    ],
  },
  {
    label: "Hackathon Winner",
    matchers: [
      (s) => (s.includes("treehacks") || s.includes("hackmit") || s.includes("calhacks")) &&
             (s.includes("winner") || s.includes("grand prize")),
    ],
  },
  {
    label: "ETHGlobal Winner",
    matchers: [
      (s) => s.includes("ethglobal") && (s.includes("winner") || s.includes("finalist") || s.includes("prize")),
    ],
  },
  {
    label: "High h-index",
    matchers: [
      (s) => {
        const match = s.match(/h-index\s*(?:of\s*)?(\d+)/i);
        return match ? parseInt(match[1], 10) >= 10 : false;
      },
    ],
  },
  {
    label: "Highly Cited arXiv",
    matchers: [
      (s) => s.includes("arxiv") && (s.includes("1000 citations") || s.includes("highly cited")),
    ],
  },
  {
    label: "Systems Conference",
    matchers: [
      (s) => s.includes("mlsys"),
      (s) => s.includes("osdi"),
      (s) => s.includes("sosp"),
    ],
  },
  {
    label: "Google Scholar",
    matchers: [(s) => s.includes("google scholar")],
  },
  {
    label: "Elite University",
    matchers: [
      (s) => s.includes("stanford"),
      (s) => /\bmit\b/.test(s),
      (s) => s.includes("berkeley"),
      (s) => /\bcmu\b/.test(s),
    ],
    requiresCombination: true,
  },
];

// ---------------------------------------------------------------------------
// False Positive Flags
// ---------------------------------------------------------------------------

interface FalsePositiveCheck {
  flag: string;
  check: (joined: string) => boolean;
}

const FALSE_POSITIVE_CHECKS: FalsePositiveCheck[] = [
  {
    flag: "Workshop paper (not main conference)",
    check: (s) => {
      const conferences = ["neurips", "icml", "iclr"];
      for (const conf of conferences) {
        if (!s.includes(conf)) continue;
        // Check if "workshop" appears within ~5 words of the conference name
        const idx = s.indexOf(conf);
        const window = s.substring(Math.max(0, idx - 40), idx + conf.length + 40);
        if (window.includes("workshop")) return true;
      }
      return false;
    },
  },
  {
    flag: "Findings track (weaker than main conference)",
    check: (s) => s.includes("findings of acl") || s.includes("findings of emnlp"),
  },
  {
    flag: "TEDx is not TED main stage — 100x selectivity difference",
    check: (s) => s.includes("tedx"),
  },
  {
    flag: "IBM high-volume patent filer",
    check: (s) => {
      if (!s.includes("ibm") || !s.includes("patent")) return false;
      const patentCountMatch = s.match(/(\d+)\s*patents?/i);
      if (patentCountMatch && parseInt(patentCountMatch[1], 10) > 5) return true;
      return false;
    },
  },
  {
    flag: "Forbes 30 Under 30 (non-technical category)",
    check: (s) => {
      if (!s.includes("forbes 30")) return false;
      return !s.includes("enterprise tech") && !s.includes("enterprise technology") && !s.includes("science");
    },
  },
  {
    flag: "Kaggle Expert/Contributor (not elite tier)",
    check: (s) => s.includes("kaggle expert") || s.includes("kaggle contributor"),
  },
  {
    flag: "Sponsor bounty hackathon prize (low bar)",
    check: (s) => /best use of .+?(api|sdk|platform)/i.test(s),
  },
  {
    flag: "Provisional patent (never converted)",
    check: (s) => s.includes("provisional patent") || s.includes("patent pending"),
  },
];

// ---------------------------------------------------------------------------
// Scoring Logic
// ---------------------------------------------------------------------------

export function scoreCandidate(signals: string[]): EEAScore {
  const joined = signals.map((s) => s.toLowerCase()).join(" ||| ");

  // Detect false positives first (they affect Tier 1 → Tier 2 downgrades)
  const falsePositiveFlags: string[] = [];
  for (const fp of FALSE_POSITIVE_CHECKS) {
    if (fp.check(joined)) {
      falsePositiveFlags.push(fp.flag);
    }
  }

  const hasWorkshopFP = falsePositiveFlags.some((f) => f.includes("Workshop paper"));

  // Match Tier 1 signals
  const matchedTier1: string[] = [];
  for (const signal of TIER_1_SIGNALS) {
    // If workshop false positive found, downgrade NeurIPS/ICML/ICLR oral/best paper
    if (hasWorkshopFP && (signal.label.includes("NeurIPS") || signal.label.includes("ICML") || signal.label.includes("ICLR"))) {
      continue;
    }
    const isMatch = signal.matchers.some((m) => m(joined));
    if (isMatch) {
      matchedTier1.push(signal.label);
    }
  }

  // Match Tier 2 signals
  const matchedTier2: string[] = [];
  for (const signal of TIER_2_SIGNALS) {
    const isMatch = signal.matchers.some((m) => m(joined));
    if (isMatch) {
      matchedTier2.push(signal.label);
    }
  }

  // Handle elite university requiring combination
  const uniSignal = TIER_2_SIGNALS.find((s) => s.requiresCombination && s.label === "Elite University");
  if (uniSignal && matchedTier2.includes("Elite University")) {
    const nonUniTier2Count = matchedTier2.filter((s) => s !== "Elite University").length;
    if (nonUniTier2Count === 0 && matchedTier1.length === 0) {
      // Remove elite university if it's the only signal
      const idx = matchedTier2.indexOf("Elite University");
      matchedTier2.splice(idx, 1);
    }
  }

  // If workshop FP detected, move any conference signals that were T1 down to T2
  if (hasWorkshopFP) {
    // The conference was already excluded from T1 above.
    // It still counts as T2 (poster/spotlight level).
  }

  // Calculate score
  let score = 0;

  if (matchedTier1.length > 0) {
    // Tier 1: base 85 + 5 per additional match, max 100
    score = 85 + (matchedTier1.length - 1) * 5;
  } else if (matchedTier2.length > 0) {
    // Tier 2: each match = +8 points starting from 40
    score = 40 + matchedTier2.length * 8;
  }

  // False positive penalty: each = -10 points
  score -= falsePositiveFlags.length * 10;

  // Bonus: Bay Area confirmed
  const bayAreaTerms = [
    "bay area", "san francisco", "sf", "silicon valley", "palo alto",
    "mountain view", "menlo park", "redwood city", "sunnyvale",
    "santa clara", "berkeley", "oakland", "san jose", "marin", "east bay",
  ];
  const hasBayArea = bayAreaTerms.some((term) => joined.includes(term));
  if (hasBayArea) score += 5;

  // Bonus: founder / 0-to-1 evidence
  const founderTerms = ["founded", "co-founder", "cofounder", "0-to-1", "zero to one", "built from scratch"];
  const hasFounder = founderTerms.some((term) => joined.includes(term));
  if (hasFounder) score += 5;

  // Bonus: B2B + application layer
  const b2bTerms = ["b2b", "enterprise", "saas", "application layer"];
  const hasB2B = b2bTerms.some((term) => joined.includes(term));
  if (hasB2B) score += 5;

  // Cap at 100, floor at 0
  score = Math.max(0, Math.min(100, score));

  // Determine tier
  let tier: 1 | 2 | 3 | null = null;
  if (matchedTier1.length > 0) {
    tier = 1;
  } else if (matchedTier2.length >= 2) {
    tier = 2;
  } else if (matchedTier2.length === 1 || score > 0) {
    tier = 3;
  }

  // Generate summary
  let summary: string;
  if (tier === 1) {
    summary = `Immediate outreach — ${matchedTier1[0]}${matchedTier1.length > 1 ? ` and ${matchedTier1.length - 1} other Tier 1 signal(s)` : ""} confirmed.`;
  } else if (tier === 2) {
    summary = `Build the case — ${matchedTier2.length} Tier 2 signal(s) found: ${matchedTier2.slice(0, 3).join(", ")}${matchedTier2.length > 3 ? "..." : ""}.`;
  } else if (tier === 3) {
    summary = `Weak signal — limited evidence of exceptional ability. ${matchedTier2.length > 0 ? matchedTier2[0] + " noted." : "Requires further research."}`;
  } else {
    summary = "No verifiable evidence of exceptional ability found in available signals.";
  }

  if (falsePositiveFlags.length > 0) {
    summary += ` (${falsePositiveFlags.length} false positive flag${falsePositiveFlags.length > 1 ? "s" : ""} detected.)`;
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
