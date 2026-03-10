import { useState } from "react";
import { Brain, Link2, Loader2, Plus } from "lucide-react";
import type { AiFundWorkspace, AssignmentRole } from "@/types/ai-fund";
import type { SemanticMatchScore } from "@/lib/huggingface";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  workspace: AiFundWorkspace;
}

export default function MatchingBoardTab({ workspace }: Props) {
  const { concepts, people, assignments, loading, addAssignment, settings } = workspace;
  const [showForm, setShowForm] = useState(false);
  const [selectedConcept, setSelectedConcept] = useState("");
  const [selectedPerson, setSelectedPerson] = useState("");
  const [selectedRole, setSelectedRole] = useState<AssignmentRole>("fir");

  // Semantic matching state
  const [matchingConceptId, setMatchingConceptId] = useState<string | null>(null);
  const [matchScores, setMatchScores] = useState<Record<string, SemanticMatchScore[]>>({});
  const [matchError, setMatchError] = useState<string | null>(null);

  const hfConfig = settings.integrations.huggingface;

  const handleAssign = async () => {
    if (!selectedConcept || !selectedPerson) return;
    await addAssignment({
      conceptId: selectedConcept,
      personId: selectedPerson,
      role: selectedRole,
    });
    setSelectedConcept("");
    setSelectedPerson("");
    setShowForm(false);
  };

  const handleSemanticMatch = async (conceptId: string) => {
    if (!hfConfig.configured) {
      setMatchError("Add a Hugging Face API token in Settings first.");
      return;
    }

    setMatchingConceptId(conceptId);
    setMatchError(null);

    const concept = concepts.find((c) => c.id === conceptId);
    if (!concept) return;

    try {
      const { data, error } = await supabase.functions.invoke("semantic-match", {
        body: {
          conceptId,
          concept: {
            name: concept.name,
            description: concept.notes,
            thesis: concept.thesis,
          },
          people: people.map((p) => ({
            id: p.id,
            fullName: p.fullName,
            currentRole: p.currentRole,
            currentCompany: p.currentCompany,
            bio: p.bio,
          })),
        },
      });

      if (error) {
        throw new Error(error.message || "Semantic match request failed");
      }

      const result = data as { scores: SemanticMatchScore[] };
      setMatchScores((prev) => ({ ...prev, [conceptId]: result.scores }));
    } catch (err: unknown) {
      setMatchError(err instanceof Error ? err.message : "Semantic matching failed");
    } finally {
      setMatchingConceptId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-pulse text-muted-foreground text-sm">Loading matching board...</div>
      </div>
    );
  }

  // Build assignment view: concept -> assigned people
  const personMap = new Map(people.map((p) => [p.id, p]));

  const assignmentsByConceptId = assignments.reduce(
    (acc, a) => {
      if (!acc[a.conceptId]) acc[a.conceptId] = [];
      acc[a.conceptId].push(a);
      return acc;
    },
    {} as Record<string, typeof assignments>
  );

  const labelColor = (label: SemanticMatchScore["label"]) => {
    switch (label) {
      case "Strong":
        return "border-emerald-500/20 bg-emerald-500/10 text-emerald-400";
      case "Moderate":
        return "border-yellow-500/20 bg-yellow-500/10 text-yellow-400";
      case "Weak":
        return "border-border bg-secondary text-muted-foreground";
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Matching Board</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Assign candidates to concepts as FIR or VE
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Assignment
        </button>
      </div>

      {matchError && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {matchError}
        </div>
      )}

      {/* Assignment form */}
      {showForm && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <select
              value={selectedConcept}
              onChange={(e) => setSelectedConcept(e.target.value)}
              className="px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground"
            >
              <option value="">Select concept</option>
              {concepts.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select
              value={selectedPerson}
              onChange={(e) => setSelectedPerson(e.target.value)}
              className="px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground"
            >
              <option value="">Select person</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>{p.fullName}</option>
              ))}
            </select>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value as AssignmentRole)}
              className="px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground"
            >
              <option value="fir">FIR</option>
              <option value="ve">VE</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAssign}
              disabled={!selectedConcept || !selectedPerson}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              Assign
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

      {/* Matching grid */}
      {concepts.length === 0 ? (
        <div className="py-12 text-center bg-card border border-border rounded-xl">
          <p className="text-sm text-muted-foreground">
            No concepts yet. Create one in the Concept Pipeline tab first.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {concepts.map((concept) => {
            const conceptAssignments = assignmentsByConceptId[concept.id] || [];
            const scores = matchScores[concept.id];
            const isMatching = matchingConceptId === concept.id;

            return (
              <div key={concept.id} className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <Link2 className="w-4 h-4 text-primary" />
                    <h3 className="text-sm font-semibold text-foreground">{concept.name}</h3>
                    <span className="text-xs text-muted-foreground">
                      {conceptAssignments.length} assigned
                    </span>
                  </div>

                  {people.length > 0 && (
                    <button
                      onClick={() => void handleSemanticMatch(concept.id)}
                      disabled={isMatching || !hfConfig.configured}
                      title={hfConfig.configured ? "Rank candidates by semantic fit" : "Configure Hugging Face API in Settings"}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
                    >
                      {isMatching ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Brain className="h-3.5 w-3.5" />
                      )}
                      {isMatching ? "Matching..." : "Semantic Match"}
                    </button>
                  )}
                </div>

                {conceptAssignments.length === 0 && !scores ? (
                  <p className="text-xs text-muted-foreground py-2">No assignments yet</p>
                ) : (
                  <div className="space-y-1.5">
                    {conceptAssignments.map((a) => {
                      const person = personMap.get(a.personId);
                      const scoreEntry = scores?.find((s) => s.personId === a.personId);
                      return (
                        <div
                          key={a.id}
                          className="flex items-center gap-3 px-3 py-2 bg-background rounded-lg"
                        >
                          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary text-[10px] font-semibold shrink-0">
                            {person?.fullName.charAt(0) || "?"}
                          </div>
                          <span className="text-sm text-foreground flex-1 truncate">
                            {person?.fullName || "Unknown"}
                          </span>
                          {scoreEntry && (
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${labelColor(scoreEntry.label)}`}>
                              {scoreEntry.label} ({scoreEntry.similarity})
                            </span>
                          )}
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 uppercase">
                            {a.role}
                          </span>
                          <span className="text-xs text-muted-foreground">{a.status}</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Semantic match suggestions (unassigned people ranked by fit) */}
                {scores && scores.length > 0 && (
                  <div className="mt-3 border-t border-border pt-3">
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      Semantic fit ranking ({hfConfig.model || "bge-small-en-v1.5"})
                    </p>
                    <div className="space-y-1">
                      {scores
                        .filter((s) => !conceptAssignments.some((a) => a.personId === s.personId))
                        .slice(0, 10)
                        .map((score) => {
                          const person = personMap.get(score.personId);
                          if (!person) return null;
                          return (
                            <div
                              key={score.personId}
                              className="flex items-center gap-3 px-3 py-1.5 rounded-lg hover:bg-background transition-colors"
                            >
                              <div className="w-5 h-5 rounded-full bg-secondary flex items-center justify-center text-muted-foreground text-[9px] font-semibold shrink-0">
                                {person.fullName.charAt(0)}
                              </div>
                              <span className="text-xs text-foreground flex-1 truncate">
                                {person.fullName}
                              </span>
                              <span className="text-[10px] text-muted-foreground truncate max-w-[140px]">
                                {person.currentRole || person.currentCompany || ""}
                              </span>
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${labelColor(score.label)}`}>
                                {score.label} ({score.similarity})
                              </span>
                            </div>
                          );
                        })}
                    </div>
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
