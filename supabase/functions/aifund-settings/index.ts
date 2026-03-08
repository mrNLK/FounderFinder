import { authenticateAiFundUser, AuthGuardError } from "../_shared/auth-guard.ts";
import {
  buildPublicAiFundSettings,
  getHarmonicBaseUrl,
  getProviderApiKey,
  getProviderSource,
  getUserSettingsRow,
  getAnthropicModel,
  getStoredProviderPreferences,
  getStoredProviderSecrets,
  mergeEvaluationCriteria,
  mergeSourcingChannels,
  PROVIDER_KEYS,
  type ProviderKey,
} from "../_shared/aifund-settings.ts";
import {
  enrichPersonByLinkedIn,
  getCompaniesByUrns,
  getCompanyCacheTtlMs,
  normalizeHarmonicCompany,
  normalizeHarmonicPerson,
  normalizeLinkedInUrl,
} from "../_shared/harmonic.ts";
import { type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

interface SettingsRequestBody {
  action?: "get" | "update" | "test" | "harmonic_enrich_person";
  provider?: ProviderKey;
  integrations?: Record<string, unknown>;
  sourcingChannels?: unknown[];
  personId?: string;
  linkedinUrl?: string | null;
  personContext?: {
    fullName?: string | null;
    currentRole?: string | null;
    currentCompany?: string | null;
    location?: string | null;
  };
}

interface IntegrationTestResult {
  provider: ProviderKey;
  ok: boolean;
  checkedAt: string;
  message: string;
  metadata: Record<string, unknown> | null;
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
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

interface PersonRow {
  id: string;
  user_id: string;
  full_name: string | null;
  linkedin_url: string | null;
  current_role: string | null;
  current_company: string | null;
  location: string | null;
  bio: string | null;
  metadata: Record<string, unknown> | null;
}

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

function upsertSecretValue(
  target: Record<string, unknown>,
  provider: ProviderKey,
  apiKey: string | null,
): void {
  if (!apiKey) {
    delete target[provider];
    return;
  }

  target[provider] = {
    apiKey,
  };
}

function buildEphemeralSettingsRow(
  userId: string,
  currentRow: Awaited<ReturnType<typeof getUserSettingsRow>>,
  providerSecrets: Record<string, unknown>,
  providerPreferences: Record<string, unknown>,
) {
  return {
    id: currentRow?.id || crypto.randomUUID(),
    user_id: userId,
    provider_secrets: providerSecrets,
    provider_preferences: providerPreferences,
    sourcing_channels: currentRow?.sourcing_channels || null,
    evaluation_criteria: currentRow?.evaluation_criteria || null,
    updated_at: currentRow?.updated_at || new Date().toISOString(),
  };
}

function buildUpdatedProviderState(
  currentRow: Awaited<ReturnType<typeof getUserSettingsRow>>,
  integrationUpdates: Record<string, unknown>,
): {
  providerSecrets: Record<string, unknown>;
  providerPreferences: Record<string, unknown>;
} {
  const currentSecrets = asRecord(getStoredProviderSecrets(currentRow));
  const currentPreferences = asRecord(getStoredProviderPreferences(currentRow));

  for (const provider of PROVIDER_KEYS) {
    const update = asRecord(integrationUpdates[provider]);
    if (Object.keys(update).length === 0) {
      continue;
    }

    if ("apiKey" in update) {
      const nextApiKey = asString(update.apiKey);
      upsertSecretValue(currentSecrets, provider, nextApiKey);
    }

    if (provider === "harmonic" && "baseUrl" in update) {
      const harmonicPreferences = asRecord(currentPreferences.harmonic);
      const nextBaseUrl = asString(update.baseUrl);
      currentPreferences.harmonic = nextBaseUrl
        ? { ...harmonicPreferences, baseUrl: nextBaseUrl }
        : {};
    }

    if (provider === "anthropic" && "model" in update) {
      const anthropicPreferences = asRecord(currentPreferences.anthropic);
      const nextModel = asString(update.model);
      currentPreferences.anthropic = nextModel
        ? { ...anthropicPreferences, model: nextModel }
        : {};
    }
  }

  return {
    providerSecrets: currentSecrets,
    providerPreferences: currentPreferences,
  };
}

async function testHarmonicIntegration(
  settingsRow: ReturnType<typeof buildEphemeralSettingsRow>,
): Promise<IntegrationTestResult> {
  const apiKey = getProviderApiKey(settingsRow, "harmonic");
  if (!apiKey) {
    return {
      provider: "harmonic",
      ok: false,
      checkedAt: new Date().toISOString(),
      message: "Missing Harmonic API key",
      metadata: {
        source: getProviderSource(settingsRow, "harmonic"),
      },
    };
  }

  await enrichPersonByLinkedIn("https://www.linkedin.com/in/samaltman", {
    apiKey,
    baseUrl: getHarmonicBaseUrl(settingsRow),
  });

  return {
    provider: "harmonic",
    ok: true,
    checkedAt: new Date().toISOString(),
    message: "Harmonic responded successfully",
    metadata: {
      source: getProviderSource(settingsRow, "harmonic"),
      lookupType: "person_enrichment",
    },
  };
}

async function getOwnedPerson(
  userClient: SupabaseClient,
  userId: string,
  personId: string,
): Promise<PersonRow> {
  const { data, error } = await userClient
    .from("aifund_people")
    .select("id, user_id, full_name, linkedin_url, current_role, current_company, location, bio, metadata")
    .eq("id", personId)
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    throw new Error("Person not found");
  }

  return data as PersonRow;
}

async function getFreshCompanyCache(
  serviceClient: SupabaseClient,
  userId: string,
  harmonicCompanyId: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await serviceClient
    .from("aifund_harmonic_companies")
    .select("*")
    .eq("user_id", userId)
    .eq("harmonic_company_id", harmonicCompanyId)
    .single();

  if (error || !data || !data.fetched_at) {
    return null;
  }

  const ageMs = Date.now() - new Date(data.fetched_at as string).getTime();
  return ageMs <= getCompanyCacheTtlMs() ? data as Record<string, unknown> : null;
}

function buildPersonUpdate(
  person: PersonRow,
  normalized: ReturnType<typeof normalizeHarmonicPerson>,
): Record<string, unknown> {
  const enrichedAt = new Date().toISOString();
  const update: Record<string, unknown> = {
    harmonic_person_id: normalized.harmonicPersonId,
    harmonic_enriched_at: enrichedAt,
  };

  if (normalized.linkedinUrl) {
    update.linkedin_url = normalized.linkedinUrl;
  }
  if (!person.full_name && normalized.fullName) {
    update.full_name = normalized.fullName;
  }
  if (!person.current_role && normalized.currentRole) {
    update.current_role = normalized.currentRole;
  }
  if (!person.current_company && normalized.currentCompany) {
    update.current_company = normalized.currentCompany;
  }
  if (!person.location && normalized.location) {
    update.location = normalized.location;
  }
  if (!person.bio && normalized.bio) {
    update.bio = normalized.bio;
  }

  update.metadata = {
    ...(person.metadata || {}),
    harmonic_profile: {
      source: "harmonic",
      education: normalized.education,
      experience: normalized.experience,
      skills: normalized.skills,
      social_links: normalized.socialLinks,
      last_enriched_at: enrichedAt,
    },
  };

  return update;
}

async function handleHarmonicPersonEnrichment(
  auth: Awaited<ReturnType<typeof authenticateAiFundUser>>,
  body: SettingsRequestBody,
  currentRow: Awaited<ReturnType<typeof getUserSettingsRow>>,
): Promise<Response> {
  if (!body.personId) {
    return errorJson("Missing personId", "missing_person_id", 400);
  }

  const person = await getOwnedPerson(auth.userClient, auth.userId, body.personId);
  const linkedinUrl = normalizeLinkedInUrl(body.linkedinUrl || person.linkedin_url);

  if (!linkedinUrl) {
    return errorJson("Missing LinkedIn URL", "missing_linkedin_url", 400);
  }

  const harmonicOverride = {
    apiKey: getProviderApiKey(currentRow, "harmonic"),
    baseUrl: getHarmonicBaseUrl(currentRow),
  };

  if (!harmonicOverride.apiKey) {
    return errorJson("Missing Harmonic API key", "missing_harmonic_configuration", 400);
  }

  let personRaw: Record<string, unknown>;
  try {
    personRaw = await enrichPersonByLinkedIn(linkedinUrl, harmonicOverride);
  } catch (error) {
    const status = (error as Error & { status?: number }).status;
    if (status === 404) {
      return json({
        notFound: true,
        personId: body.personId,
        person: null,
        externalProfile: null,
        companyCacheRow: null,
      });
    }
    throw error;
  }

  const normalizedPerson = normalizeHarmonicPerson(personRaw);
  const personUpdate = buildPersonUpdate(person, normalizedPerson);

  const { data: updatedPerson, error: updateError } = await auth.serviceClient
    .from("aifund_people")
    .update(personUpdate)
    .eq("id", body.personId)
    .eq("user_id", auth.userId)
    .select("*")
    .single();

  if (updateError) {
    throw updateError;
  }

  let companyCacheRow: Record<string, unknown> | null = null;
  const companyUrn = normalizedPerson.companyUrns[0];
  if (companyUrn) {
    const cached = await getFreshCompanyCache(auth.serviceClient, auth.userId, companyUrn);
    if (cached) {
      companyCacheRow = cached;
    } else {
      try {
        const companies = await getCompaniesByUrns([companyUrn], [], harmonicOverride);
        const rawCompany = companies[0];
        if (rawCompany) {
          const normalizedCompany = normalizeHarmonicCompany(rawCompany);
          const { data } = await auth.serviceClient
            .from("aifund_harmonic_companies")
            .upsert({
              user_id: auth.userId,
              harmonic_company_id: normalizedCompany.harmonicCompanyId,
              name: normalizedCompany.name,
              domain: normalizedCompany.domain,
              linkedin_url: normalizedCompany.linkedinUrl,
              website_url: normalizedCompany.websiteUrl,
              location: normalizedCompany.location,
              funding_stage: normalizedCompany.fundingStage,
              funding_total: normalizedCompany.fundingTotal,
              last_funding_date: normalizedCompany.lastFundingDate,
              last_funding_total: normalizedCompany.lastFundingTotal,
              headcount: normalizedCompany.headcount,
              headcount_growth_30d: normalizedCompany.headcountGrowth30d,
              headcount_growth_90d: normalizedCompany.headcountGrowth90d,
              tags: normalizedCompany.tags,
              founders: normalizedCompany.founders,
              raw_payload: normalizedCompany.rawPayload,
              fetched_at: normalizedCompany.fetchedAt,
              updated_at: new Date().toISOString(),
            }, {
              onConflict: "user_id,harmonic_company_id",
            })
            .select("*")
            .single();
          companyCacheRow = (data as Record<string, unknown> | null) ?? null;
        }
      } catch (error) {
        console.error("Failed to cache Harmonic company:", error);
      }
    }
  }

  const normalizedLinkedInUrl = normalizedPerson.linkedinUrl || linkedinUrl;
  const externalProfilePayload = {
    person_id: body.personId,
    platform: "harmonic",
    profile_url: normalizedLinkedInUrl,
    profile_data: {
      harmonicPersonId: normalizedPerson.harmonicPersonId,
      fullName: normalizedPerson.fullName,
      linkedinUrl: normalizedLinkedInUrl,
      currentRole: normalizedPerson.currentRole,
      currentCompany: normalizedPerson.currentCompany,
      location: normalizedPerson.location,
      bio: normalizedPerson.bio,
      education: normalizedPerson.education,
      experience: normalizedPerson.experience,
      skills: normalizedPerson.skills,
      socialLinks: normalizedPerson.socialLinks,
      rawPayload: normalizedPerson.rawPayload,
    },
    fetched_at: new Date().toISOString(),
  };

  const { data: existingProfile } = await auth.serviceClient
    .from("aifund_external_profiles")
    .select("*")
    .eq("person_id", body.personId)
    .eq("platform", "harmonic")
    .eq("profile_url", normalizedLinkedInUrl)
    .limit(1)
    .maybeSingle();

  const profileMutation = existingProfile
    ? auth.serviceClient
      .from("aifund_external_profiles")
      .update(externalProfilePayload)
      .eq("id", existingProfile.id)
    : auth.serviceClient
      .from("aifund_external_profiles")
      .insert(externalProfilePayload);

  const { data: externalProfile, error: profileError } = await profileMutation
    .select("*")
    .single();

  if (profileError) {
    throw profileError;
  }

  return json({
    person: updatedPerson,
    externalProfile,
    companyCacheRow,
  });
}

async function testExaIntegration(
  settingsRow: ReturnType<typeof buildEphemeralSettingsRow>,
): Promise<IntegrationTestResult> {
  const apiKey = getProviderApiKey(settingsRow, "exa");
  if (!apiKey) {
    return {
      provider: "exa",
      ok: false,
      checkedAt: new Date().toISOString(),
      message: "Missing Exa API key",
      metadata: {
        source: getProviderSource(settingsRow, "exa"),
      },
    };
  }

  const response = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      query: "artificial intelligence founders",
      type: "auto",
      numResults: 1,
    }),
  });

  if (!response.ok) {
    throw new Error(`Exa test failed: ${response.status} ${await response.text()}`);
  }

  const payload = await response.json() as { results?: unknown[] };
  return {
    provider: "exa",
    ok: true,
    checkedAt: new Date().toISOString(),
    message: "Exa responded successfully",
    metadata: {
      source: getProviderSource(settingsRow, "exa"),
      resultCount: Array.isArray(payload.results) ? payload.results.length : 0,
    },
  };
}

