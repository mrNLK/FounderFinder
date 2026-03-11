/**
 * Hugging Face Inference API — Embedding & Semantic Matching
 *
 * Uses the free Inference API to compute embeddings for
 * candidate-to-concept semantic matching on the Matching Board.
 * Also provides client wrappers for zero-shot signal classification
 * and named entity recognition.
 */

import { supabase } from "@/integrations/supabase/client";

const DEFAULT_MODEL = "BAAI/bge-small-en-v1.5";

// ---------------------------------------------------------------------------
// Named Entity Recognition types & client wrapper
// ---------------------------------------------------------------------------

export interface ExtractedEntities {
  text: string;
  organizations: string[];
  persons: string[];
  locations: string[];
  miscellaneous: string[];
}

/**
 * Extract named entities (ORG, PER, LOC, MISC) from free-text strings
 * using the extract-entities edge function (dslim/bert-base-NER).
 */
export async function extractEntities(
  texts: string[],
): Promise<ExtractedEntities[]> {
  if (texts.length === 0) return [];

  const { data, error } = await supabase.functions.invoke("extract-entities", {
    body: { texts },
  });

  if (error) {
    throw new Error(`extract-entities invocation failed: ${error.message}`);
  }

  return (data as { entities: ExtractedEntities[] }).entities;
}

// ---------------------------------------------------------------------------
// Signal Classification (via classify-signals edge function)
// ---------------------------------------------------------------------------

export type SignalClassification = {
  signal: string;
  label: string;
  score: number;
};

/**
 * Classify raw signal text strings using HF zero-shot classification.
 * Calls the `classify-signals` Supabase Edge Function which uses
 * facebook/bart-large-mnli under the hood.
 */
export async function classifySignals(
  signals: string[],
): Promise<SignalClassification[]> {
  if (signals.length === 0) return [];

  const { data, error } = await supabase.functions.invoke("classify-signals", {
    body: { signals },
  });

  if (error) {
    throw new Error(`classify-signals failed: ${error.message}`);
  }

  return (data as { classifications: SignalClassification[] }).classifications;
}

// ---------------------------------------------------------------------------
// Near-duplicate detection via smart-dedup edge function
// ---------------------------------------------------------------------------

export type DuplicateGroup = { ids: string[]; similarity: number };

/**
 * Call the smart-dedup edge function to find near-duplicate candidates
 * using HuggingFace embedding cosine similarity.
 *
 * Returns groups of candidate IDs that are near-duplicates (similarity >= 0.92).
 */
export async function findDuplicateCandidates(
  candidates: Array<{
    id: string;
    name: string;
    company: string;
    title: string;
    location: string;
  }>,
): Promise<DuplicateGroup[]> {
  if (candidates.length < 2) return [];

  const { data, error } = await supabase.functions.invoke("smart-dedup", {
    body: { candidates },
  });

  if (error) {
    throw new Error(`smart-dedup failed: ${error.message}`);
  }

  return (data as { duplicateGroups: DuplicateGroup[] }).duplicateGroups;
}

// ---------------------------------------------------------------------------
// Core: compute embeddings via HF Inference API
// ---------------------------------------------------------------------------

export async function computeEmbeddings(
  texts: string[],
  options: { apiKey: string; model?: string },
): Promise<number[][]> {
  const model = options.model || DEFAULT_MODEL;
  const response = await fetch(
    `https://api-inference.huggingface.co/models/${model}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
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

  // The API returns number[][] for multiple inputs
  if (Array.isArray(data) && Array.isArray(data[0]) && typeof data[0][0] === "number") {
    return data as number[][];
  }

  throw new Error("Unexpected HF Inference API response shape");
}

// ---------------------------------------------------------------------------
// Cosine similarity
// ---------------------------------------------------------------------------

export function cosineSimilarity(a: number[], b: number[]): number {
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

// ---------------------------------------------------------------------------
// Semantic match: rank candidates against a concept
// ---------------------------------------------------------------------------

export interface SemanticMatchScore {
  personId: string;
  similarity: number;
  label: "Strong" | "Moderate" | "Weak";
}

function similarityLabel(score: number): SemanticMatchScore["label"] {
  if (score >= 0.75) return "Strong";
  if (score >= 0.5) return "Moderate";
  return "Weak";
}

/**
 * Build a short text summary for a person to embed.
 * Combines name, role, company, and any EEA signals.
 */
export function buildPersonEmbeddingText(person: {
  fullName: string | null;
  currentRole: string | null;
  currentCompany: string | null;
  bio: string | null;
  eeaSignals?: string | null;
}): string {
  const parts = [
    person.fullName,
    person.currentRole,
    person.currentCompany,
    person.bio,
    person.eeaSignals,
  ].filter(Boolean);

  return parts.join(". ").slice(0, 512);
}

/**
 * Build embedding text for a concept/thesis.
 */
export function buildConceptEmbeddingText(concept: {
  name: string;
  description: string | null;
  thesis: string | null;
}): string {
  const parts = [concept.name, concept.description, concept.thesis].filter(Boolean);
  return parts.join(". ").slice(0, 512);
}

/**
 * Rank a list of people against a single concept.
 *
 * Returns scores sorted by similarity (descending).
 */
export async function rankCandidatesForConcept(
  concept: {
    name: string;
    description: string | null;
    thesis: string | null;
  },
  people: Array<{
    id: string;
    fullName: string | null;
    currentRole: string | null;
    currentCompany: string | null;
    bio: string | null;
    eeaSignals?: string | null;
  }>,
  options: { apiKey: string; model?: string },
): Promise<SemanticMatchScore[]> {
  if (people.length === 0) return [];

  const conceptText = buildConceptEmbeddingText(concept);
  const personTexts = people.map(buildPersonEmbeddingText);

  // Single API call: concept text + all person texts
  const allTexts = [conceptText, ...personTexts];
  const embeddings = await computeEmbeddings(allTexts, options);

  const conceptEmbedding = embeddings[0];
  const scores: SemanticMatchScore[] = people.map((person, i) => {
    const sim = cosineSimilarity(conceptEmbedding, embeddings[i + 1]);
    return {
      personId: person.id,
      similarity: Math.round(sim * 1000) / 1000,
      label: similarityLabel(sim),
    };
  });

  scores.sort((a, b) => b.similarity - a.similarity);
  return scores;
}
