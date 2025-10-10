// apps/worker/src/scheduler.ts
import {
  addDays,
  addHours,
  isAfter,
  isBefore,
  setHours,
  setMinutes,
  setSeconds,
} from "date-fns";
import { utcToZonedTime, zonedTimeToUtc } from "date-fns-tz";
import cron from "node-cron";
import { format } from "date-fns";

import { supabase } from "./lib/supabase";
import { queue } from "./worker";
import type { Database } from "@buildos/shared-types";
import { BriefBackoffCalculator } from "./lib/briefBackoffCalculator";
import { smsAlertsService, smsMetricsService } from "@buildos/shared-utils";

export type UserBriefPreference =
  Database["public"]["Tables"]["user_brief_preferences"]["Row"];

// Feature flag for engagement backoff (defaults to false for safety)
const ENGAGEMENT_BACKOFF_ENABLED =
  process.env.ENGAGEMENT_BACKOFF_ENABLED === "true";

// Initialize backoff calculator
const backoffCalculator = new BriefBackoffCalculator();

/**
 * Queue brief generation using Supabase queue
 */
async function queueBriefGeneration(
  userId: string,
  scheduledFor: Date,
  options?: any,
  timezone: string = "UTC",
  engagementMetadata?: {
    isReengagement: boolean;
    daysSinceLastLogin: number;
  },
): Promise<any> {
  // Fetch the latest timezone from user preferences
  const { data: preferences } = await supabase
    .from("user_brief_preferences")
    .select("timezone")
    .eq("user_id", userId)
    .single();

  const userTimezone = preferences?.timezone || timezone || "UTC";

  // Calculate the brief date based on the scheduled time in the user's timezone
  const zonedDate = utcToZonedTime(scheduledFor, userTimezone);
  const briefDate =
    options?.requestedBriefDate || format(zonedDate, "yyyy-MM-dd");

  console.log(`📅 Queueing brief for user ${userId}:`);
  console.log(`   - Scheduled for (UTC): ${scheduledFor.toISOString()}`);
  console.log(`   - User timezone: ${userTimezone}`);
  console.log(`   - Brief date: ${briefDate}`);
  if (engagementMetadata) {
    console.log(`   - Is re-engagement: ${engagementMetadata.isReengagement}`);
    console.log(
      `   - Days since last login: ${engagementMetadata.daysSinceLastLogin}`,
    );
  }

  const jobData = {
    userId,
    briefDate,
    options: options
      ? { ...options, requestedBriefDate: undefined, ...engagementMetadata }
      : engagementMetadata,
    timezone: userTimezone,
  };

  // Calculate priority based on immediacy
  const delay = Math.max(0, scheduledFor.getTime() - Date.now());
  const isImmediate = delay < 60000; // Less than 1 minute
  const priority = isImmediate ? 1 : 10;

  // Create dedup key for this specific brief
  const dedupKey = `brief-${userId}-${briefDate}`;

  if (isImmediate) {
    console.log(`⚡ Immediate brief requested for ${briefDate}`);

    // Atomically cancel any existing jobs for this date
    const { count } = await queue.cancelBriefJobsForDate(userId, briefDate);
    if (count > 0) {
      console.log(
        `🚫 Cancelled ${count} existing brief job(s) for ${briefDate}`,
      );
    }
  }

  // Add job to Supabase queue
  const job = await queue.add("generate_daily_brief", userId, jobData, {
    priority,
    scheduledFor,
    dedupKey: isImmediate ? `${dedupKey}-${Date.now()}` : dedupKey,
  });

  const jobType = isImmediate ? "immediate" : "scheduled";
  console.log(`📋 Queued ${jobType} brief generation:`);
  console.log(`   - User: ${userId}`);
  console.log(`   - Brief date: ${briefDate}`);
  console.log(`   - Job ID: ${job.queue_job_id}`);
  console.log(`   - Priority: ${priority}`);

  return job;
}

/**
 * Start the scheduler
 */
