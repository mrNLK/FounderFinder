const DEFAULT_HARMONIC_BASE_URL = "https://api.harmonic.ai";
const COMPANY_CACHE_TTL_MS = 1000 * 60 * 60 * 24;

export interface HarmonicFounderSummary {
  name: string;
  title: string | null;
  linkedinUrl: string | null;
}

export interface NormalizedHarmonicCompany {
  harmonicCompanyId: string;
  name: string;
  domain: string | null;
  linkedinUrl: string | null;
  websiteUrl: string | null;
  location: string | null;
  fundingStage: string | null;
  fundingTotal: number | null;
  lastFundingDate: string | null;
  lastFundingTotal: number | null;
  headcount: number | null;
  headcountGrowth30d: number | null;
  headcountGrowth90d: number | null;
  tags: string[];
  founders: HarmonicFounderSummary[];
  rawPayload: Record<string, unknown>;
  fetchedAt: string;
}

export interface NormalizedHarmonicPerson {
  harmonicPersonId: string | null;
  fullName: string | null;
  linkedinUrl: string | null;
  currentRole: string | null;
  currentCompany: string | null;
  location: string | null;
  bio: string | null;
  education: Record<string, unknown>[];
  experience: Record<string, unknown>[];
  skills: string[];
  socialLinks: Record<string, string>;
  rawPayload: Record<string, unknown>;
  companyUrns: string[];
}

export interface HarmonicSearchCompanyResult {
  companyUrn: string;
  id?: number | null;
  name?: string | null;
}

interface HarmonicEnv {
  apiKey: string;
  baseUrl: string;
}

export interface HarmonicEnvOverride {
  apiKey?: string | null;
  baseUrl?: string | null;
}

interface HarmonicSearchResponse {
  results?: unknown[];
  companies?: unknown[];
  urns?: unknown[];
}

function getHarmonicEnv(override?: HarmonicEnvOverride): HarmonicEnv {
  const apiKey = override?.apiKey || Deno.env.get("HARMONIC_API_KEY");
  if (!apiKey) {
    throw new Error("Missing HARMONIC_API_KEY");
  }

  return {
    apiKey,
    baseUrl: override?.baseUrl || Deno.env.get("HARMONIC_BASE_URL") || DEFAULT_HARMONIC_BASE_URL,
  };
}

export function getCompanyCacheTtlMs(): number {
  return COMPANY_CACHE_TTL_MS;
}

export function normalizeLinkedInUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url.trim());
    parsed.protocol = "https:";
    parsed.hash = "";
    parsed.search = "";
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    return parsed.toString();
  } catch {
    return url.trim() || null;
  }
}

export function normalizeWebsiteUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  const trimmed = url.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    parsed.protocol = "https:";
    parsed.hash = "";
    parsed.search = "";
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    return parsed.toString();
  } catch {
    return trimmed;
  }
}

function coerceNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function coerceString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function coerceObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item: unknown) => item && typeof item === "object") as Record<string, unknown>[];
}

export async function harmonicFetch<T>(
  path: string,
  init?: RequestInit,
  override?: HarmonicEnvOverride,
): Promise<T> {
  const env = getHarmonicEnv(override);
  const headers = new Headers(init?.headers);
  headers.set("apikey", env.apiKey);
  headers.set("Accept", "application/json");
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${env.baseUrl}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const text = await response.text();
    const error = new Error(`Harmonic request failed: ${response.status} ${text}`);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }

  if (response.status === 204) {
    return {} as T;
  }

  return await response.json() as T;
}

export async function enrichPersonByLinkedIn(
  linkedinUrl: string,
  override?: HarmonicEnvOverride,
): Promise<Record<string, unknown>> {
  const params = new URLSearchParams({
    linkedin_url: normalizeLinkedInUrl(linkedinUrl) || linkedinUrl,
  });

  return await harmonicFetch<Record<string, unknown>>(`/persons?${params.toString()}`, {
    method: "POST",
  }, override);
}

