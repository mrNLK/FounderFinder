/**
 * Founder Enrich Edge Function
 *
 * Submits candidates to Parallel Task Groups for deep EEA research,
 * and polls for completion. Supports two actions:
 *   - action: "create" — submit a batch of candidates
 *   - action: "status" — poll a task group by ID
 */

import { authenticateAiFundUser, AuthGuardError } from "../_shared/auth-guard.ts";
import {
  getProviderApiKey,
  getUserSettingsRow,
} from "../_shared/aifund-settings.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EnrichRequestBody {
  action: "create" | "status";
  candidates?: CandidateInput[];
  taskGroupId?: string;
}

interface CandidateInput {
  name: string;
  company: string;
  title: string;
  profileUrl: string;
  linkedinUrl: string | null;
  existingSignals: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

// ---------------------------------------------------------------------------
// Retry Helper
// ---------------------------------------------------------------------------

const BACKOFF_MS = [1000, 2000, 4000];

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  maxRetries = 3,
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, init);

      if (response.ok) return response;

      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        const waitMs = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
      }

      if (response.status >= 500 && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]));
        continue;
      }

      const text = await response.text();
      throw new Error(`${url} failed: ${response.status} ${text}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]));
        continue;
      }
    }
  }

  throw lastError ?? new Error(`${url} failed after ${maxRetries} retries`);
}

// ---------------------------------------------------------------------------
// Parallel API
// ---------------------------------------------------------------------------

const PARALLEL_BASE = "https://api.parallel.ai";

const OUTPUT_PROMPT = `For this person, search the web for verifiable evidence of exceptional technical ability relevant to AI/ML engineering and founding. They are being evaluated as a potential Founder in Residence at AI Fund (Andrew Ng's venture studio) to lead a generative AI B2B company.

Return JSON only. No markdown, no preamble, no explanation.

Required fields:
{
  "name": "string",
  "linkedin_url": "string | null",
  "github_url": "string | null",
  "publications": ["list of verified paper titles with conference/journal names"],
  "patents": ["list of verified patents with assignee and status"],
  "competitive_programming": ["IOI/IMO/ICPC/Codeforces/Kaggle achievements with specific ranks or ratings"],
  "fellowships": ["Hertz/NSF/Thiel/YC/a16z/Google PhD/OpenAI Residency etc."],
  "open_source": ["GitHub repos with star counts, or major framework contributions"],
  "accelerator": ["YC batch, a16z Speedrun, Entrepreneur First, etc."],
  "prior_exits": ["acquisitions or IPOs with approximate values if known"],
  "conference_talks": ["keynotes or oral presentations at NeurIPS/ICML/ICLR/CVPR etc."],
  "media_recognition": ["MIT TR35, Forbes 30 Under 30 (note category), TED vs TEDx distinction"],
  "bay_area_confirmed": true | false,
  "b2b_signals": ["specific evidence of B2B or enterprise focus"],
  "zero_to_one_evidence": ["specific evidence of building from scratch — shipped products, founding stories, 0-to-1 moments"],
  "eea_tier": 1 | 2 | 3 | null,
  "eea_summary": "2-sentence plain English assessment of why this person is or is not top 5% in AI engineering",
  "outreach_hook": "one sentence opener referencing their most impressive specific achievement, written as if from Andrew Ng's talent team — not generic, not flattering, just precise"
}`;

async function createTaskGroup(
  candidates: CandidateInput[],
  apiKey: string,
): Promise<{ taskGroupId: string }> {
  const tasks = candidates.map((c) => ({
    input: {
      name: c.name,
      company: c.company,
      title: c.title,
      profileUrl: c.profileUrl,
      linkedinUrl: c.linkedinUrl ?? null,
      existingSignals: c.existingSignals,
    },
  }));

  const response = await fetchWithRetry(
    `${PARALLEL_BASE}/v1/task-groups`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        tasks,
        output: OUTPUT_PROMPT,
        output_type: "json",
      }),
    },
  );

  const data = asRecord(await response.json());
  const taskGroupId = asString(data.id) || asString(data.task_group_id);

  if (!taskGroupId) {
    throw new Error("Parallel did not return a task group ID");
  }

  return { taskGroupId };
}

async function getTaskGroupStatus(
  taskGroupId: string,
  apiKey: string,
): Promise<{
  status: "running" | "completed" | "error";
  results: Record<string, unknown>[];
}> {
  const response = await fetchWithRetry(
    `${PARALLEL_BASE}/v1/task-groups/${taskGroupId}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
    },
  );

  const data = asRecord(await response.json());
  const rawStatus = asString(data.status) || "running";

  let status: "running" | "completed" | "error";
  if (rawStatus === "completed" || rawStatus === "done" || rawStatus === "finished") {
    status = "completed";
  } else if (rawStatus === "failed" || rawStatus === "error") {
    status = "error";
  } else {
    status = "running";
  }

  const tasks = Array.isArray(data.tasks) ? data.tasks : [];
  const results: Record<string, unknown>[] = [];

  for (const task of tasks) {
    const taskRecord = asRecord(task);
    const output = taskRecord.output ?? taskRecord.result;

    if (typeof output === "string") {
      try {
        results.push(JSON.parse(output) as Record<string, unknown>);
      } catch {
        results.push({ raw: output });
      }
    } else if (output && typeof output === "object") {
      results.push(output as Record<string, unknown>);
    }
  }

  return { status, results };
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
    const body = (await request.json()) as EnrichRequestBody;
    const action = body.action;

    if (action !== "create" && action !== "status") {
      return errorJson("Invalid action. Use 'create' or 'status'.", "invalid_action", 400);
    }

    const auth = await authenticateAiFundUser(request);
    const settingsRow = await getUserSettingsRow(auth.serviceClient, auth.userId);
    const apiKey = getProviderApiKey(settingsRow, "parallel");

    if (!apiKey) {
      return errorJson(
        "Parallel API key not configured. Add it in Settings.",
        "missing_parallel_configuration",
        400,
      );
    }

    if (action === "create") {
      const candidates = body.candidates;
      if (!Array.isArray(candidates) || candidates.length === 0) {
        return errorJson("No candidates provided", "no_candidates", 400);
      }

      const { taskGroupId } = await createTaskGroup(candidates, apiKey);

      return json({
        taskGroupId,
        status: "running",
      });
    }

    // action === "status"
    const taskGroupId = body.taskGroupId;
    if (!taskGroupId) {
      return errorJson("Missing taskGroupId", "missing_task_group_id", 400);
    }

    const { status, results } = await getTaskGroupStatus(taskGroupId, apiKey);

    return json({
      taskGroupId,
      status,
      results,
    });
  } catch (error) {
    console.error("founder-enrich failed:", error);

    if (error instanceof AuthGuardError) {
      return errorJson(error.message, error.code, error.status);
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    return errorJson(message, "founder_enrich_failed", 500);
  }
});
