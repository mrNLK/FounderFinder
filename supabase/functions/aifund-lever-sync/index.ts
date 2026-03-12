import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { authenticateAiFundUser, AuthGuardError } from "../_shared/auth-guard.ts";
import { assertAppMembership, FOUNDER_FINDER_APP_SLUG } from "../_shared/app-membership.ts";
import { getProviderApiKey, getUserSettingsRow } from "../_shared/aifund-settings.ts";
import { asRecord, asString, corsHeaders, errorJson, json } from "../_shared/http.ts";

type LeverSyncMode = "preview" | "sync";
type LeverSyncSource = "lever_api" | "manual_rows";
type LeverSyncStatus = "preview" | "completed" | "failed";
type LeverRoute = "priority_outreach" | "operator_review" | "nurture_recheck" | "archive";
type ProcessStage = "identified" | "researched" | "contacted" | "archived" | "accepted" | "offered" | "residency" | "graduated";

interface RequestBody {
  userId?: string;
  mode?: LeverSyncMode;
  source?: LeverSyncSource;
  maxApplicants?: number;
  includeArchived?: boolean;
  resurfacingWindowDays?: number;
  applicants?: unknown[];
}

interface LeverSyncRunRow {
  id: string;
}

interface ApplicantCandidate {
  applicantId: string;
  opportunityId: string | null;
  fullName: string | null;
  email: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  currentRole: string | null;
  currentCompany: string | null;
  location: string | null;
  stage: string | null;
  source: string | null;
  postingTitle: string | null;
  resumeText: string | null;
  appliedAt: string | null;
  archived: boolean;
}

interface ScoredApplicant extends ApplicantCandidate {
  signalScore: number;
  route: LeverRoute;
  reasons: string[];
}

interface PersonRow {
  id: string;
  full_name: string;
  email: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  current_role: string | null;
  current_company: string | null;
  location: string | null;
  process_stage: string;
  tags: string[];
  metadata: Record<string, unknown> | null;
}

interface RouteCounts {
  priorityOutreach: number;
  operatorReview: number;
  nurtureRecheck: number;
  archive: number;
}

interface SyncSummary {
  scannedApplicants: number;
  createdPeople: number;
  updatedPeople: number;
  resurfacedApplicants: number;
  routeCounts: RouteCounts;
  sampleReasons: string[];
  errorMessage: string | null;
}

const LEVER_BASE_URL = "https://api.lever.co/v1";
const ADVANCED_PROCESS_STAGES = new Set<ProcessStage>(["offered", "accepted", "residency", "graduated"]);
const TECHNICAL_SIGNAL_PATTERNS = [
  /\b(staff engineer|principal engineer|distinguished engineer)\b/i,
  /\b(machine learning|ml engineer|ai engineer|research engineer|llm|deep learning)\b/i,
  /\b(neurips|icml|iclr|cvpr|kdd)\b/i,
  /\b(kaggle|codeforces|ioi|imo|icpc)\b/i,
  /\b(openai|anthropic|deepmind|meta fair|google brain)\b/i,
  /\b(github|open source|stars|maintainer)\b/i,
];
const FOUNDER_SIGNAL_PATTERNS = [
  /\b(founder|co-founder|cofounder|founding engineer)\b/i,
  /\b(startup|launched|shipped|built from scratch|zero to one)\b/i,
];
const NON_TECH_PENALTY_PATTERNS = [
  /\b(recruiter|talent partner|hr|human resources)\b/i,
  /\b(office manager|executive assistant)\b/i,
];

function getRequiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

function getOptionalEnv(name: string): string | null {
  const value = Deno.env.get(name);
  return value ? value : null;
}

async function resolveInternalDefaultUserId(serviceClient: SupabaseClient): Promise<string> {
  const { data, error } = await serviceClient
    .from("app_memberships")
    .select("user_id")
    .eq("app_slug", FOUNDER_FINDER_APP_SLUG)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Failed to resolve internal default user:", error);
    throw new Error("internal_user_lookup_failed");
  }

  const userId = asString(asRecord(data).user_id);
  if (!userId) {
    throw new AuthGuardError("No active FounderFinder member found", "not_authorized", 403);
  }

  return userId;
}

