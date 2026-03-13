import { type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

export const PROVIDER_KEYS = ["harmonic", "exa", "github", "parallel", "anthropic", "huggingface", "lever"] as const;
export type ProviderKey = typeof PROVIDER_KEYS[number];

export type ProviderSource = "saved" | "project_env" | "missing";

export interface StoredProviderSecret {
  apiKey: string | null;
}

export interface StoredProviderPreferences {
  harmonic?: {
    baseUrl?: string | null;
  };
  anthropic?: {
    model?: string | null;
  };
  huggingface?: {
    model?: string | null;
  };
}

export interface SourcingChannelConfig {
  id: string;
  label: string;
  provider: "exa" | "parallel" | "github";
  enabled: boolean;
  description: string;
  queryTemplate: string;
  domains: string[];
}

export interface EvaluationCriterionConfig {
  id: "aiExcellence" | "technicalAbility" | "productInstinct" | "leadershipPotential";
  label: string;
  description: string;
  weight: number;
}

export interface UserSettingsRow {
  id: string;
  user_id: string;
  provider_secrets: Record<string, unknown> | null;
  provider_preferences: Record<string, unknown> | null;
  sourcing_channels: unknown[] | null;
  evaluation_criteria: unknown[] | null;
  updated_at: string;
}

export interface PublicIntegrationConfig {
  provider: ProviderKey;
  label: string;
  configured: boolean;
  source: ProviderSource;
  maskedKey: string | null;
  baseUrl?: string | null;
  model?: string | null;
}

export interface PublicAiFundSettings {
  integrations: Record<ProviderKey, PublicIntegrationConfig>;
  sourcingChannels: SourcingChannelConfig[];
  evaluationCriteria: EvaluationCriterionConfig[];
  updatedAt: string | null;
}

const DEFAULT_HARMONIC_BASE_URL = "https://api.harmonic.ai";

export const DEFAULT_SOURCING_CHANNELS: SourcingChannelConfig[] = [
  {
    id: "huggingface_spaces",
    label: "Hugging Face Spaces",
    provider: "exa",
    enabled: true,
    description: "Builders shipping public AI demos and tools.",
    queryTemplate: 'site:huggingface.co/spaces {{query}} ("founder" OR "creator" OR "team")',
    domains: ["huggingface.co"],
  },
  {
    id: "arxiv_applied_ai",
    label: "arXiv (applied AI)",
    provider: "exa",
    enabled: true,
    description: "Researchers publishing applied AI work.",
    queryTemplate: 'site:arxiv.org {{query}} ("applied ai" OR "machine learning")',
    domains: ["arxiv.org"],
  },
  {
    id: "conference_rosters",
    label: "Conference Rosters",
    provider: "parallel",
    enabled: false,
    description: "Speakers, organizers, and featured founders from AI events.",
    queryTemplate: "{{query}} AI conference speaker roster founders researchers",
    domains: [],
  },
  {
    id: "yc_alumni",
    label: "YC Alumni",
    provider: "exa",
    enabled: true,
    description: "YC-backed founders and operators.",
    queryTemplate: 'site:ycombinator.com/companies {{query}}',
    domains: ["ycombinator.com"],
  },
  {
    id: "built_in_public",
    label: "Built in Public",
    provider: "exa",
    enabled: false,
    description: "People building publicly and sharing progress.",
    queryTemplate: '{{query}} "built in public" founder operator',
    domains: [],
  },
  {
    id: "open_source_maintainers",
    label: "Open-source Maintainers",
    provider: "github",
    enabled: true,
    description: "Developers with visible GitHub execution and shipped code.",
    queryTemplate: "{{query}} language:TypeScript followers:>10 repos:>3",
    domains: [],
  },
];

export const DEFAULT_EVALUATION_CRITERIA: EvaluationCriterionConfig[] = [
  {
    id: "aiExcellence",
    label: "AI Excellence",
    description: "Technical depth, model quality, and research signal.",
    weight: 40,
  },
  {
    id: "technicalAbility",
    label: "Technical Ability",
    description: "Speed, engineering range, and delivery capability.",
    weight: 25,
  },
  {
    id: "productInstinct",
    label: "Product Instinct",
    description: "Taste, market judgment, and customer understanding.",
    weight: 20,
  },
  {
    id: "leadershipPotential",
    label: "Leadership Potential",
    description: "Founder energy, recruiting pull, and decision quality.",
    weight: 15,
  },
];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item: unknown) => asString(item))
    .filter((item: string | null): item is string => item !== null);
}

export function maskSecret(secret: string | null): string | null {
  if (!secret) {
    return null;
  }

  if (secret.length <= 8) {
    return `${secret.slice(0, 2)}...${secret.slice(-2)}`;
  }

  return `${secret.slice(0, 4)}...${secret.slice(-4)}`;
}

export function getStoredProviderSecrets(row: UserSettingsRow | null): Partial<Record<ProviderKey, StoredProviderSecret>> {
  const secrets = asRecord(row?.provider_secrets);
  const result: Partial<Record<ProviderKey, StoredProviderSecret>> = {};

  for (const provider of PROVIDER_KEYS) {
    const config = asRecord(secrets[provider]);
    const apiKey = asString(config.apiKey);
    if (apiKey) {
      result[provider] = { apiKey };
    }
  }

  return result;
}

export function getStoredProviderPreferences(row: UserSettingsRow | null): StoredProviderPreferences {
  const preferences = asRecord(row?.provider_preferences);

  return {
    harmonic: {
      baseUrl: asString(asRecord(preferences.harmonic).baseUrl),
    },
    anthropic: {
      model: asString(asRecord(preferences.anthropic).model),
    },
    huggingface: {
      model: asString(asRecord(preferences.huggingface).model),
    },
  };
}