function normalizeSearchResults(response: HarmonicSearchResponse): HarmonicSearchCompanyResult[] {
  const urns = Array.isArray(response.urns)
    ? response.urns.filter((item: unknown) => typeof item === "string") as string[]
    : [];

  if (urns.length > 0) {
    return urns.map((companyUrn: string) => ({ companyUrn }));
  }

  const rawResults = Array.isArray(response.results)
    ? response.results
    : Array.isArray(response.companies)
      ? response.companies
      : [];

  return rawResults
    .map((item: unknown) => {
      if (typeof item === "string" && item.trim()) {
        return {
          companyUrn: item.trim(),
          id: null,
          name: null,
        };
      }

      const record = coerceObject(item);
      return {
        companyUrn: coerceString(record.company_urn) ||
          coerceString(record.entity_urn) ||
          coerceString(record.urn) ||
          "",
        id: coerceNumber(record.id),
        name: coerceString(record.name),
      };
    })
    .filter((item: HarmonicSearchCompanyResult) => Boolean(item.companyUrn));
}

export async function searchCompaniesByNaturalLanguage(
  query: string,
  limit: number,
  override?: HarmonicEnvOverride,
): Promise<HarmonicSearchCompanyResult[]> {
  const params = new URLSearchParams({
    query,
    size: String(limit),
  });

  try {
    const response = await harmonicFetch<HarmonicSearchResponse>(`/search/search_agent?${params.toString()}`, {
      method: "GET",
    }, override);
    const results = normalizeSearchResults(response);
    if (results.length > 0) {
      return results;
    }
  } catch (error) {
    const status = (error as Error & { status?: number }).status;
    if (status && status < 500 && status !== 404) {
      throw error;
    }
  }

  const fallbackResponse = await harmonicFetch<HarmonicSearchResponse>(`/search/companies_by_keywords?size=${limit}`, {
    method: "POST",
    body: JSON.stringify({
      keywords: query,
      include_ids_only: true,
    }),
  }, override);

  return normalizeSearchResults(fallbackResponse);
}

export async function getCompaniesByUrns(
  urns: string[],
  includeFields: string[],
  override?: HarmonicEnvOverride,
): Promise<Record<string, unknown>[]> {
  if (urns.length === 0) return [];

  const params = new URLSearchParams();
  urns.forEach((urn: string) => params.append("urns", urn));

  let response: Record<string, unknown> | Record<string, unknown>[];
  try {
    response = await harmonicFetch<Record<string, unknown> | Record<string, unknown>[]>(
      `/companies?${params.toString()}`,
      { method: "GET" },
      override,
    );
  } catch (error) {
    const status = (error as Error & { status?: number }).status;
    if (status && status < 500 && status !== 404) {
      throw error;
    }

    response = await harmonicFetch<Record<string, unknown> | Record<string, unknown>[]>(
      "/companies",
      {
        method: "POST",
        body: JSON.stringify({
          urns,
        }),
      },
      override,
    );
  }

  if (Array.isArray(response)) {
    return response.map((item: unknown) => coerceObject(item));
  }

  if (Array.isArray(response.companies)) {
    return response.companies.map((item: unknown) => coerceObject(item));
  }

  return [coerceObject(response)].filter((item: Record<string, unknown>) => Object.keys(item).length > 0);
}

export function buildFounderSummaries(companyRaw: Record<string, unknown>): HarmonicFounderSummary[] {
  const founders = toRecordArray(companyRaw.founders);
  const people = toRecordArray(companyRaw.people);

  const founderPeople = people.filter((person: Record<string, unknown>) => {
    const title = [
      coerceString(person.title),
      coerceString(person.role),
      coerceString(person.job_title),
    ].filter(Boolean).join(" ").toLowerCase();
    return title.includes("founder");
  });

  const rawFounders = founders.length > 0 ? founders : founderPeople;

  return rawFounders.map((founder: Record<string, unknown>) => ({
    name: coerceString(founder.name) || "Unknown founder",
    title: coerceString(founder.title) || coerceString(founder.role),
    linkedinUrl: normalizeLinkedInUrl(
      coerceString(coerceObject(founder.socials).linkedin_url) ||
      coerceString(coerceObject(coerceObject(founder.socials).LINKEDIN).url) ||
      coerceString(founder.linkedin_url),
    ),
  }));
}

