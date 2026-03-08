import { supabase } from "@/integrations/supabase/client";
import type {
  AiFundAppSettings,
  AiFundSettingsUpdate,
  AiFundIntelligenceRun,
  AiFundIntelligenceRunRow,
  AiFundHarmonicIntelligenceSummary,
  AiFundProviderIntelligenceSummary,
  IntegrationProvider,
} from "@/types/ai-fund";
import { intelligenceRunFromRow } from "@/types/ai-fund";

interface SettingsFunctionErrorPayload {
  error?: {
    message?: string;
    code?: string;
  };
}

interface RunIntelligenceResponse {
  run: AiFundIntelligenceRun;
  resultsSummary: AiFundHarmonicIntelligenceSummary | AiFundProviderIntelligenceSummary;
}

const INTEGRATION_LABELS: Record<IntegrationProvider, string> = {
  harmonic: "Harmonic",
  exa: "Exa",
  github: "GitHub",
  parallel: "Parallel",
  anthropic: "Claude",
};

export function createDefaultAiFundSettings(): AiFundAppSettings {
  return {
    integrations: {
      harmonic: {
        provider: "harmonic",
        label: INTEGRATION_LABELS.harmonic,
        configured: false,
        source: "missing",
        maskedKey: null,
        baseUrl: "https://api.harmonic.ai/api/v4_0",
      },
      exa: {
        provider: "exa",
        label: INTEGRATION_LABELS.exa,
        configured: false,
        source: "missing",
        maskedKey: null,
      },
      github: {
        provider: "github",
        label: INTEGRATION_LABELS.github,
        configured: false,
        source: "missing",
        maskedKey: null,
      },
      parallel: {
        provider: "parallel",
        label: INTEGRATION_LABELS.parallel,
        configured: false,
        source: "missing",
        maskedKey: null,
      },
      anthropic: {
        provider: "anthropic",
        label: INTEGRATION_LABELS.anthropic,
        configured: false,
        source: "missing",
        maskedKey: null,
        model: null,
      },
    },
    sourcingChannels: [
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
        queryTemplate: "site:ycombinator.com/companies {{query}}",
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
    ],
    evaluationCriteria: [
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
    ],
    updatedAt: null,
  };
}

async function extractFunctionErrorMessage(error: unknown): Promise<string> {
  const defaultMessage = error instanceof Error ? error.message : "Unknown settings error";
  const response = (error as { context?: Response } | null)?.context;

  if (!response) {
    return defaultMessage;
  }

  try {
    const payload = await response.json() as SettingsFunctionErrorPayload;
    return payload.error?.message || defaultMessage;
  } catch {
    try {
      return await response.text();
    } catch {
      return defaultMessage;
    }
  }
}

export async function fetchAiFundSettings(): Promise<AiFundAppSettings> {
  const { data, error } = await supabase.functions.invoke("aifund-settings", {
    body: {
      action: "get",
    },
  });

  if (error) {
    throw new Error(await extractFunctionErrorMessage(error));
  }

  return (data as AiFundAppSettings) || createDefaultAiFundSettings();
}

export async function updateAiFundSettings(
  updates: AiFundSettingsUpdate,
): Promise<AiFundAppSettings> {
  const { data, error } = await supabase.functions.invoke("aifund-settings", {
    body: {
      action: "update",
      ...updates,
    },
  });

  if (error) {
    throw new Error(await extractFunctionErrorMessage(error));
  }

  return data as AiFundAppSettings;
}

export async function runAiFundIntelligence(input: {
  runId: string;
  query: string;
  conceptId?: string | null;
  limit?: number;
  channelIds?: string[];
}): Promise<RunIntelligenceResponse> {
  const { data, error } = await supabase.functions.invoke("aifund-intelligence", {
    body: input,
  });

  if (error) {
    throw new Error(await extractFunctionErrorMessage(error));
  }

  const payload = data as {
    run: AiFundIntelligenceRunRow;
    resultsSummary: AiFundHarmonicIntelligenceSummary | AiFundProviderIntelligenceSummary;
  };

  return {
    run: intelligenceRunFromRow(payload.run),
    resultsSummary: payload.resultsSummary,
  };
}
