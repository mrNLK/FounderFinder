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
} from "@/lib/ai-fund";
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [c, p, a, s] = await Promise.all([
        fetchConcepts(),
        fetchPeople(),
        fetchAssignments(),
        fetchDashboardStats(),
      ]);
      setConcepts(c);
      setPeople(p);
      setAssignments(a);
      setStats(s);
    } catch (err: unknown) {
      const msg = err instanceof Error
        ? err.message
        : (err as { message?: string })?.message || "Failed to load AI Fund data";
      setError(msg);
      console.error("useAiFundWorkspace refresh error:", err);
    } finally {
      setLoading(false);
    }
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
    refresh();
  }, [refresh]);

  const addConcept = useCallback(
    async (fields: Partial<AiFundConcept>): Promise<AiFundConcept | null> => {
      try {
        const concept = await createConcept(fields);
        setConcepts((prev) => [concept, ...prev]);
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
    },
    []
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
    async (fields: Partial<AiFundEvaluationScore>): Promise<void> => {
      await createScore(fields);
    },
    []
  );

  return {
    concepts,
    people,
    assignments,
    stats,
    loading,
    error,
    refresh,
    addConcept,
    updateConcept: updateConceptHandler,
    addPerson,
    updatePerson: updatePersonHandler,
    refreshPersonEnrichment: refreshPersonEnrichmentHandler,
    addAssignment: addAssignmentHandler,
    scoreCandidate: scoreCandidateHandler,
  };
}