function getEnvApiKey(provider: ProviderKey): string | null {
  switch (provider) {
    case "harmonic":
      return asString(Deno.env.get("HARMONIC_API_KEY"));
    case "exa":
      return asString(Deno.env.get("EXA_API_KEY"));
    case "github":
      return asString(Deno.env.get("GITHUB_TOKEN")) || asString(Deno.env.get("GITHUB_API_KEY"));
    case "parallel":
      return asString(Deno.env.get("PARALLEL_API_KEY"));
    case "anthropic":
      return asString(Deno.env.get("ANTHROPIC_API_KEY"));
    case "huggingface":
      return asString(Deno.env.get("HUGGINGFACE_API_KEY")) || asString(Deno.env.get("HF_TOKEN"));
    case "lever":
      return asString(Deno.env.get("LEVER_API_KEY"));
  }
}

export function getProviderApiKey(
  row: UserSettingsRow | null,
  provider: ProviderKey,
): string | null {
  const stored = getStoredProviderSecrets(row)[provider]?.apiKey || null;
  return stored || getEnvApiKey(provider);
}

export function getProviderSource(
  row: UserSettingsRow | null,
  provider: ProviderKey,
): ProviderSource {
  const stored = getStoredProviderSecrets(row)[provider]?.apiKey || null;
  if (stored) {
    return "saved";
  }

  return getEnvApiKey(provider) ? "project_env" : "missing";
}

export function getHarmonicBaseUrl(row: UserSettingsRow | null): string {
  const stored = getStoredProviderPreferences(row).harmonic?.baseUrl || null;
  return stored || asString(Deno.env.get("HARMONIC_BASE_URL")) || DEFAULT_HARMONIC_BASE_URL;
}

export function getAnthropicModel(row: UserSettingsRow | null): string | null {
  return getStoredProviderPreferences(row).anthropic?.model ||
    asString(Deno.env.get("ANTHROPIC_MODEL"));
}

export const DEFAULT_HF_EMBEDDING_MODEL = "BAAI/bge-small-en-v1.5";

export function getHuggingFaceModel(row: UserSettingsRow | null): string {
  return getStoredProviderPreferences(row).huggingface?.model ||
    asString(Deno.env.get("HF_EMBEDDING_MODEL")) ||
    DEFAULT_HF_EMBEDDING_MODEL;
}

export function mergeSourcingChannels(value: unknown): SourcingChannelConfig[] {
  const input = Array.isArray(value) ? value : [];
  const overrides = new Map<string, Record<string, unknown>>();

  for (const item of input) {
    const record = asRecord(item);
    const id = asString(record.id);
    if (id) {
      overrides.set(id, record);
    }
  }

  return DEFAULT_SOURCING_CHANNELS.map((channel: SourcingChannelConfig) => {
    const override = overrides.get(channel.id);
    if (!override) {
      return channel;
    }

    const provider = asString(override.provider);
    const nextProvider = provider === "exa" || provider === "parallel" || provider === "github"
      ? provider
      : channel.provider;

    return {
      ...channel,
      provider: nextProvider,
      enabled: asBoolean(override.enabled, channel.enabled),
      description: asString(override.description) || channel.description,
      queryTemplate: asString(override.queryTemplate) || channel.queryTemplate,
      domains: asStringArray(override.domains),
    };
  });
}

export function mergeEvaluationCriteria(value: unknown): EvaluationCriterionConfig[] {
  const input = Array.isArray(value) ? value : [];
  const overrides = new Map<string, Record<string, unknown>>();

  for (const item of input) {
    const record = asRecord(item);
    const id = asString(record.id);
    if (id) {
      overrides.set(id, record);
    }
  }

  return DEFAULT_EVALUATION_CRITERIA.map((criterion: EvaluationCriterionConfig) => {
    const override = overrides.get(criterion.id);
    if (!override) {
      return criterion;
    }

    return {
      ...criterion,
      label: asString(override.label) || criterion.label,
      description: asString(override.description) || criterion.description,
      weight: asNumber(override.weight, criterion.weight),
    };
  });
}

export function buildPublicAiFundSettings(row: UserSettingsRow | null): PublicAiFundSettings {
  const integrations = {} as Record<ProviderKey, PublicIntegrationConfig>;

  const labels: Record<ProviderKey, string> = {
    harmonic: "Harmonic",
    exa: "Exa",
    github: "GitHub",
    parallel: "Parallel",
    anthropic: "Claude",
    huggingface: "Hugging Face",
    lever: "Lever",
  };

  for (const provider of PROVIDER_KEYS) {
    integrations[provider] = {
      provider,
      label: labels[provider],
      configured: Boolean(getProviderApiKey(row, provider)),
      source: getProviderSource(row, provider),
      maskedKey: maskSecret(getProviderApiKey(row, provider)),
    };
  }

  integrations.harmonic.baseUrl = getHarmonicBaseUrl(row);
  integrations.anthropic.model = getAnthropicModel(row);
  integrations.huggingface.model = getHuggingFaceModel(row);

  return {
    integrations,
    sourcingChannels: mergeSourcingChannels(row?.sourcing_channels),
    evaluationCriteria: mergeEvaluationCriteria(row?.evaluation_criteria),
    updatedAt: row?.updated_at || null,
  };
}

export async function getUserSettingsRow(
  serviceClient: SupabaseClient,
  userId: string,
): Promise<UserSettingsRow | null> {
  const { data, error } = await serviceClient
    .from("aifund_user_settings")
    .select("id, user_id, provider_secrets, provider_preferences, sourcing_channels, evaluation_criteria, updated_at")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as UserSettingsRow | null) ?? null;
}
