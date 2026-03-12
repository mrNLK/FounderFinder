/**
 * Founder Source Edge Function
 *
 * Creates an Exa Webset with 5 search queries targeting Bay Area
 * GenAI founders, adds enrichment columns, polls until idle,
 * and returns structured candidate data.
 */

import { authenticateAiFundUser, AuthGuardError } from "../_shared/auth-guard.ts";
import {
  getProviderApiKey,
  getUserSettingsRow,
} from "../_shared/aifund-settings.ts";
import {
  corsHeaders,
  json,
  errorJson,
  asString,
  asRecord,
  fetchWithRetry,
} from "../_shared/http.ts";


// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SourceRequestBody {
  count?: number;
  appendQueries?: boolean;
}

interface SearchQuery {
  query: string;
  count: number;
      enrichments: Record<string, unknown> | unknown[];
}

interface EnrichmentColumn {
  description: string;
  format: string;
  options?: { label: string }[];
}

interface WebsetItem {
  id: string;
  url: string;
  properties: Record<string, unknown>;
  enrichments: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Exa Websets API Helpers
// ---------------------------------------------------------------------------

const EXA_BASE = "https://api.exa.ai";

async function exaFetch(
  path: string,
  apiKey: string,
  options: { method?: string; body?: unknown } = {},
): Promise<Record<string, unknown>> {
  const response = await fetchWithRetry(
    `${EXA_BASE}${path}`,
    {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    },
  );

  return (await response.json()) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Query Definitions
// ---------------------------------------------------------------------------

function buildQueries(count: number): { create: SearchQuery; appends: SearchQuery[] } {
  const create: SearchQuery = {
    query: "technical AI founder Bay Area generative AI B2B application layer",
    count,
    searchCriteria: [
      { description: "Person is based in San Francisco Bay Area, Silicon Valley, or greater Bay Area (SF, Oakland, San Jose, Palo Alto, Mountain View, Menlo Park, Redwood City, Sunnyvale, Santa Clara, Berkeley, Marin, East Bay)" },
      { description: "Person has founded, co-founded, or been an early technical leader at a generative AI company" },
      { description: "Person has shipped production AI products with real users or revenue" },
      { description: "Person demonstrates exceptional technical depth — not just a product or business person" },
    ],
  };

  const appends: SearchQuery[] = [
    {
      query: "AI founder Bay Area NeurIPS ICML YC Thiel IOI Kaggle olympiad fellowship Stanford MIT Berkeley",
      count,
      searchCriteria: [
        { description: "Person has at least one of: publication at a top ML conference, olympiad medal, competitive programming achievement, prestigious fellowship, or accelerator acceptance" },
        { description: "Person is based in Bay Area" },
      ],
    },
    {
      query: "AI startup founder built from scratch zero to one Bay Area generative AI LLM agent",
      count,
      searchCriteria: [
        { description: "Person built and shipped a product end-to-end — not just ideated or managed" },
        { description: "Person has hands-on engineering experience, not only a business background" },
        { description: "Based in Bay Area" },
      ],
    },
    {
      query: "AI researcher turned founder Bay Area LLM generative AI application enterprise B2B",
      count,
      searchCriteria: [
        { description: "Person transitioned from research (PhD, residency, lab) to building a product company" },
        { description: "B2B or enterprise focus" },
        { description: "Bay Area" },
      ],
    },
    {
      query: "open source AI maintainer founder Bay Area LLM inference RAG agent framework",
      count,
      searchCriteria: [
        { description: "Person created or maintains a widely-used AI open source project" },
        { description: "Has moved or is moving from OSS to building a company" },
        { description: "Bay Area" },
      ],
    },
  ];

  return { create, appends };
}

const ENRICHMENTS: EnrichmentColumn[] = [
  { description: "LinkedIn profile URL", format: "url" },
  { description: "Current job title or role", format: "text" },
  { description: "Current company or startup name", format: "text" },
  { description: "GitHub username or profile URL", format: "url" },
  { description: "Location — city and state", format: "text" },
  { description: "Evidence of exceptional ability: publications, patents, olympiad medals, competitive programming achievements, fellowships, accelerator acceptance, open source projects with 1000+ stars. List all found.", format: "text" },
  { description: "Has this person founded or co-founded a company? Yes or No. If yes, name the company.", format: "text" },
  {
    description: "Is this person's work focused on B2B applications (selling to businesses) vs B2C (selling to consumers)?",
    format: "options",
    options: [{ label: "B2B" }, { label: "B2C" }, { label: "Both" }, { label: "Unclear" }],
  },
  {
    description: "Technical depth: is this person primarily an engineer/researcher who builds, or primarily a product/business person?",
    format: "options",
    options: [{ label: "Deep technical" }, { label: "Technical PM" }, { label: "Non-technical" }, { label: "Unclear" }],
  },
];

// ---------------------------------------------------------------------------
// Polling Helper
// ---------------------------------------------------------------------------

async function pollUntilIdle(websetId: string, apiKey: string, maxAttempts = 60): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    const webset = await exaFetch(`/websets/${websetId}`, apiKey);
    const status = asString(webset.status);

    if (status === "idle") return;
    if (status === "error" || status === "failed") {
      throw new Error(`Webset ${websetId} failed with status: ${status}`);
    }

    // Wait 5 seconds between polls
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  throw new Error(`Webset ${websetId} did not become idle after ${maxAttempts} attempts`);
}

// ---------------------------------------------------------------------------
// Item Retrieval
// ---------------------------------------------------------------------------

async function retrieveAllItems(websetId: string, apiKey: string): Promise<WebsetItem[]> {
  const items: WebsetItem[] = [];
  const seenIds = new Set<string>();
  let cursor: string | null = null;
  const maxPages = 20;

  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams();
    if (cursor) params.set("cursor", cursor);
    params.set("limit", "100");

    const response = await exaFetch(
      `/websets/${websetId}/items?${params.toString()}`,
      apiKey,
    );

    const data = Array.isArray(response.data) ? response.data : [];
    for (const raw of data) {
      const record = asRecord(raw);
      const id = asString(record.id) || crypto.randomUUID();
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      items.push({
        id,
        url: asString(record.url) || "",
        properties: asRecord(record.properties),
                  enrichments: record.enrichments && typeof record.enrichments === "object" ? record.enrichments as Record<string, unknown> | unknown[] : {},
      });
    }

    const nextCursor = asString(response.next_cursor) || asString(response.nextCursor);
    if (!nextCursor || data.length === 0) break;
    cursor = nextCursor;
  }

