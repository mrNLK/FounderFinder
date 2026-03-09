import { describe, it, expect, vi } from "vitest";

// Mock the Supabase client to avoid localStorage dependency
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

import { exportCandidatesCsv, mergeEnrichmentResults } from "../founder-finder";
import type { CandidateResult, ParallelEnrichmentResult } from "@/types/founder-finder";

function makeCandidate(overrides: Partial<CandidateResult> = {}): CandidateResult {
  return {
    name: "Jane Doe",
    title: "CEO",
    company: "AICo",
    linkedinUrl: null,
    githubUrl: null,
    location: "San Francisco",
    isFounder: true,
    b2bFocus: "B2B",
    technicalDepth: "Deep technical",
    eeaSignals: "Y Combinator W24",
    eeaScore: {
      tier: 1,
      score: 85,
      matchedTier1: ["Y Combinator"],
      matchedTier2: [],
      falsePositiveFlags: [],
      summary: "Immediate outreach — Y Combinator confirmed.",
    },
    profileUrl: "https://example.com/janedoe",
    snippet: "AI founder building enterprise tools",
    ...overrides,
  };
}

describe("exportCandidatesCsv", () => {
  it("generates valid CSV with header row", () => {
    const candidates = [makeCandidate()];
    const csv = exportCandidatesCsv(candidates);

    const lines = csv.split("\n");
    expect(lines.length).toBe(2); // header + 1 data row

    const headers = lines[0].split(",");
    expect(headers).toContain("name");
    expect(headers).toContain("eea_tier");
    expect(headers).toContain("eea_score");
    expect(headers).toContain("linkedin_url");
  });

  it("escapes commas in field values", () => {
    const candidates = [
      makeCandidate({
        name: "Doe, Jane",
        company: 'Foo "Bar" Inc',
      }),
    ];
    const csv = exportCandidatesCsv(candidates);

    // Name with comma should be quoted
    expect(csv).toContain('"Doe, Jane"');
    // Company with quotes should be double-escaped
    expect(csv).toContain('"Foo ""Bar"" Inc"');
  });

  it("handles empty candidates array", () => {
    const csv = exportCandidatesCsv([]);
    const lines = csv.split("\n");
    expect(lines.length).toBe(1); // header only
  });

  it("handles null LinkedIn URL", () => {
    const candidates = [makeCandidate({ linkedinUrl: null })];
    const csv = exportCandidatesCsv(candidates);
    // Should have empty field, not "null"
    expect(csv).not.toContain("null");
  });
});

describe("mergeEnrichmentResults", () => {
  it("merges enrichment data by name match", () => {
    const candidates = [makeCandidate({ name: "Jane Doe", linkedinUrl: null })];
    const enrichments: ParallelEnrichmentResult[] = [
      {
        name: "Jane Doe",
        linkedin_url: "https://linkedin.com/in/janedoe",
        github_url: "https://github.com/janedoe",
        publications: ["Paper A at NeurIPS"],
        patents: [],
        competitive_programming: [],
        fellowships: ["NSF GRFP"],
        open_source: [],
        accelerator: ["YC W24"],
        prior_exits: [],
        conference_talks: [],
        media_recognition: [],
        bay_area_confirmed: true,
        b2b_signals: ["Enterprise SaaS"],
        zero_to_one_evidence: ["Built from scratch"],
        eea_tier: 1,
        eea_summary: "Exceptional founder",
        outreach_hook: "Your NeurIPS paper on alignment...",
      },
    ];

    const merged = mergeEnrichmentResults(candidates, enrichments);

    expect(merged[0].linkedinUrl).toBe("https://linkedin.com/in/janedoe");
    expect(merged[0].githubUrl).toBe("https://github.com/janedoe");
    expect(merged[0].eeaSignals).toContain("Paper A at NeurIPS");
    expect(merged[0].eeaSignals).toContain("NSF GRFP");
    expect(merged[0].eeaSignals).toContain("Bay Area confirmed");
  });

  it("does not overwrite existing LinkedIn URL", () => {
    const candidates = [
      makeCandidate({
        name: "Jane Doe",
        linkedinUrl: "https://linkedin.com/in/original",
      }),
    ];
    const enrichments: ParallelEnrichmentResult[] = [
      {
        name: "Jane Doe",
        linkedin_url: "https://linkedin.com/in/different",
        github_url: null,
        publications: [],
        patents: [],
        competitive_programming: [],
        fellowships: [],
        open_source: [],
        accelerator: [],
        prior_exits: [],
        conference_talks: [],
        media_recognition: [],
        bay_area_confirmed: false,
        b2b_signals: [],
        zero_to_one_evidence: [],
        eea_tier: null,
        eea_summary: "",
        outreach_hook: "",
      },
    ];

    const merged = mergeEnrichmentResults(candidates, enrichments);
    expect(merged[0].linkedinUrl).toBe("https://linkedin.com/in/original");
  });

  it("skips candidates with no enrichment match", () => {
    const candidates = [makeCandidate({ name: "Unknown Person" })];
    const enrichments: ParallelEnrichmentResult[] = [
      {
        name: "Different Person",
        linkedin_url: null,
        github_url: null,
        publications: [],
        patents: [],
        competitive_programming: [],
        fellowships: [],
        open_source: [],
        accelerator: [],
        prior_exits: [],
        conference_talks: [],
        media_recognition: [],
        bay_area_confirmed: false,
        b2b_signals: [],
        zero_to_one_evidence: [],
        eea_tier: null,
        eea_summary: "",
        outreach_hook: "",
      },
    ];

    const merged = mergeEnrichmentResults(candidates, enrichments);
    expect(merged[0].linkedinUrl).toBeNull();
    expect(merged[0].eeaSignals).toBe("Y Combinator W24"); // unchanged
  });

  it("name matching is case-insensitive", () => {
    const candidates = [makeCandidate({ name: "JANE DOE" })];
    const enrichments: ParallelEnrichmentResult[] = [
      {
        name: "jane doe",
        linkedin_url: "https://linkedin.com/in/janedoe",
        github_url: null,
        publications: [],
        patents: [],
        competitive_programming: [],
        fellowships: [],
        open_source: [],
        accelerator: [],
        prior_exits: [],
        conference_talks: [],
        media_recognition: [],
        bay_area_confirmed: false,
        b2b_signals: [],
        zero_to_one_evidence: [],
        eea_tier: null,
        eea_summary: "",
        outreach_hook: "",
      },
    ];

    const merged = mergeEnrichmentResults(candidates, enrichments);
    expect(merged[0].linkedinUrl).toBe("https://linkedin.com/in/janedoe");
  });
});
