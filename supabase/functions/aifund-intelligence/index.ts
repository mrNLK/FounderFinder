import { type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

import {
  getCompaniesByUrns,
  normalizeHarmonicCompany,
  searchCompaniesByNaturalLanguage,
  type HarmonicEnvOverride,
} from "../_shared/harmonic.ts";
import {
  getHarmonicBaseUrl,
  getProviderApiKey,
  getUserSettingsRow,
  mergeSourcingChannels,
  type SourcingChannelConfig,
} from "../_shared/aifund-settings.ts";
import { authenticateAiFundUser, AuthGuardError } from "../_shared/auth-guard.ts";

type IntelligenceProvider = "exa" | "parallel" | "github" | "harmonic" | "manual";

interface IntelligenceRequestBody {
  runId: string;
  query: string;
  conceptId?: string | null;
  limit?: number;
  channelIds?: string[];
}

interface IntelligenceRunRow {
  id: string;
  user_id: string;
  provider: IntelligenceProvider;
}

interface ProviderResultItem {
  id: string;
  title: string;
  subtitle: string | null;
  snippet: string | null;
  url: string | null;
  publishedAt: string | null;
  sourceChannel: string | null;
  tags: string[];
  importCandidate: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
}

interface ProviderSummary {
  source: "exa" | "parallel" | "github";
  query: string;
  conceptId: string | null;
  fetchedAt: string;
  channelIds: string[];
  items: ProviderResultItem[];
  error?: string;
}

interface HarmonicSummary {
  source: "harmonic";
  query: string;
  conceptId: string | null;
  fetchedAt: string;
  companies: Record<string, unknown>[];
  error?: string;
}

interface FunctionErrorBody {
  error: {
    message: string;
    code: string;
  };
}

const corsHeaders: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
      ...(init?.headers ?? {}),
    },
  });
}

