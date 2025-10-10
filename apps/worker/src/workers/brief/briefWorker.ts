// apps/worker/src/workers/brief/briefWorker.ts
import { format } from "date-fns";
import { utcToZonedTime, getTimezoneOffset } from "date-fns-tz";

import { supabase } from "../../lib/supabase";
import { createServiceClient } from "@buildos/supabase-client";
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

    // Phase 2 REVISED: Create email record and queue email job (non-blocking)
    let emailRecordId: string | null = null;
    let emailQueuedSuccessfully = false;
    try {
      const emailSender = new DailyBriefEmailSender(supabase);
      const shouldSend = await emailSender.shouldSendEmail(job.data.userId);

      if (shouldSend) {
        console.log(
          `📧 User ${job.data.userId} is eligible for email, proceeding with email creation...`,
        );

        // Get user email
        const { data: user, error: userError } = await supabase
          .from("users")
          .select("email")
          .eq("id", job.data.userId)
          .single();

        if (userError) {
          console.error(
            `❌ Error fetching user email for ${job.data.userId}:`,
            userError,
          );
          throw new Error(`Failed to fetch user: ${userError.message}`);
        }

        if (!user?.email) {
          console.warn(
            `⚠️  No email address found for user ${job.data.userId}, cannot send email`,
          );
        } else {
          // Generate tracking ID
          const trackingId = crypto.randomUUID();

          // Prepare email content (reuse existing formatBriefForEmail method)
          const { htmlContent, plainText } = emailSender.formatBriefForEmail(
            brief,
            briefDate,
          );

          // Generate tracking pixel
          const trackingPixel = `<img src="https://build-os.com/api/email-tracking/${trackingId}" width="1" height="1" style="display:none;" alt="" />`;

          // Use custom subject from metadata (for re-engagement emails) or default
          const customSubject =
            brief.metadata && typeof brief.metadata === "object"
              ? brief.metadata.email_subject
              : undefined;

          const subject =
            customSubject ||
            `Daily Brief - ${new Date(briefDate).toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}`;

          // Generate minimal HTML for storage
          const emailHtmlForStorage = `
<!DOCTYPE html>
<html>
<head><title>${subject}</title></head>
<body>
  ${htmlContent}
  ${trackingPixel}
</body>
</html>`;

          // Create email record in existing emails table (status='scheduled')
          const { data: emailRecord, error: emailError } = await supabase
            .from("emails")
            .insert({
              created_by: job.data.userId,
              from_email: "noreply@build-os.com",
              from_name: "BuildOS",
              subject: subject,
              content: emailHtmlForStorage,
              category: "daily_brief",
              status: "scheduled", // ← Not sent yet!
              tracking_enabled: true,
              tracking_id: trackingId,
              template_data: {
                brief_id: brief.id,
                brief_date: briefDate,
                user_id: job.data.userId,
              },
            })
            .select()
            .single();

          if (emailError) {
            console.error("Failed to create email record:", emailError);
          } else {
            emailRecordId = emailRecord.id;

            // Create recipient record in existing email_recipients table
            const { error: recipientError } = await supabase
              .from("email_recipients")
              .insert({
                email_id: emailRecord.id,
                recipient_email: user.email,
                recipient_type: "to",
                status: "pending",
              });

            if (recipientError) {
              console.error(
                "Failed to create recipient record:",
                recipientError,
              );
            }

            // Queue email job with emailId (not briefId!)
            const { data: emailJob, error: queueError } = await supabase.rpc(
              "add_queue_job",
              {
                p_user_id: job.data.userId,
                p_job_type: "generate_brief_email",
                p_metadata: {
                  emailId: emailRecord.id, // ← Just emailId!
                },
                p_priority: 5, // Lower priority than brief generation
                p_scheduled_for: new Date().toISOString(), // Send immediately
                p_dedup_key: `email-${emailRecord.id}`, // Prevent duplicate email jobs
              },
            );

            if (queueError) {
              console.error(
                `❌ CRITICAL: Failed to queue email job for email ${emailRecord.id}:`,
                queueError,
              );
              console.error(`   → Error code: ${queueError.code}`);
              console.error(`   → Error message: ${queueError.message}`);
              console.error(
                `   → Brief ID: ${brief.id}, User ID: ${job.data.userId}`,
              );

              // Mark email as failed since we couldn't queue it
              await supabase
                .from("emails")
                .update({
                  status: "failed",
                  template_data: {
                    brief_id: brief.id,
                    brief_date: briefDate,
                    user_id: job.data.userId,
                    error: {
                      message: queueError.message,
                      code: queueError.code,
                      timestamp: new Date().toISOString(),
                    },
                  },
                })
                .eq("id", emailRecord.id);

              throw new Error(
                `Failed to queue email job: ${queueError.message}`,
              );
            } else {
              emailQueuedSuccessfully = true;
              console.log(
                `✅ Successfully queued email job ${emailJob} for email ${emailRecord.id} (brief ${brief.id})`,
              );
            }
          }
        }
      } else {
        console.log(
          `📭 Email not enabled for user ${job.data.userId}, skipping email`,
        );
      }
    } catch (emailError) {
      // Log error but don't fail the brief job
      const errorMessage =
        emailError instanceof Error ? emailError.message : "Unknown error";
      console.error(`Failed to create/queue email: ${errorMessage}`);

      // Track email creation failure in error_logs
      const { error: errorLogError } = await supabase
        .from("error_logs")
        .insert({
          user_id: job.data.userId,
          error_type: "email_creation_failure",
          error_message: errorMessage,
          endpoint: "/worker/brief/email-create",
          operation_type: "create_email_record",
          record_id: brief.id,
          metadata: {
            brief_id: brief.id,
            brief_date: briefDate,
            job_id: job.id,
          },
        });

      if (errorLogError) {
        console.error("Failed to log error:", errorLogError);
      }
    }

    await updateJobStatus(job.id, "completed", "brief");

    // Emit notification event for brief completion
    try {
      const serviceClient = createServiceClient();

      // Get task and project counts from project_daily_briefs
      const { data: projectBriefs } = await supabase
        .from("project_daily_briefs")
        .select("id, metadata")
        .eq("daily_brief_id", brief.id);

      const projectCount = projectBriefs?.length || 0;

      // Calculate all task counts from project briefs for comprehensive notification
      const todaysTaskCount = projectBriefs?.reduce((sum, pb) => {
        const metadata = pb.metadata as any;
        return sum + (metadata?.todays_task_count || 0);
      }, 0) || 0;

      const overdueTaskCount = projectBriefs?.reduce((sum, pb) => {
        const metadata = pb.metadata as any;
        return sum + (metadata?.overdue_task_count || 0);
      }, 0) || 0;

      const upcomingTaskCount = projectBriefs?.reduce((sum, pb) => {
        const metadata = pb.metadata as any;
        return sum + (metadata?.upcoming_task_count || 0);
      }, 0) || 0;

      const nextSevenDaysTaskCount = projectBriefs?.reduce((sum, pb) => {
        const metadata = pb.metadata as any;
        return sum + (metadata?.next_seven_days_task_count || 0);
      }, 0) || 0;

      const recentlyCompletedCount = projectBriefs?.reduce((sum, pb) => {
        const metadata = pb.metadata as any;
        return sum + (metadata?.recently_completed_count || 0);
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

      // Type assertion needed until database types are regenerated after migration
      await (serviceClient.rpc as any)("emit_notification_event", {
        p_event_type: "brief.completed",
        p_event_source: "worker_job",
        p_target_user_id: job.data.userId,
        p_payload: {
          brief_id: brief.id,
          brief_date: briefDate,
          timezone: timezone,
          task_count: todaysTaskCount, // Keep for backward compatibility
          todays_task_count: todaysTaskCount,
          overdue_task_count: overdueTaskCount,
          upcoming_task_count: upcomingTaskCount,
          next_seven_days_task_count: nextSevenDaysTaskCount,
          recently_completed_count: recentlyCompletedCount,
          project_count: projectCount,
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
   → Brief Date: ${briefDate}
   → Timezone: ${timezone}
   → Email Record Created: ${emailRecordId ? "YES ✅" : "NO ❌"}
   → Email Job Queued: ${emailQueuedSuccessfully ? "YES ✅" : "NO ❌"}`);
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