async function assertFounderFinderMembership(serviceClient: SupabaseClient, userId: string): Promise<void> {
  try {
    await assertAppMembership(serviceClient, userId, FOUNDER_FINDER_APP_SLUG);
  } catch (error) {
    if (error instanceof Error && error.message === "membership_check_failed") {
      throw new AuthGuardError("Access check failed", "membership_check_failed", 500);
    }
    throw new AuthGuardError("Access denied", "not_authorized", 403);
  }
}

async function resolveSyncContext(
  request: Request,
  body: RequestBody,
): Promise<{ userId: string; serviceClient: SupabaseClient }> {
  const requestInternalKey = request.headers.get("x-internal-sync-key")?.trim();
  const expectedInternalKey = getOptionalEnv("AIFUND_LEVER_SYNC_INTERNAL_KEY")?.trim();

  if (expectedInternalKey && requestInternalKey && requestInternalKey === expectedInternalKey) {
    const serviceClient = createClient(getRequiredEnv("SUPABASE_URL"), getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"));
    const configuredUserId = asString(body.userId) || getOptionalEnv("AIFUND_LEVER_SYNC_USER_ID");
    const userId = configuredUserId || await resolveInternalDefaultUserId(serviceClient);
    await assertFounderFinderMembership(serviceClient, userId);
    return { userId, serviceClient };
  }

  const auth = await authenticateAiFundUser(request);
  return {
    userId: auth.userId,
    serviceClient: auth.serviceClient,
  };
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asBoundedInt(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(min, Math.min(max, Math.floor(value)));
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.max(min, Math.min(max, Math.floor(parsed)));
    }
  }

  return fallback;
}

function toIsoDate(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) {
    return null;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function normalizeUrl(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.replace(/\/+$/, "").toLowerCase();
}

function buildRouteCounts(): RouteCounts {
  return {
    priorityOutreach: 0,
    operatorReview: 0,
    nurtureRecheck: 0,
    archive: 0,
  };
}

function incrementRouteCount(routeCounts: RouteCounts, route: LeverRoute): void {
  if (route === "priority_outreach") {
    routeCounts.priorityOutreach += 1;
    return;
  }

  if (route === "operator_review") {
    routeCounts.operatorReview += 1;
    return;
  }

  if (route === "nurture_recheck") {
    routeCounts.nurtureRecheck += 1;
    return;
  }

  routeCounts.archive += 1;
}

function extractEmail(record: Record<string, unknown>): string | null {
  const direct = asString(record.email);
  if (direct) {
    return direct.toLowerCase();
  }

  const emails = Array.isArray(record.emails) ? record.emails : [];
  for (const item of emails) {
    if (typeof item === "string" && item.trim()) {
      return item.trim().toLowerCase();
    }

    const value = asString(asRecord(item).value);
    if (value) {
      return value.toLowerCase();
    }
  }

  return null;
}

function extractFirstUrl(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const direct = asString(record[key]);
    if (direct && /^https?:\/\//i.test(direct)) {
      return direct;
    }
  }

  const urls = Array.isArray(record.urls) ? record.urls : [];
  for (const urlEntry of urls) {
    const candidate = asRecord(urlEntry);
    const label = asString(candidate.type) || asString(candidate.label) || "";
    const value = asString(candidate.value) || asString(candidate.url);
    if (!value || !/^https?:\/\//i.test(value)) {
      continue;
    }

    if (keys.some((key: string) => label.toLowerCase().includes(key.toLowerCase()))) {
      return value;
    }
  }

  const links = Array.isArray(record.links) ? record.links : [];
  for (const linkEntry of links) {
    const candidate = asRecord(linkEntry);
    const value = asString(candidate.value) || asString(candidate.url);
    if (!value || !/^https?:\/\//i.test(value)) {
      continue;
    }

    const label = asString(candidate.type) || asString(candidate.label) || "";
    if (keys.some((key: string) => label.toLowerCase().includes(key.toLowerCase()) || value.toLowerCase().includes(key.toLowerCase()))) {
      return value;
    }
  }

  return null;
}