function errorJson(message: string, code: string, status: number): Response {
  return json(
    {
      error: {
        message,
        code,
      },
    } satisfies FunctionErrorBody,
    { status },
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item: unknown) => asString(item))
    .filter((item: string | null): item is string => item !== null);
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function trimText(value: string | null, maxLength = 420): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3)}...`;
}

async function getOwnedRun(
  userClient: SupabaseClient,
  userId: string,
  runId: string,
): Promise<IntelligenceRunRow> {
  const { data, error } = await userClient
    .from("aifund_intelligence_runs")
    .select("id, user_id, provider")
    .eq("id", runId)
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    throw new Error("Run not found");
  }

  return data as IntelligenceRunRow;
}

async function verifyOwnedConcept(
  userClient: SupabaseClient,
  userId: string,
  conceptId: string,
): Promise<void> {
  const { data, error } = await userClient
    .from("aifund_concepts")
    .select("id")
    .eq("id", conceptId)
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    throw new Error("Concept not found");
  }
}

async function sha256(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest)).map((byte: number) => byte.toString(16).padStart(2, "0")).join("");
}

function buildChannelQueries(
  provider: "exa" | "parallel" | "github",
  query: string,
  savedChannels: SourcingChannelConfig[],
  requestedChannelIds: string[],
): SourcingChannelConfig[] {
  const enabledChannels = savedChannels.filter((channel: SourcingChannelConfig) =>
    channel.enabled && channel.provider === provider
  );

  if (requestedChannelIds.length === 0) {
    return enabledChannels;
  }

  const requested = new Set(requestedChannelIds);
  const filtered = enabledChannels.filter((channel: SourcingChannelConfig) => requested.has(channel.id));
  return filtered.length > 0 ? filtered : enabledChannels;
}

function interpolateQuery(template: string, query: string): string {
  return template.includes("{{query}}")
    ? template.replaceAll("{{query}}", query)
    : `${template} ${query}`.trim();
}

function dedupeItems(items: ProviderResultItem[], limit: number): ProviderResultItem[] {
  const seen = new Set<string>();
  const result: ProviderResultItem[] = [];

  for (const item of items) {
    const dedupeKey = item.url || item.id;
    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    result.push(item);

    if (result.length >= limit) {
      break;
    }
  }

  return result;
}

async function runExaSearch(
  query: string,
  conceptId: string | null,
  limit: number,
  channels: SourcingChannelConfig[],
  apiKey: string,
): Promise<ProviderSummary> {
  const fetchedAt = new Date().toISOString();
  const perQueryLimit = Math.max(1, Math.ceil(limit / Math.max(channels.length, 1)));
  const items: ProviderResultItem[] = [];

  const searchConfigs = channels.length > 0
    ? channels
    : [{
      id: "general_web",
      label: "General Web",
      provider: "exa",
      enabled: true,
      description: "General web search",
      queryTemplate: "{{query}}",
      domains: [],
    } satisfies SourcingChannelConfig];

  for (const channel of searchConfigs) {
    const response = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        query: interpolateQuery(channel.queryTemplate, query),
        type: "auto",
        numResults: perQueryLimit,
        includeDomains: channel.domains.length > 0 ? channel.domains : undefined,
        contents: {
          text: {
            maxCharacters: 1200,
          },
          highlights: {
            query,
            numSentences: 2,
            highlightsPerUrl: 2,
          },
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Exa search failed: ${response.status} ${await response.text()}`);
    }

    const payload = await response.json() as { results?: unknown[] };
    const results = Array.isArray(payload.results) ? payload.results : [];

    for (const raw of results) {
      const record = asRecord(raw);
      const text = asString(record.text);
      const highlights = asStringArray(record.highlights);
      items.push({
        id: asString(record.id) || asString(record.url) || crypto.randomUUID(),
        title: asString(record.title) || asString(record.url) || "Untitled result",
        subtitle: [asString(record.author), channel.label].filter(Boolean).join(" | ") || channel.label,
        snippet: trimText(highlights.join(" ")) || trimText(text),
        url: asString(record.url),
        publishedAt: asString(record.publishedDate),
        sourceChannel: channel.id,
        tags: [channel.label],
        importCandidate: null,
        metadata: {
          score: asNumber(record.score),
          author: asString(record.author),
        },
      });
    }
  }

  return {
    source: "exa",
    query,
    conceptId,
    fetchedAt,
    channelIds: searchConfigs.map((channel: SourcingChannelConfig) => channel.id),
    items: dedupeItems(items, limit),
  };
}

async function runParallelSearch(
  query: string,
  conceptId: string | null,
  limit: number,
  channels: SourcingChannelConfig[],
  apiKey: string,
): Promise<ProviderSummary> {
  const fetchedAt = new Date().toISOString();
  const perQueryLimit = Math.max(1, Math.ceil(limit / Math.max(channels.length, 1)));
  const items: ProviderResultItem[] = [];

  const searchConfigs = channels.length > 0
    ? channels
    : [{
      id: "general_research",
      label: "General Research",
      provider: "parallel",
      enabled: true,
      description: "General research search",
      queryTemplate: "{{query}}",
      domains: [],
    } satisfies SourcingChannelConfig];

  for (const channel of searchConfigs) {
    const response = await fetch("https://api.parallel.ai/v1beta/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "parallel-beta": "search-extract-2025-10-10",
      },
      body: JSON.stringify({
        objective: interpolateQuery(channel.queryTemplate, query),
        mode: "one-shot",
        max_results: perQueryLimit,
      }),
    });

    if (!response.ok) {
      throw new Error(`Parallel search failed: ${response.status} ${await response.text()}`);
    }

    const payload = await response.json() as { results?: unknown[] };
    const results = Array.isArray(payload.results) ? payload.results : [];

    for (const raw of results) {
      const record = asRecord(raw);
      const snippets = asStringArray(record.excerpts);
      items.push({
        id: asString(record.id) || asString(record.url) || crypto.randomUUID(),
        title: asString(record.title) || asString(record.url) || "Untitled result",
        subtitle: channel.label,
        snippet: trimText(snippets.join(" ")) || trimText(asString(record.text)),
        url: asString(record.url),
        publishedAt: asString(record.published_at) || asString(record.publishedDate),
        sourceChannel: channel.id,
        tags: [channel.label],
        importCandidate: null,
        metadata: {
          score: asNumber(record.score),
          domain: asString(record.domain),
        },
      });
    }
  }

  return {
    source: "parallel",
    query,
    conceptId,
    fetchedAt,
    channelIds: searchConfigs.map((channel: SourcingChannelConfig) => channel.id),
    items: dedupeItems(items, limit),
  };
}

