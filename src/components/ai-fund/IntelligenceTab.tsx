import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle,
  Clock,
  ExternalLink,
  Loader2,
  Plus,
  Upload,
  XCircle,
} from "lucide-react";
import type {
  AiFundHarmonicFounderSummary,
  AiFundHarmonicIntelligenceSummary,
  AiFundIntelligenceImportCandidate,
  AiFundIntelligenceRun,
  AiFundProviderIntelligenceSummary,
  AiFundSourcingChannel,
  AiFundWorkspace,
  IntelligenceProvider,
  IntelligenceRunStatus,
} from "@/types/ai-fund";
import { createIntelligenceRun, fetchIntelligenceRuns } from "@/lib/ai-fund";
import { runAiFundIntelligence } from "@/lib/aifund-settings";

interface Props {
  workspace: AiFundWorkspace;
}

const EXECUTABLE_PROVIDERS: Exclude<IntelligenceProvider, "manual">[] = [
  "harmonic",
  "exa",
  "parallel",
  "github",
];

const STATUS_CONFIG: Record<IntelligenceRunStatus, { icon: React.ElementType; color: string }> = {
  pending: { icon: Clock, color: "text-yellow-400" },
  running: { icon: Loader2, color: "text-blue-400" },
  completed: { icon: CheckCircle, color: "text-emerald-400" },
  failed: { icon: XCircle, color: "text-destructive" },
};

const PROVIDER_LABELS: Record<IntelligenceProvider, string> = {
  harmonic: "Harmonic",
  exa: "Exa Websets",
  parallel: "Parallel Deep Research",
  github: "GitHub API",
  manual: "Manual Import",
};

function normalizeComparableUrl(value: string | null | undefined): string | null {
  return value?.trim().toLowerCase().replace(/\/+$/, "") || null;
}

function getChannelLabel(
  settingsChannels: AiFundSourcingChannel[],
  channelId: string | null,
): string | null {
  if (!channelId) {
    return null;
  }

  return settingsChannels.find((channel) => channel.id === channelId)?.label || channelId;
}

