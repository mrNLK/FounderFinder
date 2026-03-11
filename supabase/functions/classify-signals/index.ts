/**
 * Classify Signals Edge Function
 *
 * Uses the Hugging Face zero-shot classification API (facebook/bart-large-mnli)
 * to classify raw signal text strings into EEA tier categories that the
 * regex-based scorer may miss.
 */

import { authenticateAiFundUser, AuthGuardError } from "../_shared/auth-guard.ts";
import { getProviderApiKey, getUserSettingsRow } from "../_shared/aifund-settings.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ClassifyRequestBody {
  signals: string[];
}

interface SignalClassification {
  signal: string;
  label: string;
  score: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ZERO_SHOT_MODEL = "facebook/bart-large-mnli";
const ZERO_SHOT_URL = `https://api-inference.huggingface.co/models/${ZERO_SHOT_MODEL}`;
const SCORE_THRESHOLD = 0.5;

const CANDIDATE_LABELS = [
  "tier1_competition",
  "tier1_fellowship",
  "tier1_publication",
  "tier1_accelerator",
  "tier1_exit",
  "tier1_lab",
  "tier2_conference",
  "tier2_competition",
  "tier2_fellowship",
  "tier2_startup",
  "tier2_hackathon",
  "tier2_open_source",
  "not_relevant",
];

const corsHeaders: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// HF Zero-Shot Classification
// ---------------------------------------------------------------------------

interface HFZeroShotResponse {
  sequence: string;
  labels: string[];
  scores: number[];
}

async function classifySignal(
  signalText: string,
  apiKey: string,
): Promise<SignalClassification | null> {
  const response = await fetch(ZERO_SHOT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inputs: signalText,
      parameters: { candidate_labels: CANDIDATE_LABELS },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`HF zero-shot API error ${response.status}: ${body}`);
  }

  const data = (await response.json()) as HFZeroShotResponse;

  // The top label is at index 0 (HF returns sorted by score descending)
  const topLabel = data.labels[0];
  const topScore = data.scores[0];

  // Filter out low-confidence results and "not_relevant"
  if (topScore < SCORE_THRESHOLD || topLabel === "not_relevant") {
    return null;
  }

  return {
    signal: signalText,
    label: topLabel,
    score: Math.round(topScore * 1000) / 1000,
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return errorJson("Method not allowed", "method_not_allowed", 405);
  }

  try {
    const auth = await authenticateAiFundUser(request);
    const body = (await request.json()) as ClassifyRequestBody;

    if (!body.signals || !Array.isArray(body.signals) || body.signals.length === 0) {
      return errorJson("Missing or empty signals array", "invalid_request", 400);
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

    // Classify each signal in parallel
    const results = await Promise.all(
      body.signals.map((signal) => classifySignal(signal, apiKey)),
    );

    // Filter out nulls (below threshold or not_relevant)
    const classifications: SignalClassification[] = results.filter(
      (r): r is SignalClassification => r !== null,
    );

    return json({ classifications });
  } catch (error) {
    console.error("classify-signals failed:", error);

    if (error instanceof AuthGuardError) {
      return errorJson(error.message, error.code, error.status);
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    return errorJson(message, "classify_signals_failed", 500);
  }
});
