// packages/shared-types/src/index.ts
export * from "./database.types";
export type { Database, Json } from "./database.types";

// Export queue types with correct enums
export * from "./queue-types";
export * from "./validation";
export * from "./api-types";

// Export notification system types
export * from "./notification.types";

// Legacy types kept for backward compatibility (will be deprecated)
export interface BriefGenerationJob {
  id: string;
  user_id: string;
  project_ids?: string[];
  brief_date: string;
  status: "pending" | "processing" | "completed" | "failed";
  metadata?: Record<string, any>;
}

// Common types used across apps
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