export default function IntelligenceTab({ workspace }: Props) {
  const [runs, setRuns] = useState<AiFundIntelligenceRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importingKey, setImportingKey] = useState<string | null>(null);

  const [formProvider, setFormProvider] = useState<Exclude<IntelligenceProvider, "manual">>("harmonic");
  const [formQuery, setFormQuery] = useState("");
  const [formConceptId, setFormConceptId] = useState<string>("");
  const [formChannelIds, setFormChannelIds] = useState<string[]>([]);

  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const intelligenceRuns = await fetchIntelligenceRuns();
        setRuns(intelligenceRuns);
      } catch (loadError) {
        console.error("Failed to load intelligence runs:", loadError);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  useEffect(() => {
    const configuredProvider = EXECUTABLE_PROVIDERS.find((provider) =>
      workspace.settings.integrations[provider].configured
    ) || "harmonic";

    setFormProvider((currentProvider) => (
      EXECUTABLE_PROVIDERS.includes(currentProvider) ? currentProvider : configuredProvider
    ));
  }, [workspace.settings]);

  const providerOptions = useMemo(() => (
    EXECUTABLE_PROVIDERS.map((provider) => ({
      provider,
      label: PROVIDER_LABELS[provider],
      configured: workspace.settings.integrations[provider].configured,
      source: workspace.settings.integrations[provider].source,
    }))
  ), [workspace.settings]);

  const availableChannels = useMemo(() => (
    workspace.settings.sourcingChannels.filter((channel) => (
      channel.enabled && channel.provider === formProvider
    ))
  ), [formProvider, workspace.settings.sourcingChannels]);

  useEffect(() => {
    if (formProvider === "harmonic") {
      setFormChannelIds([]);
      return;
    }

    setFormChannelIds(availableChannels.map((channel) => channel.id));
  }, [availableChannels, formProvider]);

  const selectedProviderConfigured = workspace.settings.integrations[formProvider].configured;

  const getHarmonicSummary = (
    run: AiFundIntelligenceRun,
  ): AiFundHarmonicIntelligenceSummary | null => {
    if (!run.resultsSummary || Array.isArray(run.resultsSummary)) {
      return null;
    }

    const summary = run.resultsSummary as Partial<AiFundHarmonicIntelligenceSummary>;
    return summary.source === "harmonic" && Array.isArray(summary.companies)
      ? summary as AiFundHarmonicIntelligenceSummary
      : null;
  };

  const getProviderSummary = (
    run: AiFundIntelligenceRun,
  ): AiFundProviderIntelligenceSummary | null => {
    if (!run.resultsSummary || Array.isArray(run.resultsSummary)) {
      return null;
    }

    const summary = run.resultsSummary as Partial<AiFundProviderIntelligenceSummary>;
    return (
      (summary.source === "exa" || summary.source === "parallel" || summary.source === "github") &&
      Array.isArray(summary.items)
    )
      ? summary as AiFundProviderIntelligenceSummary
      : null;
  };

  const getRunError = (run: AiFundIntelligenceRun): string | null => {
    if (!run.resultsSummary || Array.isArray(run.resultsSummary)) {
      return null;
    }

    const maybeError = (run.resultsSummary as { error?: unknown }).error;
    return typeof maybeError === "string" && maybeError.trim() ? maybeError : null;
  };

  const isImportCandidateImported = (candidate: AiFundIntelligenceImportCandidate): boolean => {
    const candidateLinkedIn = normalizeComparableUrl(candidate.linkedinUrl);
    const candidateGitHub = normalizeComparableUrl(candidate.githubUrl);
    const candidateFullName = candidate.fullName.trim().toLowerCase();
    const candidateCompany = (candidate.currentCompany || "").trim().toLowerCase();

    return workspace.people.some((person) => {
      const personLinkedIn = normalizeComparableUrl(person.linkedinUrl);
      const personGitHub = normalizeComparableUrl(person.githubUrl);

      if (candidateLinkedIn && personLinkedIn === candidateLinkedIn) {
        return true;
      }

      if (candidateGitHub && personGitHub === candidateGitHub) {
        return true;
      }

      return (
        person.fullName.trim().toLowerCase() === candidateFullName &&
        (person.currentCompany || "").trim().toLowerCase() === candidateCompany
      );
    });
  };

  const isFounderImported = (
    founder: AiFundHarmonicFounderSummary,
    companyName: string,
  ): boolean => isImportCandidateImported({
    fullName: founder.name,
    linkedinUrl: founder.linkedinUrl,
    currentRole: founder.title,
    currentCompany: companyName,
    personType: "fir",
  });

  const handleImportCandidate = async (
    candidate: AiFundIntelligenceImportCandidate,
    importKey: string,
  ): Promise<void> => {
    if (isImportCandidateImported(candidate)) {
      return;
    }

    try {
      setImportingKey(importKey);
      await workspace.addPerson({
        fullName: candidate.fullName,
        email: candidate.email || null,
        linkedinUrl: candidate.linkedinUrl || null,
        githubUrl: candidate.githubUrl || null,
        websiteUrl: candidate.websiteUrl || null,
        currentRole: candidate.currentRole || null,
        currentCompany: candidate.currentCompany || null,
        location: candidate.location || null,
        bio: candidate.bio || null,
        personType: candidate.personType || "ve",
        sourceChannel: candidate.sourceChannel || null,
        metadata: candidate.metadata || null,
      });
    } catch (importError) {
      console.error("Failed to import candidate:", importError);
    } finally {
      setImportingKey(null);
    }
  };

  const handleImportFounder = async (
    founder: AiFundHarmonicFounderSummary,
    companyName: string,
  ): Promise<void> => {
    const importKey = `${companyName}:${founder.name}:${founder.linkedinUrl || "no-linkedin"}`;
    await handleImportCandidate({
      fullName: founder.name,
      linkedinUrl: founder.linkedinUrl,
      currentRole: founder.title,
      currentCompany: companyName,
      personType: "fir",
    }, importKey);
  };

  const handleCreate = async (): Promise<void> => {
    if (!formQuery.trim() || !selectedProviderConfigured) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const run = await createIntelligenceRun({
        provider: formProvider,
        queryParams: {
          query: formQuery.trim(),
          conceptId: formConceptId || null,
          channelIds: formChannelIds,
        },
      });

      setRuns((prev) => [run, ...prev]);

      const response = await runAiFundIntelligence({
        runId: run.id,
        query: formQuery.trim(),
        conceptId: formConceptId || null,
        channelIds: formProvider === "harmonic" ? [] : formChannelIds,
      });

      setRuns((prev) => prev.map((existingRun) => (
        existingRun.id === run.id
          ? {
              ...response.run,
              resultsSummary: response.resultsSummary,
            }
          : existingRun
      )));

      setFormQuery("");
      setFormConceptId("");
      setFormChannelIds([]);
      setShowForm(false);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Failed to start intelligence run");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-pulse text-muted-foreground text-sm">Loading intelligence runs...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Intelligence</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Harmonic, Exa, Parallel, and GitHub runs from one workflow
          </p>
        </div>
        <button
          onClick={() => setShowForm((currentValue) => !currentValue)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Run
        </button>
      </div>

      {showForm && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
          {error && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <select
              value={formProvider}
              onChange={(event) => setFormProvider(event.target.value as Exclude<IntelligenceProvider, "manual">)}
              className="px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground"
            >
              {providerOptions.map((option) => (
                <option key={option.provider} value={option.provider}>
                  {option.label}{option.configured ? "" : " (missing key)"}
                </option>
              ))}
            </select>

            <select
              value={formConceptId}
              onChange={(event) => setFormConceptId(event.target.value)}
              className="px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground"
            >
              <option value="">No concept link</option>
              {workspace.concepts.map((concept) => (
                <option key={concept.id} value={concept.id}>
                  {concept.name}
                </option>
              ))}
            </select>
          </div>

          <input
            type="text"
            placeholder="Search query *"
            value={formQuery}
            onChange={(event) => setFormQuery(event.target.value)}
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />

          {formProvider !== "harmonic" && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Sourcing Channels</p>
              {availableChannels.length === 0 ? (
                <div className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
                  No enabled {PROVIDER_LABELS[formProvider]} channels. Configure them in Settings.
                </div>
              ) : (
                <div className="grid gap-2 md:grid-cols-2">
                  {availableChannels.map((channel) => (
                    <label
                      key={channel.id}
                      className="flex items-start gap-3 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                    >
                      <input
                        type="checkbox"
                        checked={formChannelIds.includes(channel.id)}
                        onChange={(event) => {
                          setFormChannelIds((current) => (
                            event.target.checked
                              ? [...current, channel.id]
                              : current.filter((id) => id !== channel.id)
                          ));
                        }}
                        className="mt-0.5 h-4 w-4 rounded border-border bg-background"
                      />
                      <span>
                        <span className="block font-medium">{channel.label}</span>
                        <span className="block text-xs text-muted-foreground">{channel.description}</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {!selectedProviderConfigured && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
              {PROVIDER_LABELS[formProvider]} is not configured yet. Add the API key in Settings first.
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={!formQuery.trim() || submitting || !selectedProviderConfigured}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {submitting ? "Running..." : "Start Run"}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-lg bg-secondary text-muted-foreground text-sm hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {runs.length === 0 ? (
        <div className="py-12 text-center bg-card border border-border rounded-xl">
          <p className="text-sm text-muted-foreground">
            No intelligence runs yet. Start one above.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {runs.map((run) => {
            const config = STATUS_CONFIG[run.status];
            const StatusIcon = config.icon;
            const harmonicSummary = getHarmonicSummary(run);
            const providerSummary = getProviderSummary(run);
            const runError = getRunError(run);

            return (
              <div key={run.id} className="space-y-3 rounded-lg border border-border bg-card px-4 py-3">
                <div className="flex items-center gap-3">
                  <StatusIcon className={`w-4 h-4 shrink-0 ${config.color} ${run.status === "running" ? "animate-spin" : ""}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {PROVIDER_LABELS[run.provider]}
                      </span>
                      <span className="text-xs text-muted-foreground">{run.status}</span>
                      {typeof run.queryParams === "object" &&
                        run.queryParams !== null &&
                        Array.isArray((run.queryParams as { channelIds?: unknown }).channelIds) &&
                        ((run.queryParams as { channelIds?: string[] }).channelIds || []).map((channelId) => (
                          <span
                            key={channelId}
                            className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase text-muted-foreground"
                          >
                            {getChannelLabel(workspace.settings.sourcingChannels, channelId)}
                          </span>
                        ))}
                      {typeof run.queryParams === "object" && run.queryParams !== null && typeof (run.queryParams as { conceptId?: unknown }).conceptId === "string" && (
                        <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] uppercase text-primary">
                          {workspace.concepts.find((concept) => concept.id === (run.queryParams as { conceptId?: string }).conceptId)?.name || "Concept-linked"}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {typeof run.queryParams === "object" && run.queryParams !== null
                        ? (run.queryParams as { query?: string }).query || JSON.stringify(run.queryParams)
                        : "No query"}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-medium text-foreground">{run.resultsCount}</p>
                    <p className="text-xs text-muted-foreground">results</p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {new Date(run.createdAt).toLocaleDateString()}
                  </span>
                </div>

                {runError && (
                  <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {runError}
                  </div>
                )}

                {harmonicSummary && harmonicSummary.companies.length > 0 && (
                  <div className="grid gap-3 border-t border-border pt-3">
                    {harmonicSummary.companies.map((company) => (
                      <div key={company.harmonicCompanyId} className="rounded-lg border border-border/70 bg-background px-3 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-foreground">{company.name}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {[company.location, company.domain, company.fundingStage].filter(Boolean).join(" | ") || "No company metadata"}
                            </p>
                          </div>
                          <div className="text-right text-xs text-muted-foreground">
                            <p>{company.headcount ? `${company.headcount} headcount` : "Headcount n/a"}</p>
                            <p>{company.fundingTotal ? `$${company.fundingTotal.toLocaleString()} raised` : "Funding n/a"}</p>
                          </div>
                        </div>

                        {company.tags.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {company.tags.slice(0, 5).map((tag) => (
                              <span key={tag} className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="mt-3 space-y-2">
                          {company.founders.length === 0 ? (
                            <p className="text-xs text-muted-foreground">No founders returned.</p>
                          ) : (
                            company.founders.map((founder) => {
                              const importKey = `${company.harmonicCompanyId}:${founder.name}:${founder.linkedinUrl || "no-linkedin"}`;
                              const alreadyImported = isFounderImported(founder, company.name);

                              return (
                                <div key={importKey} className="flex items-center justify-between gap-3">
                                  <div className="text-xs text-muted-foreground">
                                    <span className="font-medium text-foreground">{founder.name}</span>
                                    {founder.title ? ` | ${founder.title}` : ""}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => void handleImportFounder(founder, company.name)}
                                    disabled={alreadyImported || importingKey === importKey}
                                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
                                  >
                                    {importingKey === importKey ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <Upload className="h-3 w-3" />
                                    )}
                                    {alreadyImported ? "Imported" : "Import"}
                                  </button>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {providerSummary && providerSummary.items.length > 0 && (
                  <div className="grid gap-3 border-t border-border pt-3">
                    {providerSummary.items.map((item) => {
                      const importKey = `${providerSummary.source}:${item.id}`;
                      const alreadyImported = item.importCandidate ? isImportCandidateImported(item.importCandidate) : false;

                      return (
                        <div key={item.id} className="rounded-lg border border-border/70 bg-background px-3 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground">{item.title}</p>
                              {item.subtitle && (
                                <p className="mt-1 text-xs text-muted-foreground">{item.subtitle}</p>
                              )}
                            </div>
                            {item.url && (
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-primary"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            )}
                          </div>

                          {item.snippet && (
                            <p className="mt-3 text-xs leading-5 text-muted-foreground">
                              {item.snippet}
                            </p>
                          )}

                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            {item.sourceChannel && (
                              <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] uppercase text-primary">
                                {getChannelLabel(workspace.settings.sourcingChannels, item.sourceChannel)}
                              </span>
                            )}
                            {item.tags.map((tag) => (
                              <span key={tag} className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
                                {tag}
                              </span>
                            ))}

                            {item.importCandidate && (
                              <button
                                type="button"
                                onClick={() => void handleImportCandidate(item.importCandidate as AiFundIntelligenceImportCandidate, importKey)}
                                disabled={alreadyImported || importingKey === importKey}
                                className="ml-auto inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
                              >
                                {importingKey === importKey ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Upload className="h-3 w-3" />
                                )}
                                {alreadyImported ? "Imported" : "Import"}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
