import { useEffect, useState } from "react";
import { Bell, Globe, Key, Loader2, Save } from "lucide-react";
import type {
  AiFundAppSettings,
  AiFundIntegrationConfig,
  AiFundSourcingChannel,
  AiFundWorkspace,
  IntegrationProvider,
  SourcingChannelProvider,
} from "@/types/ai-fund";

interface Props {
  workspace: AiFundWorkspace;
}

interface IntegrationDraftState {
  apiKeys: Partial<Record<IntegrationProvider, string>>;
  harmonicBaseUrl: string;
  anthropicModel: string;
}

function buildInitialDraft(workspace: AiFundWorkspace): IntegrationDraftState {
  return {
    apiKeys: {},
    harmonicBaseUrl: workspace.settings.integrations.harmonic.baseUrl || "",
    anthropicModel: workspace.settings.integrations.anthropic.model || "",
  };
}

function buildDraftFromSettings(settings: AiFundAppSettings): IntegrationDraftState {
  return {
    apiKeys: {},
    harmonicBaseUrl: settings.integrations.harmonic.baseUrl || "",
    anthropicModel: settings.integrations.anthropic.model || "",
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
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    setDraft(buildDraftFromSettings(workspace.settings));
    setChannels(workspace.settings.sourcingChannels);
  }, [workspace.settings]);

  const updateApiKey = (provider: IntegrationProvider, value: string): void => {
    setDraft((prev) => ({
      ...prev,
      apiKeys: {
        ...prev.apiKeys,
        [provider]: value,
      },
    }));
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
        },
      }));
      setSaved("Settings saved");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
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
          {(["harmonic", "exa", "github", "parallel", "anthropic"] as IntegrationProvider[]).map((provider) => {
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
                        onChange={(event) => setDraft((prev) => ({ ...prev, harmonicBaseUrl: event.target.value }))}
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
                        onChange={(event) => setDraft((prev) => ({ ...prev, anthropicModel: event.target.value }))}
                        placeholder="claude-sonnet"
                        className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
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
      </div>
    </div>
  );
}
