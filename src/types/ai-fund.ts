/**
 * AI Fund Type Definitions (canonical, camelCase)
 *
 * Maps to the 11 aifund_* tables in Supabase.
 * All IDs are UUIDs. Timestamps are ISO strings from Postgres.
 */

// ---------------------------------------------------------------------------
// Enums / Literal Unions
// ---------------------------------------------------------------------------

export type ConceptStage =
  | "ideation"
  | "validation"
  | "prototyping"
  | "recruiting"
  | "residency"
  | "investment_review"
  | "funded"
  | "archived";

export type ProcessStage =
  | "identified"
  | "researched"
  | "contacted"
  | "engaged"
  | "applied"
  | "interviewing"
  | "offered"
  | "accepted"
  | "declined"
  | "residency"
  | "graduated"
  | "archived";

export type PersonType = "fir" | "ve" | "both";

export type AssignmentRole = "fir" | "ve";

export type EngagementChannel =
  | "email"
  | "linkedin"
  | "twitter"
  | "referral"
  | "event"
  | "inbound"
  | "other";

export type ResidencyStatus =
  | "active"
  | "completed"
  | "extended"
  | "terminated"
  | "paused";

export type DecisionOutcome =
  | "invest"
  | "pass"
  | "defer"
  | "conditional";

export type EvidenceType =
  | "publication"
  | "patent"
  | "github_repo"
  | "conference_talk"
  | "blog_post"
  | "product_launch"
  | "award"
  | "media_mention"
  | "huggingface_space"
  | "arxiv_paper"
  | "other";

export type IntelligenceRunStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed";

export type AiFundConceptArchetype = "fir" | "ve" | "both" | "unclear";

export type AiFundConceptCoBuildStatus = "yes" | "no" | "unclear";

export type IntelligenceProvider = "exa" | "parallel" | "github" | "harmonic" | "manual";

export type IntegrationProvider = "harmonic" | "exa" | "github" | "parallel" | "anthropic" | "huggingface";

export type SourcingChannelProvider = "exa" | "parallel" | "github";

// ---------------------------------------------------------------------------
// Core Entities
// ---------------------------------------------------------------------------

