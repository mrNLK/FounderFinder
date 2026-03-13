import { supabase } from "@/integrations/supabase/client";
import type { LeverSyncRequest, LeverSyncResponse } from "@/types/ai-fund";

interface LeverSyncFunctionErrorPayload {
  error?: {
    message?: string;
    code?: string;
  };
}

async function extractFunctionErrorMessage(error: unknown): Promise<string> {
  const defaultMessage = error instanceof Error ? error.message : "Unknown lever sync error";
  const response = (error as { context?: Response } | null)?.context;

  if (!response) {
    return defaultMessage;
  }

  try {
    const payload = await response.json() as LeverSyncFunctionErrorPayload;
    return payload.error?.message || defaultMessage;
  } catch {
    try {
      return await response.text();
    } catch {
      return defaultMessage;
    }
  }
}

export async function runLeverSync(input: LeverSyncRequest): Promise<LeverSyncResponse> {
  const { data, error } = await supabase.functions.invoke("aifund-lever-sync", {
    body: input,
  });

  if (error) {
    throw new Error(await extractFunctionErrorMessage(error));
  }

  return data as LeverSyncResponse;
}
