import { describe, it, expect } from "vitest";
import { scoreCandidate } from "../eea-scorer";

describe("scoreCandidate", () => {
  // -------------------------------------------------------------------------
  // Tier 1: Single signal should produce tier 1, score >= 85
  // -------------------------------------------------------------------------

  describe("Tier 1 signals", () => {
    it("detects Y Combinator", () => {
      const result = scoreCandidate(["Y Combinator W24 founder"]);
      expect(result.tier).toBe(1);
      expect(result.score).toBeGreaterThanOrEqual(85);
      expect(result.matchedTier1).toContain("Y Combinator");
    });

    it("detects YC batch shorthand (YC W24)", () => {
      const result = scoreCandidate(["Backed by yc w24"]);
      expect(result.tier).toBe(1);
      expect(result.matchedTier1).toContain("Y Combinator");
    });

    it("detects Thiel Fellowship", () => {
      const result = scoreCandidate(["2022 Thiel Fellow"]);
      expect(result.tier).toBe(1);
      expect(result.matchedTier1).toContain("Thiel Fellow");
    });

    it("detects IOI (gold/medal, not silver/bronze)", () => {
      const result = scoreCandidate(["Gold medal at the International Olympiad in Informatics"]);
      expect(result.tier).toBe(1);
      expect(result.matchedTier1).toContain("International Olympiad in Informatics");
    });

    it("does NOT count IOI silver as Tier 1", () => {
      const result = scoreCandidate(["IOI Silver medal 2019"]);
      expect(result.matchedTier1).not.toContain("International Olympiad in Informatics");
      // Should be Tier 2 instead
      expect(result.matchedTier2).toContain("IOI Silver/Bronze or APIO");
    });

    it("detects NeurIPS oral", () => {
      const result = scoreCandidate(["NeurIPS 2023 oral presentation"]);
      expect(result.tier).toBe(1);
      expect(result.matchedTier1).toContain("NeurIPS Oral/Best Paper");
    });

    it("detects Kaggle Grandmaster", () => {
      const result = scoreCandidate(["Kaggle Grandmaster, 4 gold medals"]);
      expect(result.tier).toBe(1);
      expect(result.matchedTier1).toContain("Kaggle Grandmaster");
    });

    it("detects ICPC World Finals", () => {
      const result = scoreCandidate(["Competed at ICPC World Finals 2022"]);
      expect(result.tier).toBe(1);
      expect(result.matchedTier1).toContain("ICPC World Finals");
    });

    it("detects a16z Speedrun", () => {
      const result = scoreCandidate(["Selected for a16z Speedrun program"]);
      expect(result.tier).toBe(1);
      expect(result.matchedTier1).toContain("a16z Speedrun");
    });

    it("detects MIT TR35", () => {
      const result = scoreCandidate(["Named to MIT TR35 list"]);
      expect(result.tier).toBe(1);
      expect(result.matchedTier1).toContain("MIT TR35");
    });

    it("detects Elite AI Lab Engineer (ex-OpenAI)", () => {
      const result = scoreCandidate(["Former OpenAI engineer, built GPT-4 fine-tuning"]);
      expect(result.tier).toBe(1);
      expect(result.matchedTier1).toContain("Elite AI Lab Engineer");
    });

    it("detects Elite AI Lab Engineer (ex-Anthropic)", () => {
      const result = scoreCandidate(["ex-Anthropic researcher working on constitutional AI"]);
      expect(result.tier).toBe(1);
      expect(result.matchedTier1).toContain("Elite AI Lab Engineer");
    });

    it("detects Elite AI Lab Engineer (DeepMind)", () => {
      const result = scoreCandidate(["DeepMind engineer on AlphaFold team"]);
      expect(result.tier).toBe(1);
      expect(result.matchedTier1).toContain("Elite AI Lab Engineer");
    });

    it("detects Elite AI Lab Engineer (Meta FAIR)", () => {
      const result = scoreCandidate(["Research scientist at Meta FAIR"]);
      expect(result.tier).toBe(1);
      expect(result.matchedTier1).toContain("Elite AI Lab Engineer");
    });

    it("detects major open source project", () => {
      const result = scoreCandidate(["Creator of a framework with 10k stars on GitHub"]);
      expect(result.tier).toBe(1);
      expect(result.matchedTier1).toContain("Major Open Source (10k+ stars)");
    });

    it("detects prior exit >$50M", () => {
      const result = scoreCandidate(["Prior exit: company acquired for $200M by Google"]);
      expect(result.tier).toBe(1);
      expect(result.matchedTier1).toContain("Prior Exit (>$50M)");
    });

    it("does NOT flag exit <=$50M as Tier 1", () => {
      const result = scoreCandidate(["Company acquired for $10M"]);
      expect(result.matchedTier1).not.toContain("Prior Exit (>$50M)");
    });

    it("scores multiple Tier 1 signals higher", () => {
      const result = scoreCandidate([
        "Y Combinator W23 founder",
        "NeurIPS 2023 oral presentation on LLM alignment",
      ]);
      expect(result.tier).toBe(1);
      expect(result.score).toBe(90); // 85 + 5
      expect(result.matchedTier1.length).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // Tier 2: Need 2+ signals for tier 2
  // -------------------------------------------------------------------------

  describe("Tier 2 signals", () => {
    it("single Tier 2 signal = tier 3", () => {
      const result = scoreCandidate(["Published at NeurIPS 2023 poster session"]);
      expect(result.tier).toBe(3);
      expect(result.matchedTier2).toContain("Top ML Conference");
    });

    it("two Tier 2 signals = tier 2", () => {
      const result = scoreCandidate([
        "Published at NeurIPS 2023",
        "NSF GRFP fellow",
      ]);
      expect(result.tier).toBe(2);
      expect(result.matchedTier2).toContain("Top ML Conference");
      expect(result.matchedTier2).toContain("NSF GRFP");
    });

    it("detects Codeforces Grandmaster", () => {
      const result = scoreCandidate(["Codeforces Grandmaster rated 2500+"]);
      expect(result.matchedTier2).toContain("Codeforces Grandmaster");
    });

    it("detects Kaggle Master (not Grandmaster)", () => {
      const result = scoreCandidate(["Kaggle Competition Master"]);
      expect(result.matchedTier2).toContain("Kaggle Master");
    });

    it("detects VC-backed (Series A)", () => {
      const result = scoreCandidate(["Raised Series A from Sequoia"]);
      expect(result.matchedTier2).toContain("VC-backed");
    });

    it("detects USAMO", () => {
      const result = scoreCandidate(["USAMO qualifier 2018"]);
      expect(result.matchedTier2).toContain("USAMO/Putnam");
    });

    it("detects high h-index", () => {
      const result = scoreCandidate(["h-index of 15 on Google Scholar"]);
      expect(result.matchedTier2).toContain("High h-index");
    });

    it("does NOT count low h-index", () => {
      const result = scoreCandidate(["h-index of 3"]);
      expect(result.matchedTier2).not.toContain("High h-index");
    });

    it("detects Multiple Exits", () => {
      const result = scoreCandidate(["Serial entrepreneur with 3 exits"]);
      expect(result.matchedTier2).toContain("Multiple Exits");
    });

    it("does NOT count single exit as Multiple Exits", () => {
      const result = scoreCandidate(["Had 1 exit last year"]);
      expect(result.matchedTier2).not.toContain("Multiple Exits");
    });

    it("detects Ex-FAANG Senior+ with another Tier 2 signal", () => {
      const result = scoreCandidate([
        "Former Staff Engineer at Google",
        "Published at NeurIPS 2024",
      ]);
      expect(result.matchedTier2).toContain("Ex-FAANG Senior+");
    });

    it("Ex-FAANG Senior+ requires combination (alone doesn't count)", () => {
      const result = scoreCandidate(["Staff Engineer at Meta, no other signals"]);
      expect(result.matchedTier2).not.toContain("Ex-FAANG Senior+");
      expect(result.tier).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Elite University requiresCombination
  // -------------------------------------------------------------------------

  describe("Elite University combination requirement", () => {
    it("Elite University alone does NOT count", () => {
      const result = scoreCandidate(["Stanford CS PhD student"]);
      expect(result.matchedTier2).not.toContain("Elite University");
      expect(result.tier).toBeNull();
    });

    it("Elite University WITH another signal counts", () => {
      const result = scoreCandidate([
        "Stanford CS PhD student",
        "Published at NeurIPS 2023",
      ]);
      expect(result.matchedTier2).toContain("Elite University");
      expect(result.matchedTier2).toContain("Top ML Conference");
      expect(result.tier).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // False Positive Detection
  // -------------------------------------------------------------------------

  describe("False positive flags", () => {
    it("flags workshop papers near conference names", () => {
      const result = scoreCandidate(["NeurIPS 2023 workshop on LLM safety"]);
      expect(result.falsePositiveFlags).toContain("Workshop paper (not main conference)");
    });

    it("flags TEDx", () => {
      const result = scoreCandidate(["TEDx speaker on AI and creativity"]);
      expect(result.falsePositiveFlags).toContain(
        "TEDx is not TED main stage — 100x selectivity difference"
      );
    });

    it("flags Kaggle Expert (not elite tier)", () => {
      const result = scoreCandidate(["Kaggle Expert tier"]);
      expect(result.falsePositiveFlags).toContain("Kaggle Expert/Contributor (not elite tier)");
    });

    it("flags provisional patents", () => {
      const result = scoreCandidate(["Filed a provisional patent for AI scheduling"]);
      expect(result.falsePositiveFlags).toContain("Provisional patent (never converted)");
    });

    it("flags Forbes 30 Under 30 in non-technical categories", () => {
      const result = scoreCandidate(["Forbes 30 Under 30 in Social Impact"]);
      expect(result.falsePositiveFlags).toContain("Forbes 30 Under 30 (non-technical category)");
    });

    it("does NOT flag Forbes 30 Under 30 Enterprise Tech", () => {
      const result = scoreCandidate(["Forbes 30 Under 30 Enterprise Technology"]);
      expect(result.falsePositiveFlags).not.toContain("Forbes 30 Under 30 (non-technical category)");
    });

    it("workshop FP downgrades NeurIPS oral when workshop is near conference name", () => {
      // Workshop must appear within 40 chars of "neurips" in the joined string
      const result = scoreCandidate([
        "NeurIPS workshop paper, also had NeurIPS oral presentation",
      ]);
      expect(result.matchedTier1).not.toContain("NeurIPS Oral/Best Paper");
      expect(result.falsePositiveFlags).toContain("Workshop paper (not main conference)");
    });

    it("false positive penalty reduces score", () => {
      const resultClean = scoreCandidate(["Y Combinator W24"]);
      const resultWithFP = scoreCandidate([
        "Y Combinator W24",
        "TEDx speaker",
        "Kaggle Expert",
      ]);

      // Both are Tier 1 via YC, but FP reduces score
      expect(resultClean.tier).toBe(1);
      expect(resultWithFP.tier).toBe(1);
      expect(resultWithFP.score).toBeLessThan(resultClean.score);
      expect(resultWithFP.falsePositiveFlags.length).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // Bonus Points
  // -------------------------------------------------------------------------

  describe("Bonus points", () => {
    it("+5 for Bay Area", () => {
      const withoutBA = scoreCandidate(["Y Combinator W24"]);
      const withBA = scoreCandidate(["Y Combinator W24", "Based in San Francisco"]);
      expect(withBA.score).toBe(withoutBA.score + 5);
    });

    it("+5 for founder evidence", () => {
      const without = scoreCandidate(["Published at NeurIPS", "NSF GRFP"]);
      const withFounder = scoreCandidate(["Published at NeurIPS", "NSF GRFP", "Co-founder of AI startup"]);
      expect(withFounder.score).toBe(without.score + 5);
    });

    it("+5 for B2B focus", () => {
      const without = scoreCandidate(["Published at NeurIPS", "NSF GRFP"]);
      const withB2B = scoreCandidate(["Published at NeurIPS", "NSF GRFP", "B2B SaaS company"]);
      expect(withB2B.score).toBe(without.score + 5);
    });

    it("all bonuses stack", () => {
      // Use signals that don't accidentally trigger any bonuses
      const base = scoreCandidate(["ICPC Regional finalist", "Putnam honorable mention"]);
      const withBayArea = scoreCandidate(["ICPC Regional finalist", "Putnam honorable mention", "San Francisco"]);
      const withFounder = scoreCandidate(["ICPC Regional finalist", "Putnam honorable mention", "Co-founder of startup"]);
      const withB2B = scoreCandidate(["ICPC Regional finalist", "Putnam honorable mention", "B2B platform"]);
      const withAll = scoreCandidate([
        "ICPC Regional finalist",
        "Putnam honorable mention",
        "Located in San Francisco",
        "Co-founder of startup",
        "B2B platform",
      ]);
      expect(withBayArea.score).toBe(base.score + 5);
      expect(withFounder.score).toBe(base.score + 5);
      expect(withB2B.score).toBe(base.score + 5);
      expect(withAll.score).toBe(base.score + 15);
    });
  });

  // -------------------------------------------------------------------------
  // Score capping
  // -------------------------------------------------------------------------

  describe("Score boundaries", () => {
    it("caps at 100", () => {
      const result = scoreCandidate([
        "Y Combinator W24",
        "Thiel Fellow",
        "NeurIPS oral",
        "ICPC World Finals",
        "Based in San Francisco",
        "Co-founder",
        "B2B SaaS",
      ]);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it("floors at 0", () => {
      const result = scoreCandidate([
        "TEDx speaker",
        "Kaggle Expert",
        "provisional patent",
      ]);
      expect(result.score).toBeGreaterThanOrEqual(0);
    });
  });

  // -------------------------------------------------------------------------
  // No signals = unscored
  // -------------------------------------------------------------------------

  describe("No signals", () => {
    it("returns null tier and score 0 for empty input", () => {
      const result = scoreCandidate([]);
      expect(result.tier).toBeNull();
      expect(result.score).toBe(0);
      expect(result.matchedTier1).toHaveLength(0);
      expect(result.matchedTier2).toHaveLength(0);
    });

    it("returns null tier for irrelevant text", () => {
      const result = scoreCandidate(["Random person with no special achievements"]);
      expect(result.tier).toBeNull();
      expect(result.score).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Summary generation
  // -------------------------------------------------------------------------

  describe("Summary", () => {
    it("Tier 1 summary mentions signal name", () => {
      const result = scoreCandidate(["Y Combinator W24"]);
      expect(result.summary).toContain("Immediate outreach");
      expect(result.summary).toContain("Y Combinator");
    });

    it("Tier 2 summary mentions signal count", () => {
      const result = scoreCandidate(["NeurIPS 2023", "NSF GRFP"]);
      expect(result.summary).toContain("Build the case");
      expect(result.summary).toContain("2 Tier 2 signal");
    });

    it("Tier 3 summary says weak signal", () => {
      const result = scoreCandidate(["Published at CVPR 2023"]);
      expect(result.summary).toContain("Weak signal");
    });

    it("null tier summary says no evidence", () => {
      const result = scoreCandidate(["nothing special"]);
      expect(result.summary).toContain("No verifiable evidence");
    });

    it("appends false positive count to summary", () => {
      const result = scoreCandidate(["TEDx talk on AI", "Kaggle Expert"]);
      expect(result.summary).toContain("false positive flag");
    });
  });
});
