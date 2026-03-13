/**
 * Founder Finder Client Library
 *
 * Client-side wrappers for the founder-source and founder-enrich
 * Supabase Edge Functions. Follows the same pattern as aifund-settings.ts.
 */

import { supabase } from "@/integrations/supabase/client";
import type {
  CandidateResult,
  FounderSourceResponse,
  FounderEnrichResponse,
  ParallelEnrichmentResult,
} from "@/types/founder-finder";

// ---------------------------------------------------------------------------
// Error Extraction (matches aifund-settings.ts pattern)
// ---------------------------------------------------------------------------

interface FunctionErrorPayload {
  error?: {
    message?: string;
    code?: string;
  };
}

const SOURCE_FUNCTION_SLUGS = ["founder-source", "founderfinder-source"] as const;
const ENRICH_FUNCTION_SLUGS = ["founder-enrich", "founderfinder-enrich"] as const;

async function extractFunctionErrorMessage(error: unknown): Promise<string> {
  const defaultMessage = error instanceof Error ? error.message : "Unknown error";
  const response = (error as { context?: Response } | null)?.context;

  if (!response) return defaultMessage;

  try {
    const payload = (await response.json()) as FunctionErrorPayload;
    return payload.error?.message || defaultMessage;
  } catch {
    try {
      return await response.text();
    } catch {
      return defaultMessage;
    }
  }
}

async function invokeWithFallback<T>(
  slugs: readonly string[],
  body: Record<string, unknown>,
): Promise<T> {
  let lastError: unknown = null;

  for (const slug of slugs) {
    const { data, error } = await supabase.functions.invoke(slug, { body });
    if (!error) {
      return data as T;
    }
    lastError = error;
  }

  throw new Error(await extractFunctionErrorMessage(lastError));
}

// ---------------------------------------------------------------------------
// Source (Exa Websets)
// ---------------------------------------------------------------------------

export async function startFounderSource(config?: {
  count?: number;
  appendQueries?: boolean;
}): Promise<FounderSourceResponse> {
  return invokeWithFallback<FounderSourceResponse>(
    SOURCE_FUNCTION_SLUGS,
    {
      action: "start",
      count: config?.count ?? 20,
      appendQueries: config?.appendQueries ?? true,
    },
  );
}

export async function pollFounderSource(websetId: string): Promise<FounderSourceResponse> {
  return invokeWithFallback<FounderSourceResponse>(
    SOURCE_FUNCTION_SLUGS,
    {
      action: "status",
      websetId,
    },
  );
}

// ---------------------------------------------------------------------------
// Enrich (Parallel Task Groups)
// ---------------------------------------------------------------------------

export async function startFounderEnrich(
  candidates: Array<{
    name: string;
    company: string;
    title: string;
    profileUrl: string;
    linkedinUrl: string | null;
    existingSignals: string;
  }>,
): Promise<FounderEnrichResponse> {
  return invokeWithFallback<FounderEnrichResponse>(
    ENRICH_FUNCTION_SLUGS,
    {
      action: "create",
      candidates,
    },
  );
}

export async function pollFounderEnrich(
  taskGroupId: string,
): Promise<FounderEnrichResponse> {
  return invokeWithFallback<FounderEnrichResponse>(
    ENRICH_FUNCTION_SLUGS,
    {
      action: "status",
      taskGroupId,
    },
  );
}

// ---------------------------------------------------------------------------
// Merge Enrichment into Candidates
// ---------------------------------------------------------------------------

export function mergeEnrichmentResults(
  candidates: CandidateResult[],
  enrichments: ParallelEnrichmentResult[],
): CandidateResult[] {
  if (!Array.isArray(enrichments)) return candidates;

  return candidates.map((candidate) => {
    const enrichment = enrichments.find(
      (e) =>
        e?.name &&
        e.name.toLowerCase().trim() === candidate.name.toLowerCase().trim(),
    );

    if (!enrichment) return candidate;

    // Safely coerce enrichment fields that may arrive as strings or undefined
    const toArray = (val: unknown): string[] => {
      if (Array.isArray(val)) return val.filter((v) => typeof v === "string" && v.length > 0);
      if (typeof val === "string" && val.length > 0) return [val];
      return [];
    };

    // Build expanded signals from enrichment
    const newSignals: string[] = [
      ...toArray(enrichment.publications),
      ...toArray(enrichment.competitive_programming),
      ...toArray(enrichment.fellowships),
      ...toArray(enrichment.open_source),
      ...toArray(enrichment.accelerator),
      ...toArray(enrichment.prior_exits),
      ...toArray(enrichment.conference_talks),
      ...toArray(enrichment.media_recognition),
      ...toArray(enrichment.b2b_signals),
      ...toArray(enrichment.zero_to_one_evidence),
      ...toArray(enrichment.patents),
    ];
    if (enrichment.bay_area_confirmed) {
      newSignals.push("Bay Area confirmed");
    }

    const mergedSignals = candidate.eeaSignals
      ? candidate.eeaSignals + " | " + newSignals.join(" | ")
      : newSignals.join(" | ");

    return {
      ...candidate,
      linkedinUrl: candidate.linkedinUrl || enrichment.linkedin_url,
      githubUrl: candidate.githubUrl || enrichment.github_url,
      eeaSignals: mergedSignals,
      // The eeaScore will be recomputed by the caller after merging
    };
  });
}

// ---------------------------------------------------------------------------
// CSV Export
// ---------------------------------------------------------------------------

function escapeCsv(value: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportCandidatesCsv(candidates: CandidateResult[]): string {
  const headers = [
    "name", "title", "company", "location", "linkedin_url", "github_url",
    "eea_tier", "eea_score", "tier1_signals", "tier2_signals",
    "false_positive_flags", "b2b_focus", "technical_depth",
    "eea_signals", "eea_summary", "profile_url",
  ];

  const rows = candidates.map((c) => [
    escapeCsv(c.name),
    escapeCsv(c.title),
    escapeCsv(c.company),
    escapeCsv(c.location),
    escapeCsv(c.linkedinUrl),
    escapeCsv(c.githubUrl),
    escapeCsv(c.eeaScore.tier?.toString()),
    escapeCsv(c.eeaScore.score.toString()),
    escapeCsv(c.eeaScore.matchedTier1.join("; ")),
    escapeCsv(c.eeaScore.matchedTier2.join("; ")),
    escapeCsv(c.eeaScore.falsePositiveFlags.join("; ")),
    escapeCsv(c.b2bFocus),
    escapeCsv(c.technicalDepth),
    escapeCsv(c.eeaSignals),
    escapeCsv(c.eeaScore.summary),
    escapeCsv(c.profileUrl),
  ].join(","));

  return [headers.join(","), ...rows].join("\n");
}

export function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
