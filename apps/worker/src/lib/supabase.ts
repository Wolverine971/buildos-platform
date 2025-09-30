// worker-queue/src/lib/supabase.ts
import { createCustomClient } from "@buildos/supabase-client";
import type { Database } from "@buildos/shared-types";
import dotenv from "dotenv";

dotenv.config();
const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.PRIVATE_SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error("Missing Supabase environment variables");
}

export const supabase = createCustomClient(supabaseUrl, supabaseServiceKey);

// Database types (adjust these to match your actual schema)
export interface Project {
  context: string | null;
  created_at: string | null;
  description: string | null;
  end_date: string | null;
  executive_summary: string | null;
  id: string;
  name: string | null;
  slug: string | null;
  start_date: string | null;
  status: string | null;
  tags: string[] | null;
  updated_at: string | null;
  user_id: string | null;
}

export interface Note {
  category: string | null;
  content: string | null;
  created_at: string | null;
  id: string;
  project_id: string | null;
  tags: string[] | null;
  title: string | null;
  updated_at: string;
  user_id: string | null;
}

export interface Task {
  completed_at: string | null;
  created_at: string | null;
  dependencies: string[] | null;
  description: string | null;
  details: string | null;
  duration_minutes: number | null;
  id: string;
  outdated: boolean | null;
  parent_task_id: string | null;
  priority: string | null;
  project_id: string | null;
  recurrence_ends: string | null;
  recurrence_pattern: string | null;
  start_date: string | null;
  status: string | null;
  task_steps: string | null;
  task_type: string | null;
  title: string | null;
  updated_at: string | null;
  user_id: string | null;
}

export interface ProjectDailyBrief {
  brief_content: string;
  brief_date: string;
  created_at: string | null;
  generation_completed_at: string | null;
  generation_error: string | null;
  generation_started_at: string | null;
  generation_status: string | null;
  id: string;
  metadata: any | null;
  project_id: string;
  template_id: string | null;
  updated_at: string | null;
  user_id: string;
}

export interface DailyBrief {
  brief_date: string;
  created_at: string | null;
  generation_completed_at: string | null;
  generation_error: string | null;
  generation_progress: any | null;
  generation_started_at: string | null;
  generation_status: string | null;
  id: string;
  insights: string | null;
  metadata: any | null;
  priority_actions: string[] | null;
  project_brief_ids: string[] | null;
  summary_content: string;
  updated_at: string | null;
  user_id: string;
}

export interface BriefGenerationJob {
  id: string;
  user_id: string;
  job_type: string;
  scheduled_for: string;
  status:
    | "pending"
    | "processing"
    | "completed"
    | "failed"
    | "cancelled"
    | "retrying";
  queue_job_id: string;
  created_at: string;
  processed_at: string | null;
  error_message: string | null;
}
