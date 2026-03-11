export type BuildStage =
  | "explore"
  | "prd_research"
  | "tdd_review"
  | "build_loop"
  | "manual_polish";

export type BuildProjectStatus = "active" | "shipped" | "parked";

export type BuildStageRunStatus = "locked" | "active" | "completed";

export type BuildArtifactType =
  | "experiment_log"
  | "prd"
  | "market_signals"
  | "tdd"
  | "engineering_questions"
  | "implementation_notes"
  | "qa_notes"
  | "manual_test_notes"
  | "polish_backlog";

export interface BuildArtifactSeed {
  artifactType: BuildArtifactType;
  title: string;
  sourceStage: BuildStage;
  defaultMarkdown: string;
}

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

export const BUILD_ARTIFACT_SEEDS: BuildArtifactSeed[] = [
  {
    artifactType: "experiment_log",
    title: "Experiment Log",
    sourceStage: "explore",
    defaultMarkdown: [
      "# Experiment Log",
      "",
      "## Problem Space",
      "- What problem are we testing?",
      "",
      "## Tools / APIs / Snippets Tried",
      "- Tool or API:",
      "- Input:",
      "- Output:",
      "- Notes:",
      "",
      "## What Started Working",
      "-",
      "",
      "## What Failed or Looked Weak",
      "-",
      "",
      "## Decision to Continue",
      "-",
    ].join("\n"),
  },
  {
    artifactType: "prd",
    title: "PRD",
    sourceStage: "prd_research",
    defaultMarkdown: [
      "# Product Requirements Document",
      "",
      "## 1. Problem",
      "- Who has the problem?",
      "- What is broken today?",
      "",
      "## 2. Product Vision",
      "- What does the product do?",
      "- What will feel different if this works?",
      "",
      "## 3. Target User",
      "- Primary user:",
      "- Jobs to be done:",
      "",
      "## 4. Core Workflow",
      "1. Entry point",
      "2. Key action",
      "3. Success moment",
      "",
      "## 5. Requirements",
      "- Must have:",
      "- Nice to have:",
      "- Out of scope:",
      "",
      "## 6. Metrics",
      "- User success metric:",
      "- Business signal:",
      "",
      "## 7. Risks / Open Questions",
      "-",
    ].join("\n"),
  },
  {
    artifactType: "market_signals",
    title: "Market Signals",
    sourceStage: "prd_research",
    defaultMarkdown: [
      "# Market Signals",
      "",
      "## Demand Signals",
      "-",
      "",
      "## Competitive Landscape",
      "-",
      "",
      "## Why Now",
      "-",
      "",
      "## Evidence That This Is Worth Building",
      "-",
    ].join("\n"),
  },
  {
    artifactType: "tdd",
    title: "TDD",
    sourceStage: "tdd_review",
    defaultMarkdown: [
      "# Technical Design Document",
      "",
      "## 1. Architecture Overview",
      "-",
      "",
      "## 2. Components / Services",
      "-",
      "",
      "## 3. Data Model / Contracts",
      "-",
      "",
      "## 4. User Flows / State",
      "-",
      "",
      "## 5. Failure Modes",
      "-",
      "",
      "## 6. Testing Plan",
      "-",
      "",
      "## 7. Implementation Notes",
      "-",
    ].join("\n"),
  },
  {
    artifactType: "engineering_questions",
    title: "Engineering Questions",
    sourceStage: "tdd_review",
    defaultMarkdown: [
      "# Engineering Questions",
      "",
      "## Open Questions",
      "-",
      "",
      "## Decisions Made",
      "-",
      "",
      "## Deferred Questions",
      "-",
    ].join("\n"),
  },
  {
    artifactType: "implementation_notes",
    title: "Implementation Notes",
    sourceStage: "build_loop",
    defaultMarkdown: [
      "# Implementation Notes",
      "",
      "## Files / Systems Changed",
      "-",
      "",
      "## Decisions During Build",
      "-",
      "",
      "## Deployment Notes",
      "-",
    ].join("\n"),
  },
  {
    artifactType: "qa_notes",
    title: "QA Notes",
    sourceStage: "build_loop",
    defaultMarkdown: [
      "# QA Notes",
      "",
      "## Test Coverage",
      "-",
      "",
      "## Bugs Found",
      "-",
      "",
      "## Fix Verification",
      "-",
    ].join("\n"),
  },
  {
    artifactType: "manual_test_notes",
    title: "Manual Test Notes",
    sourceStage: "manual_polish",
    defaultMarkdown: [
      "# Manual Test Notes",
      "",
      "## What Was Tested",
      "-",
      "",
      "## Issues / Rough Edges",
      "-",
      "",
      "## Final Decision",
      "-",
    ].join("\n"),
  },
  {
    artifactType: "polish_backlog",
    title: "Polish Backlog",
    sourceStage: "manual_polish",
    defaultMarkdown: [
      "# Polish Backlog",
      "",
      "## Must Fix",
      "-",
      "",
      "## Nice to Fix",
      "-",
      "",
      "## Follow-ups",
      "-",
    ].join("\n"),
  },
];

export const BUILD_TEMPLATE_VERSION = 1;

export function getBuildStageDefinition(stage: BuildStage): BuildStageDefinition {
  const definition = BUILD_STAGE_DEFINITIONS.find((entry: BuildStageDefinition) => entry.stage === stage);
  if (!definition) {
    throw new Error(`Unknown build stage: ${stage}`);
  }

  return definition;
}

export function isBuildStage(value: string): value is BuildStage {
  return BUILD_STAGE_ORDER.includes(value as BuildStage);
}

export function isBuildProjectStatus(value: string): value is BuildProjectStatus {
  return ["active", "shipped", "parked"].includes(value);
}

export function sanitizeChecklistState(
  stage: BuildStage,
  input: Record<string, unknown> | null | undefined,
): Record<string, boolean> {
  const definition = getBuildStageDefinition(stage);
  const nextState: Record<string, boolean> = {};

  for (const item of definition.checklist) {
    nextState[item.id] = input?.[item.id] === true;
  }

  return nextState;
}

export function nextBuildStage(stage: BuildStage): BuildStage | null {
  const index = BUILD_STAGE_ORDER.indexOf(stage);
  return index >= 0 && index < BUILD_STAGE_ORDER.length - 1
    ? BUILD_STAGE_ORDER[index + 1]
    : null;
}

export function requiredArtifactsByStage(stage: BuildStage): BuildArtifactType[] {
  return getBuildStageDefinition(stage).requiredArtifacts;
}