function normalizeApplicantFromRecord(
  rawRecord: Record<string, unknown>,
  opportunityRecord: Record<string, unknown>,
): ApplicantCandidate {
  const firstName = asString(rawRecord.firstName) || asString(rawRecord.first_name);
  const lastName = asString(rawRecord.lastName) || asString(rawRecord.last_name);
  const fallbackName = [firstName, lastName].filter(Boolean).join(" ").trim();
  const fullName = asString(rawRecord.name) || asString(rawRecord.fullName) || (fallbackName || null);

  const resume = asRecord(rawRecord.resume);
  const posting = asRecord(rawRecord.posting);
  const source = asRecord(rawRecord.source);

  return {
    applicantId: asString(rawRecord.id) || crypto.randomUUID(),
    opportunityId: asString(opportunityRecord.id),
    fullName,
    email: extractEmail(rawRecord),
    linkedinUrl: extractFirstUrl(rawRecord, ["linkedin"]),
    githubUrl: extractFirstUrl(rawRecord, ["github"]),
    currentRole: asString(rawRecord.headline) || asString(rawRecord.currentRole) || asString(rawRecord.title),
    currentCompany: asString(rawRecord.company) || asString(rawRecord.currentCompany),
    location: asString(rawRecord.location),
    stage: asString(rawRecord.stage) || asString(rawRecord.status),
    source: asString(source.origin) || asString(source.label) || asString(rawRecord.origin),
    postingTitle: asString(posting.text) || asString(opportunityRecord.postingText) || asString(opportunityRecord.posting_title),
    resumeText: asString(resume.text) || asString(rawRecord.resumeText) || asString(rawRecord.notes),
    appliedAt: toIsoDate(rawRecord.appliedAt) || toIsoDate(rawRecord.createdAt) || toIsoDate(rawRecord.updatedAt),
    archived: toIsoDate(rawRecord.archivedAt) !== null || toIsoDate(opportunityRecord.archivedAt) !== null,
  };
}

function normalizeOpportunityToApplicants(opportunity: Record<string, unknown>): ApplicantCandidate[] {
  const applicants: ApplicantCandidate[] = [];
  const applications = Array.isArray(opportunity.applications) ? opportunity.applications : [];

  for (const applicationRaw of applications) {
    const application = asRecord(applicationRaw);
    const candidateRecord = asRecord(application.candidate);
    const merged = {
      ...candidateRecord,
      stage: application.stage || candidateRecord.stage,
      source: application.source || candidateRecord.source,
      posting: application.posting || candidateRecord.posting,
      appliedAt: application.appliedAt || application.createdAt || candidateRecord.appliedAt,
      archivedAt: application.archivedAt || candidateRecord.archivedAt || opportunity.archivedAt,
      notes: application.notes || candidateRecord.notes,
    };
    applicants.push(normalizeApplicantFromRecord(merged, opportunity));
  }

  if (applicants.length > 0) {
    return applicants;
  }

  return [normalizeApplicantFromRecord(opportunity, opportunity)];
}