async function fetchGitHubUserDetails(
  login: string,
  headers: HeadersInit,
): Promise<Record<string, unknown>> {
  const response = await fetch(`https://api.github.com/users/${encodeURIComponent(login)}`, {
    headers,
  });

  if (!response.ok) {
    throw new Error(`GitHub user fetch failed: ${response.status} ${await response.text()}`);
  }

  return await response.json() as Record<string, unknown>;
}

async function runGitHubSearch(
  query: string,
  conceptId: string | null,
  limit: number,
  channels: SourcingChannelConfig[],
  apiKey: string,
): Promise<ProviderSummary> {
  const fetchedAt = new Date().toISOString();
  const perQueryLimit = Math.max(1, Math.ceil(limit / Math.max(channels.length, 1)));
  const items: ProviderResultItem[] = [];
  const headers: HeadersInit = {
    "Accept": "application/vnd.github+json",
    "Authorization": `Bearer ${apiKey}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };

  const searchConfigs = channels.length > 0
    ? channels
    : [{
      id: "general_github",
      label: "GitHub Search",
      provider: "github",
      enabled: true,
      description: "General GitHub user search",
      queryTemplate: "{{query}}",
      domains: [],
    } satisfies SourcingChannelConfig];

  for (const channel of searchConfigs) {
    const response = await fetch(
      `https://api.github.com/search/users?q=${encodeURIComponent(interpolateQuery(channel.queryTemplate, query))}&per_page=${perQueryLimit}`,
      { headers },
    );

    if (!response.ok) {
      throw new Error(`GitHub search failed: ${response.status} ${await response.text()}`);
    }

    const payload = await response.json() as { items?: unknown[] };
    const results = Array.isArray(payload.items) ? payload.items : [];

    for (const raw of results) {
      const record = asRecord(raw);
      const login = asString(record.login);
      if (!login) {
        continue;
      }

      const details = await fetchGitHubUserDetails(login, headers);
      const blog = asString(details.blog);
      items.push({
        id: login,
        title: asString(details.name) || login,
        subtitle: [asString(details.company), asString(details.location), channel.label].filter(Boolean).join(" | ") || channel.label,
        snippet: trimText(asString(details.bio)),
        url: asString(details.html_url),
        publishedAt: null,
        sourceChannel: channel.id,
        tags: [
          `${asNumber(details.followers) || 0} followers`,
          `${asNumber(details.public_repos) || 0} repos`,
        ],
        importCandidate: {
          fullName: asString(details.name) || login,
          githubUrl: asString(details.html_url),
          websiteUrl: blog,
          currentCompany: asString(details.company),
          location: asString(details.location),
          bio: asString(details.bio),
          personType: "ve",
          sourceChannel: channel.id,
          metadata: {
            githubLogin: login,
            followers: asNumber(details.followers),
            publicRepos: asNumber(details.public_repos),
            twitterUsername: asString(details.twitter_username),
          },
        },
        metadata: {
          login,
          avatarUrl: asString(details.avatar_url),
        },
      });
    }
  }

  return {
    source: "github",
    query,
    conceptId,
    fetchedAt,
    channelIds: searchConfigs.map((channel: SourcingChannelConfig) => channel.id),
    items: dedupeItems(items, limit),
  };
}