export function normalizeHarmonicCompany(raw: Record<string, unknown>): NormalizedHarmonicCompany {
  const socials = coerceObject(raw.socials);
  const linkedinSocial = coerceObject(socials.LINKEDIN);
  const funding = coerceObject(raw.funding);
  const website = coerceObject(raw.website);
  const tags = Array.isArray(raw.tags) ? raw.tags.filter((item: unknown) => typeof item === "string") as string[] : [];
  const locationDetails = coerceObject(raw.location);
  const location = [
    coerceString(locationDetails.location),
    coerceString(raw.location),
    coerceString(locationDetails.city),
    coerceString(locationDetails.state),
    coerceString(locationDetails.country),
    coerceString(raw.city),
    coerceString(raw.country),
  ].filter(Boolean).join(", ") || null;

  const harmonicCompanyId = coerceString(raw.entity_urn) || coerceString(raw.company_urn) || String(raw.id ?? "");

  return {
    harmonicCompanyId,
    name: coerceString(raw.name) || "Unknown company",
    domain: coerceString(website.domain) || coerceString(raw.website_domain) || coerceString(raw.domain),
    linkedinUrl: normalizeLinkedInUrl(
      coerceString(linkedinSocial.url) ||
      coerceString(socials.linkedin_url) ||
      coerceString(raw.linkedin_url),
    ),
    websiteUrl: normalizeWebsiteUrl(
      coerceString(website.url) ||
      coerceString(raw.website_url) ||
      coerceString(socials.website_url),
    ),
    location,
    fundingStage: coerceString(funding.funding_stage) || coerceString(raw.stage) || coerceString(raw.funding_stage),
    fundingTotal: coerceNumber(funding.funding_total) ?? coerceNumber(raw.funding_total),
    lastFundingDate: coerceString(funding.last_funding_at) || coerceString(raw.last_funding_at),
    lastFundingTotal: coerceNumber(funding.last_funding_total) ?? coerceNumber(raw.last_funding_total),
    headcount: coerceNumber(raw.headcount),
    headcountGrowth30d: coerceNumber(coerceObject(raw.headcount_growth).thirty_day_growth) ?? coerceNumber(raw.headcount_growth_30d),
    headcountGrowth90d: coerceNumber(coerceObject(raw.headcount_growth).ninety_day_growth) ?? coerceNumber(raw.headcount_growth_90d),
    tags,
    founders: buildFounderSummaries(raw),
    rawPayload: raw,
    fetchedAt: new Date().toISOString(),
  };
}

export function normalizeHarmonicPerson(raw: Record<string, unknown>): NormalizedHarmonicPerson {
  const socials = coerceObject(raw.socials);
  const experience = toRecordArray(raw.experience);
  const education = toRecordArray(raw.education);
  const currentCompanyUrns = Array.isArray(raw.current_company_urns)
    ? raw.current_company_urns.filter((item: unknown) => typeof item === "string") as string[]
    : [];
  const currentExperience = experience[0] || {};

  const socialLinks: Record<string, string> = {};
  for (const [key, value] of Object.entries(socials)) {
    const stringValue = coerceString(value);
    if (stringValue) {
      socialLinks[key] = stringValue;
    }
  }

  return {
    harmonicPersonId: coerceString(raw.entity_urn) || coerceString(raw.person_urn) || null,
    fullName: coerceString(raw.name),
    linkedinUrl: normalizeLinkedInUrl(coerceString(socials.linkedin_url) || coerceString(raw.linkedin_url)),
    currentRole: coerceString(currentExperience.title) || coerceString(raw.title),
    currentCompany: coerceString(currentExperience.company_name) || coerceString(raw.current_company_name),
    location: coerceString(raw.location),
    bio: coerceString(raw.bio),
    education,
    experience,
    skills: Array.isArray(raw.skills) ? raw.skills.filter((item: unknown) => typeof item === "string") as string[] : [],
    socialLinks,
    rawPayload: raw,
    companyUrns: currentCompanyUrns,
  };
}
