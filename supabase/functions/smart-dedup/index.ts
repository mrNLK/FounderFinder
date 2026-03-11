/**
 * Smart Dedup Edge Function
 *
 * Uses the Hugging Face Inference API to compute embeddings for candidates
 * and returns groups of near-duplicates based on cosine similarity.
 */

import { authenticateAiFundUser, AuthGuardError } from "../_shared/auth-guard.ts";
import {
  getHuggingFaceModel,
  getProviderApiKey,
  getUserSettingsRow,
} from "../_shared/aifund-settings.ts";

interface DedupCandidate {
  id: string;
  name: string;
  company: string;
  title: string;
  location: string;
}

interface DedupRequestBody {
  candidates: DedupCandidate[];
}

interface DuplicateGroup {
  ids: string[];
  similarity: number;
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

function buildEmbeddingText(candidate: DedupCandidate): string {
  const parts = [
    candidate.name,
    candidate.company,
    candidate.title,
    candidate.location,
  ].filter(Boolean);
  return parts.join(". ").slice(0, 512);
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

const SIMILARITY_THRESHOLD = 0.92;

/**
 * Find groups of near-duplicate candidates using pairwise cosine similarity.
 * Uses Union-Find to merge transitive duplicates into single groups.
 */
function findDuplicateGroups(
  candidates: DedupCandidate[],
  embeddings: number[][],
): DuplicateGroup[] {
  const n = candidates.length;

  // Union-Find data structure
  const parent = Array.from({ length: n }, (_, i) => i);
  const rank = new Array(n).fill(0);

  function find(x: number): number {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]]; // path compression
      x = parent[x];
    }
    return x;
  }

  function union(x: number, y: number): void {
    const rootX = find(x);
    const rootY = find(y);
    if (rootX === rootY) return;
    if (rank[rootX] < rank[rootY]) {
      parent[rootX] = rootY;
    } else if (rank[rootX] > rank[rootY]) {
      parent[rootY] = rootX;
    } else {
      parent[rootY] = rootX;
      rank[rootX]++;
    }
  }

  // Track the highest similarity for each pair that gets merged
  const pairSimilarities: Map<string, number> = new Map();

  // Compute pairwise cosine similarity
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const sim = cosineSimilarity(embeddings[i], embeddings[j]);
      if (sim >= SIMILARITY_THRESHOLD) {
        union(i, j);
        const key = `${Math.min(i, j)}-${Math.max(i, j)}`;
        pairSimilarities.set(key, sim);
      }
    }
  }

  // Collect groups
  const groups = new Map<number, { indices: number[]; maxSim: number }>();

  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!groups.has(root)) {
      groups.set(root, { indices: [], maxSim: 0 });
    }
    groups.get(root)!.indices.push(i);
  }

  const result: DuplicateGroup[] = [];

  for (const group of groups.values()) {
    // Only include groups with more than one member (actual duplicates)
    if (group.indices.length < 2) continue;

    // Find the minimum similarity among all pairs in the group
    let minSim = 1;
    for (let a = 0; a < group.indices.length; a++) {
      for (let b = a + 1; b < group.indices.length; b++) {
        const i = Math.min(group.indices[a], group.indices[b]);
        const j = Math.max(group.indices[a], group.indices[b]);
        const key = `${i}-${j}`;
        const sim = pairSimilarities.get(key) ??
          cosineSimilarity(embeddings[group.indices[a]], embeddings[group.indices[b]]);
        if (sim < minSim) {
          minSim = sim;
        }
      }
    }

    result.push({
      ids: group.indices.map((idx) => candidates[idx].id),
      similarity: Math.round(minSim * 1000) / 1000,
    });
  }

  return result;
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
    const body = (await request.json()) as DedupRequestBody;

    if (!body.candidates || !Array.isArray(body.candidates) || body.candidates.length === 0) {
      return errorJson("Missing or empty candidates array", "invalid_request", 400);
    }

    if (body.candidates.length < 2) {
      return json({ duplicateGroups: [] });
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

    // Build embedding texts for all candidates
    const texts = body.candidates.map(buildEmbeddingText);
    const embeddings = await computeEmbeddings(texts, apiKey, model);

    const duplicateGroups = findDuplicateGroups(body.candidates, embeddings);

    return json({ duplicateGroups });
  } catch (error) {
    console.error("smart-dedup failed:", error);

    if (error instanceof AuthGuardError) {
      return errorJson(error.message, error.code, error.status);
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    return errorJson(message, "smart_dedup_failed", 500);
  }
});
