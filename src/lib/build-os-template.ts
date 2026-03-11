import type {
  AiFundBuildArtifact,
  AiFundBuildProject,
  AiFundBuildStageRun,
  BuildArtifactType,
  BuildStage,
} from "@/types/ai-fund";

export interface BuildChecklistItem {
  id: string;
  label: string;
}

export interface BuildStageDefinition {
  stage: BuildStage;
  label: string;
  description: string;
  requiredArtifacts: BuildArtifactType[];
  checklist: BuildChecklistItem[];
}

export interface BuildPromptContext {
  project: AiFundBuildProject;
  artifacts: Record<BuildArtifactType, AiFundBuildArtifact | undefined>;
  stageRun: AiFundBuildStageRun | undefined;
}

export const BUILD_STAGE_ORDER: BuildStage[] = [
  "explore",
  "prd_research",
  "tdd_review",
  "build_loop",
  "manual_polish",
];

export const BUILD_STAGE_DEFINITIONS: BuildStageDefinition[] = [
  {
    stage: "explore",
    label: "Explore",
    description: "Experiment with tools, APIs, and snippets until the path is real enough to spec.",
    requiredArtifacts: ["experiment_log"],
    checklist: [
      { id: "tooling_tested", label: "Core tools, APIs, or snippets were tested in the problem space." },
      { id: "next_step_clear", label: "There is enough signal to move from experiments into product definition." },
    ],
  },
  {
    stage: "prd_research",
    label: "PRD + Research",
    description: "Write the PRD and iterate with research until the opportunity and market signals are crisp.",
    requiredArtifacts: ["prd", "market_signals"],
    checklist: [
      { id: "research_complete", label: "Research pass captured competitive context and market signals." },
      { id: "requirements_locked", label: "PRD scope is specific enough to hand to engineering." },
    ],
  },
  {
    stage: "tdd_review",
    label: "TDD Review",
    description: "Write the TDD and pressure-test it with a fresh engineering context until there are no open questions.",
    requiredArtifacts: ["tdd", "engineering_questions"],
    checklist: [
      { id: "open_questions_resolved", label: "Open engineering questions are resolved or explicitly parked." },
      { id: "handoff_ready", label: "The TDD is specific enough for implementation without new product decisions." },
    ],
  },
  {
    stage: "build_loop",
    label: "Build Loop",
    description: "Implement, deploy, and run QA loops until the spec is complete and tested.",
    requiredArtifacts: ["implementation_notes", "qa_notes"],
    checklist: [
      { id: "design_applied", label: "Design skill guidance was applied to the shipped UI." },
      { id: "spec_passes_qa", label: "Closed-loop QA passed against the current spec." },
    ],
  },
  {
    stage: "manual_polish",
    label: "Manual Polish",
    description: "Return for manual testing, polish rough edges, and either ship or park the project.",
    requiredArtifacts: ["manual_test_notes", "polish_backlog"],
    checklist: [
      { id: "manual_pass_complete", label: "Manual testing identified the remaining polish or sign-off items." },
    ],
  },
];

export function getBuildStageDefinition(stage: BuildStage): BuildStageDefinition {
  const definition = BUILD_STAGE_DEFINITIONS.find((entry: BuildStageDefinition) => entry.stage === stage);
  if (!definition) {
    throw new Error(`Unknown build stage: ${stage}`);
  }

  return definition;
}