async function saveHarmonicSearchSnapshot(
  serviceClient: SupabaseClient,
  userId: string,
  conceptId: string | null,
  query: string,
  runId: string,
  resultCount: number,
  fetchedAt: string,
): Promise<void> {
  if (!conceptId) {
    return;
  }

  const queryHash = await sha256(query);
  const payload = {
    user_id: userId,
    concept_id: conceptId,
    query_text: query,
    query_hash: queryHash,
    status: "draft",
    last_run_id: runId,
    result_count: resultCount,
    metadata: {
      source: "harmonic",
      last_results_fetched_at: fetchedAt,
    },
    updated_at: fetchedAt,
  };

  const { data: existingSavedSearch } = await serviceClient
    .from("aifund_harmonic_saved_searches")
    .select("id")
    .eq("user_id", userId)
    .eq("concept_id", conceptId)
    .eq("query_hash", queryHash)
    .is("harmonic_saved_search_id", null)
    .limit(1)
    .maybeSingle();

  if (existingSavedSearch) {
    await serviceClient
      .from("aifund_harmonic_saved_searches")
      .update(payload)
      .eq("id", existingSavedSearch.id);
    return;
  }

  await serviceClient
    .from("aifund_harmonic_saved_searches")
    .insert(payload);
}

async function runHarmonicSearch(
  query: string,
  conceptId: string | null,
  limit: number,
  userId: string,
  serviceClient: SupabaseClient,
  runId: string,
  override: HarmonicEnvOverride,
): Promise<HarmonicSummary> {
  const searchResults = await searchCompaniesByNaturalLanguage(query, limit, override);
  const urns = searchResults.map((result: { companyUrn: string }) => result.companyUrn);
  const companyPayloads = await getCompaniesByUrns(urns, [], override);
  const companies = companyPayloads.map((raw: Record<string, unknown>) => normalizeHarmonicCompany(raw));
  const fetchedAt = new Date().toISOString();

  for (const company of companies) {
    await serviceClient
      .from("aifund_harmonic_companies")
      .upsert({
        user_id: userId,
        harmonic_company_id: company.harmonicCompanyId,
        name: company.name,
        domain: company.domain,
        linkedin_url: company.linkedinUrl,
        website_url: company.websiteUrl,
        location: company.location,
        funding_stage: company.fundingStage,
        funding_total: company.fundingTotal,
        last_funding_date: company.lastFundingDate,
        last_funding_total: company.lastFundingTotal,
        headcount: company.headcount,
        headcount_growth_30d: company.headcountGrowth30d,
        headcount_growth_90d: company.headcountGrowth90d,
        tags: company.tags,
        founders: company.founders,
        raw_payload: company.rawPayload,
        fetched_at: fetchedAt,
        updated_at: fetchedAt,
      }, {
        onConflict: "user_id,harmonic_company_id",
      });
  }

  await saveHarmonicSearchSnapshot(serviceClient, userId, conceptId, query, runId, companies.length, fetchedAt);

  return {
    source: "harmonic",
    query,
    conceptId,
    fetchedAt,
    companies: companies as unknown as Record<string, unknown>[],
  };
}

