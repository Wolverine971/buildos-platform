import type {
  QueueJobType,
  JobMetadataMap,
  DailyBriefJobMetadata,
  PhaseGenerationJobMetadata,
  OnboardingAnalysisJobMetadata,
  CalendarSyncJobMetadata,
  BrainDumpProcessJobMetadata,
  EmailJobMetadata,
  RecurringTaskJobMetadata,
  CleanupJobMetadata,
  BriefGenerationProgress,
  BriefGenerationStep,
} from "./queue-types";

// Validation error class
export class ValidationError extends Error {
  constructor(
    public field: string,
    public value: unknown,
    public expectedType: string,
  ) {
    super(
      `Validation failed for field '${field}': expected ${expectedType}, got ${typeof value}`,
    );
    this.name = "ValidationError";
  }
}

// Date format validators
export function isValidDateString(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

export function isValidISOString(date: string): boolean {
  try {
    const parsed = new Date(date);
    return parsed.toISOString() === date;
  } catch {
    return false;
  }
}

// Timezone validator (basic check for IANA timezone format)
export function isValidTimezone(timezone: string): boolean {
  // Basic validation - checks for format like "America/New_York" or "UTC"
  return /^[A-Z][A-Za-z_\/]+$/.test(timezone) || timezone === "UTC";
}

// UUID validator
export function isValidUUID(uuid: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    uuid,
  );
}

// Brief generation step validator
export function isValidBriefGenerationStep(
  step: string,
): step is BriefGenerationStep {
  const validSteps: BriefGenerationStep[] = [
    "idle",
    "initializing",
    "starting",
    "queued",
    "gathering_data",
    "data_gathered",
    "fetching_projects",
    "generating_project_briefs",
    "consolidating_briefs",
    "generating_main_brief",
    "finalizing",
    "completed",
    "error",
  ];
  return validSteps.includes(step as BriefGenerationStep);
}

// Progress validator
export function isValidProgress(progress: number): boolean {
  return typeof progress === "number" && progress >= 0 && progress <= 100;
}

// Metadata validators for each job type
export function validateDailyBriefMetadata(
  metadata: unknown,
): DailyBriefJobMetadata {
  if (!metadata || typeof metadata !== "object") {
    throw new ValidationError("metadata", metadata, "object");
  }

  const meta = metadata as Record<string, unknown>;

  // Required fields
  if (
    typeof meta.briefDate !== "string" ||
    !isValidDateString(meta.briefDate)
  ) {
    throw new ValidationError(
      "briefDate",
      meta.briefDate,
      "YYYY-MM-DD date string",
    );
  }

  if (typeof meta.timezone !== "string" || !isValidTimezone(meta.timezone)) {
    throw new ValidationError("timezone", meta.timezone, "valid IANA timezone");
  }

  // Optional fields
  if (
    meta.forceRegenerate !== undefined &&
    typeof meta.forceRegenerate !== "boolean"
  ) {
    throw new ValidationError(
      "forceRegenerate",
      meta.forceRegenerate,
      "boolean",
    );
  }

  if (meta.includeProjects !== undefined) {
    if (
      !Array.isArray(meta.includeProjects) ||
      !meta.includeProjects.every((id) => typeof id === "string")
    ) {
      throw new ValidationError(
        "includeProjects",
        meta.includeProjects,
        "string[]",
      );
    }
  }

  if (meta.excludeProjects !== undefined) {
    if (
      !Array.isArray(meta.excludeProjects) ||
      !meta.excludeProjects.every((id) => typeof id === "string")
    ) {
      throw new ValidationError(
        "excludeProjects",
        meta.excludeProjects,
        "string[]",
      );
    }
  }

  if (
    meta.customTemplate !== undefined &&
    typeof meta.customTemplate !== "string"
  ) {
    throw new ValidationError("customTemplate", meta.customTemplate, "string");
  }

  if (
    meta.requestedBriefDate !== undefined &&
    typeof meta.requestedBriefDate !== "string"
  ) {
    throw new ValidationError(
      "requestedBriefDate",
      meta.requestedBriefDate,
      "string",
    );
  }

  // Validate generation_progress if present
  if (meta.generation_progress !== undefined) {
    validateBriefGenerationProgress(meta.generation_progress);
  }

  return meta as unknown as DailyBriefJobMetadata;
}

