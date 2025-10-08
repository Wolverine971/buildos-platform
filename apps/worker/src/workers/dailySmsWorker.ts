// apps/worker/src/workers/dailySmsWorker.ts
/**
 * Daily SMS Worker
 *
 * Processes daily SMS scheduling jobs for calendar event reminders.
 * - Fetches calendar events for the user's day
 * - Filters events that need SMS reminders
 * - Generates messages (LLM in Phase 2, templates for Phase 1)
 * - Creates scheduled_sms_messages records
 * - Queues send_sms jobs for scheduled times
 */

import { supabase } from "../lib/supabase";
import type { LegacyJob } from "./shared/jobAdapter";
import { utcToZonedTime, zonedTimeToUtc } from "date-fns-tz";
import {
  addMinutes,
  format,
  isAfter,
  isBefore,
  parseISO,
  startOfDay,
  endOfDay,
} from "date-fns";
import { queue } from "../worker";

interface DailySMSJobData {
  userId: string;
  date: string; // YYYY-MM-DD
  timezone: string;
  leadTimeMinutes: number;
}

/**
 * Process daily SMS scheduling job
 */
export async function processDailySMS(job: LegacyJob<DailySMSJobData>) {
  const { userId, date, timezone, leadTimeMinutes } = job.data;

  console.log(
    `📱 [DailySMS] Processing for user ${userId}, date ${date}, timezone ${timezone}`,
  );

  try {
    // Update progress
    await job.updateProgress({
      current: 1,
      total: 5,
      message: "Fetching user preferences and calendar events",
    });

    // Get user SMS preferences
    const { data: smsPrefs, error: prefsError } = await supabase
      .from("user_sms_preferences")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (prefsError || !smsPrefs) {
      console.error(
        `❌ [DailySMS] No SMS preferences found for user ${userId}`,
      );
      throw new Error("SMS preferences not found");
    }

    // Verify user is still opted in and phone verified
    if (
      !smsPrefs.phone_verified ||
      smsPrefs.opted_out ||
      !smsPrefs.event_reminders_enabled
    ) {
      console.log(
        `⏭️ [DailySMS] User ${userId} not eligible for SMS (phone_verified: ${smsPrefs.phone_verified}, opted_out: ${smsPrefs.opted_out}, event_reminders_enabled: ${smsPrefs.event_reminders_enabled})`,
      );
      return { success: true, message: "User not eligible for SMS reminders" };
    }

    // Check daily SMS limit
    const today = format(new Date(), "yyyy-MM-dd");
    const needsReset = smsPrefs.daily_count_reset_at
      ? format(parseISO(smsPrefs.daily_count_reset_at), "yyyy-MM-dd") !== today
      : true;

    if (needsReset) {
      // Reset daily count
      await supabase
        .from("user_sms_preferences")
        .update({
          daily_sms_count: 0,
          daily_count_reset_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
    }

    const currentCount = needsReset ? 0 : smsPrefs.daily_sms_count || 0;
    const limit = smsPrefs.daily_sms_limit || 10;

    if (currentCount >= limit) {
      console.log(
        `⏭️ [DailySMS] User ${userId} has reached daily SMS limit (${currentCount}/${limit})`,
      );
      return { success: true, message: "Daily SMS limit reached" };
    }

    // Calculate date range for calendar events
    const userDate = parseISO(`${date}T00:00:00`);
    const startOfUserDay = utcToZonedTime(startOfDay(userDate), timezone);
    const endOfUserDay = utcToZonedTime(endOfDay(userDate), timezone);

    const startUTC = zonedTimeToUtc(startOfUserDay, timezone);
    const endUTC = zonedTimeToUtc(endOfUserDay, timezone);

    console.log(
      `📅 [DailySMS] Fetching events from ${startUTC.toISOString()} to ${endUTC.toISOString()}`,
    );

    // Update progress
    await job.updateProgress({
      current: 2,
      total: 5,
      message: "Fetching calendar events",
    });

    // Fetch calendar events for the day
    const { data: calendarEvents, error: eventsError } = await supabase
      .from("task_calendar_events")
      .select("*")
      .eq("user_id", userId)
      .gte("event_start", startUTC.toISOString())
      .lte("event_start", endUTC.toISOString())
      .eq("sync_status", "synced")
      .order("event_start", { ascending: true });

    if (eventsError) {
      console.error(
        `❌ [DailySMS] Error fetching calendar events:`,
        eventsError,
      );
      throw eventsError;
    }

    if (!calendarEvents || calendarEvents.length === 0) {
      console.log(
        `📝 [DailySMS] No calendar events found for user ${userId} on ${date}`,
      );
      return { success: true, message: "No calendar events found" };
    }

    console.log(
      `📋 [DailySMS] Found ${calendarEvents.length} calendar event(s)`,
    );

    // Update progress
    await job.updateProgress({
      current: 3,
      total: 5,
      message: `Processing ${calendarEvents.length} events`,
    });

    // Filter events that need SMS reminders
    const now = new Date();
    const scheduledMessages: any[] = [];

    for (const event of calendarEvents) {
      // Skip if event_start is null
      if (!event.event_start) {
        console.log(`⏭️ [DailySMS] Skipping event with null start time`);
        continue;
      }

      const eventStart = parseISO(event.event_start);
      const reminderTime = addMinutes(eventStart, -leadTimeMinutes);

      // Skip if reminder time is in the past
      if (isBefore(reminderTime, now)) {
        console.log(
          `⏭️ [DailySMS] Skipping event "${event.event_title || "Untitled"}" - reminder time is in the past`,
        );
        continue;
      }

      // Skip all-day events for now (Phase 2 enhancement)
      if (!event.event_start.includes("T")) {
        console.log(
          `⏭️ [DailySMS] Skipping all-day event "${event.event_title || "Untitled"}"`,
        );
        continue;
      }

      // Check quiet hours
      if (smsPrefs.quiet_hours_start && smsPrefs.quiet_hours_end) {
        const reminderTimeInUserTz = utcToZonedTime(reminderTime, timezone);
        const reminderHour = reminderTimeInUserTz.getHours();
        const reminderMinute = reminderTimeInUserTz.getMinutes();

        const [quietStartHour, quietStartMinute] = smsPrefs.quiet_hours_start
          .split(":")
          .map(Number);
        const [quietEndHour, quietEndMinute] = smsPrefs.quiet_hours_end
          .split(":")
          .map(Number);

        const reminderMinutes = reminderHour * 60 + reminderMinute;
        const quietStartMinutes = quietStartHour * 60 + quietStartMinute;
        const quietEndMinutes = quietEndHour * 60 + quietEndMinute;

        const isInQuietHours =
          quietStartMinutes < quietEndMinutes
            ? reminderMinutes >= quietStartMinutes &&
              reminderMinutes < quietEndMinutes
            : reminderMinutes >= quietStartMinutes ||
              reminderMinutes < quietEndMinutes;

        if (isInQuietHours) {
          console.log(
            `⏭️ [DailySMS] Skipping event "${event.event_title}" - falls in quiet hours`,
          );
          continue;
        }
      }

      // Generate message (simple template for Phase 1, LLM in Phase 2)
      const timeUntil =
        leadTimeMinutes < 60
          ? `${leadTimeMinutes} mins`
          : `${Math.floor(leadTimeMinutes / 60)} hour${leadTimeMinutes >= 120 ? "s" : ""}`;

      const eventTitle = event.event_title || "Untitled Event";
      let message = `${eventTitle} in ${timeUntil}`;

      // Add link if available and short
      if (event.event_link && event.event_link.length < 50) {
        message += `. Link: ${event.event_link}`;
      }

      // Truncate to 160 chars
      if (message.length > 160) {
        message = message.substring(0, 157) + "...";
      }

      scheduledMessages.push({
        user_id: userId,
        message_content: message,
        message_type: "event_reminder",
        calendar_event_id: event.calendar_event_id,
        event_title: eventTitle,
        event_start: event.event_start,
        event_end: event.event_end,
        event_details: null, // Phase 2: Will store location, description, attendees
        scheduled_for: reminderTime.toISOString(),
        timezone,
        status: "scheduled",
        generated_via: "template", // Will be 'llm' in Phase 2
      });

      console.log(
        `✅ [DailySMS] Created reminder for "${event.event_title}" at ${format(reminderTime, "yyyy-MM-dd HH:mm:ss")}`,
      );
    }

    if (scheduledMessages.length === 0) {
      console.log(`📝 [DailySMS] No eligible events for SMS reminders`);
      return { success: true, message: "No eligible events for reminders" };
    }

    // Check if scheduled messages would exceed daily limit
    const remainingQuota = limit - currentCount;
    if (scheduledMessages.length > remainingQuota) {
      console.log(
        `⚠️ [DailySMS] Would exceed daily limit. Limiting to ${remainingQuota} messages`,
      );
      scheduledMessages.splice(remainingQuota);
    }

    // Update progress
    await job.updateProgress({
      current: 4,
      total: 5,
      message: `Creating ${scheduledMessages.length} scheduled messages`,
    });

    // Insert scheduled messages
    const { data: insertedMessages, error: insertError } = await supabase
      .from("scheduled_sms_messages")
      .insert(scheduledMessages)
      .select();

    if (insertError) {
      console.error(
        `❌ [DailySMS] Error inserting scheduled messages:`,
        insertError,
      );
      throw insertError;
    }

    console.log(
      `✅ [DailySMS] Created ${insertedMessages?.length} scheduled SMS message(s)`,
    );

    // Queue send_sms jobs for each scheduled message
    for (const msg of insertedMessages || []) {
      await queue.add(
        "send_sms",
        userId,
        {
          message_id: msg.id,
          phone_number: smsPrefs.phone_number,
          message: msg.message_content,
        },
        {
          priority: 5,
          scheduledFor: new Date(msg.scheduled_for),
          dedupKey: `send-sms-${msg.id}`,
        },
      );
    }

    // Update daily SMS count
    await supabase
      .from("user_sms_preferences")
      .update({
        daily_sms_count: currentCount + (insertedMessages?.length || 0),
      })
      .eq("user_id", userId);

    // Update progress
    await job.updateProgress({
      current: 5,
      total: 5,
      message: "Completed",
    });

    return {
      success: true,
      scheduled_count: insertedMessages?.length || 0,
      message: `Scheduled ${insertedMessages?.length} SMS reminders`,
    };
  } catch (error: any) {
    console.error(
      `❌ [DailySMS] Error processing daily SMS for user ${userId}:`,
      error,
    );
    throw error;
  }
}