async function updateRunStatus(
  serviceClient: SupabaseClient,
  userId: string,
  runId: string,
  updates: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { data, error } = await serviceClient
    .from("aifund_intelligence_runs")
    .update(updates)
    .eq("id", runId)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as Record<string, unknown>;
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (request.method !== "POST") {
    return errorJson("Method not allowed", "method_not_allowed", 405);
  }

  let runId = "";
  let serviceClient: SupabaseClient | null = null;
  let userId = "";
  let provider: IntelligenceProvider = "manual";
  let query = "";
  let conceptId: string | null = null;

  try {
    const body = await request.json() as IntelligenceRequestBody;
    runId = body.runId;
    query = body.query?.trim() || "";
    conceptId = body.conceptId ?? null;

    if (!runId || !query) {
      return errorJson("Missing runId or query", "missing_run_id_or_query", 400);
    }

    const auth = await authenticateAiFundUser(request);
    userId = auth.userId;
    serviceClient = auth.serviceClient;

    const run = await getOwnedRun(auth.userClient, auth.userId, runId);
    provider = run.provider;

    if (provider === "manual") {
      return errorJson("Manual runs are not supported in the app", "manual_not_supported", 400);
    }

    if (conceptId) {
      await verifyOwnedConcept(auth.userClient, auth.userId, conceptId);
    }

    const settingsRow = await getUserSettingsRow(auth.serviceClient, auth.userId);
    const channels = mergeSourcingChannels(settingsRow?.sourcing_channels);
    const requestedChannelIds = Array.isArray(body.channelIds) ? body.channelIds.filter(Boolean) : [];
    const limit = Math.max(1, Math.min(body.limit ?? 10, 25));

    await updateRunStatus(auth.serviceClient, auth.userId, runId, {
      status: "running",
      completed_at: null,
    });

    let resultsSummary: ProviderSummary | HarmonicSummary;
    let resultsCount = 0;

    if (provider === "harmonic") {
      const harmonicOverride: HarmonicEnvOverride = {
        apiKey: getProviderApiKey(settingsRow, "harmonic"),
        baseUrl: getHarmonicBaseUrl(settingsRow),
      };

      if (!harmonicOverride.apiKey) {
        throw new Error("Missing Harmonic API key");
      }

      resultsSummary = await runHarmonicSearch(
        query,
        conceptId,
        limit,
        auth.userId,
        auth.serviceClient,
        runId,
        harmonicOverride,
      );
      resultsCount = resultsSummary.companies.length;
    } else if (provider === "exa") {
      const apiKey = getProviderApiKey(settingsRow, "exa");
      if (!apiKey) {
        throw new Error("Missing Exa API key");
      }

      resultsSummary = await runExaSearch(
        query,
        conceptId,
        limit,
        buildChannelQueries("exa", query, channels, requestedChannelIds),
        apiKey,
      );
      resultsCount = resultsSummary.items.length;
    } else if (provider === "parallel") {
      const apiKey = getProviderApiKey(settingsRow, "parallel");
      if (!apiKey) {
        throw new Error("Missing Parallel API key");
      }

      resultsSummary = await runParallelSearch(
        query,
        conceptId,
        limit,
        buildChannelQueries("parallel", query, channels, requestedChannelIds),
        apiKey,
      );
      resultsCount = resultsSummary.items.length;
    } else {
      const apiKey = getProviderApiKey(settingsRow, "github");
      if (!apiKey) {
        throw new Error("Missing GitHub token");
      }

      resultsSummary = await runGitHubSearch(
        query,
        conceptId,
        limit,
        buildChannelQueries("github", query, channels, requestedChannelIds),
        apiKey,
      );
      resultsCount = resultsSummary.items.length;
    }

    const completedAt = resultsSummary.fetchedAt;
    const updatedRun = await updateRunStatus(auth.serviceClient, auth.userId, runId, {
      status: "completed",
      results_count: resultsCount,
      results_summary: resultsSummary,
      completed_at: completedAt,
    });

    return json({
      run: updatedRun,
      resultsSummary,
    });
  } catch (error) {
    console.error("aifund-intelligence failed:", error);

    if (error instanceof AuthGuardError) {
      return errorJson(error.message, error.code, error.status);
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    const failedAt = new Date().toISOString();

    if (runId && serviceClient && userId) {
      const failureSummary = provider === "harmonic"
        ? {
          source: "harmonic",
          query,
          conceptId,
          fetchedAt: failedAt,
          companies: [],
          error: message,
        }
        : {
          source: provider === "manual" ? "exa" : provider,
          query,
          conceptId,
          fetchedAt: failedAt,
          channelIds: [],
          items: [],
          error: message,
        };

      try {
        await updateRunStatus(serviceClient, userId, runId, {
          status: "failed",
          results_summary: failureSummary,
          completed_at: failedAt,
        });
      } catch (updateError) {
        console.error("Failed to persist failed run state:", updateError);
      }
    }

    const code = message.includes("Harmonic")
      ? "missing_harmonic_configuration"
      : message.includes("Exa")
        ? "missing_exa_configuration"
        : message.includes("Parallel")
          ? "missing_parallel_configuration"
          : message.includes("GitHub")
            ? "missing_github_configuration"
            : "aifund_intelligence_failed";

    return errorJson(message, code, 500);
  }
});
