/**
 * Semantic Match Edge Function
 *
 * Uses the Hugging Face Inference API to compute embeddings and
 * rank candidates against a concept by cosine similarity.
 */

import { authenticateAiFundUser, AuthGuardError } from "../_shared/auth-guard.ts";
import {
  getHuggingFaceModel,
  getProviderApiKey,
  getUserSettingsRow,
} from "../_shared/aifund-settings.ts";

interface MatchRequestBody {
  conceptId: string;
  concept: {
    name: string;
    description: string | null;
    thesis: string | null;
  };
  people: Array<{
    id: string;
    fullName: string | null;
    currentRole: string | null;
    currentCompany: string | null;
    bio: string | null;
    eeaSignals?: string | null;
  }>;
}

interface SemanticMatchScore {
  personId: string;
  similarity: number;
  label: "Strong" | "Moderate" | "Weak";
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

function buildText(parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(". ").slice(0, 512);
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

function similarityLabel(score: number): SemanticMatchScore["label"] {
  if (score >= 0.75) return "Strong";
  if (score >= 0.5) return "Moderate";
  return "Weak";
}

async function computeEmbeddings(
  texts: string[],
  apiKey: string,
  model: string,
): Promise<number[][]> {
  const response = await fetch(
    `https://api-inference.huggingface.co/models/${model}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inputs: texts }),
    },
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`HF Inference API error ${response.status}: ${body}`);
  }

  const data: unknown = await response.json();

  if (Array.isArray(data) && Array.isArray(data[0]) && typeof data[0][0] === "number") {
    return data as number[][];
  }

  throw new Error("Unexpected HF Inference API response shape");
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
    const body = (await request.json()) as MatchRequestBody;

    if (!body.concept || !body.people || body.people.length === 0) {
      return errorJson("Missing concept or people", "invalid_request", 400);
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

    const model = getHuggingFaceModel(settingsRow);

    // Build texts: concept first, then each person
    const conceptText = buildText([body.concept.name, body.concept.description, body.concept.thesis]);
    const personTexts = body.people.map((p) =>
      buildText([p.fullName, p.currentRole, p.currentCompany, p.bio, p.eeaSignals]),
    );

    const allTexts = [conceptText, ...personTexts];
    const embeddings = await computeEmbeddings(allTexts, apiKey, model);

    const conceptEmbedding = embeddings[0];
    const scores: SemanticMatchScore[] = body.people.map((person, i) => {
      const sim = cosineSimilarity(conceptEmbedding, embeddings[i + 1]);
      return {
        personId: person.id,
        similarity: Math.round(sim * 1000) / 1000,
        label: similarityLabel(sim),
      };
    });

    scores.sort((a, b) => b.similarity - a.similarity);

    return json({
      conceptId: body.conceptId,
      model,
      scores,
    });
  } catch (error) {
    console.error("semantic-match failed:", error);

    if (error instanceof AuthGuardError) {
      return errorJson(error.message, error.code, error.status);
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    return errorJson(message, "semantic_match_failed", 500);
  }
});
