/**
 * Extract Entities Edge Function
 *
 * Uses the Hugging Face Inference API (dslim/bert-base-NER) to perform
 * Named Entity Recognition on enrichment text, extracting structured
 * entities (ORG, PER, LOC, MISC) to improve signal quality.
 */

import { authenticateAiFundUser, AuthGuardError } from "../_shared/auth-guard.ts";
import { getProviderApiKey, getUserSettingsRow } from "../_shared/aifund-settings.ts";

const NER_MODEL = "dslim/bert-base-NER";

interface ExtractEntitiesRequestBody {
  texts: string[];
}

interface HFTokenClassificationResult {
  entity_group: string;
  word: string;
  score: number;
  start: number;
  end: number;
}

interface ExtractedEntities {
  text: string;
  organizations: string[];
  persons: string[];
  locations: string[];
  miscellaneous: string[];
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
  return json({ error: { message, code } }, { status });
}

async function classifyTokens(
  text: string,
  apiKey: string,
): Promise<HFTokenClassificationResult[]> {
  const response = await fetch(
    `https://api-inference.huggingface.co/models/${NER_MODEL}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inputs: text }),
    },
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`HF Inference API error ${response.status}: ${body}`);
  }

  const data: unknown = await response.json();

  if (!Array.isArray(data)) {
    throw new Error("Unexpected HF token classification response shape");
  }

  return data as HFTokenClassificationResult[];
}

function aggregateEntities(
  text: string,
  results: HFTokenClassificationResult[],
): ExtractedEntities {
  const orgSet = new Set<string>();
  const perSet = new Set<string>();
  const locSet = new Set<string>();
  const miscSet = new Set<string>();

  for (const result of results) {
    const word = result.word.trim();
    if (!word) continue;

    switch (result.entity_group) {
      case "ORG":
        orgSet.add(word);
        break;
      case "PER":
        perSet.add(word);
        break;
      case "LOC":
        locSet.add(word);
        break;
      case "MISC":
        miscSet.add(word);
        break;
    }
  }

  return {
    text,
    organizations: Array.from(orgSet),
    persons: Array.from(perSet),
    locations: Array.from(locSet),
    miscellaneous: Array.from(miscSet),
  };
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return errorJson("Method not allowed", "method_not_allowed", 405);
  }

  try {
    const auth = await authenticateAiFundUser(request);
    const body = (await request.json()) as ExtractEntitiesRequestBody;

    if (!body.texts || !Array.isArray(body.texts) || body.texts.length === 0) {
      return errorJson("Missing or empty texts array", "invalid_request", 400);
    }

    const settingsRow = await getUserSettingsRow(auth.serviceClient, auth.userId);
    const apiKey = getProviderApiKey(settingsRow, "huggingface");

    if (!apiKey) {
      return errorJson(
        "Missing Hugging Face API token. Add one in Settings.",
        "missing_hf_token",
        400,
      );
    }

    const entities: ExtractedEntities[] = [];

    for (const text of body.texts) {
      if (!text || typeof text !== "string") {
        entities.push({
          text: text ?? "",
          organizations: [],
          persons: [],
          locations: [],
          miscellaneous: [],
        });
        continue;
      }

      const results = await classifyTokens(text, apiKey);
      entities.push(aggregateEntities(text, results));
    }

    return json({ entities });
  } catch (error) {
    console.error("extract-entities failed:", error);

    if (error instanceof AuthGuardError) {
      return errorJson(error.message, error.code, error.status);
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    return errorJson(message, "extract_entities_failed", 500);
  }
});