export function startScheduler() {
  console.log("📅 Starting scheduler...");

  // Run every hour to check for scheduled briefs
  cron.schedule("0 * * * *", async () => {
    console.log("🔍 Checking for scheduled briefs...");
    await checkAndScheduleBriefs();
  });

  // Run at midnight to schedule daily SMS reminders
  cron.schedule("0 0 * * *", async () => {
    console.log("📱 Checking for daily SMS reminders...");
    await checkAndScheduleDailySMS();
  });

  // Run hourly to check SMS alert thresholds and refresh metrics view
  cron.schedule("0 * * * *", async () => {
    console.log("🚨 Checking SMS alert thresholds...");
    await checkSMSAlerts();
  });

  // Also run once at startup
  setTimeout(() => {
    checkAndScheduleBriefs();
  }, 5000);

  console.log(
    "⏰ Scheduler started - checking every hour (briefs, SMS alerts) and midnight (SMS scheduling)",
  );
}

/**
 * Check and schedule briefs
 */
async function checkAndScheduleBriefs() {
  try {
    const now = new Date();
    const oneHourFromNow = addHours(now, 1);

    // Get all active user preferences
    const { data: preferences, error } = await supabase
      .from("user_brief_preferences")
      .select("*")
      .eq("is_active", true);

    if (error) {
      console.error("Error fetching user preferences:", error);
      return;
    }

    if (!preferences || preferences.length === 0) {
      console.log("📝 No active brief preferences found");
      return;
    }

    console.log(`📋 Found ${preferences.length} active preference(s)`);

    // PHASE 1: Batch fetch engagement data for all users (if enabled)
    const engagementDataMap = new Map<
      string,
      {
        shouldSend: boolean;
        isReengagement: boolean;
        daysSinceLastLogin: number;
        reason?: string;
      }
    >();

    if (ENGAGEMENT_BACKOFF_ENABLED) {
      console.log("🔍 Batch checking engagement status for all users...");
      const engagementChecks = await Promise.allSettled(
        preferences.map(async (preference) => {
          if (!preference.user_id) return null;
          const decision = await backoffCalculator.shouldSendDailyBrief(
            preference.user_id,
          );
          return { userId: preference.user_id, decision };
        }),
      );

      engagementChecks.forEach((result) => {
        if (result.status === "fulfilled" && result.value) {
          const { userId, decision } = result.value;
          engagementDataMap.set(userId, decision);
        }
      });
    }

    // PHASE 2: Calculate next run times and filter users needing briefs
    const usersToSchedule: Array<{
      preference: any;
      nextRunTime: Date;
      engagementMetadata?: {
        isReengagement: boolean;
        daysSinceLastLogin: number;
      };
    }> = [];

    for (const preference of preferences) {
      if (!preference.user_id) {
        console.warn("Skipping preference with no user_id");
        continue;
      }

      // Check engagement status
      let engagementMetadata:
        | { isReengagement: boolean; daysSinceLastLogin: number }
        | undefined;

      if (ENGAGEMENT_BACKOFF_ENABLED) {
        const backoffDecision = engagementDataMap.get(preference.user_id);

        if (!backoffDecision?.shouldSend) {
          console.log(
            `⏸️ Skipping brief for user ${preference.user_id}: ${backoffDecision?.reason || "unknown"}`,
          );
          continue;
        }

        engagementMetadata = {
          isReengagement: backoffDecision.isReengagement,
          daysSinceLastLogin: backoffDecision.daysSinceLastLogin,
        };

        const briefType = backoffDecision.isReengagement
          ? "re-engagement"
          : "standard";
        console.log(
          `📧 Will queue ${briefType} brief for user ${preference.user_id} (inactive for ${backoffDecision.daysSinceLastLogin} days)`,
        );
      }

      const nextRunTime = calculateNextRunTime(preference, now);

      if (!nextRunTime) {
        console.warn(
          `Could not calculate next run time for user ${preference.user_id}`,
        );
        continue;
      }

      // Check if the next run time is within the next hour
      if (isAfter(nextRunTime, now) && isBefore(nextRunTime, oneHourFromNow)) {
        usersToSchedule.push({ preference, nextRunTime, engagementMetadata });
      }
    }

    if (usersToSchedule.length === 0) {
      console.log("✅ No briefs need to be scheduled at this time");
      return;
    }

    // PHASE 3: Batch check for existing jobs (single query for all users)
    console.log(
      `🔍 Checking for existing jobs for ${usersToSchedule.length} user(s)...`,
    );
    const userIds = usersToSchedule.map((u) => u.preference.user_id);
    const timeWindow = 30 * 60 * 1000; // 30 minutes tolerance

    const { data: existingJobs } = await supabase
      .from("queue_jobs")
      .select("user_id, scheduled_for")
      .in("user_id", userIds)
      .eq("job_type", "generate_daily_brief")
      .in("status", ["pending", "processing"]);

    // Create map of existing jobs for quick lookup
    const existingJobsMap = new Map<string, Date[]>();
    existingJobs?.forEach((job) => {
      if (!existingJobsMap.has(job.user_id)) {
        existingJobsMap.set(job.user_id, []);
      }
      existingJobsMap.get(job.user_id)!.push(new Date(job.scheduled_for));
    });

    // Filter out users who already have jobs scheduled
    const usersToQueue = usersToSchedule.filter(
      ({ preference, nextRunTime }) => {
        const userJobs = existingJobsMap.get(preference.user_id) || [];
        const windowStart = new Date(nextRunTime.getTime() - timeWindow);
        const windowEnd = new Date(nextRunTime.getTime() + timeWindow);

        const hasConflict = userJobs.some(
          (jobTime) => jobTime >= windowStart && jobTime <= windowEnd,
        );

        if (hasConflict) {
          console.log(
            `⏭️ Brief already scheduled for user ${preference.user_id}`,
          );
          return false;
        }

        return true;
      },
    );

    // PHASE 4: Batch queue all jobs in parallel
    if (usersToQueue.length === 0) {
      console.log("✅ All users already have briefs scheduled");
      return;
    }

    console.log(`📨 Queueing ${usersToQueue.length} brief(s) in parallel...`);
    const queueResults = await Promise.allSettled(
      usersToQueue.map(
        async ({ preference, nextRunTime, engagementMetadata }) => {
          console.log(
            `⏰ Scheduling brief for user ${preference.user_id} at ${nextRunTime.toISOString()}`,
          );
          await queueBriefGeneration(
            preference.user_id,
            nextRunTime,
            undefined,
            preference.timezone || "UTC",
            engagementMetadata,
          );
          return preference.user_id;
        },
      ),
    );

    // Log results
    const successCount = queueResults.filter(
      (r) => r.status === "fulfilled",
    ).length;
    const failureCount = queueResults.filter(
      (r) => r.status === "rejected",
    ).length;

    console.log(`✅ Successfully queued ${successCount} brief(s)`);
    if (failureCount > 0) {
      console.warn(`⚠️ Failed to queue ${failureCount} brief(s)`);
      queueResults.forEach((result, i) => {
        if (result.status === "rejected") {
          console.error(
            `Failed to queue brief for user ${usersToQueue[i].preference.user_id}:`,
            result.reason,
          );
        }
      });
    }
  } catch (error) {
    console.error("Error in checkAndScheduleBriefs:", error);
  }
}