export function validateBriefGenerationProgress(
  progress: unknown,
): BriefGenerationProgress {
  if (!progress || typeof progress !== "object") {
    throw new ValidationError("generation_progress", progress, "object");
  }

  const prog = progress as Record<string, unknown>;

  if (!isValidBriefGenerationStep(prog.step as string)) {
    throw new ValidationError("step", prog.step, "valid BriefGenerationStep");
  }

  if (!isValidProgress(prog.progress as number)) {
    throw new ValidationError(
      "progress",
      prog.progress,
      "number between 0-100",
    );
  }

  if (prog.message !== undefined && typeof prog.message !== "string") {
    throw new ValidationError("message", prog.message, "string");
  }

  if (prog.projects !== undefined) {
    if (typeof prog.projects !== "object" || prog.projects === null) {
      throw new ValidationError("projects", prog.projects, "object");
    }
    const projects = prog.projects as Record<string, unknown>;
    if (
      typeof projects.completed !== "number" ||
      typeof projects.total !== "number" ||
      typeof projects.failed !== "number"
    ) {
      throw new ValidationError(
        "projects",
        projects,
        "object with completed, total, failed numbers",
      );
    }
  }

  if (typeof prog.timestamp !== "string") {
    throw new ValidationError("timestamp", prog.timestamp, "ISO string");
  }

  return prog as unknown as BriefGenerationProgress;
}

export function validatePhaseGenerationMetadata(
  metadata: unknown,
): PhaseGenerationJobMetadata {
  if (!metadata || typeof metadata !== "object") {
    throw new ValidationError("metadata", metadata, "object");
  }

  const meta = metadata as Record<string, unknown>;

  if (typeof meta.projectId !== "string" || !isValidUUID(meta.projectId)) {
    throw new ValidationError("projectId", meta.projectId, "valid UUID");
  }

  if (meta.regenerate !== undefined && typeof meta.regenerate !== "boolean") {
    throw new ValidationError("regenerate", meta.regenerate, "boolean");
  }

  if (meta.template !== undefined && typeof meta.template !== "string") {
    throw new ValidationError("template", meta.template, "string");
  }

  if (
    meta.includeExistingTasks !== undefined &&
    typeof meta.includeExistingTasks !== "boolean"
  ) {
    throw new ValidationError(
      "includeExistingTasks",
      meta.includeExistingTasks,
      "boolean",
    );
  }

  return meta as unknown as PhaseGenerationJobMetadata;
}

export function validateOnboardingAnalysisMetadata(
  metadata: unknown,
): OnboardingAnalysisJobMetadata {
  if (!metadata || typeof metadata !== "object") {
    throw new ValidationError("metadata", metadata, "object");
  }

  const meta = metadata as Record<string, unknown>;

  if (typeof meta.userId !== "string") {
    throw new ValidationError("userId", meta.userId, "string");
  }

  if (meta.step !== undefined) {
    const validSteps = ["initial", "preferences", "complete"];
    if (!validSteps.includes(meta.step as string)) {
      throw new ValidationError(
        "step",
        meta.step,
        "initial|preferences|complete",
      );
    }
  }

  return meta as unknown as OnboardingAnalysisJobMetadata;
}

export function validateCalendarSyncMetadata(
  metadata: unknown,
): CalendarSyncJobMetadata {
  if (!metadata || typeof metadata !== "object") {
    throw new ValidationError("metadata", metadata, "object");
  }

  const meta = metadata as Record<string, unknown>;

  if (typeof meta.calendarId !== "string") {
    throw new ValidationError("calendarId", meta.calendarId, "string");
  }

  if (meta.syncDirection !== undefined) {
    const validDirections = ["to_google", "from_google", "bidirectional"];
    if (!validDirections.includes(meta.syncDirection as string)) {
      throw new ValidationError(
        "syncDirection",
        meta.syncDirection,
        "to_google|from_google|bidirectional",
      );
    }
  }

  if (meta.dateRange !== undefined) {
    if (typeof meta.dateRange !== "object" || meta.dateRange === null) {
      throw new ValidationError("dateRange", meta.dateRange, "object");
    }
    const range = meta.dateRange as Record<string, unknown>;
    if (typeof range.start !== "string" || typeof range.end !== "string") {
      throw new ValidationError(
        "dateRange",
        range,
        "object with start and end strings",
      );
    }
  }

  if (
    meta.lastSyncedAt !== undefined &&
    typeof meta.lastSyncedAt !== "string"
  ) {
    throw new ValidationError("lastSyncedAt", meta.lastSyncedAt, "string");
  }

  return meta as unknown as CalendarSyncJobMetadata;
}

export function validateBrainDumpProcessMetadata(
  metadata: unknown,
): BrainDumpProcessJobMetadata {
  if (!metadata || typeof metadata !== "object") {
    throw new ValidationError("metadata", metadata, "object");
  }

  const meta = metadata as Record<string, unknown>;

  if (typeof meta.brainDumpId !== "string") {
    throw new ValidationError("brainDumpId", meta.brainDumpId, "string");
  }

  if (meta.processMode !== undefined) {
    const validModes = ["full", "quick"];
    if (!validModes.includes(meta.processMode as string)) {
      throw new ValidationError("processMode", meta.processMode, "full|quick");
    }
  }

  if (meta.projectId !== undefined && typeof meta.projectId !== "string") {
    throw new ValidationError("projectId", meta.projectId, "string");
  }

  if (
    meta.includeTaskExtraction !== undefined &&
    typeof meta.includeTaskExtraction !== "boolean"
  ) {
    throw new ValidationError(
      "includeTaskExtraction",
      meta.includeTaskExtraction,
      "boolean",
    );
  }

  return meta as unknown as BrainDumpProcessJobMetadata;
}

