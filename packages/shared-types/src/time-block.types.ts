// packages/shared-types/src/time-block.types.ts

export type TimeBlockType = "project" | "build";
export type TimeBlockSyncStatus = "pending" | "synced" | "failed" | "deleted";
export type TimeBlockSyncSource = "app" | "google";

export interface TimeBlockSuggestion {
  title: string;
  reason: string;
  project_id?: string | null;
  project_name?: string | null;
  priority?: "low" | "medium" | "high" | "urgent";
  estimated_minutes?: number | null;
  task_id?: string | null;
  confidence?: number | null;
}

export type TimeBlockSuggestionStatus = "pending" | "generating" | "completed" | "failed";

export interface TimeBlockSuggestionsState {
  status: TimeBlockSuggestionStatus;
  progress?: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface TimeBlock {
  id: string;
  user_id: string;
  block_type: TimeBlockType;
  project_id: string | null;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  timezone: string;
  calendar_event_id: string | null;
  calendar_event_link: string | null;
  sync_status: TimeBlockSyncStatus;
  sync_source: TimeBlockSyncSource;
  last_synced_at: string | null;
  ai_suggestions: TimeBlockSuggestion[] | null;
  suggestions_summary: string | null;
  suggestions_generated_at: string | null;
  suggestions_model: string | null;
  suggestions_state: TimeBlockSuggestionsState | null;
  created_at: string;
  updated_at: string;
}

export interface TimeBlockWithProject extends TimeBlock {
  project?: {
    id: string;
    name: string;
    calendar_color_id: string | null;
  } | null;
}

export interface CreateTimeBlockParams {
  block_type: TimeBlockType;
  project_id?: string | null;
  start_time: Date;
  end_time: Date;
  timezone?: string;
}

export interface UpdateTimeBlockParams {
  block_type?: TimeBlockType;
  project_id?: string | null;
  start_time?: Date;
  end_time?: Date;
  timezone?: string;
  regenerate_suggestions?: boolean;
}

export interface TimeBlockConflictInfo {
  id: string;
  block_type: TimeBlockType;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  project?: {
    id: string;
    name: string;
    calendar_color_id: string | null;
  } | null;
}

export interface TimeBlockSuggestedSlot {
  start: string;
  end: string;
  duration_minutes: number;
  timeZone?: string;
}

export interface TimeAllocation {
  total_hours: number;
  build_block_hours: number;
  project_allocations: ProjectAllocation[];
  date_range: {
    start: string;
    end: string;
  };
}

export interface ProjectAllocation {
  project_id: string;
  project_name: string;
  project_color?: string | null;
  hours: number;
  percentage: number;
  block_count: number;
}
