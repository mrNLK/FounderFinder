import { authenticateAiFundUser, AuthGuardError } from "../_shared/auth-guard.ts";
import {
  BUILD_ARTIFACT_SEEDS,
  type BuildArtifactType,
} from "../_shared/build-os.ts";

interface RequestBody {
  projectId?: string;
  artifactType?: BuildArtifactType;
  markdownBody?: string;
}

interface BuildArtifactRow {
  id: string;
  project_id: string;
  user_id: string;
  artifact_type: BuildArtifactType;
  title: string;
  markdown_body: string;
  source_stage: string;
  created_at: string;
  updated_at: string;
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

function asTrimmedString(value: unknown): string | null {
  return typeof value === "string" ? value.trim() : null;
}

function isBuildArtifactType(value: string): value is BuildArtifactType {
  return BUILD_ARTIFACT_SEEDS.some((artifact) => artifact.artifactType === value);
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return errorJson("Method not allowed", "method_not_allowed", 405);
  }

  try {
    const { userId, serviceClient } = await authenticateAiFundUser(request);
    const body = await request.json() as RequestBody;
    const projectId = asTrimmedString(body.projectId);
    const artifactType = asTrimmedString(body.artifactType);
    const markdownBody = typeof body.markdownBody === "string" ? body.markdownBody : "";

    if (!projectId) {
      return errorJson("Project id is required", "missing_project_id", 400);
    }

    if (!artifactType || !isBuildArtifactType(artifactType)) {
      return errorJson("Artifact type is invalid", "invalid_artifact_type", 400);
    }

    const { data: project, error: projectError } = await serviceClient
      .from("aifund_build_projects")
      .select("id")
      .eq("id", projectId)
      .eq("user_id", userId)
      .single();

    if (projectError || !project) {
      return errorJson("Project not found", "project_not_found", 404);
    }

    const artifactSeed = BUILD_ARTIFACT_SEEDS.find((artifact) => artifact.artifactType === artifactType);
    if (!artifactSeed) {
      return errorJson("Artifact definition not found", "artifact_seed_missing", 500);
    }

    const now = new Date().toISOString();
    const { data: existingArtifact, error: lookupError } = await serviceClient
      .from("aifund_build_artifacts")
      .select("*")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .eq("artifact_type", artifactType)
      .limit(1)
      .maybeSingle();

    if (lookupError) {
      console.error("Artifact lookup failed:", lookupError);
      return errorJson("Failed to load artifact", "artifact_lookup_failed", 500);
    }

    let artifactRow: BuildArtifactRow | null = null;

    if (existingArtifact) {
      const { data: updatedArtifact, error: updateError } = await serviceClient
        .from("aifund_build_artifacts")
        .update({
          markdown_body: markdownBody,
          updated_at: now,
        })
        .eq("id", (existingArtifact as BuildArtifactRow).id)
        .eq("user_id", userId)
        .select("*")
        .single();

      if (updateError || !updatedArtifact) {
        console.error("Artifact update failed:", updateError);
        return errorJson("Failed to save artifact", "artifact_update_failed", 500);
      }

      artifactRow = updatedArtifact as BuildArtifactRow;
    } else {
      const { data: insertedArtifact, error: insertError } = await serviceClient
        .from("aifund_build_artifacts")
        .insert({
          project_id: projectId,
          user_id: userId,
          artifact_type: artifactType,
          title: artifactSeed.title,
          markdown_body: markdownBody,
          source_stage: artifactSeed.sourceStage,
          updated_at: now,
        })
        .select("*")
        .single();

      if (insertError || !insertedArtifact) {
        console.error("Artifact insert failed:", insertError);
        return errorJson("Failed to save artifact", "artifact_insert_failed", 500);
      }

      artifactRow = insertedArtifact as BuildArtifactRow;
    }

    await serviceClient
      .from("aifund_build_projects")
      .update({ updated_at: now })
      .eq("id", projectId)
      .eq("user_id", userId);

    await serviceClient
      .from("aifund_activity_events")
      .insert({
        user_id: userId,
        entity_type: "build_artifact",
        entity_id: artifactRow.id,
        action: "saved_build_artifact",
        details: {
          projectId,
          artifactType,
        },
      });

    return json({
      artifact: artifactRow,
    });
  } catch (error) {
    if (error instanceof AuthGuardError) {
      return errorJson(error.message, error.code, error.status);
    }

    console.error("Unexpected build artifact save error:", error);
    return errorJson("Unexpected server error", "unexpected_error", 500);
  }
});
