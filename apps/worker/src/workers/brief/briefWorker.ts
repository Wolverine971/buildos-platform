// apps/worker/src/workers/brief/briefWorker.ts
import { format } from "date-fns";
import { utcToZonedTime, getTimezoneOffset } from "date-fns-tz";

import { supabase } from "../../lib/supabase";
import { createServiceClient } from "@buildos/supabase-client";
import {
  BriefJobData,
  notifyUser,
  updateJobStatus,
  validateBriefJobData,
} from "../shared/queueUtils";
import { LegacyJob } from "../shared/jobAdapter";
import { generateDailyBrief } from "./briefGenerator";
import { generateCorrelationId } from "@buildos/shared-utils";
import { getTaskCount } from "@buildos/shared-types";

/**
 * Validates if a timezone string is valid
 * @param timezone The timezone string to validate
 * @returns true if valid, false otherwise
 */
function isValidTimezone(timezone: string): boolean {
  try {
    // Try to get the timezone offset - this will throw if invalid
    getTimezoneOffset(timezone, new Date());
    return true;
  } catch (error) {
    return false;
  }
}

export async function processBriefJob(job: LegacyJob<BriefJobData>) {
  console.log(`🏃 Processing brief job ${job.id} for user ${job.data.userId}`);

  try {
    // Validate job data immediately to catch errors early
    const validatedData = validateBriefJobData(job.data);

    await updateJobStatus(job.id, "processing", "brief");

    // ALWAYS fetch user's timezone from users table (centralized source of truth)
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("timezone")
      .eq("id", job.data.userId)
      .single();

    if (userError || !user) {
      console.warn(
        `Failed to fetch user timezone: ${userError?.message || "User not found"}, using fallback`,
      );
    }

    // Use timezone from users table (centralized), fallback to job data, then UTC
    // No type assertion needed - properly handle null cases
    let timezone = user?.timezone || job.data.timezone || "UTC";

    // Validate the timezone and fallback to UTC if invalid
    if (!isValidTimezone(timezone)) {
      console.warn(
        `Invalid timezone "${timezone}" detected, falling back to UTC`,
      );
      timezone = "UTC";
    }

    // Calculate briefDate based on the user's timezone
    let briefDate = job.data.briefDate;
    if (!briefDate) {
      // For immediate briefs, use "today" in the user's timezone
      const userCurrentTime = utcToZonedTime(new Date(), timezone);
      briefDate = format(userCurrentTime, "yyyy-MM-dd");
    }

    // Validate the brief date is in the expected format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(briefDate)) {
      throw new Error(
        `Invalid brief date format: ${briefDate}. Expected YYYY-MM-DD`,
      );
    }

    // At this point, briefDate is guaranteed to be a valid date string
    const validatedBriefDate: string = briefDate;

    console.log(
      `📅 Generating brief for date: ${validatedBriefDate} (timezone: ${timezone}, current time: ${new Date().toISOString()})`,
    );

    // Log timezone conversion for debugging
    const userCurrentTime = utcToZonedTime(new Date(), timezone);
    console.log(
      `🕐 User's current time: ${format(userCurrentTime, "yyyy-MM-dd HH:mm:ss zzz")}`,
    );

    const brief = await generateDailyBrief(
      job.data.userId,
      validatedBriefDate,
      job.data.options,
      timezone,
      job.id, // Pass the job ID
    );

    // Check user notification preferences for daily brief delivery
    const { data: notificationPrefs, error: notificationPrefsError } =
      await supabase
        .from("user_notification_preferences")
        .select("should_email_daily_brief, should_sms_daily_brief")
        .eq("user_id", job.data.userId)
        .single();

    if (notificationPrefsError && notificationPrefsError.code !== "PGRST116") {
      console.warn(
        `Failed to fetch notification preferences for user ${job.data.userId}: ${notificationPrefsError.message}`,
      );
    }

    const shouldEmailBrief =
      notificationPrefs?.should_email_daily_brief ?? false;
    const shouldSmsBrief = notificationPrefs?.should_sms_daily_brief ?? false;

    console.log(`📬 Notification preferences for user ${job.data.userId}:
   → should_email_daily_brief: ${shouldEmailBrief}
   → should_sms_daily_brief: ${shouldSmsBrief}`);

    // NOTE: Email and SMS notifications are now handled via the notification system (brief.completed event)
    // The emailAdapter and smsAdapter will fetch the full brief with LLM analysis and send it
    console.log(
      `📧 Email will be sent via notification system (should_email_daily_brief: ${shouldEmailBrief})`,
    );

    // Handle SMS notifications via notification system
    if (shouldSmsBrief) {
      try {
        console.log(`📱 Checking SMS eligibility for user ${job.data.userId}`);

        // Check SMS preferences (phone verification required)
        const { data: smsPrefs, error: smsPrefsError } = await supabase
          .from("user_sms_preferences")
          .select("phone_number, phone_verified, opted_out")
          .eq("user_id", job.data.userId)
          .single();

        if (smsPrefsError && smsPrefsError.code !== "PGRST116") {
          console.warn(
            `Failed to fetch SMS preferences: ${smsPrefsError.message}`,
          );
        }

        if (!smsPrefs?.phone_number) {
          console.warn(
            `⚠️  User ${job.data.userId} wants SMS but has no phone number`,
          );
        } else if (smsPrefs?.phone_verified !== true) {
          // Explicitly check for true - null/false/undefined all mean not verified
          console.warn(
            `⚠️  User ${job.data.userId} wants SMS but phone not verified`,
          );
        } else if (smsPrefs?.opted_out === true) {
          // Explicitly check for true - null/false/undefined mean not opted out
          console.warn(`⚠️  User ${job.data.userId} has opted out of SMS`);
        } else {
          console.log(
            `✅ Phone verified for user ${job.data.userId}, SMS will be sent via notification system`,
          );
          // SMS will be sent via emit_notification_event below
          // The notification system will check should_sms_daily_brief preference
        }
      } catch (smsError) {
        console.error(
          `Failed to check SMS eligibility: ${smsError instanceof Error ? smsError.message : "Unknown error"}`,
        );
      }
    } else {
      console.log(
        `📭 SMS notifications not enabled for user ${job.data.userId}, skipping SMS`,
      );
    }

    await updateJobStatus(job.id, "completed", "brief");

    // Emit notification event for brief completion
    try {
      const serviceClient = createServiceClient();

      // Get task and project counts from project_daily_briefs
      const { data: projectBriefs } = await supabase
        .from("project_daily_briefs")
        .select("id, metadata")
        .eq("user_id", job.data.userId)
        .eq("brief_date", validatedBriefDate);

      const projectCount = projectBriefs?.length || 0;

      // Calculate all task counts from project briefs for comprehensive notification
      // Using type-safe helper function to extract task counts from metadata
      const todaysTaskCount =
        projectBriefs?.reduce((sum, pb) => {
          return sum + getTaskCount(pb.metadata, "todays_task_count");
        }, 0) || 0;

      const overdueTaskCount =
        projectBriefs?.reduce((sum, pb) => {
          return sum + getTaskCount(pb.metadata, "overdue_task_count");
        }, 0) || 0;

      const upcomingTaskCount =
        projectBriefs?.reduce((sum, pb) => {
          return sum + getTaskCount(pb.metadata, "upcoming_task_count");
        }, 0) || 0;

      const nextSevenDaysTaskCount =
        projectBriefs?.reduce((sum, pb) => {
          return sum + getTaskCount(pb.metadata, "next_seven_days_task_count");
        }, 0) || 0;

      const recentlyCompletedCount =
        projectBriefs?.reduce((sum, pb) => {
          return sum + getTaskCount(pb.metadata, "recently_completed_count");
        }, 0) || 0;

      // Get notification scheduled time from job data (if provided)
      const notificationScheduledFor = job.data.notificationScheduledFor
        ? new Date(job.data.notificationScheduledFor)
        : undefined;

      if (notificationScheduledFor) {
        console.log(
          `📅 Scheduling notification for ${notificationScheduledFor.toISOString()} (user's preferred time)`,
        );
      } else {
        console.log(
          `📅 Sending notification immediately (no scheduled time provided)`,
        );
      }

      console.log(
        `📊 Task counts - Today: ${todaysTaskCount}, Overdue: ${overdueTaskCount}, Upcoming: ${upcomingTaskCount}, Next 7 days: ${nextSevenDaysTaskCount}, Recently completed: ${recentlyCompletedCount}`,
      );

      // Generate correlation ID for end-to-end tracking
      const correlationId = generateCorrelationId();
      console.log(
        `🔗 Generated correlation ID: ${correlationId} for brief.completed notification`,
      );

      // Type assertion needed until database types are regenerated after migration
      await (serviceClient.rpc as any)("emit_notification_event", {
        p_event_type: "brief.completed",
        p_event_source: "worker_job",
        p_target_user_id: job.data.userId,
        p_payload: {
          brief_id: brief.id,
          brief_date: validatedBriefDate,
          timezone: timezone,
          task_count: todaysTaskCount, // Keep for backward compatibility
          todays_task_count: todaysTaskCount,
          overdue_task_count: overdueTaskCount,
          upcoming_task_count: upcomingTaskCount,
          next_seven_days_task_count: nextSevenDaysTaskCount,
          recently_completed_count: recentlyCompletedCount,
          project_count: projectCount,
          correlationId, // Add correlation ID to payload
        },
        p_metadata: {
          correlationId, // Add correlation ID to metadata for tracking
        },
        p_scheduled_for: notificationScheduledFor?.toISOString(), // Schedule at user's preferred time
      });

      console.log(
        `📬 Emitted brief.completed notification event for user ${job.data.userId}`,
      );
    } catch (notificationError) {
      // Log error but don't fail the brief job
      console.error("Failed to emit notification event:", notificationError);
    }

    console.log(`✅ Completed brief generation for user ${job.data.userId}
   → Brief ID: ${brief.id}
   → Brief Date: ${validatedBriefDate}
   → Timezone: ${timezone}
   → Email Preference: ${shouldEmailBrief ? "ENABLED ✅ (will be sent via notification system)" : "DISABLED ❌"}
   → SMS Preference: ${shouldSmsBrief ? "ENABLED ✅ (will be sent via notification system)" : "DISABLED ❌"}`);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(
      `❌ Failed to generate brief for user ${job.data.userId}:`,
      errorMessage,
    );

    await updateJobStatus(job.id, "failed", "brief", errorMessage);

    await notifyUser(job.data.userId, "brief_failed", {
      error: errorMessage,
      jobId: job.id,
      message: "Brief generation failed. Click to retry.",
    });

    throw error;
  }
}