/**
 * Calculate next run time for a user preference
 */
export function calculateNextRunTime(
  preference: UserBriefPreference,
  now: Date,
): Date | null {
  try {
    const timezone = preference.timezone || "UTC";
    const timeOfDay = preference.time_of_day || "09:00:00";
    const frequency = preference.frequency || "daily";

    // Parse time of day
    const timeParts = timeOfDay.split(":");
    if (timeParts.length < 2) {
      console.error(`Invalid time format: ${timeOfDay}`);
      return null;
    }

    const hours = parseInt(timeParts[0], 10);
    const minutes = parseInt(timeParts[1], 10);
    const seconds = parseInt(timeParts[2] || "0", 10);

    // Validate time components
    if (
      isNaN(hours) ||
      isNaN(minutes) ||
      isNaN(seconds) ||
      hours < 0 ||
      hours > 23 ||
      minutes < 0 ||
      minutes > 59 ||
      seconds < 0 ||
      seconds > 59
    ) {
      console.error(`Invalid time components: ${hours}:${minutes}:${seconds}`);
      return null;
    }

    let targetDate: Date;

    switch (frequency) {
      case "daily":
        targetDate = calculateDailyRunTime(
          now,
          hours,
          minutes,
          seconds,
          timezone,
        );
        break;

      case "weekly":
        const dayOfWeek = preference.day_of_week ?? 1; // Default to Monday
        targetDate = calculateWeeklyRunTime(
          now,
          dayOfWeek,
          hours,
          minutes,
          seconds,
          timezone,
        );
        break;

      case "custom":
        // For custom frequency, treat as daily for now
        targetDate = calculateDailyRunTime(
          now,
          hours,
          minutes,
          seconds,
          timezone,
        );
        break;

      default:
        console.warn(`Unknown frequency: ${frequency}`);
        return null;
    }

    return targetDate;
  } catch (error) {
    console.error("Error calculating next run time:", error);
    return null;
  }
}

