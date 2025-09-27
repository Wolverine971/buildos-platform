// Export all database types
export * from "./database.types";
export type { Database, Json } from "./database.types";

// Common types used across apps
export interface BriefGenerationJob {
  id: string;
  user_id: string;
  project_ids?: string[];
  brief_date: string;
  status: "pending" | "processing" | "completed" | "failed";
  metadata?: Record<string, any>;
}

export interface QueueJob {
  id: string;
  job_type: "daily_brief" | "project_brief" | "phase_generation";
  status: "pending" | "processing" | "completed" | "failed";
  user_id: string;
  scheduled_for: string;
  metadata?: Record<string, any>;
  attempts?: number;
  max_attempts?: number;
  error_message?: string;
  result?: any;
}

export interface UserPreferences {
  timezone?: string;
  email_daily_brief?: boolean;
  frequency?: "daily" | "weekly";
  time_of_day?: string;
  day_of_week?: number;
}

export interface ProjectContext {
  id: string;
  name: string;
  description?: string;
  context?: string;
  status: "planning" | "active" | "completed" | "archived";
  tasks?: Task[];
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: "todo" | "in_progress" | "completed" | "cancelled";
  priority: "low" | "medium" | "high" | "urgent";
  project_id?: string;
  due_date?: string;
  completed_at?: string;
}
