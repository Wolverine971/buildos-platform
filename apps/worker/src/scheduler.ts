// worker-queue/src/scheduler.ts
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

  // Also run once at startup
  setTimeout(() => {
    checkAndScheduleBriefs();
  }, 5000);

  console.log("⏰ Scheduler started - checking every hour");
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

    for (const preference of preferences) {
      try {
        if (!preference.user_id) {
          console.warn("Skipping preference with no user_id");
          continue;
        }

        // NEW: Check backoff status if feature flag is enabled
        let engagementMetadata:
          | { isReengagement: boolean; daysSinceLastLogin: number }
          | undefined;

        if (ENGAGEMENT_BACKOFF_ENABLED) {
          const backoffDecision = await backoffCalculator.shouldSendDailyBrief(
            preference.user_id,
          );

          if (!backoffDecision.shouldSend) {
            console.log(
              `⏸️ Skipping brief for user ${preference.user_id}: ${backoffDecision.reason}`,
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
            `📧 Queueing ${briefType} brief for user ${preference.user_id} (inactive for ${backoffDecision.daysSinceLastLogin} days)`,
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
        if (
          isAfter(nextRunTime, now) &&
          isBefore(nextRunTime, oneHourFromNow)
        ) {
          // Check if we already have a job scheduled
          const timeWindow = 30 * 60 * 1000; // 30 minutes tolerance
          const windowStart = new Date(nextRunTime.getTime() - timeWindow);
          const windowEnd = new Date(nextRunTime.getTime() + timeWindow);

          const { data: existingJobs } = await supabase
            .from("queue_jobs")
            .select("*")
            .eq("user_id", preference.user_id)
            .eq("job_type", "generate_daily_brief")
            .in("status", ["pending", "processing"])
            .gte("scheduled_for", windowStart.toISOString())
            .lte("scheduled_for", windowEnd.toISOString());

          if (!existingJobs || existingJobs.length === 0) {
            console.log(
              `⏰ Scheduling brief for user ${preference.user_id} at ${nextRunTime.toISOString()}`,
            );
            await queueBriefGeneration(
              preference.user_id,
              nextRunTime,
              undefined,
              preference.timezone || "UTC",
              engagementMetadata, // NEW: Pass engagement metadata
            );
          } else {
            console.log(
              `⏭️ Brief already scheduled for user ${preference.user_id}`,
            );
          }
        }
      } catch (error) {
        console.error(
          `Error processing preference for user ${preference.user_id}:`,
          error,
        );
      }
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