export function buildArtifactRecord(
  artifacts: AiFundBuildArtifact[],
): Record<BuildArtifactType, AiFundBuildArtifact | undefined> {
  return artifacts.reduce((accumulator: Record<BuildArtifactType, AiFundBuildArtifact | undefined>, artifact) => {
    accumulator[artifact.artifactType] = artifact;
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

function trimBody(value: string | null | undefined): string {
  return (value || "").trim();
}

function projectHeader(project: AiFundBuildProject): string {
  return [
    `Project: ${project.title}`,
    `Problem statement: ${project.problemStatement || "Not set"}`,
    `Target user: ${project.targetUser || "Not set"}`,
    `Current stage: ${project.currentStage}`,
    `Project status: ${project.status}`,
    project.repoUrl ? `Repo URL: ${project.repoUrl}` : null,
    project.deployUrl ? `Deploy URL: ${project.deployUrl}` : null,
  ].filter(Boolean).join("\n");
}

function buildExplorePrompt(context: BuildPromptContext): string {
  return [
    "Work from the experiment log below and decide whether the opportunity is strong enough to move into PRD work.",
    "",
    "Output:",
    "1. Strongest technical signals",
    "2. Weak points or dead ends",
    "3. Recommendation on whether to continue",
    "",
    projectHeader(context.project),
    "",
    "Experiment log:",
    trimBody(context.artifacts.experiment_log?.markdownBody) || "No experiment log yet.",
  ].join("\n");
}

function buildPrdPrompt(context: BuildPromptContext): string {
  return [
    "Iterate on this PRD and market research with fresh context until the product scope, user, and market signal are clear.",
    "",
    "Focus on:",
    "- tightening the problem and user definition",
    "- pressure-testing market demand and competition",
    "- identifying unclear requirements",
    "",
    projectHeader(context.project),
    "",
    "PRD:",
    trimBody(context.artifacts.prd?.markdownBody) || "No PRD yet.",
    "",
    "Market signals:",
    trimBody(context.artifacts.market_signals?.markdownBody) || "No market signals yet.",
  ].join("\n");
}

function buildTddPrompt(context: BuildPromptContext): string {
  return [
    "Act as a fresh software engineer reviewing this TDD. Ask and answer implementation-critical questions until there are no unresolved blockers.",
    "",
    "Before coding, return:",
    "1. Breaking changes",
    "2. Migration requirements",
    "3. RLS impacts",
    "4. Exact files to change",
    "",
    projectHeader(context.project),
    "",
    "TDD:",
    trimBody(context.artifacts.tdd?.markdownBody) || "No TDD yet.",
    "",
    "Engineering questions:",
    trimBody(context.artifacts.engineering_questions?.markdownBody) || "No engineering questions yet.",
  ].join("\n");
}

function buildLoopPrompt(context: BuildPromptContext): string {
  return [
    "Implement the current TDD using railway and design skills. Deploy to Railway and use chrome skill to QA. Closed loop test until spec is complete and tested.",
    "",
    "Before coding, return:",
    "1. Breaking changes",
    "2. Migration requirements",
    "3. RLS impacts",
    "4. Exact files to change",
    "",
    projectHeader(context.project),
    "",
    "TDD:",
    trimBody(context.artifacts.tdd?.markdownBody) || "No TDD yet.",
    "",
    "Implementation notes:",
    trimBody(context.artifacts.implementation_notes?.markdownBody) || "No implementation notes yet.",
    "",
    "QA notes:",
    trimBody(context.artifacts.qa_notes?.markdownBody) || "No QA notes yet.",
  ].join("\n");
}

function buildPolishPrompt(context: BuildPromptContext): string {
  return [
    "Review the manual test notes and polish backlog. Produce a focused finish pass plan with the smallest changes required to ship or consciously park the project.",
    "",
    projectHeader(context.project),
    "",
    "Manual test notes:",
    trimBody(context.artifacts.manual_test_notes?.markdownBody) || "No manual test notes yet.",
    "",
    "Polish backlog:",
    trimBody(context.artifacts.polish_backlog?.markdownBody) || "No polish backlog yet.",
  ].join("\n");
}

export function buildPromptPacket(stage: BuildStage, context: BuildPromptContext): string {
  switch (stage) {
    case "explore":
      return buildExplorePrompt(context);
    case "prd_research":
      return buildPrdPrompt(context);
    case "tdd_review":
      return buildTddPrompt(context);
    case "build_loop":
      return buildLoopPrompt(context);
    case "manual_polish":
      return buildPolishPrompt(context);
    default:
      return "";
  }
}

