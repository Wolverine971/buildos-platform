// worker-queue/src/workers/brief/briefWorker.ts
import { format } from "date-fns";
import { utcToZonedTime, getTimezoneOffset } from "date-fns-tz";

import { supabase } from "../../lib/supabase";
import {
  BriefJobData,
  notifyUser,
  updateJobStatus,
} from "../shared/queueUtils";
import { LegacyJob } from "../shared/jobAdapter";
import { generateDailyBrief } from "./briefGenerator";
import { DailyBriefEmailSender } from "../../lib/services/email-sender";

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
    await updateJobStatus(job.id, "processing", "brief");

    // ALWAYS fetch user's timezone from preferences to ensure consistency
    const { data: preferences, error: prefError } = await supabase
      .from("user_brief_preferences")
      .select("timezone")
      .eq("user_id", job.data.userId)
      .single();

    if (prefError) {
      console.warn(
        `Failed to fetch user preferences: ${prefError.message}, using UTC`,
      );
    }

    // Use timezone from preferences, fallback to job data, then UTC
    let timezone = preferences?.timezone || job.data.timezone || "UTC";

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

    console.log(
      `📅 Generating brief for date: ${briefDate} (timezone: ${timezone}, current time: ${new Date().toISOString()})`,
    );

    // Log timezone conversion for debugging
    const userCurrentTime = utcToZonedTime(new Date(), timezone);
    console.log(
      `🕐 User's current time: ${format(userCurrentTime, "yyyy-MM-dd HH:mm:ss zzz")}`,
    );

    const brief = await generateDailyBrief(
      job.data.userId,
      briefDate,
      job.data.options,
      timezone,
      job.id, // Pass the job ID
    );

    // Send email if user has opted in
    let emailStatus = { sent: false, error: null as string | null };
    try {
      const emailSender = new DailyBriefEmailSender(supabase);
      const emailSent = await emailSender.sendDailyBriefEmail(
        job.data.userId,
        briefDate,
        brief,
      );

      if (emailSent) {
        console.log(`📧 Email notification sent for brief ${brief.id}`);
        emailStatus.sent = true;
      }
    } catch (emailError) {
      // Track email failures but don't fail the job
      const errorMessage =
        emailError instanceof Error ? emailError.message : "Unknown error";
      console.error(`Failed to send email notification: ${errorMessage}`);
      emailStatus.error = errorMessage;

      // Update brief metadata to track email failure
      try {
        await supabase
          .from("daily_briefs")
          .update({
            metadata: {
              ...(brief.metadata || {}),
              email_status: {
                sent: false,
                error: errorMessage,
                failed_at: new Date().toISOString(),
              },
            },
          })
          .eq("id", brief.id);

        // Track email failure in error_logs table
        await supabase.from("error_logs").insert({
          user_id: job.data.userId,
          error_type: "email_send_failure",
          error_message: errorMessage,
          endpoint: "/worker/brief/email",
          operation_type: "send_daily_brief_email",
          record_id: brief.id,
          metadata: {
            brief_id: brief.id,
            brief_date: briefDate,
            job_id: job.id,
            email_type: "daily_brief",
          },
        });
      } catch (trackingError) {
        console.error("Failed to track email failure:", trackingError);
      }
    }

    await updateJobStatus(job.id, "completed", "brief");

    // Include email status in notification
    await notifyUser(job.data.userId, "brief_completed", {
      briefId: brief.id,
      briefDate: brief.brief_date,
      timezone: timezone,
      message: `Your daily brief for ${briefDate} is ready!`,
      emailSent: emailStatus.sent,
      emailError: emailStatus.error,
    });

    console.log(
      `✅ Completed brief generation for user ${job.data.userId} - Date: ${briefDate}, Timezone: ${timezone}`,
    );
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
