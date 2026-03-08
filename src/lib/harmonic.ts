import { supabase } from "@/integrations/supabase/client";
import type {
  AiFundHarmonicCompany,
  AiFundHarmonicIntelligenceSummary,
  AiFundHarmonicPersonProfile,
  AiFundPersonRow,
} from "@/types/ai-fund";

export interface HarmonicPersonInput {
  personId: string;
  linkedinUrl?: string | null;
  personContext?: {
    fullName?: string | null;
    currentRole?: string | null;
    currentCompany?: string | null;
    location?: string | null;
  };
}

export interface HarmonicPersonResponse {
  person: AiFundPersonRow | null;
  externalProfile: {
    id: string;
    person_id: string;
    platform: string;
    profile_url: string;
    profile_data: Record<string, unknown> | null;
    fetched_at: string;
  } | null;
  companyCacheRow: Record<string, unknown> | null;
  notFound?: boolean;
}

export interface HarmonicIntelligenceInput {
  runId: string;
  query: string;
  conceptId?: string | null;
  limit?: number;
}

export interface HarmonicIntelligenceResponse {
  run: {
    id: string;
    user_id: string;
    provider: string;
    query_params: Record<string, unknown>;
    status: string;
    results_count: number;
    results_summary: AiFundHarmonicIntelligenceSummary | null;
    started_at: string;
    completed_at: string | null;
    created_at: string;
  };
  companies: AiFundHarmonicCompany[];
}

interface FunctionErrorPayload {
  error?: {
    message?: string;
    code?: string;
  };
}

export function coerceHarmonicPersonProfile(
  payload: Record<string, unknown>,
): AiFundHarmonicPersonProfile {
  const socialLinks = payload.socialLinks;

  return {
    harmonicPersonId: typeof payload.harmonicPersonId === "string" ? payload.harmonicPersonId : null,
    fullName: typeof payload.fullName === "string" ? payload.fullName : null,
    linkedinUrl: typeof payload.linkedinUrl === "string" ? payload.linkedinUrl : null,
    currentRole: typeof payload.currentRole === "string" ? payload.currentRole : null,
    currentCompany: typeof payload.currentCompany === "string" ? payload.currentCompany : null,
    location: typeof payload.location === "string" ? payload.location : null,
    bio: typeof payload.bio === "string" ? payload.bio : null,
    education: Array.isArray(payload.education) ? payload.education as Record<string, unknown>[] : [],
    experience: Array.isArray(payload.experience) ? payload.experience as Record<string, unknown>[] : [],
    skills: Array.isArray(payload.skills) ? payload.skills.filter((item: unknown) => typeof item === "string") as string[] : [],
    socialLinks: socialLinks && typeof socialLinks === "object" && !Array.isArray(socialLinks)
      ? socialLinks as Record<string, string>
      : {},
    rawPayload: payload.rawPayload && typeof payload.rawPayload === "object" && !Array.isArray(payload.rawPayload)
      ? payload.rawPayload as Record<string, unknown>
      : {},
  };
}

async function extractFunctionErrorMessage(error: unknown): Promise<string> {
  const defaultMessage = error instanceof Error ? error.message : "Unknown Harmonic error";
  const response = (error as { context?: Response } | null)?.context;

  if (!response) {
    return defaultMessage;
  }

  try {
    const payload = await response.json() as FunctionErrorPayload;
    return payload.error?.message || defaultMessage;
  } catch {
    try {
      return await response.text();
    } catch {
      return defaultMessage;
    }
  }
}

export async function enrichPersonWithHarmonic(
  input: HarmonicPersonInput,
): Promise<HarmonicPersonResponse> {
  const { data, error } = await supabase.functions.invoke("harmonic-person", {
    body: input,
  });

  if (error) {
    throw new Error(await extractFunctionErrorMessage(error));
  }

  return data as HarmonicPersonResponse;
}

export async function runHarmonicIntelligence(
  input: HarmonicIntelligenceInput,
): Promise<HarmonicIntelligenceResponse> {
  const { data, error } = await supabase.functions.invoke("harmonic-intelligence", {
    body: input,
  });

  if (error) {
    throw new Error(await extractFunctionErrorMessage(error));
  }

  return data as HarmonicIntelligenceResponse;
}
