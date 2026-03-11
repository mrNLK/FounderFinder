import { authenticateAiFundUser, AuthGuardError } from "../_shared/auth-guard.ts";
import {
  BUILD_ARTIFACT_SEEDS,
  BUILD_STAGE_ORDER,
  BUILD_TEMPLATE_VERSION,
  type BuildStage,
  isBuildProjectStatus,
  isBuildStage,
  sanitizeChecklistState,
} from "../_shared/build-os.ts";
import { type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

interface BuildProjectInput {
  conceptId?: string | null;
  title?: string | null;
  problemStatement?: string | null;
  targetUser?: string | null;
  repoUrl?: string | null;
  deployUrl?: string | null;
  currentStage?: string | null;
  status?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface RequestBody {
  action?: "create" | "update";
  projectId?: string;
  project?: BuildProjectInput;
}

interface BuildProjectRow {
  id: string;
  user_id: string;
  concept_id: string | null;
  title: string;
  problem_statement: string | null;
  target_user: string | null;
  repo_url: string | null;
  deploy_url: string | null;
  current_stage: string;
  status: string;
  template_version: number;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

interface BuildStageRunRow {
  id: string;
  project_id: string;
  user_id: string;
  stage: string;
  status: string;
  checklist_state: Record<string, unknown>;
  summary: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface BuildArtifactRow {
  id: string;
  project_id: string;
  user_id: string;
  artifact_type: string;
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
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNullableRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

async function ensureConceptOwnership(
  serviceClient: SupabaseClient,
  userId: string,
  conceptId: string | null,
): Promise<void> {
  if (!conceptId) {
    return;
  }

  const { data, error } = await serviceClient
    .from("aifund_concepts")
    .select("id")
    .eq("id", conceptId)
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Concept ownership check failed:", error);
    throw new Error("concept_lookup_failed");
  }

  if (!data) {
    throw new Error("concept_not_found");
  }
}

async function getOwnedProject(
  serviceClient: SupabaseClient,
  userId: string,
  projectId: string,
): Promise<BuildProjectRow> {
  const { data, error } = await serviceClient
    .from("aifund_build_projects")
    .select("*")
    .eq("id", projectId)
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    throw new Error("project_not_found");
  }

  return data as BuildProjectRow;
}

async function fetchSeededProjectState(
  serviceClient: SupabaseClient,
  projectId: string,
): Promise<{
  stageRuns: BuildStageRunRow[];
  artifacts: BuildArtifactRow[];
}> {
  const [{ data: stageRuns, error: stageRunsError }, { data: artifacts, error: artifactsError }] = await Promise.all([
    serviceClient
      .from("aifund_build_stage_runs")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true }),
    serviceClient
      .from("aifund_build_artifacts")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true }),
  ]);

  if (stageRunsError) {
    console.error("Failed to fetch stage runs:", stageRunsError);
    throw new Error("stage_runs_lookup_failed");
  }

  if (artifactsError) {
    console.error("Failed to fetch artifacts:", artifactsError);
    throw new Error("artifacts_lookup_failed");
  }

  return {
    stageRuns: (stageRuns || []) as BuildStageRunRow[],
    artifacts: (artifacts || []) as BuildArtifactRow[],
  };
}