/**
 * Calculate daily run time
 */
function calculateDailyRunTime(
  now: Date,
  hours: number,
  minutes: number,
  seconds: number,
  timezone: string,
): Date {
  // Get current time in user's timezone
  const nowInUserTz = utcToZonedTime(now, timezone);

  // Set target time for today with precise time (no milliseconds)
  let targetInUserTz = setHours(nowInUserTz, hours);
  targetInUserTz = setMinutes(targetInUserTz, minutes);
  targetInUserTz = setSeconds(targetInUserTz, seconds);
  targetInUserTz.setMilliseconds(0); // Ensure precise scheduling without millisecond drift

  // If target time has passed today, schedule for tomorrow
  if (isBefore(targetInUserTz, nowInUserTz)) {
    targetInUserTz = addDays(targetInUserTz, 1);
  }

  // Convert back to UTC
  return zonedTimeToUtc(targetInUserTz, timezone);
}

/**
 * Calculate weekly run time
 */
function calculateWeeklyRunTime(
  now: Date,
  dayOfWeek: number,
  hours: number,
  minutes: number,
  seconds: number,
  timezone: string,
): Date {
  // Get current time in user's timezone
  const nowInUserTz = utcToZonedTime(now, timezone);
  const currentDayOfWeek = nowInUserTz.getDay();

  // Calculate days until target day
  let daysUntilTarget = dayOfWeek - currentDayOfWeek;

  // If target day is today but time has passed, or if target day has passed this week
  let targetInUserTz = setHours(nowInUserTz, hours);
  targetInUserTz = setMinutes(targetInUserTz, minutes);
  targetInUserTz = setSeconds(targetInUserTz, seconds);
  targetInUserTz.setMilliseconds(0); // Ensure precise scheduling without millisecond drift

  if (
    daysUntilTarget < 0 ||
    (daysUntilTarget === 0 && isBefore(targetInUserTz, nowInUserTz))
  ) {
    daysUntilTarget += 7; // Schedule for next week
  }

  // Add days to reach target day
  if (daysUntilTarget > 0) {
    targetInUserTz = addDays(targetInUserTz, daysUntilTarget);
  }

  // Convert back to UTC
  return zonedTimeToUtc(targetInUserTz, timezone);
}

/**
 * Validate user brief preference
 */
export function validateUserPreference(
  preference: Partial<UserBriefPreference>,
): string[] {
  const errors: string[] = [];

  // Validate frequency
  if (
    preference.frequency &&
    !["daily", "weekly", "custom"].includes(preference.frequency)
  ) {
    errors.push("Invalid frequency. Must be daily, weekly, or custom");
  }

  // Validate time_of_day
  if (preference.time_of_day) {
    const timeParts = preference.time_of_day.split(":");
    if (timeParts.length < 2) {
      errors.push("Invalid time_of_day format. Expected HH:MM:SS");
    } else {
      const hours = parseInt(timeParts[0], 10);
      const minutes = parseInt(timeParts[1], 10);
      const seconds = parseInt(timeParts[2] || "0", 10);

      if (isNaN(hours) || hours < 0 || hours > 23) {
        errors.push("Invalid hours in time_of_day");
      }
      if (isNaN(minutes) || minutes < 0 || minutes > 59) {
        errors.push("Invalid minutes in time_of_day");
      }
      if (isNaN(seconds) || seconds < 0 || seconds > 59) {
        errors.push("Invalid seconds in time_of_day");
      }
    }
  }

  // Validate day_of_week
  if (preference.day_of_week !== undefined && preference.day_of_week !== null) {
    if (preference.day_of_week < 0 || preference.day_of_week > 6) {
      errors.push(
        "Invalid day_of_week. Must be between 0 (Sunday) and 6 (Saturday)",
      );
    }
  }

  return errors;
}

