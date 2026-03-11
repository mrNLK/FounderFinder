import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ClipboardList,
  Copy,
  FileText,
  FolderKanban,
  Loader2,
  Rocket,
  Sparkles,
  Wrench,
} from "lucide-react";
import type {
  AiFundBuildArtifact,
  AiFundBuildProject,
  AiFundBuildStageRun,
  AiFundWorkspace,
  BuildArtifactType,
  BuildProjectStatus,
  BuildStage,
} from "@/types/ai-fund";
import {
  buildArtifactRecord,
  buildPromptPacket,
  BUILD_STAGE_DEFINITIONS,
  getBuildStageDefinition,
} from "@/lib/build-os-template";

interface Props {
  workspace: AiFundWorkspace;
}

interface CreateProjectDraft {
  title: string;
  problemStatement: string;
  targetUser: string;
  conceptId: string;
}

interface ProjectDraft {
  title: string;
  problemStatement: string;
  targetUser: string;
  conceptId: string;
  repoUrl: string;
  deployUrl: string;
  status: BuildProjectStatus;
}

const STAGE_ICONS: Record<BuildStage, React.ElementType> = {
  explore: Sparkles,
  prd_research: ClipboardList,
  tdd_review: FileText,
  build_loop: Wrench,
  manual_polish: CheckCircle2,
};

const STATUS_LABELS: Record<BuildProjectStatus, string> = {
  active: "Active",
  shipped: "Shipped",
  parked: "Parked",
};

function toProjectDraft(project: AiFundBuildProject): ProjectDraft {
  return {
    title: project.title,
    problemStatement: project.problemStatement || "",
    targetUser: project.targetUser || "",
    conceptId: project.conceptId || "",
    repoUrl: project.repoUrl || "",
    deployUrl: project.deployUrl || "",
    status: project.status,
  };
}

function isCurrentStage(project: AiFundBuildProject | null, stage: BuildStage): boolean {
  return project?.currentStage === stage;
}

function getStageRun(
  runs: AiFundBuildStageRun[],
  stage: BuildStage,
): AiFundBuildStageRun | undefined {
  return runs.find((run: AiFundBuildStageRun) => run.stage === stage);
}

function getStageStatusClass(status: AiFundBuildStageRun["status"], isSelected: boolean): string {
  if (isSelected) {
    return "border-primary bg-primary/10 text-foreground";
  }

  switch (status) {
    case "completed":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "active":
      return "border-blue-200 bg-blue-50 text-blue-700";
    default:
      return "border-border bg-card text-muted-foreground";
  }
}

function getStatusBadgeClass(status: BuildProjectStatus): string {
  switch (status) {
    case "shipped":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "parked":
      return "bg-amber-50 text-amber-700 border-amber-200";
    default:
      return "bg-blue-50 text-blue-700 border-blue-200";
  }
}