async function logActivity(
  serviceClient: SupabaseClient,
  userId: string,
  entityType: string,
  entityId: string,
  action: string,
  details: Record<string, unknown>,
): Promise<void> {
  const { error } = await serviceClient
    .from("aifund_activity_events")
    .insert({
      user_id: userId,
      entity_type: entityType,
      entity_id: entityId,
      action,
      details,
    });

  if (error) {
    console.error("Failed to log build OS activity:", error);
  }
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
    const action = body.action || "create";
    const project = body.project || {};

    if (!["create", "update"].includes(action)) {
      return errorJson("Action is invalid", "invalid_action", 400);
    }

    if (action === "create") {
      const title = asTrimmedString(project.title);
      if (!title) {
        return errorJson("Project title is required", "missing_title", 400);
      }

      const conceptId = asTrimmedString(project.conceptId) || null;
      await ensureConceptOwnership(serviceClient, userId, conceptId);

      const requestedStage = asTrimmedString(project.currentStage) || "";
      const currentStage = isBuildStage(requestedStage)
        ? requestedStage
        : "explore";
      const requestedStatus = asTrimmedString(project.status) || "";
      const status = isBuildProjectStatus(requestedStatus)
        ? requestedStatus
        : "active";

      const now = new Date().toISOString();
      const { data: insertedProject, error: insertProjectError } = await serviceClient
        .from("aifund_build_projects")
        .insert({
          user_id: userId,
          concept_id: conceptId,
          title,
          problem_statement: asTrimmedString(project.problemStatement),
          target_user: asTrimmedString(project.targetUser),
          repo_url: asTrimmedString(project.repoUrl),
          deploy_url: asTrimmedString(project.deployUrl),
          current_stage: currentStage,
          status,
          template_version: BUILD_TEMPLATE_VERSION,
          metadata: asNullableRecord(project.metadata) || {},
          updated_at: now,
        })
        .select("*")
        .single();

      if (insertProjectError || !insertedProject) {
        console.error("Failed to create build project:", insertProjectError);
        return errorJson("Failed to create project", "create_failed", 500);
      }

      const projectRow = insertedProject as BuildProjectRow;
      const stageRunRows = BUILD_STAGE_ORDER.map((stage: BuildStage) => ({
        project_id: projectRow.id,
        user_id: userId,
        stage,
        status: stage === currentStage ? "active" : "locked",
        checklist_state: sanitizeChecklistState(stage, {}),
        summary: null,
        started_at: stage === currentStage ? now : null,
        completed_at: null,
        updated_at: now,
      }));

      const { error: stageInsertError } = await serviceClient
        .from("aifund_build_stage_runs")
        .insert(stageRunRows);

      if (stageInsertError) {
        console.error("Failed to seed build stage runs:", stageInsertError);
        return errorJson("Failed to seed build stages", "seed_stage_runs_failed", 500);
      }

      const artifactRows = BUILD_ARTIFACT_SEEDS.map((artifact) => ({
        project_id: projectRow.id,
        user_id: userId,
        artifact_type: artifact.artifactType,
        title: artifact.title,
        markdown_body: artifact.defaultMarkdown,
        source_stage: artifact.sourceStage,
        updated_at: now,
      }));

      const { error: artifactInsertError } = await serviceClient
        .from("aifund_build_artifacts")
        .insert(artifactRows);

      if (artifactInsertError) {
        console.error("Failed to seed build artifacts:", artifactInsertError);
        return errorJson("Failed to seed build artifacts", "seed_artifacts_failed", 500);
      }

      const seededState = await fetchSeededProjectState(serviceClient, projectRow.id);
      await logActivity(serviceClient, userId, "build_project", projectRow.id, "created_build_project", {
        title: projectRow.title,
        currentStage: projectRow.current_stage,
      });

      return json({
        project: projectRow,
        stageRuns: seededState.stageRuns,
        artifacts: seededState.artifacts,
      });
    }

    const projectId = asTrimmedString(body.projectId);
    if (!projectId) {
      return errorJson("Project id is required", "missing_project_id", 400);
    }

    const existingProject = await getOwnedProject(serviceClient, userId, projectId);
    const conceptId = "conceptId" in project
      ? asTrimmedString(project.conceptId) || null
      : existingProject.concept_id;
    await ensureConceptOwnership(serviceClient, userId, conceptId);

    const payload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if ("title" in project) {
      const title = asTrimmedString(project.title);
      if (!title) {
        return errorJson("Project title is required", "missing_title", 400);
      }
      payload.title = title;
    }

    if ("problemStatement" in project) {
      payload.problem_statement = asTrimmedString(project.problemStatement);
    }

    if ("targetUser" in project) {
      payload.target_user = asTrimmedString(project.targetUser);
    }

    if ("repoUrl" in project) {
      payload.repo_url = asTrimmedString(project.repoUrl);
    }

    if ("deployUrl" in project) {
      payload.deploy_url = asTrimmedString(project.deployUrl);
    }

    if ("conceptId" in project) {
      payload.concept_id = conceptId;
    }

    if ("status" in project) {
      const status = asTrimmedString(project.status);
      if (status && !isBuildProjectStatus(status)) {
        return errorJson("Invalid project status", "invalid_status", 400);
      }
      payload.status = status || "active";
    }

    if ("metadata" in project) {
      payload.metadata = asNullableRecord(project.metadata) || {};
    }

    const { data: updatedProject, error: updateError } = await serviceClient
      .from("aifund_build_projects")
      .update(payload)
      .eq("id", projectId)
      .eq("user_id", userId)
      .select("*")
      .single();

    if (updateError || !updatedProject) {
      console.error("Failed to update build project:", updateError);
      return errorJson("Failed to update project", "update_failed", 500);
    }

    await logActivity(serviceClient, userId, "build_project", projectId, "updated_build_project", {
      title: (updatedProject as BuildProjectRow).title,
    });

    return json({
      project: updatedProject,
    });
  } catch (error) {
    if (error instanceof AuthGuardError) {
      return errorJson(error.message, error.code, error.status);
    }

    if (error instanceof Error && error.message === "concept_not_found") {
      return errorJson("Selected concept was not found", "concept_not_found", 404);
    }

    if (error instanceof Error && error.message === "concept_lookup_failed") {
      return errorJson("Failed to validate concept ownership", "concept_lookup_failed", 500);
    }

    console.error("Unexpected build project upsert error:", error);
    return errorJson("Unexpected server error", "unexpected_error", 500);
  }
});