export function validateEmailJobMetadata(metadata: unknown): EmailJobMetadata {
  if (!metadata || typeof metadata !== "object") {
    throw new ValidationError("metadata", metadata, "object");
  }

  const meta = metadata as Record<string, unknown>;

  if (typeof meta.recipientUserId !== "string") {
    throw new ValidationError(
      "recipientUserId",
      meta.recipientUserId,
      "string",
    );
  }

  const validEmailTypes = [
    "daily_brief",
    "welcome",
    "trial_ending",
    "payment_failed",
    "weekly_summary",
  ];
  if (!validEmailTypes.includes(meta.emailType as string)) {
    throw new ValidationError(
      "emailType",
      meta.emailType,
      validEmailTypes.join("|"),
    );
  }

  if (meta.templateId !== undefined && typeof meta.templateId !== "string") {
    throw new ValidationError("templateId", meta.templateId, "string");
  }

  if (meta.briefId !== undefined && typeof meta.briefId !== "string") {
    throw new ValidationError("briefId", meta.briefId, "string");
  }

  return meta as unknown as EmailJobMetadata;
}

export function validateRecurringTaskMetadata(
  metadata: unknown,
): RecurringTaskJobMetadata {
  if (!metadata || typeof metadata !== "object") {
    throw new ValidationError("metadata", metadata, "object");
  }

  const meta = metadata as Record<string, unknown>;

  if (meta.taskIds !== undefined) {
    if (
      !Array.isArray(meta.taskIds) ||
      !meta.taskIds.every((id) => typeof id === "string")
    ) {
      throw new ValidationError("taskIds", meta.taskIds, "string[]");
    }
  }

  if (meta.dryRun !== undefined && typeof meta.dryRun !== "boolean") {
    throw new ValidationError("dryRun", meta.dryRun, "boolean");
  }

  if (
    meta.updatedCount !== undefined &&
    typeof meta.updatedCount !== "number"
  ) {
    throw new ValidationError("updatedCount", meta.updatedCount, "number");
  }

  return meta as unknown as RecurringTaskJobMetadata;
}

export function validateCleanupJobMetadata(
  metadata: unknown,
): CleanupJobMetadata {
  if (!metadata || typeof metadata !== "object") {
    throw new ValidationError("metadata", metadata, "object");
  }

  const meta = metadata as Record<string, unknown>;

  if (meta.targetDate !== undefined && typeof meta.targetDate !== "string") {
    throw new ValidationError("targetDate", meta.targetDate, "string");
  }

  if (
    meta.deletedCount !== undefined &&
    typeof meta.deletedCount !== "number"
  ) {
    throw new ValidationError("deletedCount", meta.deletedCount, "number");
  }

  if (meta.entities !== undefined) {
    if (
      !Array.isArray(meta.entities) ||
      !meta.entities.every((e) => typeof e === "string")
    ) {
      throw new ValidationError("entities", meta.entities, "string[]");
    }
  }

  return meta as unknown as CleanupJobMetadata;
}

// Main validation function
export function validateJobMetadata<T extends QueueJobType>(
  jobType: T,
  metadata: unknown,
): JobMetadataMap[T] {
  switch (jobType) {
    case "generate_daily_brief":
      return validateDailyBriefMetadata(metadata) as JobMetadataMap[T];
    case "generate_phases":
      return validatePhaseGenerationMetadata(metadata) as JobMetadataMap[T];
    case "onboarding_analysis":
      return validateOnboardingAnalysisMetadata(metadata) as JobMetadataMap[T];
    case "sync_calendar":
      return validateCalendarSyncMetadata(metadata) as JobMetadataMap[T];
    case "process_brain_dump":
      return validateBrainDumpProcessMetadata(metadata) as JobMetadataMap[T];
    case "send_email":
      return validateEmailJobMetadata(metadata) as JobMetadataMap[T];
    case "update_recurring_tasks":
      return validateRecurringTaskMetadata(metadata) as JobMetadataMap[T];
    case "cleanup_old_data":
      return validateCleanupJobMetadata(metadata) as JobMetadataMap[T];
    case "other":
      return metadata as JobMetadataMap[T];
    default:
      throw new ValidationError("jobType", jobType, "valid QueueJobType");
  }
}

// Safe validation that returns null on error
export function tryValidateJobMetadata<T extends QueueJobType>(
  jobType: T,
  metadata: unknown,
): JobMetadataMap[T] | null {
  try {
    return validateJobMetadata(jobType, metadata);
  } catch {
    return null;
  }
}
