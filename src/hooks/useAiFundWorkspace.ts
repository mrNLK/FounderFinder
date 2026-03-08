/**
 * useAiFundWorkspace Hook
 *
 * Central state management for the AI Fund module.
 * Connects to Supabase. No mock data.
 */

import { useState, useEffect, useCallback } from "react";
import {
  type AiFundConcept,
  type AiFundPerson,
  type AiFundAssignment,
  type AiFundEvaluationScore,
  type AiFundDashboardStats,
  type AiFundWorkspace,
  personFromRow,
} from "@/types/ai-fund";
import {
  fetchConcepts,
  createConcept,
  updateConcept as updateConceptDb,
  fetchPeople,
  createPerson,
  updatePerson as updatePersonDb,
  fetchAssignments,
  createAssignment,
  createScore,
  fetchDashboardStats,
  logActivity,
} from "@/lib/ai-fund";
import {
  createDefaultAiFundSettings,
  fetchAiFundSettings,
  updateAiFundSettings,
} from "@/lib/aifund-settings";
import { enrichPersonWithHarmonic } from "@/lib/harmonic";

export function useAiFundWorkspace(): AiFundWorkspace {
  const [concepts, setConcepts] = useState<AiFundConcept[]>([]);
  const [people, setPeople] = useState<AiFundPerson[]>([]);
  const [assignments, setAssignments] = useState<AiFundAssignment[]>([]);
  const [stats, setStats] = useState<AiFundDashboardStats>({
    totalConcepts: 0,
    activeConcepts: 0,
    totalPeople: 0,
    activePipeline: 0,
    activeResidencies: 0,
    pendingDecisions: 0,
    recentActivity: [],
  });
  const [settings, setSettings] = useState(createDefaultAiFundSettings());
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [conceptsResult, peopleResult, assignmentsResult, statsResult, settingsResult] =
      await Promise.allSettled([
        fetchConcepts(),
        fetchPeople(),
        fetchAssignments(),
        fetchDashboardStats(),
        fetchAiFundSettings(),
      ]);

    const failures: string[] = [];

    if (conceptsResult.status === "fulfilled") {
      setConcepts(conceptsResult.value);
    } else {
      failures.push("concepts");
      console.error("Failed to load concepts:", conceptsResult.reason);
    }

    if (peopleResult.status === "fulfilled") {
      setPeople(peopleResult.value);
    } else {
      failures.push("people");
      console.error("Failed to load people:", peopleResult.reason);
    }

    if (assignmentsResult.status === "fulfilled") {
      setAssignments(assignmentsResult.value);
    } else {
      failures.push("assignments");
      console.error("Failed to load assignments:", assignmentsResult.reason);
    }

    if (statsResult.status === "fulfilled") {
      setStats(statsResult.value);
    } else {
      failures.push("overview");
      console.error("Failed to load dashboard stats:", statsResult.reason);
    }

    if (settingsResult.status === "fulfilled") {
      setSettings(settingsResult.value);
    } else {
      console.warn("Failed to load AI Fund settings:", settingsResult.reason);
      setSettings(createDefaultAiFundSettings());
    }

    setError(
      failures.length > 0
        ? `Failed to load ${failures.join(", ")} data`
        : null,
    );
    setLoading(false);
    setSettingsLoading(false);
  }, []);

  const mergePerson = useCallback((row: ReturnType<typeof personFromRow>): void => {
    setPeople((prev) => {
      const exists = prev.some((person) => person.id === row.id);
      if (!exists) {
        return [row, ...prev];
      }

      return prev.map((person) => (
        person.id === row.id ? row : person
      ));
    });
  }, []);

  const triggerHarmonicEnrichment = useCallback(
    async (
      personId: string,
      person: Partial<AiFundPerson>,
    ): Promise<void> => {
      const linkedinUrl = person.linkedinUrl || null;
      if (!linkedinUrl) return;

      try {
        const response = await enrichPersonWithHarmonic({
          personId,
          linkedinUrl,
          personContext: {
            fullName: person.fullName || null,
            currentRole: person.currentRole || null,
            currentCompany: person.currentCompany || null,
            location: person.location || null,
          },
        });

        if (response.person) {
          mergePerson(personFromRow(response.person));
        }

        if (response.notFound) {
          console.warn(`Harmonic did not find a profile for person ${personId}`);
        }
      } catch (err: unknown) {
        console.warn("Harmonic enrichment warning:", err);
      }
    },
    [mergePerson],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [refresh]);

  const addConcept = useCallback(
    async (fields: Partial<AiFundConcept>): Promise<AiFundConcept | null> => {
      try {
        const concept = await createConcept(fields);
        setConcepts((prev) => [concept, ...prev]);
        void logActivity("concept", concept.id, "created_concept", {
          name: concept.name,
        });
        return concept;
      } catch (err) {
        console.error("addConcept error:", err);
        return null;
      }
    },
    []
  );

  const updateConceptHandler = useCallback(
    async (id: string, updates: Partial<AiFundConcept>): Promise<void> => {
      await updateConceptDb(id, updates);
      setConcepts((prev) =>
        prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
      );
    },
    []
  );

  const addPerson = useCallback(
    async (fields: Partial<AiFundPerson>): Promise<AiFundPerson | null> => {
      try {
        const person = await createPerson(fields);
        setPeople((prev) => [person, ...prev]);
        void logActivity("person", person.id, "created_person", {
          name: person.fullName,
          sourceChannel: person.sourceChannel,
        });
        if (person.linkedinUrl) {
          await triggerHarmonicEnrichment(person.id, person);
        }
        return person;
      } catch (err) {
        console.error("addPerson error:", err);
        return null;
      }
    },
    [triggerHarmonicEnrichment]
  );

  const updatePersonHandler = useCallback(
    async (id: string, updates: Partial<AiFundPerson>): Promise<void> => {
      await updatePersonDb(id, updates);
      const existingPerson = people.find((person) => person.id === id);
      const updatedPerson = existingPerson ? { ...existingPerson, ...updates } : null;

      setPeople((prev) => prev.map((person) => (
        person.id === id ? { ...person, ...updates } : person
      )));

      const shouldEnrich =
        updates.linkedinUrl !== undefined ||
        updates.fullName !== undefined ||
        updates.currentRole !== undefined ||
        updates.currentCompany !== undefined ||
        updates.location !== undefined;

      if (shouldEnrich && updatedPerson?.linkedinUrl) {
        await triggerHarmonicEnrichment(id, updatedPerson);
      }
    },
    [people, triggerHarmonicEnrichment]
  );

  const addAssignmentHandler = useCallback(
    async (fields: Partial<AiFundAssignment>): Promise<void> => {
      const assignment = await createAssignment(fields);
      setAssignments((prev) => [assignment, ...prev]);
      void logActivity("assignment", assignment.id, "created_assignment", {
        conceptId: assignment.conceptId,
        personId: assignment.personId,
        role: assignment.role,
      });
    },
    []
  );

  const updateSettingsHandler = useCallback(
    async (updates: Parameters<typeof updateAiFundSettings>[0]): Promise<void> => {
      const nextSettings = await updateAiFundSettings(updates);
      setSettings(nextSettings);
    },
    [],
  );

  const refreshPersonEnrichmentHandler = useCallback(
    async (personId: string): Promise<void> => {
      const person = people.find((candidate) => candidate.id === personId);
      if (!person?.linkedinUrl) {
        return;
      }

      await triggerHarmonicEnrichment(personId, person);
    },
    [people, triggerHarmonicEnrichment],
  );

  const scoreCandidateHandler = useCallback(
    async (fields: Partial<AiFundEvaluationScore>): Promise<AiFundEvaluationScore | null> => {
      try {
        const score = await createScore(fields);
        if (score.personId) {
          void logActivity("person", score.personId, "scored_candidate", {
            compositeScore: score.compositeScore,
          });
        }
        return score;
      } catch (err) {
        console.error("scoreCandidate error:", err);
        return null;
      }
    },
    []
  );

  return {
    concepts,
    people,
    assignments,
    stats,
    settings,
    settingsLoading,
    loading,
    error,
    refresh,
    addConcept,
    updateConcept: updateConceptHandler,
    addPerson,
    updatePerson: updatePersonHandler,
    updateSettings: updateSettingsHandler,
    refreshPersonEnrichment: refreshPersonEnrichmentHandler,
    addAssignment: addAssignmentHandler,
    scoreCandidate: scoreCandidateHandler,
  };
}
