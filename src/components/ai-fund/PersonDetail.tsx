import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2, X } from "lucide-react";
import type {
  AiFundEngagement,
  AiFundEvaluationScore,
  AiFundEvidence,
  AiFundPerson,
  AiFundWorkspace,
  PersonType,
  ProcessStage,
} from "@/types/ai-fund";
import { fetchEngagements, fetchEvidence, fetchScoresForPerson } from "@/lib/ai-fund";
import { computeCompositeScore, scoreColor, scoreLabel } from "@/lib/aifund-scoring";

interface Props {
  person: AiFundPerson;
  workspace: AiFundWorkspace;
  onClose: () => void;
}

const PERSON_TYPE_LABELS: Record<PersonType, string> = {
  fir: "FIR",
  ve: "VE",
  both: "Both",
};

const PROCESS_STAGE_LABELS: Record<ProcessStage, string> = {
  identified: "Identified",
  researched: "Researched",
  contacted: "Contacted",
  engaged: "Engaged",
  applied: "Applied",
  interviewing: "Interviewing",
  offered: "Offered",
  accepted: "Accepted",
  declined: "Declined",
  residency: "Residency",
  graduated: "Graduated",
  archived: "Archived",
};

function sourceChannelLabel(workspace: AiFundWorkspace, value: string | null): string | null {
  if (!value) {
    return null;
  }

  if (value === "manual_entry") {
    return "Manual Entry";
  }

  if (value === "harmonic_founder_search") {
    return "Harmonic Founder Search";
  }

  return workspace.settings.sourcingChannels.find((channel) => channel.id === value)?.label || value;
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "Not set";
  }

  return new Date(value).toLocaleString();
}

export default function PersonDetail({ person, workspace, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [scores, setScores] = useState<AiFundEvaluationScore[]>([]);
  const [evidence, setEvidence] = useState<AiFundEvidence[]>([]);
  const [engagements, setEngagements] = useState<AiFundEngagement[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async (): Promise<void> => {
      setLoading(true);
      setError(null);

      try {
        const [scoreRows, evidenceRows, engagementRows] = await Promise.all([
          fetchScoresForPerson(person.id),
          fetchEvidence(person.id),
          fetchEngagements(person.id),
        ]);

        if (cancelled) {
          return;
        }

        setScores(scoreRows);
        setEvidence(evidenceRows);
        setEngagements(engagementRows);
      } catch (loadError) {
        if (cancelled) {
          return;
        }

        setError(loadError instanceof Error ? loadError.message : "Failed to load person details");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [person.id]);

  const latestScore = scores[0] || null;
  const compositeScore = useMemo(() => {
    if (!latestScore) {
      return null;
    }

    return latestScore.compositeScore ?? computeCompositeScore({
      aiExcellence: latestScore.aiExcellence,
      technicalAbility: latestScore.technicalAbility,
      productInstinct: latestScore.productInstinct,
      leadershipPotential: latestScore.leadershipPotential,
    });
  }, [latestScore]);

  return (
    <div className="rounded-xl border border-primary/20 bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-foreground">{person.fullName}</h2>
            <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">
              {PERSON_TYPE_LABELS[person.personType]}
            </span>
            <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
              {PROCESS_STAGE_LABELS[person.processStage]}
            </span>
            {person.harmonicPersonId && (
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase text-emerald-400">
                Harmonic Enriched
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {[person.currentRole, person.currentCompany].filter(Boolean).join(" @ ") || "No role info"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {person.location || "Location unknown"}
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

      <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
        {sourceChannelLabel(workspace, person.sourceChannel) && (
          <span className="rounded-full border border-border px-2 py-0.5">
            Source: {sourceChannelLabel(workspace, person.sourceChannel)}
          </span>
        )}
        {person.harmonicEnrichedAt && (
          <span className="rounded-full border border-border px-2 py-0.5">
            Enriched {new Date(person.harmonicEnrichedAt).toLocaleString()}
          </span>
        )}
        {person.tags.map((tag) => (
          <span key={tag} className="rounded-full border border-border px-2 py-0.5">
            {tag}
          </span>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {person.linkedinUrl && (
          <a
            href={person.linkedinUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
          >
            LinkedIn
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
        {person.githubUrl && (
          <a
            href={person.githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
          >
            GitHub
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
        {person.websiteUrl && (
          <a
            href={person.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
          >
            Website
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>

      {person.bio && (
        <div className="mt-4 rounded-lg border border-border bg-background p-4">
          <h3 className="text-sm font-semibold text-foreground">About</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{person.bio}</p>
        </div>
      )}

      {loading ? (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading detail view...
        </div>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <div className="rounded-lg border border-border bg-background p-4 lg:col-span-1">
            <h3 className="text-sm font-semibold text-foreground">Evaluation</h3>
            {latestScore ? (
              <>
                <div className="mt-3">
                  <p className={`text-2xl font-semibold ${scoreColor(compositeScore)}`}>
                    {compositeScore !== null ? compositeScore.toFixed(1) : "n/a"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {compositeScore !== null ? scoreLabel(compositeScore) : "Unscored"}
                    {" • "}
                    Latest score {new Date(latestScore.scoredAt).toLocaleString()}
                  </p>
                </div>
                <div className="mt-4 space-y-3">
                  {workspace.settings.evaluationCriteria.map((criterion) => {
                    const value = latestScore[criterion.id];
                    return (
                      <div key={criterion.id}>
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs font-medium text-foreground">{criterion.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {value !== null && value !== undefined ? value.toFixed(1) : "n/a"}
                          </p>
                        </div>
                        <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                          {criterion.weight}% • {criterion.description}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">No evaluation scores yet.</p>
            )}
          </div>

          <div className="rounded-lg border border-border bg-background p-4 lg:col-span-1">
            <h3 className="text-sm font-semibold text-foreground">Evidence</h3>
            {error ? (
              <div className="mt-3 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            ) : evidence.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No evidence captured yet.</p>
            ) : (
              <div className="mt-3 space-y-3">
                {evidence.map((item) => (
                  <div key={item.id} className="rounded-lg border border-border px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{item.title}</p>
                        <p className="mt-1 text-[11px] uppercase text-muted-foreground">
                          {item.evidenceType.replace(/_/g, " ")}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {item.signalStrength !== null ? `${item.signalStrength}/5` : "n/a"}
                      </p>
                    </div>
                    {item.description && (
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.description}</p>
                    )}
                    {item.url && (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        Open source
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border bg-background p-4 lg:col-span-1">
            <h3 className="text-sm font-semibold text-foreground">Engagement History</h3>
            {error ? (
              <div className="mt-3 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            ) : engagements.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No engagements recorded yet.</p>
            ) : (
              <div className="mt-3 space-y-3">
                {engagements.map((engagement) => (
                  <div key={engagement.id} className="rounded-lg border border-border px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-foreground">
                        {engagement.channel}
                      </p>
                      <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
                        {engagement.direction}
                      </span>
                    </div>
                    {engagement.subject && (
                      <p className="mt-2 text-xs font-medium text-foreground">{engagement.subject}</p>
                    )}
                    {engagement.body && (
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">{engagement.body}</p>
                    )}
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Sent {formatDateTime(engagement.sentAt)}
                    </p>
                    {engagement.respondedAt && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Responded {formatDateTime(engagement.respondedAt)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
