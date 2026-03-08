import { useMemo, useState } from "react";
import { CheckCircle, ExternalLink, Loader2, Upload, X } from "lucide-react";
import type {
  AiFundHarmonicFounderSummary,
  AiFundHarmonicIntelligenceSummary,
  AiFundIntelligenceImportCandidate,
  AiFundIntelligenceRun,
  AiFundProviderIntelligenceSummary,
  AiFundWorkspace,
} from "@/types/ai-fund";

interface Props {
  run: AiFundIntelligenceRun;
  workspace: AiFundWorkspace;
  importingKey: string | null;
  onClose: () => void;
  onImportCandidate: (candidate: AiFundIntelligenceImportCandidate, importKey: string) => Promise<void>;
  onImportFounder: (founder: AiFundHarmonicFounderSummary, companyName: string) => Promise<void>;
  isImportCandidateImported: (candidate: AiFundIntelligenceImportCandidate) => boolean;
  isFounderImported: (founder: AiFundHarmonicFounderSummary, companyName: string) => boolean;
}

function getHarmonicSummary(
  run: AiFundIntelligenceRun,
): AiFundHarmonicIntelligenceSummary | null {
  if (!run.resultsSummary || Array.isArray(run.resultsSummary)) {
    return null;
  }

  const summary = run.resultsSummary as Partial<AiFundHarmonicIntelligenceSummary>;
  return summary.source === "harmonic" && Array.isArray(summary.companies)
    ? summary as AiFundHarmonicIntelligenceSummary
    : null;
}

function getProviderSummary(
  run: AiFundIntelligenceRun,
): AiFundProviderIntelligenceSummary | null {
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
}

function getRunQuery(run: AiFundIntelligenceRun): string {
  if (typeof run.queryParams !== "object" || run.queryParams === null) {
    return "No query";
  }

  const query = (run.queryParams as { query?: unknown }).query;
  return typeof query === "string" && query.trim() ? query : "No query";
}

function formatCurrency(value: number | null): string {
  if (value === null) {
    return "n/a";
  }

  return `$${value.toLocaleString()}`;
}

