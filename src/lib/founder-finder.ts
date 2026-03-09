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

// ---------------------------------------------------------------------------
// Source (Exa Websets)
// ---------------------------------------------------------------------------

export async function startFounderSource(config?: {
  count?: number;
  appendQueries?: boolean;
}): Promise<FounderSourceResponse> {
  const { data, error } = await supabase.functions.invoke("founder-source", {
    body: {
      count: config?.count ?? 20,
      appendQueries: config?.appendQueries ?? true,
    },
  });

  if (error) {
    throw new Error(await extractFunctionErrorMessage(error));
  }

  return data as FounderSourceResponse;
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
  const { data, error } = await supabase.functions.invoke("founder-enrich", {
    body: {
      action: "create",
      candidates,
    },
  });

  if (error) {
    throw new Error(await extractFunctionErrorMessage(error));
  }

  return data as FounderEnrichResponse;
}

export async function pollFounderEnrich(
  taskGroupId: string,
): Promise<FounderEnrichResponse> {
  const { data, error } = await supabase.functions.invoke("founder-enrich", {
    body: {
      action: "status",
      taskGroupId,
    },
  });

  if (error) {
    throw new Error(await extractFunctionErrorMessage(error));
  }

  return data as FounderEnrichResponse;
}

// ---------------------------------------------------------------------------
// Merge Enrichment into Candidates
// ---------------------------------------------------------------------------

export function mergeEnrichmentResults(
  candidates: CandidateResult[],
  enrichments: ParallelEnrichmentResult[],
): CandidateResult[] {
  return candidates.map((candidate) => {
    const enrichment = enrichments.find(
      (e) => e.name.toLowerCase().trim() === candidate.name.toLowerCase().trim(),
    );

    if (!enrichment) return candidate;

    // Build expanded signals from enrichment
    const newSignals: string[] = [];
    if (enrichment.publications.length > 0) {
      newSignals.push(...enrichment.publications);
    }
    if (enrichment.competitive_programming.length > 0) {
      newSignals.push(...enrichment.competitive_programming);
    }
    if (enrichment.fellowships.length > 0) {
      newSignals.push(...enrichment.fellowships);
    }
    if (enrichment.open_source.length > 0) {
      newSignals.push(...enrichment.open_source);
    }
    if (enrichment.accelerator.length > 0) {
      newSignals.push(...enrichment.accelerator);
    }
    if (enrichment.prior_exits.length > 0) {
      newSignals.push(...enrichment.prior_exits);
    }
    if (enrichment.conference_talks.length > 0) {
      newSignals.push(...enrichment.conference_talks);
    }
    if (enrichment.media_recognition.length > 0) {
      newSignals.push(...enrichment.media_recognition);
    }
    if (enrichment.bay_area_confirmed) {
      newSignals.push("Bay Area confirmed");
    }
    if (enrichment.b2b_signals.length > 0) {
      newSignals.push(...enrichment.b2b_signals);
    }
    if (enrichment.zero_to_one_evidence.length > 0) {
      newSignals.push(...enrichment.zero_to_one_evidence);
    }
    if (enrichment.patents.length > 0) {
      newSignals.push(...enrichment.patents);
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
    "eea_summary", "profile_url",
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
