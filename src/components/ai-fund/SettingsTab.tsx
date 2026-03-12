import { useEffect, useState } from "react";
import { Bell, Database, Globe, Key, Loader2, Play, RefreshCw, Save } from "lucide-react";
import type {
  AiFundAppSettings,
  AiFundHarmonicSavedSearch,
  AiFundIntegrationConfig,
  AiFundIntegrationTestResult,
  LeverSyncResponse,
  AiFundSourcingChannel,
  AiFundWorkspace,
  IntegrationProvider,
  SourcingChannelProvider,
} from "@/types/ai-fund";
import { testAiFundIntegration } from "@/lib/aifund-settings";
import { runLeverSync } from "@/lib/lever-sync";
import { fetchHarmonicDebugSnapshot, type HarmonicDebugSnapshot } from "@/lib/harmonic";

interface Props {
  workspace: AiFundWorkspace;
}

interface IntegrationDraftState {
  apiKeys: Partial<Record<IntegrationProvider, string>>;
  harmonicBaseUrl: string;
  anthropicModel: string;
  huggingfaceModel: string;
}

function buildInitialDraft(workspace: AiFundWorkspace): IntegrationDraftState {
  return {
    apiKeys: {},
    harmonicBaseUrl: workspace.settings.integrations.harmonic.baseUrl || "",
    anthropicModel: workspace.settings.integrations.anthropic.model || "",
    huggingfaceModel: workspace.settings.integrations.huggingface.model || "",
  };
}

function buildDraftFromSettings(settings: AiFundAppSettings): IntegrationDraftState {
  return {
    apiKeys: {},
    harmonicBaseUrl: settings.integrations.harmonic.baseUrl || "",
    anthropicModel: settings.integrations.anthropic.model || "",
    huggingfaceModel: settings.integrations.huggingface.model || "",
  };
}

function sourceLabel(source: AiFundIntegrationConfig["source"]): string {
  if (source === "saved") {
    return "Saved in app";
  }

  if (source === "project_env") {
    return "Project env";
  }

  return "Missing";
}

