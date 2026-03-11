/**
 * Shared HTTP utilities for Supabase Edge Functions.
 *
 * Provides CORS headers, JSON response helpers, retry logic,
 * and safe type coercion used across multiple edge functions.
 */

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

export const corsHeaders: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ---------------------------------------------------------------------------
// Response Helpers
// ---------------------------------------------------------------------------

export function json(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
      ...(init?.headers ?? {}),
    },
  });
}

export function errorJson(message: string, code: string, status: number): Response {
  return json({ error: { message, code } }, { status });
}

// ---------------------------------------------------------------------------
// Safe Type Coercion
// ---------------------------------------------------------------------------

export function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

// ---------------------------------------------------------------------------
// Retry Helper
// ---------------------------------------------------------------------------

const BACKOFF_MS = [1000, 2000, 4000];

export async function fetchWithRetry(
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