export interface AiFundConcept {
  id: string;
  userId: string;
  name: string;
  thesis: string | null;
  sector: string | null;
  stage: ConceptStage;
  lpSource: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiFundConceptProfile {
  generalBreakdown: string | null;
  idealArchetype: AiFundConceptArchetype;
  archetypeReason: string | null;
  coBuildStatus: AiFundConceptCoBuildStatus;
  lpPartner: string | null;
  tags: string[];
}

export interface AiFundImportBatch {
  id: string;
  userId: string;
  canonicalFileName: string;
  canonicalStoragePath: string | null;
  markdownFileName: string | null;
  markdownStoragePath: string | null;
  status: string;
  summary: Record<string, unknown>;
  metadata: Record<string, unknown>;
  uploadedFiles: AiFundImportBatchFile[];
  matchedAttachments: BulkConceptImportAttachmentPreview[];
  unmatchedAttachments: AiFundImportBatchAttachment[];
  dismissedAttachments: AiFundImportBatchAttachment[];
  createdAt: string;
  updatedAt: string;
}

export interface AiFundImportBatchFile {
  fileName: string;
  storagePath: string;
  sourceType: string;
  category: "canonical" | "attachment" | "markdown";
}

export interface AiFundImportBatchAttachment extends BulkConceptImportAttachmentPreview {
  storagePath: string | null;
  batchId: string;
}

export interface AiFundSourceTextReindexResult {
  conceptId: string | null;
  scannedCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  completedAt: string;
  errors: string[];
}

export interface AiFundConceptSource {
  id: string;
  userId: string;
  conceptId: string;
  importBatchId: string | null;
  sourceType: string;
  sourceFile: string | null;
  storagePath: string | null;
  sourceSection: string | null;
  submitter: string | null;
  rawText: string | null;
  comments: string | null;
  originalLanguage: string | null;
  englishSummary: string | null;
  statusRaw: string | null;
  sectorRaw: string | null;
  thesisRaw: string | null;
  dedupeHint: string | null;
  extractedFields: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface BulkConceptImportMatch {
  conceptId: string;
  conceptName: string;
  lpSource: string | null;
  matchType: "exact" | "fuzzy";
}

export interface BulkConceptImportSourceEntry {
  sourceType: string;
  sourceFile: string | null;
  storagePath: string | null;
  sourceSection: string | null;
  submitter: string | null;
  rawText: string | null;
  comments: string | null;
  originalLanguage: string | null;
  englishSummary: string | null;
  statusRaw: string | null;
  sectorRaw: string | null;
  thesisRaw: string | null;
  dedupeHint: string | null;
  extractedFields: Record<string, unknown>;
}

export interface BulkConceptImportAttachmentPreview {
  fileName: string;
  relativePath: string;
  sourceType: string;
  lpSource: string | null;
  matchedConceptName: string | null;
  matchReason: string | null;
  matchScore: number | null;
}

export interface BulkConceptImportRow {
  localId: string;
  conceptName: string;
  lpSource: string | null;
  thesis: string | null;
  sector: string | null;
  notes: string | null;
  statusRaw: string | null;
  decision: "create" | "merge" | "skip";
  targetConceptId: string | null;
  matches: BulkConceptImportMatch[];
  sourceEntries: BulkConceptImportSourceEntry[];
}

export interface BulkConceptImportPreview {
  canonicalFileName: string;
  defaultLpSource: string | null;
  sheetName: string | null;
  rowCount: number;
  rows: BulkConceptImportRow[];
  matchedAttachments: BulkConceptImportAttachmentPreview[];
  unmatchedAttachments: BulkConceptImportAttachmentPreview[];
}

export interface AiFundAtsImportMatch {
  personId: string;
  fullName: string;
  currentCompany: string | null;
  reason: string;
}

export interface AiFundAtsImportCount {
  label: string;
  count: number;
}

export interface AiFundAtsImportRow {
  localId: string;
  fullName: string;
  email: string | null;
  currentRole: string | null;
  currentCompany: string | null;
  location: string | null;
  personType: PersonType;
  processStage: ProcessStage;
  sourceChannel: string;
  decision: "create" | "skip";
  duplicateReason: string | null;
  matches: AiFundAtsImportMatch[];
  metadata: Record<string, unknown>;
}

export interface AiFundAtsImportPreview {
  fileName: string;
  importSchema: "candidates_by_origin" | "opportunity_summary";
  importSchemaLabel: string;
  isPreferredLeverExport: boolean;
  rowCount: number;
  createCount: number;
  skipCount: number;
  archivedCount: number;
  rows: AiFundAtsImportRow[];
  postings: AiFundAtsImportCount[];
  departments: AiFundAtsImportCount[];
}

export interface AiFundAtsImportResult {
  createdCount: number;
  skippedCount: number;
  duplicateCount: number;
  archivedCount: number;
}

export interface AiFundPerson {
  id: string;
  userId: string;
  fullName: string;
  email: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  twitterUrl: string | null;
  websiteUrl: string | null;
  currentRole: string | null;
  currentCompany: string | null;
  location: string | null;
  bio: string | null;
  personType: PersonType;
  processStage: ProcessStage;
  sourceChannel: string | null;
  tags: string[];
  metadata: Record<string, unknown> | null;
  harmonicPersonId: string | null;
  harmonicEnrichedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiFundHarmonicFounderSummary {
  name: string;
  title: string | null;
  linkedinUrl: string | null;
}

export interface AiFundHarmonicCompany {
  harmonicCompanyId: string;
  name: string;
  domain: string | null;
  linkedinUrl: string | null;
  websiteUrl: string | null;
  location: string | null;
  fundingStage: string | null;
  fundingTotal: number | null;
  lastFundingDate: string | null;
  lastFundingTotal: number | null;
  headcount: number | null;
  headcountGrowth30d: number | null;
  headcountGrowth90d: number | null;
  tags: string[];
  founders: AiFundHarmonicFounderSummary[];
  rawPayload: Record<string, unknown>;
  fetchedAt: string;
}

export interface AiFundHarmonicPersonProfile {
  harmonicPersonId: string | null;
  fullName: string | null;
  linkedinUrl: string | null;
  currentRole: string | null;
  currentCompany: string | null;
  location: string | null;
  bio: string | null;
  education: Record<string, unknown>[];
  experience: Record<string, unknown>[];
  skills: string[];
  socialLinks: Record<string, string>;
  rawPayload: Record<string, unknown>;
}

export interface AiFundHarmonicSavedSearch {
  id: string;
  userId: string;
  conceptId: string;
  harmonicSavedSearchId: string | null;
  queryText: string;
  queryHash: string;
  status: string;
  lastSyncedAt: string | null;
  lastRunId: string | null;
  resultCount: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AiFundHarmonicIntelligenceSummary {
  source: "harmonic";
  query: string;
  conceptId: string | null;
  fetchedAt: string;
  companies: AiFundHarmonicCompany[];
  error?: string;
}

export interface AiFundIntelligenceImportCandidate {
  fullName: string;
  email?: string | null;
  linkedinUrl?: string | null;
  githubUrl?: string | null;
  websiteUrl?: string | null;
  currentRole?: string | null;
  currentCompany?: string | null;
  location?: string | null;
  bio?: string | null;
  personType?: PersonType;
  sourceChannel?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface AiFundProviderIntelligenceItem {
  id: string;
  title: string;
  subtitle: string | null;
  snippet: string | null;
  url: string | null;
  publishedAt: string | null;
  sourceChannel: string | null;
  tags: string[];
  importCandidate: AiFundIntelligenceImportCandidate | null;
  metadata: Record<string, unknown>;
}

export interface AiFundProviderIntelligenceSummary {
  source: "exa" | "parallel" | "github";
  query: string;
  conceptId: string | null;
  fetchedAt: string;
  channelIds: string[];
  items: AiFundProviderIntelligenceItem[];
  error?: string;
}

export interface AiFundEvaluationScore {
  id: string;
  personId: string;
  evaluatorId: string | null;
  aiExcellence: number | null;
  technicalAbility: number | null;
  productInstinct: number | null;
  leadershipPotential: number | null;
  compositeScore: number | null;
  notes: string | null;
  scoredAt: string;
}

export interface AiFundExternalProfile {
  id: string;
  personId: string;
  platform: string;
  profileUrl: string;
  profileData: Record<string, unknown> | null;
  fetchedAt: string;
}

export interface AiFundEvidence {
  id: string;
  personId: string;
  evidenceType: EvidenceType;
  title: string;
  url: string | null;
  description: string | null;
  signalStrength: number | null;
  verifiedAt: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface AiFundAssignment {
  id: string;
  conceptId: string;
  personId: string;
  role: AssignmentRole;
  status: string;
  assignedAt: string;
  notes: string | null;
}

export interface AiFundEngagement {
  id: string;
  personId: string;
  channel: EngagementChannel;
  direction: "inbound" | "outbound";
  subject: string | null;
  body: string | null;
  sentAt: string | null;
  respondedAt: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface AiFundResidency {
  id: string;
  assignmentId: string;
  startDate: string;
  endDate: string | null;
  stipendMonthly: number;
  status: ResidencyStatus;
  weeklyCheckIns: Record<string, unknown>[];
  milestones: Record<string, unknown>[];
  createdAt: string;
}

export interface AiFundDecisionMemo {
  id: string;
  conceptId: string;
  authorId: string | null;
  outcome: DecisionOutcome;
  investmentAmount: number | null;
  valuation: number | null;
  rationale: string | null;
  conditions: string | null;
  decidedAt: string;
  createdAt: string;
}

export interface AiFundActivityEvent {
  id: string;
  userId: string;
  entityType: string;
  entityId: string;
  action: string;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface AiFundIntelligenceRun {
  id: string;
  userId: string;
  provider: IntelligenceProvider;
  queryParams: Record<string, unknown>;
  status: IntelligenceRunStatus;
  resultsCount: number;
  resultsSummary:
    | AiFundHarmonicIntelligenceSummary
    | AiFundProviderIntelligenceSummary
    | Record<string, unknown>
    | null;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
}

export interface AiFundIntegrationConfig {
  provider: IntegrationProvider;
  label: string;
  configured: boolean;
  source: "saved" | "project_env" | "missing";
  maskedKey: string | null;
  baseUrl?: string | null;
  model?: string | null;
}

export interface AiFundSourcingChannel {
  id: string;
  label: string;
  provider: SourcingChannelProvider;
  enabled: boolean;
  description: string;
  queryTemplate: string;
  domains: string[];
}

export interface AiFundEvaluationCriterion {
  id: "aiExcellence" | "technicalAbility" | "productInstinct" | "leadershipPotential";
  label: string;
  description: string;
  weight: number;
}

export interface AiFundAppSettings {
  integrations: Record<IntegrationProvider, AiFundIntegrationConfig>;
  sourcingChannels: AiFundSourcingChannel[];
  evaluationCriteria: AiFundEvaluationCriterion[];
  updatedAt: string | null;
}

export interface AiFundSettingsUpdate {
  integrations?: Partial<Record<IntegrationProvider, {
    apiKey?: string | null;
    baseUrl?: string | null;
    model?: string | null;
  }>>;
  sourcingChannels?: AiFundSourcingChannel[];
}

export interface AiFundIntegrationTestResult {
  provider: IntegrationProvider;
  ok: boolean;
  checkedAt: string;
  message: string;
  metadata: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Scoring Weights
// ---------------------------------------------------------------------------

export const SCORING_WEIGHTS = {
  aiExcellence: 0.40,
  technicalAbility: 0.30,
  productInstinct: 0.18,
  leadershipPotential: 0.12,
} as const;

export type ScoringDimension = keyof typeof SCORING_WEIGHTS;

// ---------------------------------------------------------------------------
// Composite / View Types
// ---------------------------------------------------------------------------

export interface PersonWithScores extends AiFundPerson {
  latestScore: AiFundEvaluationScore | null;
  evidenceCount: number;
  assignments: AiFundAssignment[];
}

export interface ConceptWithAssignments extends AiFundConcept {
  assignments: (AiFundAssignment & { person: AiFundPerson })[];
  decisionMemos: AiFundDecisionMemo[];
}

export interface AiFundDashboardStats {
  totalConcepts: number;
  activeConcepts: number;
  totalPeople: number;
  activePipeline: number;
  activeResidencies: number;
  pendingDecisions: number;
  recentActivity: AiFundActivityEvent[];
}

// ---------------------------------------------------------------------------
// Workspace (consumed by all tabs)
// ---------------------------------------------------------------------------

export interface AiFundWorkspace {
  concepts: AiFundConcept[];
  people: AiFundPerson[];
  assignments: AiFundAssignment[];
  stats: AiFundDashboardStats;
  settings: AiFundAppSettings;
  settingsLoading: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  addConcept: (concept: Partial<AiFundConcept>) => Promise<AiFundConcept | null>;
  updateConcept: (id: string, updates: Partial<AiFundConcept>) => Promise<void>;
  addPerson: (person: Partial<AiFundPerson>) => Promise<AiFundPerson | null>;
  updatePerson: (id: string, updates: Partial<AiFundPerson>) => Promise<void>;
  updateSettings: (updates: AiFundSettingsUpdate) => Promise<void>;
  refreshPersonEnrichment: (personId: string) => Promise<void>;
  addAssignment: (assignment: Partial<AiFundAssignment>) => Promise<void>;
  scoreCandidate: (score: Partial<AiFundEvaluationScore>) => Promise<AiFundEvaluationScore | null>;
}

// ---------------------------------------------------------------------------
// DB row shapes (snake_case, for Supabase .select() returns)
// ---------------------------------------------------------------------------

export interface AiFundConceptRow {
  id: string;
  user_id: string | null;
  name: string;
  thesis?: string | null;
  sector?: string | null;
  stage: string;
  lp_source?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
  source?: string | null;
  lp_sponsor?: string | null;
  brief?: string | null;
  problem_statement?: string | null;
  market_theme?: string | null;
  first_customer_notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AiFundPersonRow {
  id: string;
  user_id: string;
  full_name: string;
  email: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  twitter_url: string | null;
  website_url: string | null;
  current_role: string | null;
  current_company: string | null;
  location: string | null;
  bio: string | null;
  person_type: PersonType;
  process_stage: ProcessStage;
  source_channel: string | null;
  tags: string[];
  metadata: Record<string, unknown> | null;
  harmonic_person_id: string | null;
  harmonic_enriched_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AiFundEvaluationScoreRow {
  id: string;
  person_id: string;
  evaluator_id: string | null;
  ai_excellence: number | null;
  technical_ability: number | null;
  product_instinct: number | null;
  leadership_potential: number | null;
  composite_score: number | null;
  notes: string | null;
  scored_at: string;
}

export interface AiFundAssignmentRow {
  id: string;
  concept_id: string;
  person_id: string;
  role_intent: string | null;
  fit_rationale: string | null;
  owner: string | null;
  priority: string | null;
  confidence: string | null;
  status: string;
  created_at: string;
  user_id: string;
}

export interface AiFundEngagementRow {
  id: string;
  person_id: string;
  channel: EngagementChannel;
  direction: "inbound" | "outbound";
  subject: string | null;
  body: string | null;
  sent_at: string | null;
  responded_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface AiFundResidencyRow {
  id: string;
  assignment_id: string;
  start_date: string;
  end_date: string | null;
  stipend_monthly: number;
  status: ResidencyStatus;
  weekly_check_ins: Record<string, unknown>[];
  milestones: Record<string, unknown>[];
  created_at: string;
}

export interface AiFundDecisionMemoRow {
  id: string;
  concept_id: string;
  person_id: string | null;
  recommendation: string | null;
  summary: string | null;
  key_risks: string | null;
  catalysts: string | null;
  author: string | null;
  created_at: string;
  user_id: string;
}

export interface AiFundActivityEventRow {
  id: string;
  user_id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface AiFundIntelligenceRunRow {
  id: string;
  user_id: string;
  provider: IntelligenceProvider;
  query_params: Record<string, unknown>;
  status: IntelligenceRunStatus;
  results_count: number;
  results_summary: Record<string, unknown> | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

export interface AiFundEvidenceRow {
  id: string;
  person_id: string;
  evidence_type: EvidenceType;
  title: string;
  url: string | null;
  description: string | null;
  signal_strength: number | null;
  verified_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface AiFundExternalProfileRow {
  id: string;
  person_id: string;
  platform: string;
  profile_url: string;
  profile_data: Record<string, unknown> | null;
  fetched_at: string;
}

export interface AiFundImportBatchRow {
  id: string;
  user_id: string;
  canonical_file_name: string;
  canonical_storage_path: string | null;
  markdown_file_name: string | null;
  markdown_storage_path: string | null;
  status: string;
  summary: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AiFundConceptSourceRow {
  id: string;
  user_id: string;
  concept_id: string;
  import_batch_id: string | null;
  source_type: string;
  source_file: string | null;
  storage_path: string | null;
  source_section: string | null;
  submitter: string | null;
  raw_text: string | null;
  comments: string | null;
  original_language: string | null;
  english_summary: string | null;
  status_raw: string | null;
  sector_raw: string | null;
  thesis_raw: string | null;
  dedupe_hint: string | null;
  extracted_fields: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Row-to-Model Converters
// ---------------------------------------------------------------------------

export function conceptFromRow(row: AiFundConceptRow): AiFundConcept {
  const normalizedStage: ConceptStage = row.stage === "stage_1"
    ? "ideation"
    : row.stage === "stage_2"
      ? "validation"
      : row.stage === "stage_3"
        ? "recruiting"
        : row.stage === "decision"
          ? "investment_review"
          : row.stage === "newco"
            ? "funded"
            : row.stage === "residency"
              ? "residency"
              : row.stage === "archived"
                ? "archived"
                : row.stage as ConceptStage;

  return {
    id: row.id,
    userId: row.user_id || "",
    name: row.name,
    thesis: row.thesis ?? row.brief ?? row.problem_statement ?? null,
    sector: row.sector ?? row.market_theme ?? null,
    stage: normalizedStage,
    lpSource: row.lp_source ?? row.lp_sponsor ?? row.source ?? null,
    notes: row.notes ?? row.first_customer_notes ?? null,
    metadata: row.metadata ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function personFromRow(row: AiFundPersonRow): AiFundPerson {
  return {
    id: row.id,
    userId: row.user_id,
    fullName: row.full_name,
    email: row.email,
    linkedinUrl: row.linkedin_url,
    githubUrl: row.github_url,
    twitterUrl: row.twitter_url,
    websiteUrl: row.website_url,
    currentRole: row.current_role,
    currentCompany: row.current_company,
    location: row.location,
    bio: row.bio,
    personType: row.person_type,
    processStage: row.process_stage,
    sourceChannel: row.source_channel,
    tags: row.tags,
    metadata: row.metadata,
    harmonicPersonId: row.harmonic_person_id,
    harmonicEnrichedAt: row.harmonic_enriched_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function importBatchFromRow(row: AiFundImportBatchRow): AiFundImportBatch {
  const metadata = row.metadata ?? {};
  const uploadedFiles = Array.isArray(metadata.uploadedFiles)
    ? metadata.uploadedFiles.filter((file: unknown): file is AiFundImportBatchFile => {
      if (!file || typeof file !== "object") {
        return false;
      }

      const candidate = file as Record<string, unknown>;
      return (
        typeof candidate.fileName === "string" &&
        typeof candidate.storagePath === "string" &&
        typeof candidate.sourceType === "string" &&
        (
          candidate.category === "canonical" ||
          candidate.category === "attachment" ||
          candidate.category === "markdown"
        )
      );
    })
    : [];

  const matchedAttachments = Array.isArray(metadata.matchedAttachments)
    ? metadata.matchedAttachments.filter((attachment: unknown): attachment is BulkConceptImportAttachmentPreview => {
      if (!attachment || typeof attachment !== "object") {
        return false;
      }

      const candidate = attachment as Record<string, unknown>;
      return (
        typeof candidate.fileName === "string" &&
        typeof candidate.relativePath === "string" &&
        typeof candidate.sourceType === "string"
      );
    })
    : [];

  const unmatchedAttachments = Array.isArray(metadata.unmatchedAttachments)
    ? metadata.unmatchedAttachments
      .filter((attachment: unknown): attachment is BulkConceptImportAttachmentPreview => {
        if (!attachment || typeof attachment !== "object") {
          return false;
        }

        const candidate = attachment as Record<string, unknown>;
        return (
          typeof candidate.fileName === "string" &&
          typeof candidate.relativePath === "string" &&
          typeof candidate.sourceType === "string"
        );
      })
      .map((attachment: BulkConceptImportAttachmentPreview) => ({
        ...attachment,
        batchId: row.id,
        storagePath: uploadedFiles.find((file: AiFundImportBatchFile) => file.fileName === attachment.fileName)?.storagePath || null,
      }))
    : [];

  const dismissedAttachments = Array.isArray(metadata.dismissedAttachments)
    ? metadata.dismissedAttachments
      .filter((attachment: unknown): attachment is BulkConceptImportAttachmentPreview => {
        if (!attachment || typeof attachment !== "object") {
          return false;
        }

        const candidate = attachment as Record<string, unknown>;
        return (
          typeof candidate.fileName === "string" &&
          typeof candidate.relativePath === "string" &&
          typeof candidate.sourceType === "string"
        );
      })
      .map((attachment: BulkConceptImportAttachmentPreview) => ({
        ...attachment,
        batchId: row.id,
        storagePath: uploadedFiles.find((file: AiFundImportBatchFile) => file.fileName === attachment.fileName)?.storagePath || null,
      }))
    : [];

  return {
    id: row.id,
    userId: row.user_id,
    canonicalFileName: row.canonical_file_name,
    canonicalStoragePath: row.canonical_storage_path,
    markdownFileName: row.markdown_file_name,
    markdownStoragePath: row.markdown_storage_path,
    status: row.status,
    summary: row.summary ?? {},
    metadata,
    uploadedFiles,
    matchedAttachments,
    unmatchedAttachments,
    dismissedAttachments,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function conceptSourceFromRow(row: AiFundConceptSourceRow): AiFundConceptSource {
  return {
    id: row.id,
    userId: row.user_id,
    conceptId: row.concept_id,
    importBatchId: row.import_batch_id,
    sourceType: row.source_type,
    sourceFile: row.source_file,
    storagePath: row.storage_path,
    sourceSection: row.source_section,
    submitter: row.submitter,
    rawText: row.raw_text,
    comments: row.comments,
    originalLanguage: row.original_language,
    englishSummary: row.english_summary,
    statusRaw: row.status_raw,
    sectorRaw: row.sector_raw,
    thesisRaw: row.thesis_raw,
    dedupeHint: row.dedupe_hint,
    extractedFields: row.extracted_fields ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function scoreFromRow(row: AiFundEvaluationScoreRow): AiFundEvaluationScore {
  return {
    id: row.id,
    personId: row.person_id,
    evaluatorId: row.evaluator_id,
    aiExcellence: row.ai_excellence,
    technicalAbility: row.technical_ability,
    productInstinct: row.product_instinct,
    leadershipPotential: row.leadership_potential,
    compositeScore: row.composite_score,
    notes: row.notes,
    scoredAt: row.scored_at,
  };
}

export function assignmentFromRow(row: AiFundAssignmentRow): AiFundAssignment {
  return {
    id: row.id,
    conceptId: row.concept_id,
    personId: row.person_id,
    role: (row.role_intent as AssignmentRole) || "fir",
    status: row.status,
    assignedAt: row.created_at,
    notes: row.fit_rationale,
  };
}

export function engagementFromRow(row: AiFundEngagementRow): AiFundEngagement {
  return {
    id: row.id,
    personId: row.person_id,
    channel: row.channel,
    direction: row.direction,
    subject: row.subject,
    body: row.body,
    sentAt: row.sent_at,
    respondedAt: row.responded_at,
    metadata: row.metadata,
    createdAt: row.created_at,
  };
}

export function residencyFromRow(row: AiFundResidencyRow): AiFundResidency {
  return {
    id: row.id,
    assignmentId: row.assignment_id,
    startDate: row.start_date,
    endDate: row.end_date,
    stipendMonthly: row.stipend_monthly,
    status: row.status,
    weeklyCheckIns: row.weekly_check_ins,
    milestones: row.milestones,
    createdAt: row.created_at,
  };
}

export function decisionMemoFromRow(row: AiFundDecisionMemoRow): AiFundDecisionMemo {
  return {
    id: row.id,
    conceptId: row.concept_id,
    authorId: row.author,
    outcome: (row.recommendation as DecisionOutcome) || "defer",
    investmentAmount: null,
    valuation: null,
    rationale: row.summary,
    conditions: row.key_risks,
    decidedAt: row.created_at,
    createdAt: row.created_at,
  };
}

export function activityEventFromRow(row: AiFundActivityEventRow): AiFundActivityEvent {
  return {
    id: row.id,
    userId: row.user_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action,
    details: row.details,
    createdAt: row.created_at,
  };
}

export function intelligenceRunFromRow(row: AiFundIntelligenceRunRow): AiFundIntelligenceRun {
  return {
    id: row.id,
    userId: row.user_id,
    provider: row.provider,
    queryParams: row.query_params,
    status: row.status,
    resultsCount: row.results_count,
    resultsSummary: row.results_summary,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

export function evidenceFromRow(row: AiFundEvidenceRow): AiFundEvidence {
  return {
    id: row.id,
    personId: row.person_id,
    evidenceType: row.evidence_type,
    title: row.title,
    url: row.url,
    description: row.description,
    signalStrength: row.signal_strength,
    verifiedAt: row.verified_at,
    metadata: row.metadata,
    createdAt: row.created_at,
  };
}