  return items;
}

// ---------------------------------------------------------------------------
// Map Items to Candidate Shape
// ---------------------------------------------------------------------------

function extractEnrichmentValue(enrichments: Record<string, unknown> | unknown[], description: string): string {
  // Enrichments may be keyed by description or by index
  for (const [_key, val] of Object.entries(enrichments)) {
    // Handle array-form enrichments first
      if (Array.isArray(enrichments)) {
          for (const item of enrichments) {
                const record = asRecord(item);
                      if (asString(record.description)?.includes(description.substring(0, 20))) {
                              return asString(record.value) || asString(record.result) || "";
                                    }
                                        }
                                            return "";
                                              }
                                              
    const record = asRecord(val);
    if (asString(record.description) === description || asString(record.field) === description) {
      return asString(record.value) || asString(record.result) || "";
    }
    // If the key matches description substring
    if (_key.toLowerCase().includes(description.substring(0, 20).toLowerCase())) {
      if (typeof val === "string") return val;
      return asString(record.value) || asString(record.result) || "";
    }
  }

  // Try array-style enrichments
  if (Array.isArray(enrichments)) {
    for (const item of enrichments) {
      const record = asRecord(item);
      if (asString(record.description)?.includes(description.substring(0, 20))) {
        return asString(record.value) || asString(record.result) || "";
      }
    }
  }

  // Fallback: try direct key match
  const directValue = enrichments[description];
  if (typeof directValue === "string") return directValue;

  return "";
}

interface CandidateData {
  name: string;
  title: string;
  company: string;
  linkedinUrl: string | null;
  githubUrl: string | null;
  location: string;
  isFounder: boolean;
  b2bFocus: string;
  technicalDepth: string;
  eeaSignals: string;
  profileUrl: string;
  snippet: string;
}