/**
 * Check and schedule daily SMS event reminders
 * Runs at midnight (12:00 AM) to queue SMS scheduling jobs for users
 */
async function checkAndScheduleDailySMS() {
  try {
    console.log("📱 [SMS Scheduler] Starting daily SMS check...");

    // Get all users with SMS event reminders enabled
    const { data: smsPreferences, error } = await supabase
      .from("user_sms_preferences")
      .select(
        "user_id, timezone, event_reminders_enabled, reminder_lead_time_minutes",
      )
      .eq("event_reminders_enabled", true)
      .eq("phone_verified", true)
      .eq("opted_out", false);

    if (error) {
      console.error(
        "❌ [SMS Scheduler] Error fetching SMS preferences:",
        error,
      );
      return;
    }

    if (!smsPreferences || smsPreferences.length === 0) {
      console.log(
        "📝 [SMS Scheduler] No users with SMS event reminders enabled",
      );
      return;
    }

    console.log(
      `📋 [SMS Scheduler] Found ${smsPreferences.length} user(s) with SMS enabled`,
    );

    // Queue a job for each user to process their daily SMS
    let queuedCount = 0;
    let skippedCount = 0;

    for (const pref of smsPreferences) {
      try {
        const userTimezone = pref.timezone || "UTC";
        const now = new Date();

        // Calculate today's date in user's timezone
        const userNow = utcToZonedTime(now, userTimezone);
        const todayDate = format(userNow, "yyyy-MM-dd");

        // Queue job to process this user's daily SMS
        const jobData = {
          userId: pref.user_id,
          date: todayDate,
          timezone: userTimezone,
          leadTimeMinutes: pref.reminder_lead_time_minutes || 15,
        };

        const dedupKey = `schedule-daily-sms-${pref.user_id}-${todayDate}`;

        await queue.add("schedule_daily_sms", pref.user_id, jobData, {
          priority: 5, // Medium priority
          scheduledFor: now, // Process immediately
          dedupKey,
        });

        queuedCount++;
        console.log(
          `✅ [SMS Scheduler] Queued SMS job for user ${pref.user_id} (${todayDate})`,
        );
      } catch (jobError) {
        console.error(
          `❌ [SMS Scheduler] Error queuing SMS job for user ${pref.user_id}:`,
          jobError,
        );
        skippedCount++;
      }
    }

    console.log(
      `📊 [SMS Scheduler] Summary: ${queuedCount} queued, ${skippedCount} skipped`,
    );
  } catch (error) {
    console.error(
      "❌ [SMS Scheduler] Error in checkAndScheduleDailySMS:",
      error,
    );
  }
}

/**
 * Check SMS alert thresholds and refresh metrics view
 * Runs hourly to monitor SMS system health and trigger alerts
 */
async function checkSMSAlerts() {
  try {
    console.log("🚨 [SMS Alerts] Starting hourly alert check...");

    // Step 1: Refresh materialized view to get latest metrics
    console.log("📊 [SMS Alerts] Refreshing metrics materialized view...");
    await smsMetricsService.refreshMaterializedView();
    console.log("✅ [SMS Alerts] Metrics view refreshed successfully");

    // Step 2: Check all alert thresholds
    console.log("🔍 [SMS Alerts] Checking alert thresholds...");
    const triggeredAlerts = await smsAlertsService.checkAlerts();

    if (triggeredAlerts.length === 0) {
      console.log("✅ [SMS Alerts] All metrics within acceptable thresholds");
    } else {
      console.log(
        `🚨 [SMS Alerts] ${triggeredAlerts.length} alert(s) triggered:`,
      );
      triggeredAlerts.forEach(
        (alert: {
          severity: string;
          alert_type: string;
          message: string;
          notification_channel: string;
        }) => {
          console.log(
            `   - ${alert.severity.toUpperCase()}: ${alert.alert_type}`,
          );
          console.log(`     Message: ${alert.message}`);
          console.log(`     Channel: ${alert.notification_channel}`);
        },
      );
    }

    console.log("✅ [SMS Alerts] Alert check completed successfully");
  } catch (error) {
    console.error("❌ [SMS Alerts] Error in checkSMSAlerts:", error);
  }
}
