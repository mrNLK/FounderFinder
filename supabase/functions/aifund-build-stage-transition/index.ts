import { authenticateAiFundUser, AuthGuardError } from "../_shared/auth-guard.ts";
import {
  isBuildProjectStatus,
  isBuildStage,
  nextBuildStage,
  sanitizeChecklistState,
  type BuildArtifactType,
  type BuildProjectStatus,
  type BuildStage,
  type BuildStageRunStatus,
} from "../_shared/build-os.ts";

interface RequestBody {
  projectId?: string;
  stage?: string;
  action?: "save" | "advance";
  checklistState?: Record<string, unknown>;
  summary?: string | null;
  projectStatus?: BuildProjectStatus;
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
  current_stage: BuildStage;
  status: BuildProjectStatus;
  template_version: number;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

interface BuildStageRunRow {
  id: string;
  project_id: string;
  user_id: string;
  stage: BuildStage;
  status: BuildStageRunStatus;
  checklist_state: Record<string, unknown> | null;
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
  artifact_type: BuildArtifactType;
  title: string;
  markdown_body: string;
  source_stage: BuildStage;
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

function isNonEmptyMarkdown(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function artifactMap(artifacts: BuildArtifactRow[]): Record<BuildArtifactType, BuildArtifactRow | undefined> {
  return artifacts.reduce((accumulator: Record<BuildArtifactType, BuildArtifactRow | undefined>, artifact) => {
    accumulator[artifact.artifact_type] = artifact;
    return accumulator;
  }, {
    experiment_log: undefined,
    prd: undefined,
    market_signals: undefined,
    tdd: undefined,
    engineering_questions: undefined,
    implementation_notes: undefined,
    qa_notes: undefined,
    manual_test_notes: undefined,
    polish_backlog: undefined,
  });
}

function validateStageAdvance(input: {
  project: BuildProjectRow;
  stage: BuildStage;
  checklistState: Record<string, boolean>;
  artifacts: BuildArtifactRow[];
  projectStatus: BuildProjectStatus;
}): string | null {
  const artifacts = artifactMap(input.artifacts);

  switch (input.stage) {
    case "explore":
      if (!isNonEmptyMarkdown(artifacts.experiment_log?.markdown_body)) {
        return "Experiment log must be filled in before moving on.";
      }
      if (!isNonEmptyMarkdown(input.project.problem_statement)) {
        return "Problem statement must be filled in before moving on.";
      }
      return null;
    case "prd_research":
      if (!isNonEmptyMarkdown(artifacts.prd?.markdown_body)) {
        return "PRD must be filled in before moving on.";
      }
      if (!isNonEmptyMarkdown(artifacts.market_signals?.markdown_body)) {
        return "Market signals must be filled in before moving on.";
      }
      if (!input.checklistState.research_complete) {
        return "Mark the research checklist item complete before moving on.";
      }
      return null;
    case "tdd_review":
      if (!isNonEmptyMarkdown(artifacts.tdd?.markdown_body)) {
        return "TDD must be filled in before moving on.";
      }
      if (!input.checklistState.open_questions_resolved) {
        return "Open engineering questions must be resolved before moving on.";
      }
      return null;
    case "build_loop":
      if (!isNonEmptyMarkdown(artifacts.implementation_notes?.markdown_body)) {
        return "Implementation notes must be filled in before moving on.";
      }
      if (!isNonEmptyMarkdown(artifacts.qa_notes?.markdown_body)) {
        return "QA notes must be filled in before moving on.";
      }
      if (!isNonEmptyMarkdown(input.project.deploy_url)) {
        return "Deploy URL must be filled in before moving on.";
      }
      if (!input.checklistState.spec_passes_qa) {
        return "Spec passes QA must be checked before moving on.";
      }
      return null;
    case "manual_polish":
      if (!isNonEmptyMarkdown(artifacts.manual_test_notes?.markdown_body)) {
        return "Manual test notes must be filled in before finishing.";
      }
      if (!["shipped", "parked"].includes(input.projectStatus)) {
        return "Mark the project as shipped or parked before finishing.";
      }
      return null;
    default:
      return "Invalid stage.";
  }
}

async function getProjectState(
  serviceClient: Awaited<ReturnType<typeof authenticateAiFundUser>>["serviceClient"],
  userId: string,
  projectId: string,
): Promise<{
  project: BuildProjectRow;
  stageRuns: BuildStageRunRow[];
  artifacts: BuildArtifactRow[];
}> {
  const [{ data: project, error: projectError }, { data: stageRuns, error: stageRunsError }, { data: artifacts, error: artifactsError }] =
    await Promise.all([
      serviceClient
        .from("aifund_build_projects")
        .select("*")
        .eq("id", projectId)
        .eq("user_id", userId)
        .single(),
      serviceClient
        .from("aifund_build_stage_runs")
        .select("*")
        .eq("project_id", projectId)
        .eq("user_id", userId)
        .order("created_at", { ascending: true }),
      serviceClient
        .from("aifund_build_artifacts")
        .select("*")
        .eq("project_id", projectId)
        .eq("user_id", userId),
    ]);

  if (projectError || !project) {
    throw new Error("project_not_found");
  }

  if (stageRunsError) {
    console.error("Build stage run lookup failed:", stageRunsError);
    throw new Error("stage_runs_lookup_failed");
  }

  if (artifactsError) {
    console.error("Build artifact lookup failed:", artifactsError);
    throw new Error("artifacts_lookup_failed");
  }

  return {
    project: project as BuildProjectRow,
    stageRuns: (stageRuns || []) as BuildStageRunRow[],
    artifacts: (artifacts || []) as BuildArtifactRow[],
  };
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
    const stageValue = asTrimmedString(body.stage);
    const action = body.action || "advance";

    if (!["save", "advance"].includes(action)) {
      return errorJson("Action is invalid", "invalid_action", 400);
    }

    if (!projectId) {
      return errorJson("Project id is required", "missing_project_id", 400);
    }

    if (!stageValue || !isBuildStage(stageValue)) {
      return errorJson("Stage is invalid", "invalid_stage", 400);
    }

    const stage = stageValue as BuildStage;
    const state = await getProjectState(serviceClient, userId, projectId);

    if (state.project.current_stage !== stage) {
      return errorJson("Only the current stage can be updated", "stage_not_current", 400);
    }

    const stageRun = state.stageRuns.find((candidate: BuildStageRunRow) => candidate.stage === stage);
    if (!stageRun) {
      return errorJson("Stage run not found", "stage_run_not_found", 404);
    }

    if (stageRun.status === "completed" && !nextBuildStage(stage) && state.project.status !== "active") {
      return errorJson("Project is already completed", "project_already_completed", 400);
    }

    const nextChecklistState = sanitizeChecklistState(stage, body.checklistState);
    const summary = asTrimmedString(body.summary);
    if (body.projectStatus && !isBuildProjectStatus(body.projectStatus)) {
      return errorJson("Project status is invalid", "invalid_project_status", 400);
    }

    const projectStatus = body.projectStatus || state.project.status;
    const now = new Date().toISOString();

    const { error: saveRunError } = await serviceClient
      .from("aifund_build_stage_runs")
      .update({
        checklist_state: nextChecklistState,
        summary,
        updated_at: now,
      })
      .eq("id", stageRun.id)
      .eq("user_id", userId);

    if (saveRunError) {
      console.error("Failed to save stage checklist:", saveRunError);
      return errorJson("Failed to save stage state", "save_stage_failed", 500);
    }

    if (action === "save") {
      const { data: savedProject, error: savedProjectError } = await serviceClient
        .from("aifund_build_projects")
        .update({
          status: projectStatus,
          updated_at: now,
        })
        .eq("id", projectId)
        .eq("user_id", userId)
        .select("*")
        .single();

      if (savedProjectError || !savedProject) {
        console.error("Failed to save build project status:", savedProjectError);
        return errorJson("Failed to save project", "save_project_failed", 500);
      }

      const refreshed = await getProjectState(serviceClient, userId, projectId);
      await serviceClient
        .from("aifund_activity_events")
        .insert({
          user_id: userId,
          entity_type: "build_project",
          entity_id: projectId,
          action: "saved_build_stage",
          details: {
            stage,
          },
        });

      return json({
        project: savedProject,
        stageRuns: refreshed.stageRuns,
      });
    }

    const gateError = validateStageAdvance({
      project: state.project,
      stage,
      checklistState: nextChecklistState,
      artifacts: state.artifacts,
      projectStatus,
    });

    if (gateError) {
      return errorJson(gateError, "stage_gate_failed", 400);
    }

    const nextStage = nextBuildStage(stage);
    const stageUpdates = [
      serviceClient
        .from("aifund_build_stage_runs")
        .update({
          status: "completed",
          checklist_state: nextChecklistState,
          summary,
          completed_at: now,
          updated_at: now,
        })
        .eq("id", stageRun.id)
        .eq("user_id", userId),
    ];

    if (nextStage) {
      stageUpdates.push(
        serviceClient
          .from("aifund_build_stage_runs")
          .update({
            status: "active",
            started_at: now,
            updated_at: now,
          })
          .eq("project_id", projectId)
          .eq("user_id", userId)
          .eq("stage", nextStage),
      );
    }

    const stageUpdateResults = await Promise.all(stageUpdates);
    for (const result of stageUpdateResults) {
      if (result.error) {
        console.error("Failed to update build stage status:", result.error);
        return errorJson("Failed to advance stage", "advance_stage_failed", 500);
      }
    }

    const { data: updatedProject, error: projectUpdateError } = await serviceClient
      .from("aifund_build_projects")
      .update({
        current_stage: nextStage || stage,
        status: projectStatus,
        updated_at: now,
      })
      .eq("id", projectId)
      .eq("user_id", userId)
      .select("*")
      .single();

    if (projectUpdateError || !updatedProject) {
      console.error("Failed to update build project stage:", projectUpdateError);
      return errorJson("Failed to advance project", "advance_project_failed", 500);
    }

    const refreshed = await getProjectState(serviceClient, userId, projectId);
    await serviceClient
      .from("aifund_activity_events")
      .insert({
        user_id: userId,
        entity_type: "build_project",
        entity_id: projectId,
        action: nextStage ? "advanced_build_stage" : "completed_build_project",
        details: {
          fromStage: stage,
          toStage: nextStage,
          status: projectStatus,
        },
      });

    return json({
      project: updatedProject,
      stageRuns: refreshed.stageRuns,
    });
  } catch (error) {
    if (error instanceof AuthGuardError) {
      return errorJson(error.message, error.code, error.status);
    }

    if (error instanceof Error && error.message === "project_not_found") {
      return errorJson("Project not found", "project_not_found", 404);
    }

    console.error("Unexpected build stage transition error:", error);
    return errorJson("Unexpected server error", "unexpected_error", 500);
  }
});