function buildSignalText(applicant: ApplicantCandidate): string {
  return [
    applicant.fullName,
    applicant.currentRole,
    applicant.currentCompany,
    applicant.resumeText,
    applicant.stage,
    applicant.source,
    applicant.postingTitle,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function scoreApplicant(applicant: ApplicantCandidate): { score: number; route: LeverRoute; reasons: string[] } {
  const text = buildSignalText(applicant);
  let score = 0;
  const reasons: string[] = [];

  let technicalHits = 0;
  for (const pattern of TECHNICAL_SIGNAL_PATTERNS) {
    if (pattern.test(text)) {
      technicalHits += 1;
    }
  }

  let founderHits = 0;
  for (const pattern of FOUNDER_SIGNAL_PATTERNS) {
    if (pattern.test(text)) {
      founderHits += 1;
    }
  }

  let penaltyHits = 0;
  for (const pattern of NON_TECH_PENALTY_PATTERNS) {
    if (pattern.test(text)) {
      penaltyHits += 1;
    }
  }

  if (technicalHits > 0) {
    score += Math.min(technicalHits * 12, 42);
    reasons.push(`technical_signals:${technicalHits}`);
  }

  if (founderHits > 0) {
    score += Math.min(founderHits * 10, 20);
    reasons.push(`founder_signals:${founderHits}`);
  }

  if (applicant.linkedinUrl) {
    score += 6;
    reasons.push("has_linkedin");
  }

  if (applicant.githubUrl) {
    score += 8;
    reasons.push("has_github");
  }

  if (applicant.appliedAt) {
    const ageDays = Math.floor((Date.now() - new Date(applicant.appliedAt).getTime()) / 86_400_000);
    if (ageDays <= 90) {
      score += 8;
      reasons.push("recent_application");
    } else if (ageDays <= 365) {
      score += 4;
      reasons.push("application_within_year");
    }
  }

  if (applicant.archived) {
    score -= 8;
    reasons.push("archived_penalty");
  }

  if (penaltyHits > 0) {
    score -= Math.min(penaltyHits * 12, 24);
    reasons.push(`non_technical_penalty:${penaltyHits}`);
  }

  if (!applicant.resumeText && !applicant.linkedinUrl && !applicant.githubUrl) {
    score -= 10;
    reasons.push("low_profile_signal");
  }

  score = Math.max(0, Math.min(100, score));

  let route: LeverRoute = "archive";
  if (score >= 80) {
    route = "priority_outreach";
  } else if (score >= 60) {
    route = "operator_review";
  } else if (score >= 40) {
    route = "nurture_recheck";
  }

  return { score, route, reasons };
}

function mapRouteToProcessStage(route: LeverRoute, existingStage: string | null): ProcessStage {
  const safeExistingStage = (existingStage || "identified") as ProcessStage;
  if (ADVANCED_PROCESS_STAGES.has(safeExistingStage)) {
    return safeExistingStage;
  }

  if (route === "priority_outreach") {
    return "contacted";
  }

  if (route === "operator_review") {
    return "researched";
  }

  if (route === "nurture_recheck") {
    return "identified";
  }

  return "archived";
}

function mergeTags(existingTags: string[] | null | undefined, nextRoute: LeverRoute, resurfaced: boolean): string[] {
  const tags = new Set<string>(existingTags || []);
  tags.add("lever");
  tags.add(`lever:${nextRoute}`);

  if (resurfaced) {
    tags.add("lever:resurfaced");
  } else {
    tags.delete("lever:resurfaced");
  }

  return Array.from(tags).sort();
}

function wasResurfaced(
  existingPerson: PersonRow | null,
  scoredApplicant: ScoredApplicant,
  resurfacingWindowDays: number,
): boolean {
  if (!existingPerson) {
    return false;
  }

  const metadata = asRecord(existingPerson.metadata);
  const leverMetadata = asRecord(metadata.lever);
  const previousAppliedAt = toIsoDate(leverMetadata.appliedAt);
  const previousScore = asBoundedInt(leverMetadata.signalScore, 0, 0, 100);

  if (!previousAppliedAt) {
    return false;
  }

  const elapsedDays = Math.floor((Date.now() - new Date(previousAppliedAt).getTime()) / 86_400_000);
  if (elapsedDays < resurfacingWindowDays) {
    return false;
  }

  return scoredApplicant.signalScore >= 60 && scoredApplicant.signalScore >= previousScore + 5;
}

async function findExistingPerson(
  serviceClient: SupabaseClient,
  userId: string,
  applicant: ApplicantCandidate,
): Promise<PersonRow | null> {
  if (applicant.email) {
    const { data, error } = await serviceClient
      .from("aifund_people")
      .select("id, full_name, email, linkedin_url, github_url, current_role, current_company, location, process_stage, tags, metadata")
      .eq("user_id", userId)
      .eq("email", applicant.email)
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      return data as PersonRow;
    }
  }

  const normalizedLinkedIn = normalizeUrl(applicant.linkedinUrl);
  if (normalizedLinkedIn) {
    const { data, error } = await serviceClient
      .from("aifund_people")
      .select("id, full_name, email, linkedin_url, github_url, current_role, current_company, location, process_stage, tags, metadata")
      .eq("user_id", userId)
      .ilike("linkedin_url", `%${normalizedLinkedIn}%`)
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      return data as PersonRow;
    }
  }

  if (applicant.fullName && applicant.currentCompany) {
    const { data, error } = await serviceClient
      .from("aifund_people")
      .select("id, full_name, email, linkedin_url, github_url, current_role, current_company, location, process_stage, tags, metadata")
      .eq("user_id", userId)
      .eq("full_name", applicant.fullName)
      .eq("current_company", applicant.currentCompany)
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      return data as PersonRow;
    }
  }

  return null;
}

