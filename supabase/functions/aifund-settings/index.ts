import { authenticateAiFundUser, AuthGuardError } from "../_shared/auth-guard.ts";
import {
  buildPublicAiFundSettings,
  getStoredProviderPreferences,
  getStoredProviderSecrets,
  getUserSettingsRow,
  mergeEvaluationCriteria,
  mergeSourcingChannels,
  PROVIDER_KEYS,
  type ProviderKey,
} from "../_shared/aifund-settings.ts";

interface SettingsRequestBody {
  action?: "get" | "update";
  integrations?: Record<string, unknown>;
  sourcingChannels?: unknown[];
}

interface FunctionErrorBody {
  error: {
    message: string;
    code: string;
  };
}

function json(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
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

Deno.serve(async (request: Request): Promise<Response> => {
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

    const integrationUpdates = asRecord(body.integrations);
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
