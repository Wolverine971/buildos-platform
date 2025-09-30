// apps/worker/src/workers/shared/queueUtils.ts
// Utility functions for queue operations (Redis-free version)

import type {
  QueueJobStatus,
  DailyBriefJobMetadata,
  PhaseGenerationJobMetadata,
  OnboardingAnalysisJobMetadata,
} from "@buildos/shared-types";
import { supabase } from "../../lib/supabase";

// Legacy job data interfaces - kept for backward compatibility
// These map to the new metadata types
export interface BriefJobData
  extends Omit<DailyBriefJobMetadata, "briefDate" | "timezone"> {
  userId: string;
  briefDate?: string; // Made optional for backward compat
  timezone?: string; // Made optional for backward compat
  options?: {
    includeProjects?: string[];
    excludeProjects?: string[];
    customTemplate?: string;
    requestedBriefDate?: string;
    // Engagement metadata for re-engagement emails
    isReengagement?: boolean;
    daysSinceLastLogin?: number;
  };
}

export interface PhasesJobData {
  userId: string;
  projectId: string;
  options?: {
    regenerate?: boolean;
    template?: string;
  };
}

export interface OnboardingAnalysisJobData {
  userId: string;
  userContext: {
    input_projects?: string | null;
    input_work_style?: string | null;
    input_challenges?: string | null;
    input_help_focus?: string | null;
  };
  options?: {
    forceRegenerate?: boolean;
    maxQuestions?: number;
  };
}

export interface EmailBriefJobData {
  emailId: string; // ID from emails table
}

// Update job status in database
export async function updateJobStatus(
  queueJobId: string,
  status: QueueJobStatus,
  jobType:
    | "brief"
    | "phases"
    | "onboarding"
    | "send_sms"
    | "email"
    | "email_cancelled"
    | "email_sent",
  errorMessage?: string,
) {
  // Status is now consistent - no mapping needed
  const mappedStatus = status;

  const updateData: any = {
    status: mappedStatus,
    processed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (errorMessage) {
    updateData.error_message = errorMessage;
  }

  if (mappedStatus === "processing") {
    updateData.started_at = new Date().toISOString();
  } else if (mappedStatus === "completed") {
    updateData.completed_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from("queue_jobs")
    .update(updateData)
    .eq("queue_job_id", queueJobId);

  if (error) {
    console.error("Failed to update job status:", error);
  }
}

// Send notification to user via Supabase Realtime
export async function notifyUser(
  userId: string,
  event:
    | string
    | {
        type: string;
        emailId?: string;
        briefId?: string;
        briefDate?: string;
        error?: string;
        trackingId?: string;
      },
  payload?: any,
) {
  try {
    // Handle both old and new notification formats
    const actualEvent = typeof event === "string" ? event : event.type;
    const actualPayload = typeof event === "string" ? payload : event;

    // Send realtime notification
    const channel = supabase.channel(`user:${userId}`);
    await channel.send({
      type: "broadcast",
      event: actualEvent,
      payload: actualPayload,
    });

    console.log(`📢 Sent notification to user ${userId}: ${actualEvent}`);
  } catch (error) {
    console.error("Failed to send notification:", error);
  }
}