function mapItemToCandidate(item: WebsetItem): CandidateData {
  const enrichments = item.enrichments;
  const properties = item.properties;

  const linkedinUrl = extractEnrichmentValue(enrichments, "LinkedIn profile URL") || null;
  const title = extractEnrichmentValue(enrichments, "Current job title or role");
  const company = extractEnrichmentValue(enrichments, "Current company or startup name");
  const githubUrl = extractEnrichmentValue(enrichments, "GitHub username or profile URL") || null;
  const location = extractEnrichmentValue(enrichments, "Location — city and state");
  const eeaSignals = extractEnrichmentValue(enrichments, "Evidence of exceptional ability");
  const founderText = extractEnrichmentValue(enrichments, "Has this person founded or co-founded a company");
  const b2bFocus = extractEnrichmentValue(enrichments, "Is this person's work focused on B2B") || "Unclear";
  const technicalDepth = extractEnrichmentValue(enrichments, "Technical depth") || "Unclear";

  const name = asString(properties.title) || asString(properties.name) || title || item.url;
  const snippet = asString(properties.text) || asString(properties.description) || "";
  const isFounder = founderText.toLowerCase().includes("yes");

  return {
    name,
    title,
    company,
    linkedinUrl: linkedinUrl && linkedinUrl.includes("linkedin.com") ? linkedinUrl : null,
    githubUrl: githubUrl && (githubUrl.includes("github.com") || githubUrl.includes("github.io")) ? githubUrl : null,
    location,
    isFounder,
    b2bFocus,
    technicalDepth,
    eeaSignals,
    profileUrl: item.url,
    snippet: snippet.length > 500 ? snippet.substring(0, 497) + "..." : snippet,
  };
}

// ---------------------------------------------------------------------------
// Main Handler
// ---------------------------------------------------------------------------

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return errorJson("Method not allowed", "method_not_allowed", 405);
  }

  try {
    const body = (await request.json()) as SourceRequestBody;
    const count = Math.max(1, Math.min(body.count ?? 20, 50));
    const appendQueries = body.appendQueries !== false;

    const auth = await authenticateAiFundUser(request);
    const settingsRow = await getUserSettingsRow(auth.serviceClient, auth.userId);
    const apiKey = getProviderApiKey(settingsRow, "exa");

    if (!apiKey) {
      return errorJson(
        "Exa API key not configured. Add it in Settings.",
        "missing_exa_configuration",
        400,
      );
    }

    // 1. Create webset with first query
    const queries = buildQueries(count);
    const createPayload = {
      search: {
        query: queries.create.query,
        count: queries.create.count,
        criteria: queries.create.searchCriteria,
      },
      enrichments: ENRICHMENTS.map((e) => {
        const col: Record<string, unknown> = {
          description: e.description,
          format: e.format,
        };
        if (e.options) col.options = e.options;
        return col;
      }),
    };

    const websetData = await exaFetch("/websets", apiKey, {
      method: "POST",
      body: createPayload,
    });

    const websetId = asString(websetData.id);
    if (!websetId) {
      throw new Error("Failed to create webset — no ID returned");
    }

    // 2. Append additional searches
    if (appendQueries) {
      for (const appendQuery of queries.appends) {
        await exaFetch(`/websets/${websetId}/searches`, apiKey, {
          method: "POST",
          body: {
            query: appendQuery.query,
            count: appendQuery.count,
            criteria: appendQuery.searchCriteria,
            behavior: "append",
          },
        });
      }
    }

    // 3. Poll until idle
    await pollUntilIdle(websetId, apiKey);

    // 4. Retrieve all items
    const items = await retrieveAllItems(websetId, apiKey);

    // 5. Map to candidate shape
    const allCandidates = items.map(mapItemToCandidate);

    // 6. Deduplicate by normalized URL and by name+company
    const seenUrls = new Set<string>();
    const seenNameCompany = new Set<string>();
    const candidates: CandidateData[] = [];

    for (const c of allCandidates) {
      const normUrl = c.profileUrl.toLowerCase().replace(/\/+$/, "").replace(/\?.*$/, "");
      if (seenUrls.has(normUrl)) continue;
      seenUrls.add(normUrl);

      const nameKey = `${c.name.toLowerCase().trim()}|||${(c.company || "").toLowerCase().trim()}`;
      if (seenNameCompany.has(nameKey)) continue;
      seenNameCompany.add(nameKey);

      candidates.push(c);
    }

    const deduplicatedCount = allCandidates.length - candidates.length;

    return json({
      websetId,
      totalFound: candidates.length,
      deduplicatedCount,
      candidates,
    });
  } catch (error) {
    console.error("founder-source failed:", error);

    if (error instanceof AuthGuardError) {
      return errorJson(error.message, error.code, error.status);
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    return errorJson(message, "founder_source_failed", 500);
  }
});