export default function IntelligenceRunDetail({
  run,
  workspace,
  importingKey,
  onClose,
  onImportCandidate,
  onImportFounder,
  isImportCandidateImported,
  isFounderImported,
}: Props) {
  const [expandedCompanyIds, setExpandedCompanyIds] = useState<string[]>([]);

  const harmonicSummary = useMemo(() => getHarmonicSummary(run), [run]);
  const providerSummary = useMemo(() => getProviderSummary(run), [run]);
  const conceptId = typeof run.queryParams === "object" && run.queryParams !== null
    ? (run.queryParams as { conceptId?: unknown }).conceptId
    : null;
  const conceptName = typeof conceptId === "string"
    ? workspace.concepts.find((concept) => concept.id === conceptId)?.name || "Concept-linked"
    : null;

  return (
    <div className="rounded-xl border border-primary/20 bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-foreground">Intelligence Run Detail</h2>
            <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] uppercase text-primary">
              {run.provider}
            </span>
            <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
              {run.status}
            </span>
            {conceptName && (
              <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
                {conceptName}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{getRunQuery(run)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Created {new Date(run.createdAt).toLocaleString()}
            {run.completedAt ? ` • Completed ${new Date(run.completedAt).toLocaleString()}` : ""}
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
          Close
        </button>
      </div>

      {harmonicSummary && harmonicSummary.companies.length > 0 && (
        <div className="mt-4 space-y-3">
          {harmonicSummary.companies.map((company) => {
            const isExpanded = expandedCompanyIds.includes(company.harmonicCompanyId);
            return (
              <div key={company.harmonicCompanyId} className="rounded-lg border border-border bg-background px-4 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{company.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {[company.location, company.domain, company.fundingStage].filter(Boolean).join(" • ") || "No company metadata"}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                      <span>Headcount: {company.headcount ?? "n/a"}</span>
                      <span>Funding: {formatCurrency(company.fundingTotal)}</span>
                      <span>Last round: {formatCurrency(company.lastFundingTotal)}</span>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {company.linkedinUrl && (
                      <a
                        href={company.linkedinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                    {company.websiteUrl && (
                      <a
                        href={company.websiteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => setExpandedCompanyIds((currentValue) => (
                        isExpanded
                          ? currentValue.filter((companyId) => companyId !== company.harmonicCompanyId)
                          : [...currentValue, company.harmonicCompanyId]
                      ))}
                      className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
                    >
                      {isExpanded ? "Hide detail" : "View detail"}
                    </button>
                  </div>
                </div>

                {company.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {company.tags.map((tag) => (
                      <span key={tag} className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {isExpanded && (
                  <div className="mt-4 space-y-3 border-t border-border pt-4">
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="rounded-lg border border-border px-3 py-3">
                        <p className="text-[11px] uppercase text-muted-foreground">Funding Stage</p>
                        <p className="mt-1 text-sm text-foreground">{company.fundingStage || "n/a"}</p>
                      </div>
                      <div className="rounded-lg border border-border px-3 py-3">
                        <p className="text-[11px] uppercase text-muted-foreground">30d Headcount Growth</p>
                        <p className="mt-1 text-sm text-foreground">{company.headcountGrowth30d ?? "n/a"}</p>
                      </div>
                      <div className="rounded-lg border border-border px-3 py-3">
                        <p className="text-[11px] uppercase text-muted-foreground">90d Headcount Growth</p>
                        <p className="mt-1 text-sm text-foreground">{company.headcountGrowth90d ?? "n/a"}</p>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Founders</h3>
                      {company.founders.length === 0 ? (
                        <p className="mt-2 text-sm text-muted-foreground">No founders returned.</p>
                      ) : (
                        <div className="mt-3 space-y-2">
                          {company.founders.map((founder) => {
                            const importKey = `${company.harmonicCompanyId}:${founder.name}:${founder.linkedinUrl || "no-linkedin"}`;
                            const alreadyImported = isFounderImported(founder, company.name);

                            return (
                              <div key={importKey} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-3">
                                <div>
                                  <p className="text-sm font-medium text-foreground">{founder.name}</p>
                                  <p className="mt-1 text-xs text-muted-foreground">{founder.title || "No title"}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                  {founder.linkedinUrl && (
                                    <a
                                      href={founder.linkedinUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:text-foreground"
                                    >
                                      <ExternalLink className="h-3.5 w-3.5" />
                                    </a>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => void onImportFounder(founder, company.name)}
                                    disabled={alreadyImported || importingKey === importKey}
                                    className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
                                  >
                                    {alreadyImported ? (
                                      <CheckCircle className="h-3.5 w-3.5" />
                                    ) : importingKey === importKey ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Upload className="h-3.5 w-3.5" />
                                    )}
                                    {alreadyImported ? "Imported" : importingKey === importKey ? "Importing..." : "Import"}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {providerSummary && providerSummary.items.length > 0 && (
        <div className="mt-4 space-y-3">
          {providerSummary.items.map((item) => {
            const importKey = `${providerSummary.source}:${item.id}`;
            const alreadyImported = item.importCandidate ? isImportCandidateImported(item.importCandidate) : false;

            return (
              <div key={item.id} className="rounded-lg border border-border bg-background px-4 py-4">
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
                      className="rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>

                {item.snippet && (
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.snippet}</p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {item.tags.map((tag) => (
                    <span key={tag} className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
                      {tag}
                    </span>
                  ))}
                  {item.importCandidate && (
                    <button
                      type="button"
                      onClick={() => void onImportCandidate(item.importCandidate as AiFundIntelligenceImportCandidate, importKey)}
                      disabled={alreadyImported || importingKey === importKey}
                      className="ml-auto inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
                    >
                      {alreadyImported ? (
                        <CheckCircle className="h-3.5 w-3.5" />
                      ) : importingKey === importKey ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Upload className="h-3.5 w-3.5" />
                      )}
                      {alreadyImported ? "Imported" : importingKey === importKey ? "Importing..." : "Import"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!harmonicSummary && !providerSummary && (
        <div className="mt-4 rounded-lg border border-border bg-background px-4 py-6 text-sm text-muted-foreground">
          No detailed results are available for this run yet.
        </div>
      )}
    </div>
  );
}