export default function AiFundSettingsTab({ workspace }: Props) {
  const [draft, setDraft] = useState<IntegrationDraftState>(() => buildInitialDraft(workspace));
  const [channels, setChannels] = useState<AiFundSourcingChannel[]>(workspace.settings.sourcingChannels);
  const [saving, setSaving] = useState(false);
  const [testingProvider, setTestingProvider] = useState<IntegrationProvider | null>(null);
  const [testResults, setTestResults] = useState<Partial<Record<IntegrationProvider, AiFundIntegrationTestResult>>>({});
  const [harmonicDebug, setHarmonicDebug] = useState<HarmonicDebugSnapshot | null>(null);
  const [harmonicDebugLoading, setHarmonicDebugLoading] = useState(false);
  const [expandedCompanyId, setExpandedCompanyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [leverMaxApplicants, setLeverMaxApplicants] = useState(120);
  const [leverIncludeArchived, setLeverIncludeArchived] = useState(false);
  const [leverResurfacingWindowDays, setLeverResurfacingWindowDays] = useState(180);
  const [leverSyncing, setLeverSyncing] = useState<"preview" | "sync" | null>(null);
  const [leverSyncResult, setLeverSyncResult] = useState<LeverSyncResponse | null>(null);

  useEffect(() => {
    setDraft(buildDraftFromSettings(workspace.settings));
    setChannels(workspace.settings.sourcingChannels);
  }, [workspace.settings]);

  const loadHarmonicDebug = async (): Promise<void> => {
    setHarmonicDebugLoading(true);

    try {
      const snapshot = await fetchHarmonicDebugSnapshot();
      setHarmonicDebug(snapshot);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load Harmonic debug data");
    } finally {
      setHarmonicDebugLoading(false);
    }
  };

  useEffect(() => {
    if (!workspace.settingsLoading) {
      void loadHarmonicDebug();
    }
  }, [workspace.settingsLoading]);

  const resolveConceptName = (conceptId: string): string => {
    return workspace.concepts.find((concept) => concept.id === conceptId)?.name || "Unknown concept";
  };

  const updateApiKey = (provider: IntegrationProvider, value: string): void => {
    setDraft((prev) => ({
      ...prev,
      apiKeys: {
        ...prev.apiKeys,
        [provider]: value,
      },
    }));
    setTestResults((prev) => {
      const next = { ...prev };
      delete next[provider];
      return next;
    });
  };

  const updateIntegrationDraft = (
    provider: IntegrationProvider,
    updates: Partial<Pick<IntegrationDraftState, "harmonicBaseUrl" | "anthropicModel" | "huggingfaceModel">>,
  ): void => {
    setDraft((prev) => ({ ...prev, ...updates }));
    setTestResults((prev) => {
      const next = { ...prev };
      delete next[provider];
      return next;
    });
  };

  const updateChannel = (
    channelId: string,
    updates: Partial<AiFundSourcingChannel>,
  ): void => {
    setChannels((prev) => prev.map((channel) => (
      channel.id === channelId ? { ...channel, ...updates } : channel
    )));
  };

  const handleSave = async (): Promise<void> => {
    setSaving(true);
    setError(null);
    setSaved(null);

    try {
      const integrations: Partial<Record<IntegrationProvider, {
        apiKey?: string | null;
        baseUrl?: string | null;
        model?: string | null;
      }>> = {
        harmonic: {
          ...(draft.apiKeys.harmonic?.trim() ? { apiKey: draft.apiKeys.harmonic.trim() } : {}),
          baseUrl: draft.harmonicBaseUrl.trim() || null,
        },
        exa: draft.apiKeys.exa?.trim() ? { apiKey: draft.apiKeys.exa.trim() } : {},
        github: draft.apiKeys.github?.trim() ? { apiKey: draft.apiKeys.github.trim() } : {},
        parallel: draft.apiKeys.parallel?.trim() ? { apiKey: draft.apiKeys.parallel.trim() } : {},
        anthropic: {
          ...(draft.apiKeys.anthropic?.trim() ? { apiKey: draft.apiKeys.anthropic.trim() } : {}),
          model: draft.anthropicModel.trim() || null,
        },
        huggingface: {
          ...(draft.apiKeys.huggingface?.trim() ? { apiKey: draft.apiKeys.huggingface.trim() } : {}),
          model: draft.huggingfaceModel.trim() || null,
        },
        lever: draft.apiKeys.lever?.trim() ? { apiKey: draft.apiKeys.lever.trim() } : {},
      };

      await workspace.updateSettings({
        integrations,
        sourcingChannels: channels,
      });

      setDraft(buildDraftFromSettings({
        ...workspace.settings,
        sourcingChannels: channels,
        integrations: {
          ...workspace.settings.integrations,
          harmonic: {
            ...workspace.settings.integrations.harmonic,
            baseUrl: draft.harmonicBaseUrl.trim() || null,
          },
          anthropic: {
            ...workspace.settings.integrations.anthropic,
            model: draft.anthropicModel.trim() || null,
          },
          huggingface: {
            ...workspace.settings.integrations.huggingface,
            model: draft.huggingfaceModel.trim() || null,
          },
        },
      }));
      setSaved("Settings saved");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const buildIntegrationOverrides = (
    provider: IntegrationProvider,
  ): Partial<Record<IntegrationProvider, {
    apiKey?: string | null;
    baseUrl?: string | null;
    model?: string | null;
  }>> => {
    switch (provider) {
      case "harmonic":
        return {
          harmonic: {
            apiKey: draft.apiKeys.harmonic?.trim() || undefined,
            baseUrl: draft.harmonicBaseUrl.trim() || null,
          },
        };
      case "anthropic":
        return {
          anthropic: {
            apiKey: draft.apiKeys.anthropic?.trim() || undefined,
            model: draft.anthropicModel.trim() || null,
          },
        };
      case "huggingface":
        return {
          huggingface: {
            apiKey: draft.apiKeys.huggingface?.trim() || undefined,
            model: draft.huggingfaceModel.trim() || null,
          },
        };
      case "exa":
      case "github":
      case "parallel":
      case "lever":
        return {
          [provider]: {
            apiKey: draft.apiKeys[provider]?.trim() || undefined,
          },
        };
    }
  };

  const handleTest = async (provider: IntegrationProvider): Promise<void> => {
    setError(null);
    setSaved(null);
    setTestingProvider(provider);

    try {
      const result = await testAiFundIntegration({
        provider,
        integrations: buildIntegrationOverrides(provider),
      });
      setTestResults((prev) => ({
        ...prev,
        [provider]: result,
      }));
    } catch (err: unknown) {
      setTestResults((prev) => ({
        ...prev,
        [provider]: {
          provider,
          ok: false,
          checkedAt: new Date().toISOString(),
          message: err instanceof Error ? err.message : "Integration test failed",
          metadata: null,
        },
      }));
    } finally {
      setTestingProvider(null);
    }
  };

  const handleLeverSync = async (mode: "preview" | "sync"): Promise<void> => {
    setError(null);
    setSaved(null);
    setLeverSyncing(mode);

    try {
      const result = await runLeverSync({
        mode,
        source: "lever_api",
        maxApplicants: leverMaxApplicants,
        includeArchived: leverIncludeArchived,
        resurfacingWindowDays: leverResurfacingWindowDays,
      });
      setLeverSyncResult(result);
      setSaved(mode === "preview" ? "Lever preview completed" : "Lever sync completed");
      if (mode === "sync") {
        await workspace.refresh();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Lever sync failed");
    } finally {
      setLeverSyncing(null);
    }
  };

  if (workspace.settingsLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">AI Fund Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Provider credentials, sourcing channels, and evaluation criteria
          </p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {saved && (
        <div className="rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 text-sm text-primary">
          {saved}
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Key className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">API Keys</h2>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {(["harmonic", "exa", "github", "parallel", "anthropic", "huggingface", "lever"] as IntegrationProvider[]).map((provider) => {
            const config = workspace.settings.integrations[provider];
            return (
              <div key={provider} className="rounded-lg border border-border bg-background p-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{config.label}</p>
                      <p className="text-xs text-muted-foreground">{sourceLabel(config.source)}</p>
                    </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                    config.configured
                      ? "border border-primary/20 bg-primary/10 text-primary"
                      : "border border-border bg-secondary text-muted-foreground"
                  }`}>
                      {config.configured ? "Configured" : "Missing"}
                    </span>
                  </div>

                  <div className="mb-3 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => void handleTest(provider)}
                      disabled={testingProvider !== null}
                      className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
                    >
                      {testingProvider === provider ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Play className="h-3.5 w-3.5" />
                      )}
                      {testingProvider === provider ? "Testing..." : "Test"}
                    </button>

                    {testResults[provider] && (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                        testResults[provider]?.ok
                          ? "border border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                          : "border border-destructive/20 bg-destructive/10 text-destructive"
                      }`}>
                        {testResults[provider]?.ok ? "Live" : "Failed"}
                      </span>
                    )}
                  </div>

                  <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">
                      {provider === "github" ? "Token" : "API Key"}
                    </label>
                    <input
                      type="password"
                      value={draft.apiKeys[provider] || ""}
                      onChange={(event) => updateApiKey(provider, event.target.value)}
                      placeholder={config.maskedKey || "Paste a new secret to replace the current one"}
                      className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  {provider === "harmonic" && (
                    <div>
                      <label className="mb-1 block text-xs text-muted-foreground">Base URL</label>
                      <input
                        type="text"
                        value={draft.harmonicBaseUrl}
                        onChange={(event) => updateIntegrationDraft("harmonic", { harmonicBaseUrl: event.target.value })}
                        className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  )}

                  {provider === "anthropic" && (
                    <div>
                      <label className="mb-1 block text-xs text-muted-foreground">Model</label>
                      <input
                        type="text"
                        value={draft.anthropicModel}
                        onChange={(event) => updateIntegrationDraft("anthropic", { anthropicModel: event.target.value })}
                        placeholder="claude-sonnet"
                        className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  )}

                  {provider === "huggingface" && (
                    <div>
                      <label className="mb-1 block text-xs text-muted-foreground">Embedding Model</label>
                      <input
                        type="text"
                        value={draft.huggingfaceModel}
                        onChange={(event) => updateIntegrationDraft("huggingface", { huggingfaceModel: event.target.value })}
                        placeholder="BAAI/bge-small-en-v1.5"
                        className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  )}
                </div>

                {testResults[provider] && (
                  <div className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
                    testResults[provider]?.ok
                      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                      : "border-destructive/20 bg-destructive/10 text-destructive"
                  }`}>
                    <div>{testResults[provider]?.message}</div>
                    <div className="mt-1 opacity-80">
                      {new Date(testResults[provider]!.checkedAt).toLocaleString()}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Lever Sync Automation</h2>
          </div>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
            workspace.settings.integrations.lever.configured
              ? "border border-primary/20 bg-primary/10 text-primary"
              : "border border-border bg-secondary text-muted-foreground"
          }`}>
            {workspace.settings.integrations.lever.configured ? "Ready" : "Lever key missing"}
          </span>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Max Applicants</label>
            <input
              type="number"
              min={1}
              max={500}
              value={leverMaxApplicants}
              onChange={(event) => setLeverMaxApplicants(Number(event.target.value) || 1)}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Resurface Window (days)</label>
            <input
              type="number"
              min={30}
              max={730}
              value={leverResurfacingWindowDays}
              onChange={(event) => setLeverResurfacingWindowDays(Number(event.target.value) || 180)}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex items-end">
            <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={leverIncludeArchived}
                onChange={(event) => setLeverIncludeArchived(event.target.checked)}
                className="h-4 w-4 rounded border-border bg-background"
              />
              Include archived applicants
            </label>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleLeverSync("preview")}
            disabled={leverSyncing !== null || !workspace.settings.integrations.lever.configured}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
          >
            {leverSyncing === "preview" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            {leverSyncing === "preview" ? "Previewing..." : "Preview Run"}
          </button>
          <button
            type="button"
            onClick={() => void handleLeverSync("sync")}
            disabled={leverSyncing !== null || !workspace.settings.integrations.lever.configured}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {leverSyncing === "sync" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {leverSyncing === "sync" ? "Syncing..." : "Run Sync"}
          </button>
        </div>

        {leverSyncResult && (
          <div className="mt-4 rounded-lg border border-border bg-background p-4">
            <div className="grid gap-3 md:grid-cols-4">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Scanned</p>
                <p className="text-lg font-semibold text-foreground">{leverSyncResult.scannedApplicants}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Created</p>
                <p className="text-lg font-semibold text-foreground">{leverSyncResult.createdPeople}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Updated</p>
                <p className="text-lg font-semibold text-foreground">{leverSyncResult.updatedPeople}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Resurfaced</p>
                <p className="text-lg font-semibold text-foreground">{leverSyncResult.resurfacedApplicants}</p>
              </div>
            </div>

            <div className="mt-3 grid gap-2 md:grid-cols-4 text-xs text-muted-foreground">
              <div>Priority Outreach: <span className="text-foreground font-medium">{leverSyncResult.routeCounts.priorityOutreach}</span></div>
              <div>Operator Review: <span className="text-foreground font-medium">{leverSyncResult.routeCounts.operatorReview}</span></div>
              <div>Nurture/Recheck: <span className="text-foreground font-medium">{leverSyncResult.routeCounts.nurtureRecheck}</span></div>
              <div>Archive: <span className="text-foreground font-medium">{leverSyncResult.routeCounts.archive}</span></div>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Harmonic Debug</h2>
          </div>
          <button
            type="button"
            onClick={() => void loadHarmonicDebug()}
            disabled={harmonicDebugLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
          >
            {harmonicDebugLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {harmonicDebugLoading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-border bg-background p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Cached companies</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{harmonicDebug?.companyCount ?? 0}</p>
            <div className="mt-3 space-y-2 text-xs text-muted-foreground">
              {(harmonicDebug?.recentCompanies || []).length === 0 ? (
                <p>No company cache rows yet.</p>
              ) : (
                harmonicDebug?.recentCompanies.map((company) => (
                  <div key={company.id} className="rounded-lg border border-border px-3 py-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-foreground">{company.name}</p>
                        <p>{company.domain || "No domain"}</p>
                        <p>Updated {new Date(company.updatedAt).toLocaleString()}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setExpandedCompanyId((currentValue) => (
                          currentValue === company.id ? null : company.id
                        ))}
                        className="shrink-0 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-secondary"
                      >
                        {expandedCompanyId === company.id ? "Hide raw payload" : "View raw payload"}
                      </button>
                    </div>

                    {expandedCompanyId === company.id && (
                      <pre className="mt-3 overflow-x-auto rounded-lg border border-border bg-card p-3 text-[11px] leading-5 text-muted-foreground">
                        {JSON.stringify(company.rawPayload, null, 2)}
                      </pre>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-background p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Saved search drafts</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{harmonicDebug?.savedSearchCount ?? 0}</p>
            <div className="mt-3 space-y-2 text-xs text-muted-foreground">
              {(harmonicDebug?.recentSavedSearches || []).length === 0 ? (
                <p>No Harmonic saved-search rows yet.</p>
              ) : (
                harmonicDebug?.recentSavedSearches.map((savedSearch: AiFundHarmonicSavedSearch) => (
                  <div key={savedSearch.id} className="rounded-lg border border-border px-3 py-2">
                    <p className="font-medium text-foreground">{resolveConceptName(savedSearch.conceptId)}</p>
                    <p className="line-clamp-2">{savedSearch.queryText}</p>
                    <p>{savedSearch.resultCount} results • {savedSearch.status}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Globe className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Sourcing Channels</h2>
        </div>

        <div className="space-y-3">
          {channels.map((channel) => (
            <div key={channel.id} className="rounded-lg border border-border bg-background p-4">
              <div className="mb-3 flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-foreground">{channel.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{channel.description}</p>
                </div>
                <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={channel.enabled}
                    onChange={(event) => updateChannel(channel.id, { enabled: event.target.checked })}
                    className="h-4 w-4 rounded border-border bg-background"
                  />
                  Enabled
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Provider</label>
                  <select
                    value={channel.provider}
                    onChange={(event) => updateChannel(channel.id, {
                      provider: event.target.value as SourcingChannelProvider,
                    })}
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="exa">Exa</option>
                    <option value="parallel">Parallel</option>
                    <option value="github">GitHub</option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs text-muted-foreground">Domains</label>
                  <input
                    type="text"
                    value={channel.domains.join(", ")}
                    onChange={(event) => updateChannel(channel.id, {
                      domains: event.target.value
                        .split(",")
                        .map((value) => value.trim())
                        .filter(Boolean),
                    })}
                    placeholder="example.com, another.com"
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              <div className="mt-3">
                <label className="mb-1 block text-xs text-muted-foreground">Query Template</label>
                <input
                  type="text"
                  value={channel.queryTemplate}
                  onChange={(event) => updateChannel(channel.id, { queryTemplate: event.target.value })}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Evaluation Criteria</h2>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {workspace.settings.evaluationCriteria.map((criterion) => (
            <div key={criterion.id} className="rounded-lg border border-border bg-background p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-foreground">{criterion.label}</p>
                <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">
                  {criterion.weight}%
                </span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{criterion.description}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Role-Adjusted Weights</p>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-border bg-background p-4">
              <p className="mb-2 text-sm font-medium text-foreground">FIR (Founder / Idea Realizer)</p>
              <div className="space-y-1 text-xs text-muted-foreground">
                <div className="flex justify-between"><span>AI Excellence</span><span className="text-primary">38%</span></div>
                <div className="flex justify-between"><span>Technical Ability</span><span className="text-primary">28%</span></div>
                <div className="flex justify-between"><span>Product Instinct</span><span className="text-primary">20%</span></div>
                <div className="flex justify-between"><span>Leadership Potential</span><span className="text-primary">14%</span></div>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-background p-4">
              <p className="mb-2 text-sm font-medium text-foreground">VE (Venture Executive)</p>
              <div className="space-y-1 text-xs text-muted-foreground">
                <div className="flex justify-between"><span>AI Excellence</span><span className="text-primary">38%</span></div>
                <div className="flex justify-between"><span>Technical Ability</span><span className="text-primary">35%</span></div>
                <div className="flex justify-between"><span>Product Instinct</span><span className="text-primary">12%</span></div>
                <div className="flex justify-between"><span>Leadership Potential</span><span className="text-primary">15%</span></div>
              </div>
            </div>
          </div>

          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mt-4">Score Thresholds (1-4 Scale)</p>
          <div className="rounded-lg border border-border bg-background p-4">
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center gap-2"><span className="inline-block h-2 w-2 rounded-full bg-emerald-400" /><span className="text-emerald-400 font-medium w-20">3.5 - 4.0</span><span className="text-muted-foreground">Exceptional</span></div>
              <div className="flex items-center gap-2"><span className="inline-block h-2 w-2 rounded-full bg-primary" /><span className="text-primary font-medium w-20">2.8 - 3.4</span><span className="text-muted-foreground">Strong</span></div>
              <div className="flex items-center gap-2"><span className="inline-block h-2 w-2 rounded-full bg-yellow-400" /><span className="text-yellow-400 font-medium w-20">2.0 - 2.7</span><span className="text-muted-foreground">Moderate</span></div>
              <div className="flex items-center gap-2"><span className="inline-block h-2 w-2 rounded-full bg-orange-400" /><span className="text-orange-400 font-medium w-20">1.5 - 1.9</span><span className="text-muted-foreground">Below Bar</span></div>
              <div className="flex items-center gap-2"><span className="inline-block h-2 w-2 rounded-full bg-destructive" /><span className="text-destructive font-medium w-20">&lt; 1.5</span><span className="text-muted-foreground">No Hire</span></div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Database className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">EEA Scoring (Automated Pipeline)</h2>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          Evidence of Exceptional Ability scoring runs automatically during the FounderFinder pipeline. Candidates are scored 0-100 based on verifiable achievement signals detected in their profiles.
        </p>

        <div className="space-y-3">
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
            <p className="mb-2 text-sm font-medium text-emerald-400">Tier 1 Signals (Score starts at 85)</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              IOI/IMO Gold, ICPC World Finals, Kaggle Grandmaster, NeurIPS/ICML/ICLR Best Paper,
              Hertz/Knight-Hennessy/Thiel Fellowship, YC/a16z Speedrun, prior exits &gt;$50M,
              major OSS (10k+ stars), major HuggingFace contributors. 49 patterns total.
            </p>
          </div>

          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
            <p className="mb-2 text-sm font-medium text-primary">Tier 2 Signals (Score starts at 40-48)</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              NeurIPS/ICML/ICLR/CVPR publications, IOI Silver/Bronze, USAMO/Putnam,
              Codeforces Grandmaster, Kaggle Master, VC-backed Series A/B,
              hackathon winners, top university affiliations. 30 patterns total.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-background p-4">
            <p className="mb-2 text-sm font-medium text-foreground">Bonuses &amp; Penalties</p>
            <div className="grid gap-2 md:grid-cols-2 text-xs text-muted-foreground">
              <div>
                <p className="font-medium text-foreground mb-1">Bonuses (+5 each)</p>
                <p>Bay Area location, Founder/co-founder evidence, B2B/enterprise focus</p>
              </div>
              <div>
                <p className="font-medium text-foreground mb-1">False Positive Penalties</p>
                <p>Workshop papers, Findings of ACL/EMNLP, TEDx, IBM patent volume, Forbes 30U30 (non-Enterprise Tech), Kaggle Expert/Contributor, sponsor bounty prizes, provisional patents</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