async function testGitHubIntegration(
  settingsRow: ReturnType<typeof buildEphemeralSettingsRow>,
): Promise<IntegrationTestResult> {
  const apiKey = getProviderApiKey(settingsRow, "github");
  if (!apiKey) {
    return {
      provider: "github",
      ok: false,
      checkedAt: new Date().toISOString(),
      message: "Missing GitHub token",
      metadata: {
        source: getProviderSource(settingsRow, "github"),
      },
    };
  }

  const response = await fetch("https://api.github.com/user", {
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${apiKey}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub test failed: ${response.status} ${await response.text()}`);
  }

  const payload = await response.json() as { login?: unknown };
  return {
    provider: "github",
    ok: true,
    checkedAt: new Date().toISOString(),
    message: "GitHub token is valid",
    metadata: {
      source: getProviderSource(settingsRow, "github"),
      login: asString(payload.login),
    },
  };
}

async function testParallelIntegration(
  settingsRow: ReturnType<typeof buildEphemeralSettingsRow>,
): Promise<IntegrationTestResult> {
  const apiKey = getProviderApiKey(settingsRow, "parallel");
  if (!apiKey) {
    return {
      provider: "parallel",
      ok: false,
      checkedAt: new Date().toISOString(),
      message: "Missing Parallel API key",
      metadata: {
        source: getProviderSource(settingsRow, "parallel"),
      },
    };
  }

  const response = await fetch("https://api.parallel.ai/v1beta/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "parallel-beta": "search-extract-2025-10-10",
    },
    body: JSON.stringify({
      objective: "artificial intelligence founders",
      mode: "one-shot",
      max_results: 1,
    }),
  });

  if (!response.ok) {
    throw new Error(`Parallel test failed: ${response.status} ${await response.text()}`);
  }

  const payload = await response.json() as { results?: unknown[] };
  return {
    provider: "parallel",
    ok: true,
    checkedAt: new Date().toISOString(),
    message: "Parallel responded successfully",
    metadata: {
      source: getProviderSource(settingsRow, "parallel"),
      resultCount: Array.isArray(payload.results) ? payload.results.length : 0,
    },
  };
}

async function testAnthropicIntegration(
  settingsRow: ReturnType<typeof buildEphemeralSettingsRow>,
): Promise<IntegrationTestResult> {
  const apiKey = getProviderApiKey(settingsRow, "anthropic");
  if (!apiKey) {
    return {
      provider: "anthropic",
      ok: false,
      checkedAt: new Date().toISOString(),
      message: "Missing Claude API key",
      metadata: {
        source: getProviderSource(settingsRow, "anthropic"),
      },
    };
  }

  const response = await fetch("https://api.anthropic.com/v1/models", {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
  });

  if (!response.ok) {
    throw new Error(`Claude test failed: ${response.status} ${await response.text()}`);
  }

  const payload = await response.json() as { data?: unknown[] };
  return {
    provider: "anthropic",
    ok: true,
    checkedAt: new Date().toISOString(),
    message: "Claude responded successfully",
    metadata: {
      source: getProviderSource(settingsRow, "anthropic"),
      model: getAnthropicModel(settingsRow),
      modelCount: Array.isArray(payload.data) ? payload.data.length : 0,
    },
  };
}

async function runIntegrationTest(
  provider: ProviderKey,
  settingsRow: ReturnType<typeof buildEphemeralSettingsRow>,
): Promise<IntegrationTestResult> {
  switch (provider) {
    case "harmonic":
      return await testHarmonicIntegration(settingsRow);
    case "exa":
      return await testExaIntegration(settingsRow);
    case "github":
      return await testGitHubIntegration(settingsRow);
    case "parallel":
      return await testParallelIntegration(settingsRow);
    case "anthropic":
      return await testAnthropicIntegration(settingsRow);
  }
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (request.method !== "POST" && request.method !== "GET") {
    return errorJson("Method not allowed", "method_not_allowed", 405);
  }

  try {
    const auth = await authenticateAiFundUser(request);
    const body = request.method === "POST"
      ? await request.json().catch(() => ({})) as SettingsRequestBody
      : { action: "get" } satisfies SettingsRequestBody;
    const action = body.action || "get";

    const currentRow = await getUserSettingsRow(auth.serviceClient, auth.userId);

    if (action === "get") {
      return json(buildPublicAiFundSettings(currentRow));
    }

    if (action === "harmonic_enrich_person") {
      return await handleHarmonicPersonEnrichment(auth, body, currentRow);
    }

    const integrationUpdates = asRecord(body.integrations);
    const {
      providerSecrets: currentSecrets,
      providerPreferences: currentPreferences,
    } = buildUpdatedProviderState(currentRow, integrationUpdates);

    if (action === "test") {
      if (!body.provider || !PROVIDER_KEYS.includes(body.provider)) {
        return errorJson("Missing provider", "missing_provider", 400);
      }

      const effectiveSettingsRow = buildEphemeralSettingsRow(
        auth.userId,
        currentRow,
        currentSecrets,
        currentPreferences,
      );

      try {
        const result = await runIntegrationTest(body.provider, effectiveSettingsRow);
        return json(result);
      } catch (testError) {
        const message = testError instanceof Error ? testError.message : "Unknown integration test error";
        return json({
          provider: body.provider,
          ok: false,
          checkedAt: new Date().toISOString(),
          message,
          metadata: {
            source: getProviderSource(effectiveSettingsRow, body.provider),
          },
        } satisfies IntegrationTestResult);
      }
    }

    const sourcingChannels = body.sourcingChannels !== undefined
      ? mergeSourcingChannels(body.sourcingChannels)
      : mergeSourcingChannels(currentRow?.sourcing_channels);
    const evaluationCriteria = mergeEvaluationCriteria(currentRow?.evaluation_criteria);
    const updatedAt = new Date().toISOString();

    const { data, error } = await auth.serviceClient
      .from("aifund_user_settings")
      .upsert({
        user_id: auth.userId,
        provider_secrets: currentSecrets,
        provider_preferences: currentPreferences,
        sourcing_channels: sourcingChannels,
        evaluation_criteria: evaluationCriteria,
        updated_at: updatedAt,
      }, {
        onConflict: "user_id",
      })
      .select("id, user_id, provider_secrets, provider_preferences, sourcing_channels, evaluation_criteria, updated_at")
      .single();

    if (error) {
      throw error;
    }

    return json(buildPublicAiFundSettings(data));
  } catch (error) {
    console.error("aifund-settings failed:", error);

    if (error instanceof AuthGuardError) {
      return errorJson(error.message, error.code, error.status);
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    return errorJson(message, "aifund_settings_failed", 500);
  }
});
