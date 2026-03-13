/**
 * Founder Finder Pipeline Types
 *
 * Types for the EEA scoring engine, Exa Websets sourcing,
 * and Parallel Task Groups enrichment pipeline.
 */

// ---------------------------------------------------------------------------
// EEA Scoring
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
// Candidate Result (from Exa + scoring)
// ---------------------------------------------------------------------------

export type B2BFocus = "B2B" | "B2C" | "Both" | "Unclear";
export type TechnicalDepth = "Deep technical" | "Technical PM" | "Non-technical" | "Unclear";

export interface CandidateResult {
  name: string;
  title: string;
  company: string;
  linkedinUrl: string | null;
  githubUrl: string | null;
  location: string;
  isFounder: boolean;
  b2bFocus: B2BFocus;
  technicalDepth: TechnicalDepth;
  eeaSignals: string;
  eeaScore: EEAScore;
  profileUrl: string;
  snippet: string;
}

export interface FounderFinderResult {
  websetId: string;
  totalFound: number;
  candidates: CandidateResult[];
}

// ---------------------------------------------------------------------------
// Parallel Enrichment
// ---------------------------------------------------------------------------

export interface ParallelEnrichmentResult {
  name: string;
  linkedin_url: string | null;
  github_url: string | null;
  publications: string[];
  patents: string[];
  competitive_programming: string[];
  fellowships: string[];
  open_source: string[];
  accelerator: string[];
  prior_exits: string[];
  conference_talks: string[];
  media_recognition: string[];
  bay_area_confirmed: boolean;
  b2b_signals: string[];
  zero_to_one_evidence: string[];
  eea_tier: 1 | 2 | 3 | null;
  eea_summary: string;
  outreach_hook: string;
}

// ---------------------------------------------------------------------------
// Edge Function Request / Response Shapes
// ---------------------------------------------------------------------------

export interface FounderSourceRequest {
  action?: "start" | "status";
  count?: number;
  appendQueries?: boolean;
  websetId?: string;
}

export interface FounderSourceResponse {
  status: "running" | "completed" | "error";
  websetId: string;
  totalFound?: number;
  deduplicatedCount?: number;
  candidates?: CandidateResult[];
  error?: string;
}

export interface FounderEnrichRequest {
  action: "create" | "status";
  candidates?: Array<{
    name: string;
    company: string;
    title: string;
    profileUrl: string;
    linkedinUrl: string | null;
    existingSignals: string;
  }>;
  taskGroupId?: string;
}

export interface FounderEnrichResponse {
  taskGroupId: string;
  status: "running" | "completed" | "error";
  results?: ParallelEnrichmentResult[];
  error?: string;
}

// ---------------------------------------------------------------------------
// Pipeline State (client-side)
// ---------------------------------------------------------------------------

export type FounderPipelineStep =
  | "idle"
  | "sourcing"
  | "scoring"
  | "enriching"
  | "merging"
  | "complete"
  | "error";

export interface FounderPipelineState {
  step: FounderPipelineStep;
  candidates: CandidateResult[];
  taskGroupId: string | null;
  error: string | null;
}