async function fetchLeverPage(
  apiKey: string,
  limit: number,
  offset: number,
): Promise<Record<string, unknown>[]> {
  const authToken = btoa(`${apiKey}:`);
  const queryVariants = [
    new URLSearchParams({ limit: String(limit), offset: String(offset) }),
    new URLSearchParams({ limit: String(limit), skip: String(offset) }),
  ];

  for (const params of queryVariants) {
    const response = await fetch(`${LEVER_BASE_URL}/opportunities?${params.toString()}`, {
      headers: {
        "Authorization": `Basic ${authToken}`,
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      continue;
    }

    const payload = await response.json() as { data?: unknown[] };
    return Array.isArray(payload.data) ? payload.data.map((item: unknown) => asRecord(item)) : [];
  }

  throw new Error("Lever opportunities fetch failed. Check API key scope and endpoint access.");
}

async function fetchLeverApplicants(
  apiKey: string,
  maxApplicants: number,
  includeArchived: boolean,
): Promise<ApplicantCandidate[]> {
  const applicants: ApplicantCandidate[] = [];
  let offset = 0;
  const pageSize = Math.min(50, maxApplicants);
  const maxPages = Math.max(20, Math.ceil(maxApplicants / Math.max(pageSize, 1)) + 5);

  for (let page = 0; page < maxPages && applicants.length < maxApplicants; page += 1) {
    const opportunityRows = await fetchLeverPage(apiKey, pageSize, offset);
    if (opportunityRows.length === 0) {
      break;
    }

    for (const opportunity of opportunityRows) {
      const normalized = normalizeOpportunityToApplicants(opportunity);
      for (const applicant of normalized) {
        if (!includeArchived && applicant.archived) {
          continue;
        }

        applicants.push(applicant);
        if (applicants.length >= maxApplicants) {
          break;
        }
      }

      if (applicants.length >= maxApplicants) {
        break;
      }
    }

    offset += opportunityRows.length;
    if (opportunityRows.length < pageSize) {
      break;
    }
  }

  return applicants;
}

async function createRunRow(
  serviceClient: SupabaseClient,
  userId: string,
  mode: LeverSyncMode,
  source: LeverSyncSource,
  maxApplicants: number,
  includeArchived: boolean,
  resurfacingWindowDays: number,
): Promise<string> {
  const initialStatus: LeverSyncStatus = mode === "preview" ? "preview" : "preview";
  const { data, error } = await serviceClient
    .from("aifund_lever_sync_runs")
    .insert({
      user_id: userId,
      status: initialStatus,
      mode,
      source,
      max_applicants: maxApplicants,
      include_archived: includeArchived,
      resurfacing_window_days: resurfacingWindowDays,
      summary: {},
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error("Failed to create Lever sync run");
  }

  return (data as LeverSyncRunRow).id;
}

async function updateRunRow(
  serviceClient: SupabaseClient,
  runId: string,
  status: LeverSyncStatus,
  summary: SyncSummary,
): Promise<void> {
  const { error } = await serviceClient
    .from("aifund_lever_sync_runs")
    .update({
      status,
      summary,
      updated_at: new Date().toISOString(),
    })
    .eq("id", runId);

  if (error) {
    console.error("Failed to update Lever sync run:", error);
  }
}

async function logLeverActivity(
  serviceClient: SupabaseClient,
  userId: string,
  runId: string,
  action: string,
  details: Record<string, unknown>,
): Promise<void> {
  const { error } = await serviceClient
    .from("aifund_activity_events")
    .insert({
      user_id: userId,
      entity_type: "lever_sync",
      entity_id: runId,
      action,
      details,
    });

  if (error) {
    console.error("Failed to log Lever activity:", error);
  }
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return errorJson("Method not allowed", "method_not_allowed", 405);
  }

  let runId: string | null = null;
  let runContext: { userId: string; serviceClient: SupabaseClient } | null = null;

  try {
    const body = await request.json().catch(() => ({})) as RequestBody;
    const { userId, serviceClient } = await resolveSyncContext(request, body);
    runContext = { userId, serviceClient };

    const mode: LeverSyncMode = body.mode === "sync" ? "sync" : "preview";
    const source: LeverSyncSource = body.source === "manual_rows" ? "manual_rows" : "lever_api";
    const maxApplicants = asBoundedInt(body.maxApplicants, 120, 1, 2000);
    const includeArchived = asBoolean(body.includeArchived, false);
    const resurfacingWindowDays = asBoundedInt(body.resurfacingWindowDays, 180, 30, 730);
    const routeCounts = buildRouteCounts();

    runId = await createRunRow(
      serviceClient,
      userId,
      mode,
      source,
      maxApplicants,
      includeArchived,
      resurfacingWindowDays,
    );

    const applicants: ApplicantCandidate[] = [];
    if (source === "manual_rows") {
      const manualRows = Array.isArray(body.applicants) ? body.applicants : [];
      for (const row of manualRows.slice(0, maxApplicants)) {
        applicants.push(normalizeApplicantFromRecord(asRecord(row), asRecord(row)));
      }
    } else {
      const settingsRow = await getUserSettingsRow(serviceClient, userId);
      const leverApiKey = getProviderApiKey(settingsRow, "lever");
      if (!leverApiKey) {
        throw new Error("Missing Lever API key. Save it in Settings before running sync.");
      }

      applicants.push(...await fetchLeverApplicants(leverApiKey, maxApplicants, includeArchived));
    }

    let createdPeople = 0;
    let updatedPeople = 0;
    let resurfacedApplicants = 0;
    const sampleReasons: string[] = [];

    for (const applicant of applicants) {
      const scored = scoreApplicant(applicant);
      const scoredApplicant: ScoredApplicant = {
        ...applicant,
        signalScore: scored.score,
        route: scored.route,
        reasons: scored.reasons,
      };

      incrementRouteCount(routeCounts, scoredApplicant.route);
      if (sampleReasons.length < 6) {
        sampleReasons.push(`${scoredApplicant.fullName || "unknown"}:${scoredApplicant.route}:${scoredApplicant.signalScore}`);
      }

      if (mode !== "sync") {
        continue;
      }

      const existingPerson = await findExistingPerson(serviceClient, userId, scoredApplicant);
      const resurfaced = wasResurfaced(existingPerson, scoredApplicant, resurfacingWindowDays);
      if (resurfaced) {
        resurfacedApplicants += 1;
      }

      const existingMetadata = asRecord(existingPerson?.metadata);
      const existingLeverMetadata = asRecord(existingMetadata.lever);
      const leverMetadata = {
        ...existingLeverMetadata,
        applicantId: scoredApplicant.applicantId,
        opportunityId: scoredApplicant.opportunityId,
        postingTitle: scoredApplicant.postingTitle,
        stage: scoredApplicant.stage,
        source: scoredApplicant.source,
        archived: scoredApplicant.archived,
        appliedAt: scoredApplicant.appliedAt,
        signalScore: scoredApplicant.signalScore,
        route: scoredApplicant.route,
        reasons: scoredApplicant.reasons,
        resurfaced,
        lastSyncedAt: new Date().toISOString(),
        syncRunId: runId,
      };

      const mergedMetadata = {
        ...existingMetadata,
        lever: leverMetadata,
      };

      const tags = mergeTags(existingPerson?.tags, scoredApplicant.route, resurfaced);
      const processStage = mapRouteToProcessStage(scoredApplicant.route, existingPerson?.process_stage || null);

      if (existingPerson) {
        const { error } = await serviceClient
          .from("aifund_people")
          .update({
            full_name: scoredApplicant.fullName || existingPerson.full_name,
            email: scoredApplicant.email || existingPerson.email,
            linkedin_url: scoredApplicant.linkedinUrl || existingPerson.linkedin_url,
            github_url: scoredApplicant.githubUrl || existingPerson.github_url,
            current_role: scoredApplicant.currentRole || existingPerson.current_role,
            current_company: scoredApplicant.currentCompany || existingPerson.current_company,
            location: scoredApplicant.location || existingPerson.location,
            process_stage: processStage,
            source_channel: "lever",
            tags,
            metadata: mergedMetadata,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingPerson.id);

        if (error) {
          throw new Error(`Failed to update applicant ${scoredApplicant.fullName || scoredApplicant.applicantId}: ${error.message}`);
        }

        updatedPeople += 1;
      } else {
        const { error } = await serviceClient
          .from("aifund_people")
          .insert({
            user_id: userId,
            full_name: scoredApplicant.fullName || "Unknown Lever Candidate",
            email: scoredApplicant.email,
            linkedin_url: scoredApplicant.linkedinUrl,
            github_url: scoredApplicant.githubUrl,
            twitter_url: null,
            website_url: null,
            current_role: scoredApplicant.currentRole,
            current_company: scoredApplicant.currentCompany,
            location: scoredApplicant.location,
            bio: scoredApplicant.resumeText,
            person_type: "fir",
            process_stage: processStage,
            source_channel: "lever",
            tags,
            metadata: mergedMetadata,
            harmonic_person_id: null,
            harmonic_enriched_at: null,
          });

        if (error) {
          throw new Error(`Failed to create applicant ${scoredApplicant.fullName || scoredApplicant.applicantId}: ${error.message}`);
        }

        createdPeople += 1;
      }
    }

    const summary: SyncSummary = {
      scannedApplicants: applicants.length,
      createdPeople,
      updatedPeople,
      resurfacedApplicants,
      routeCounts,
      sampleReasons,
      errorMessage: null,
    };

    const finalStatus: LeverSyncStatus = mode === "preview" ? "preview" : "completed";
    await updateRunRow(serviceClient, runId, finalStatus, summary);
    await logLeverActivity(serviceClient, userId, runId, mode === "preview" ? "preview_completed" : "sync_completed", {
      scannedApplicants: applicants.length,
      createdPeople,
      updatedPeople,
      resurfacedApplicants,
      routeCounts,
      source,
    });

    return json({
      runId,
      status: finalStatus,
      mode,
      source,
      scannedApplicants: applicants.length,
      createdPeople,
      updatedPeople,
      resurfacedApplicants,
      routeCounts,
      errorMessage: null,
    });
  } catch (error) {
    console.error("aifund-lever-sync failed:", error);

    const message = error instanceof Error ? error.message : "Unknown lever sync error";

    if (runId && runContext) {
      try {
        await updateRunRow(runContext.serviceClient, runId, "failed", {
          scannedApplicants: 0,
          createdPeople: 0,
          updatedPeople: 0,
          resurfacedApplicants: 0,
          routeCounts: buildRouteCounts(),
          sampleReasons: [],
          errorMessage: message,
        });
        await logLeverActivity(runContext.serviceClient, runContext.userId, runId, "sync_failed", {
          errorMessage: message,
        });
      } catch {
        // Ignore follow-up failure while returning primary error.
      }
    }

    if (error instanceof AuthGuardError) {
      return errorJson(error.message, error.code, error.status);
    }

    return errorJson(message, "lever_sync_failed", 500);
  }
});
