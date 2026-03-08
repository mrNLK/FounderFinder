import { supabase } from "@/integrations/supabase/client";
import type {
  AiFundHarmonicCompany,
  AiFundHarmonicIntelligenceSummary,
  AiFundHarmonicPersonProfile,
  AiFundHarmonicSavedSearch,
  AiFundIntelligenceRunRow,
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

export interface HarmonicDebugCompany {
  id: string;
  harmonicCompanyId: string;
  name: string;
  domain: string | null;
  fetchedAt: string;
  updatedAt: string;
  rawPayload: Record<string, unknown>;
}

export interface HarmonicDebugSnapshot {
  companyCount: number;
  savedSearchCount: number;
  recentCompanies: HarmonicDebugCompany[];
  recentSavedSearches: AiFundHarmonicSavedSearch[];
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
  const { data, error } = await supabase.functions.invoke("aifund-settings", {
    body: {
      action: "harmonic_enrich_person",
      ...input,
    },
  });

  if (error) {
    throw new Error(await extractFunctionErrorMessage(error));
  }

  return data as HarmonicPersonResponse;
}

export async function runHarmonicIntelligence(
  input: HarmonicIntelligenceInput,
): Promise<HarmonicIntelligenceResponse> {
  const { data, error } = await supabase.functions.invoke("aifund-intelligence", {
    body: input,
  });

  if (error) {
    throw new Error(await extractFunctionErrorMessage(error));
  }

  const payload = data as {
    run: AiFundIntelligenceRunRow;
    resultsSummary: AiFundHarmonicIntelligenceSummary;
  };

  return {
    run: {
      id: payload.run.id,
      user_id: payload.run.user_id,
      provider: payload.run.provider,
      query_params: payload.run.query_params,
      status: payload.run.status,
      results_count: payload.run.results_count,
      results_summary: payload.run.results_summary as AiFundHarmonicIntelligenceSummary | null,
      started_at: payload.run.started_at,
      completed_at: payload.run.completed_at,
      created_at: payload.run.created_at,
    },
    companies: payload.resultsSummary.companies,
  };
}

export async function fetchHarmonicDebugSnapshot(): Promise<HarmonicDebugSnapshot> {
  const [companiesResult, savedSearchesResult, companyCountResult, savedSearchCountResult] = await Promise.all([
    supabase
      .from("aifund_harmonic_companies")
      .select("id, harmonic_company_id, name, domain, fetched_at, updated_at, raw_payload")
      .order("updated_at", { ascending: false })
      .limit(5),
    supabase
      .from("aifund_harmonic_saved_searches")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(5),
    supabase
      .from("aifund_harmonic_companies")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("aifund_harmonic_saved_searches")
      .select("id", { count: "exact", head: true }),
  ]);

  if (companiesResult.error) {
    throw companiesResult.error;
  }
  if (savedSearchesResult.error) {
    throw savedSearchesResult.error;
  }
  if (companyCountResult.error) {
    throw companyCountResult.error;
  }
  if (savedSearchCountResult.error) {
    throw savedSearchCountResult.error;
  }

  const recentCompanies = (companiesResult.data || []).map((row) => ({
    id: row.id as string,
    harmonicCompanyId: row.harmonic_company_id as string,
    name: row.name as string,
    domain: (row.domain as string | null) || null,
    fetchedAt: row.fetched_at as string,
    updatedAt: row.updated_at as string,
    rawPayload: (row.raw_payload as Record<string, unknown>) || {},
  }));

  const recentSavedSearches = (savedSearchesResult.data || []).map((row) => ({
    id: row.id as string,
    userId: row.user_id as string,
    conceptId: row.concept_id as string,
    harmonicSavedSearchId: (row.harmonic_saved_search_id as string | null) || null,
    queryText: row.query_text as string,
    queryHash: row.query_hash as string,
    status: row.status as string,
    lastSyncedAt: (row.last_synced_at as string | null) || null,
    lastRunId: (row.last_run_id as string | null) || null,
    resultCount: row.result_count as number,
    metadata: (row.metadata as Record<string, unknown>) || {},
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }));

  return {
    companyCount: companyCountResult.count || 0,
    savedSearchCount: savedSearchCountResult.count || 0,
    recentCompanies,
    recentSavedSearches,
  };
}

export async function fetchHarmonicSavedSearches(): Promise<AiFundHarmonicSavedSearch[]> {
  const { data, error } = await supabase
    .from("aifund_harmonic_saved_searches")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data || []).map((row) => ({
    id: row.id as string,
    userId: row.user_id as string,
    conceptId: row.concept_id as string,
    harmonicSavedSearchId: (row.harmonic_saved_search_id as string | null) || null,
    queryText: row.query_text as string,
    queryHash: row.query_hash as string,
    status: row.status as string,
    lastSyncedAt: (row.last_synced_at as string | null) || null,
    lastRunId: (row.last_run_id as string | null) || null,
    resultCount: row.result_count as number,
    metadata: (row.metadata as Record<string, unknown>) || {},
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }));
}

export async function updateHarmonicSavedSearchStatus(
  savedSearchId: string,
  status: string,
): Promise<AiFundHarmonicSavedSearch> {
  const { data, error } = await supabase
    .from("aifund_harmonic_saved_searches")
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", savedSearchId)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return {
    id: data.id as string,
    userId: data.user_id as string,
    conceptId: data.concept_id as string,
    harmonicSavedSearchId: (data.harmonic_saved_search_id as string | null) || null,
    queryText: data.query_text as string,
    queryHash: data.query_hash as string,
    status: data.status as string,
    lastSyncedAt: (data.last_synced_at as string | null) || null,
    lastRunId: (data.last_run_id as string | null) || null,
    resultCount: data.result_count as number,
    metadata: (data.metadata as Record<string, unknown>) || {},
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
  };
}