export default function BuildOsTab({ workspace }: Props) {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedStage, setSelectedStage] = useState<BuildStage>("explore");
  const [projectDraft, setProjectDraft] = useState<ProjectDraft | null>(null);
  const [createDraft, setCreateDraft] = useState<CreateProjectDraft>({
    title: "",
    problemStatement: "",
    targetUser: "",
    conceptId: "",
  });
  const [artifactDrafts, setArtifactDrafts] = useState<Partial<Record<BuildArtifactType, string>>>({});
  const [checklistDraft, setChecklistDraft] = useState<Record<string, boolean>>({});
  const [stageSummaryDraft, setStageSummaryDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [creating, setCreating] = useState(false);
  const [savingProject, setSavingProject] = useState(false);
  const [savingArtifactType, setSavingArtifactType] = useState<BuildArtifactType | null>(null);
  const [savingStage, setSavingStage] = useState(false);

  useEffect(() => {
    if (!selectedProjectId && workspace.buildProjects.length > 0) {
      setSelectedProjectId(workspace.buildProjects[0].id);
    }
  }, [selectedProjectId, workspace.buildProjects]);

  const selectedProject = useMemo(() => (
    workspace.buildProjects.find((project: AiFundBuildProject) => project.id === selectedProjectId) || null
  ), [selectedProjectId, workspace.buildProjects]);

  const selectedProjectRuns = useMemo(() => (
    selectedProject
      ? workspace.buildStageRuns.filter((run: AiFundBuildStageRun) => run.projectId === selectedProject.id)
      : []
  ), [selectedProject, workspace.buildStageRuns]);

  const selectedProjectArtifacts = useMemo(() => (
    selectedProject
      ? workspace.buildArtifacts.filter((artifact: AiFundBuildArtifact) => artifact.projectId === selectedProject.id)
      : []
  ), [selectedProject, workspace.buildArtifacts]);

  const artifactRecord = useMemo(() => buildArtifactRecord(selectedProjectArtifacts), [selectedProjectArtifacts]);
  const stageDefinition = getBuildStageDefinition(selectedStage);
  const selectedStageRun = getStageRun(selectedProjectRuns, selectedStage);
  const currentStageSelected = isCurrentStage(selectedProject, selectedStage);
  const finalStageCompleted = selectedStage === "manual_polish"
    && selectedStageRun?.status === "completed"
    && selectedProject?.status !== "active";

  useEffect(() => {
    if (!selectedProject) {
      setProjectDraft(null);
      return;
    }

    setProjectDraft(toProjectDraft(selectedProject));
    setSelectedStage(selectedProject.currentStage);
    setArtifactDrafts({});
  }, [selectedProjectId, selectedProject]);

  useEffect(() => {
    setChecklistDraft(selectedStageRun?.checklistState || {});
    setStageSummaryDraft(selectedStageRun?.summary || "");
  }, [selectedProjectId, selectedStage, selectedStageRun]);

  const promptArtifacts = useMemo(() => {
    const hydratedArtifacts = selectedProjectArtifacts.map((artifact: AiFundBuildArtifact) => ({
      ...artifact,
      markdownBody: artifactDrafts[artifact.artifactType] ?? artifact.markdownBody,
    }));

    return buildArtifactRecord(hydratedArtifacts);
  }, [artifactDrafts, selectedProjectArtifacts]);

  const promptPacket = useMemo(() => {
    if (!selectedProject || !projectDraft) {
      return "";
    }

    return buildPromptPacket(selectedStage, {
      project: {
        ...selectedProject,
        title: projectDraft.title,
        problemStatement: projectDraft.problemStatement || null,
        targetUser: projectDraft.targetUser || null,
        conceptId: projectDraft.conceptId || null,
        repoUrl: projectDraft.repoUrl || null,
        deployUrl: projectDraft.deployUrl || null,
        status: projectDraft.status,
      },
      artifacts: promptArtifacts,
      stageRun: selectedStageRun,
    });
  }, [projectDraft, promptArtifacts, selectedProject, selectedStage, selectedStageRun]);

  const handleCreateProject = async (): Promise<void> => {
    if (!createDraft.title.trim()) {
      setError("Project title is required.");
      return;
    }

    try {
      setCreating(true);
      setError(null);
      const project = await workspace.createBuildProject({
        title: createDraft.title.trim(),
        problemStatement: createDraft.problemStatement.trim() || null,
        targetUser: createDraft.targetUser.trim() || null,
        conceptId: createDraft.conceptId || null,
      });
      setSelectedProjectId(project.id);
      setCreateDraft({
        title: "",
        problemStatement: "",
        targetUser: "",
        conceptId: "",
      });
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create project.");
    } finally {
      setCreating(false);
    }
  };

  const handleSaveProject = async (): Promise<void> => {
    if (!selectedProject || !projectDraft) {
      return;
    }

    try {
      setSavingProject(true);
      setError(null);
      const project = await workspace.updateBuildProject(selectedProject.id, {
        title: projectDraft.title.trim(),
        problemStatement: projectDraft.problemStatement.trim() || null,
        targetUser: projectDraft.targetUser.trim() || null,
        conceptId: projectDraft.conceptId || null,
        repoUrl: projectDraft.repoUrl.trim() || null,
        deployUrl: projectDraft.deployUrl.trim() || null,
        status: projectDraft.status,
      });
      setProjectDraft(toProjectDraft(project));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save project.");
    } finally {
      setSavingProject(false);
    }
  };

  const handleSaveArtifact = async (artifactType: BuildArtifactType): Promise<void> => {
    if (!selectedProject) {
      return;
    }

    try {
      setSavingArtifactType(artifactType);
      setError(null);
      const nextBody = artifactDrafts[artifactType] ?? artifactRecord[artifactType]?.markdownBody ?? "";
      const artifact = await workspace.saveBuildArtifact(selectedProject.id, artifactType, nextBody);
      setArtifactDrafts((current) => ({
        ...current,
        [artifactType]: artifact.markdownBody,
      }));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save artifact.");
    } finally {
      setSavingArtifactType(null);
    }
  };

  const handleSaveStage = async (action: "save" | "advance"): Promise<void> => {
    if (!selectedProject) {
      return;
    }

    try {
      setSavingStage(true);
      setError(null);
      if (projectDraft) {
        const project = await workspace.updateBuildProject(selectedProject.id, {
          title: projectDraft.title.trim(),
          problemStatement: projectDraft.problemStatement.trim() || null,
          targetUser: projectDraft.targetUser.trim() || null,
          conceptId: projectDraft.conceptId || null,
          repoUrl: projectDraft.repoUrl.trim() || null,
          deployUrl: projectDraft.deployUrl.trim() || null,
          status: projectDraft.status,
        });
        setProjectDraft(toProjectDraft(project));
      }

      if (action === "advance") {
        await Promise.all(stageArtifacts.map((artifact) => (
          workspace.saveBuildArtifact(
            selectedProject.id,
            artifact.artifactType,
            artifact.markdownBody,
          )
        )));
      }

      const result = await workspace.advanceBuildStage({
        projectId: selectedProject.id,
        stage: selectedStage,
        action,
        checklistState: checklistDraft,
        summary: stageSummaryDraft.trim() || null,
        projectStatus: projectDraft?.status || selectedProject.status,
      });

      if (action === "advance") {
        setSelectedStage(result.project.currentStage);
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save stage.");
    } finally {
      setSavingStage(false);
    }
  };

  const handleCopyPrompt = async (): Promise<void> => {
    if (!promptPacket) {
      return;
    }

    try {
      await navigator.clipboard.writeText(promptPacket);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Failed to copy prompt packet.");
    }
  };

  const stageArtifacts = stageDefinition.requiredArtifacts.map((artifactType: BuildArtifactType) => {
    const artifact = artifactRecord[artifactType];
    const markdownBody = artifactDrafts[artifactType] ?? artifact?.markdownBody ?? "";
    return {
      artifactType,
      title: artifact?.title || artifactType,
      markdownBody,
      updatedAt: artifact?.updatedAt || null,
    };
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="space-y-4">
        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <FolderKanban className="h-4 w-4 text-primary" />
            Build OS
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            One canonical Eli workflow for turning raw ideas into shipped products.
          </p>
        </section>

        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">New Project</h3>
            {creating && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
          </div>
          <input
            value={createDraft.title}
            onChange={(event) => setCreateDraft((current) => ({ ...current, title: event.target.value }))}
            placeholder="Idea or product name"
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
          />
          <textarea
            value={createDraft.problemStatement}
            onChange={(event) => setCreateDraft((current) => ({ ...current, problemStatement: event.target.value }))}
            placeholder="Problem statement"
            rows={4}
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
          />
          <input
            value={createDraft.targetUser}
            onChange={(event) => setCreateDraft((current) => ({ ...current, targetUser: event.target.value }))}
            placeholder="Target user"
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
          />
          <select
            value={createDraft.conceptId}
            onChange={(event) => setCreateDraft((current) => ({ ...current, conceptId: event.target.value }))}
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
          >
            <option value="">No linked concept</option>
            {workspace.concepts.map((concept) => (
              <option key={concept.id} value={concept.id}>
                {concept.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => void handleCreateProject()}
            disabled={creating}
            className="w-full rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            Create Build Project
          </button>
        </section>

        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-foreground">Projects</h3>
          <div className="mt-3 space-y-2">
            {workspace.buildProjects.length === 0 && (
              <p className="text-sm text-muted-foreground">No Build OS projects yet.</p>
            )}
            {workspace.buildProjects.map((project) => (
              <button
                key={project.id}
                onClick={() => setSelectedProjectId(project.id)}
                className={`w-full rounded-2xl border p-3 text-left transition-colors ${
                  project.id === selectedProjectId
                    ? "border-primary bg-primary/5"
                    : "border-border bg-background hover:bg-secondary"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-foreground">{project.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {getBuildStageDefinition(project.currentStage).label}
                    </div>
                  </div>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${getStatusBadgeClass(project.status)}`}>
                    {STATUS_LABELS[project.status]}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>
      </aside>

      <section className="space-y-6">
        {error && (
          <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {!selectedProject || !projectDraft ? (
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <p className="text-sm text-muted-foreground">
              Create a Build OS project to start the Eli workflow.
            </p>
          </div>
        ) : (
          <>
            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Rocket className="h-4 w-4 text-primary" />
                    <h2 className="text-lg font-semibold text-foreground">{selectedProject.title}</h2>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Canonical Eli build loop with in-app specs and prompt packets.
                  </p>
                </div>
                <button
                  onClick={() => void handleSaveProject()}
                  disabled={savingProject}
                  className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary disabled:opacity-50"
                >
                  {savingProject ? "Saving..." : "Save Details"}
                </button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Title</label>
                  <input
                    value={projectDraft.title}
                    onChange={(event) => setProjectDraft((current) => current ? { ...current, title: event.target.value } : current)}
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Linked Concept</label>
                  <select
                    value={projectDraft.conceptId}
                    onChange={(event) => setProjectDraft((current) => current ? { ...current, conceptId: event.target.value } : current)}
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
                  >
                    <option value="">No linked concept</option>
                    {workspace.concepts.map((concept) => (
                      <option key={concept.id} value={concept.id}>
                        {concept.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Problem Statement</label>
                  <textarea
                    value={projectDraft.problemStatement}
                    onChange={(event) => setProjectDraft((current) => current ? { ...current, problemStatement: event.target.value } : current)}
                    rows={4}
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Target User</label>
                  <input
                    value={projectDraft.targetUser}
                    onChange={(event) => setProjectDraft((current) => current ? { ...current, targetUser: event.target.value } : current)}
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</label>
                  <select
                    value={projectDraft.status}
                    onChange={(event) => setProjectDraft((current) => current ? {
                      ...current,
                      status: event.target.value as BuildProjectStatus,
                    } : current)}
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
                  >
                    {Object.entries(STATUS_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Repo URL</label>
                  <input
                    value={projectDraft.repoUrl}
                    onChange={(event) => setProjectDraft((current) => current ? { ...current, repoUrl: event.target.value } : current)}
                    placeholder="https://github.com/..."
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Deploy URL</label>
                  <input
                    value={projectDraft.deployUrl}
                    onChange={(event) => setProjectDraft((current) => current ? { ...current, deployUrl: event.target.value } : current)}
                    placeholder="https://..."
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
                  />
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Stage Rail</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  The current stage is the only stage that can be advanced.
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-5">
                {BUILD_STAGE_DEFINITIONS.map((stage) => {
                  const stageRun = getStageRun(selectedProjectRuns, stage.stage);
                  const Icon = STAGE_ICONS[stage.stage];
                  return (
                    <button
                      key={stage.stage}
                      onClick={() => setSelectedStage(stage.stage)}
                      className={`rounded-2xl border p-3 text-left transition-colors ${getStageStatusClass(stageRun?.status || "locked", selectedStage === stage.stage)}`}
                    >
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Icon className="h-4 w-4" />
                        {stage.label}
                      </div>
                      <div className="mt-1 text-xs opacity-80">
                        {stageRun?.status || "locked"}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_380px]">
              <div className="space-y-6">
                <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                  <h3 className="text-sm font-semibold text-foreground">{stageDefinition.label}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{stageDefinition.description}</p>
                </div>

                {stageArtifacts.map((artifact) => (
                  <div key={artifact.artifactType} className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h4 className="text-sm font-semibold text-foreground">{artifact.title}</h4>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {artifact.updatedAt ? `Updated ${new Date(artifact.updatedAt).toLocaleString()}` : "Unsaved artifact"}
                        </p>
                      </div>
                      <button
                        onClick={() => void handleSaveArtifact(artifact.artifactType)}
                        disabled={savingArtifactType === artifact.artifactType}
                        className="rounded-xl border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary disabled:opacity-50"
                      >
                        {savingArtifactType === artifact.artifactType ? "Saving..." : "Save"}
                      </button>
                    </div>
                    <textarea
                      value={artifact.markdownBody}
                      onChange={(event) => setArtifactDrafts((current) => ({
                        ...current,
                        [artifact.artifactType]: event.target.value,
                      }))}
                      rows={16}
                      className="w-full rounded-xl border border-input bg-background px-3 py-3 font-mono text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
                    />
                  </div>
                ))}
              </div>

              <div className="space-y-6">
                <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Checklist</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {currentStageSelected ? "Editable for the current stage." : "Viewing a non-current stage."}
                      </p>
                    </div>
                    {savingStage && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                  </div>

                  <div className="space-y-3">
                    {stageDefinition.checklist.map((item) => (
                      <label key={item.id} className="flex items-start gap-3 rounded-xl border border-border bg-background px-3 py-2">
                        <input
                          type="checkbox"
                          checked={checklistDraft[item.id] === true}
                          disabled={!currentStageSelected}
                          onChange={(event) => setChecklistDraft((current) => ({
                            ...current,
                            [item.id]: event.target.checked,
                          }))}
                          className="mt-0.5"
                        />
                        <span className="text-sm text-foreground">{item.label}</span>
                      </label>
                    ))}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Stage Summary</label>
                    <textarea
                      value={stageSummaryDraft}
                      disabled={!currentStageSelected}
                      onChange={(event) => setStageSummaryDraft(event.target.value)}
                      rows={5}
                      className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:opacity-70"
                    />
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={() => void handleSaveStage("save")}
                      disabled={!currentStageSelected || savingStage || finalStageCompleted}
                      className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary disabled:opacity-50"
                    >
                      Save Checklist
                    </button>
                    <button
                      onClick={() => void handleSaveStage("advance")}
                      disabled={!currentStageSelected || savingStage || finalStageCompleted}
                      className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                    >
                      {selectedStage === "manual_polish" ? "Finish Project" : "Advance Stage"}
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Prompt Packet</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Generated from the latest project and artifact drafts.
                      </p>
                    </div>
                    <button
                      onClick={() => void handleCopyPrompt()}
                      className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary"
                    >
                      <Copy className="h-4 w-4" />
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <pre className="max-h-[640px] overflow-auto whitespace-pre-wrap rounded-xl border border-border bg-background px-4 py-3 text-xs leading-6 text-foreground">
                    {promptPacket || "Prompt packet will appear here once a project is selected."}
                  </pre>
                </div>
              </div>
            </section>
          </>
        )}
      </section>
    </div>
  );
}
