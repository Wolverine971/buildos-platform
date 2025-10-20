// packages/shared-types/src/brief.types.ts
// Type definitions for daily brief metadata structures

/**
 * Metadata structure for project_daily_briefs table
 * This defines the shape of the metadata Json field
 */
export interface ProjectBriefMetadata {
  // Task count fields
  todays_task_count?: number;
  overdue_task_count?: number;
  upcoming_task_count?: number;
  next_seven_days_task_count?: number;
  recently_completed_count?: number;

  // Additional metadata fields can be added here as needed
  [key: string]: unknown; // Allow for future extensibility
}

/**
 * Metadata structure for daily_briefs table (main brief)
 * This defines the shape of the metadata Json field
 */
export interface DailyBriefMetadata {
  // Brief generation metadata
  generation_duration_ms?: number;
  llm_analysis_duration_ms?: number;
  project_count?: number;
  total_task_count?: number;

  // Error tracking
  partial_failure?: boolean;
  failed_projects?: string[]; // Project IDs that failed to generate

  // Additional metadata
  [key: string]: unknown;
}

/**
 * Email template data structure
 * Used in emails table template_data Json field
 */
export interface EmailTemplateData {
  brief_id?: string;
  brief_date?: string;
  user_name?: string;
  preview_text?: string;

  // Additional template data
  [key: string]: unknown;
}

/**
 * Type guard to check if metadata has required brief metadata shape
 */
export function isProjectBriefMetadata(
  metadata: unknown,
): metadata is ProjectBriefMetadata {
  if (!metadata || typeof metadata !== "object") {
    return false;
  }

  const m = metadata as Record<string, unknown>;

  // Check that if task count fields exist, they are numbers
  const numericFields = [
    "todays_task_count",
    "overdue_task_count",
    "upcoming_task_count",
    "next_seven_days_task_count",
    "recently_completed_count",
  ];

  for (const field of numericFields) {
    if (field in m && typeof m[field] !== "number" && m[field] !== undefined) {
      return false;
    }
  }

  return true;
}

/**
 * Safely extract task count from metadata with validation
 */
export function getTaskCount(
  metadata: unknown,
  field: keyof Pick<
    ProjectBriefMetadata,
    | "todays_task_count"
    | "overdue_task_count"
    | "upcoming_task_count"
    | "next_seven_days_task_count"
    | "recently_completed_count"
  >,
): number {
  if (!metadata || typeof metadata !== "object") {
    return 0;
  }

  const m = metadata as Record<string, unknown>;
  const value = m[field];

  if (typeof value === "number" && !isNaN(value)) {
    return value;
  }

  return 0;
}
