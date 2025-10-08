// apps/worker/src/workers/dailySmsWorker.ts
/**
 * Daily SMS Worker - Phase 2 with LLM Message Generation
 *
 * Processes daily SMS scheduling jobs for calendar event reminders.
 * - Fetches calendar events for the user's day
 * - Filters events that need SMS reminders
 * - Generates intelligent messages via LLM (DeepSeek)
 * - Creates scheduled_sms_messages records
 * - Queues send_sms jobs for scheduled times
 */

import { supabase } from "../lib/supabase";
import type { LegacyJob } from "./shared/jobAdapter";
import { utcToZonedTime, zonedTimeToUtc } from "date-fns-tz";
import {
  addMinutes,
  endOfDay,
  format,
  isBefore,
  parseISO,
  startOfDay,
} from "date-fns";
import { queue } from "../worker";
import {
  type EventContext,
  SMSMessageGenerator,
} from "../lib/services/smsMessageGenerator";
import { smsMetricsService } from "../lib/services/smsMetrics.service";

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
      !smsPrefs.phone_number ||
      smsPrefs.opted_out ||
      !smsPrefs.event_reminders_enabled
    ) {
      console.log(
        `⏭️ [DailySMS] User ${userId} not eligible for SMS (phone_verified: ${smsPrefs.phone_verified}, phone_number: ${!!smsPrefs.phone_number}, opted_out: ${smsPrefs.opted_out}, event_reminders_enabled: ${smsPrefs.event_reminders_enabled})`,
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
        "❌ [DailySMS] Error fetching calendar events:",
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

    // Initialize SMS message generator
    const smsGenerator = new SMSMessageGenerator();

    // Filter events that need SMS reminders
    const now = new Date();
    const scheduledMessages: any[] = [];
    let quietHoursSkipCount = 0;

    for (const event of calendarEvents) {
      // Skip if event_start is null
      if (!event.event_start) {
        console.log("⏭️ [DailySMS] Skipping event with null start time");
        continue;
      }

      const parsedEventStart = parseISO(event.event_start);
      const reminderTime = addMinutes(parsedEventStart, -leadTimeMinutes);

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
          quietHoursSkipCount++;
          continue;
        }
      }

      // Generate message using LLM (with template fallback)
      const eventTitle = event.event_title || "Untitled Event";
      const eventStart = parseISO(event.event_start);
      const eventEnd = event.event_end ? parseISO(event.event_end) : eventStart;

      // Build event context for LLM
      const eventContext: EventContext = {
        eventId: event.calendar_event_id,
        title: eventTitle,
        startTime: eventStart,
        endTime: eventEnd,
        link: event.event_link || undefined,
        isAllDay: false, // We already filtered out all-day events
        userTimezone: timezone,
        // Note: description, location, attendees not available in task_calendar_events
        // Will be enhanced in future when we fetch full event details
      };

      // Generate intelligent SMS message
      let generatedMessage;
      try {
        generatedMessage = await smsGenerator.generateEventReminder(
          eventContext,
          leadTimeMinutes,
          userId,
        );
      } catch (error) {
        console.error(
          `❌ [DailySMS] Error generating message for event "${eventTitle}":`,
          error,
        );
        // Skip this event if message generation fails completely
        continue;
      }

      const message = generatedMessage.content;

      // Track LLM generation metrics (non-blocking)
      smsMetricsService
        .recordLLMGeneration(
          userId,
          generatedMessage.generatedVia,
          generatedMessage.costUsd,
          generatedMessage.metadata?.generationTimeMs,
        )
        .catch((err) =>
          console.error('[DailySMS] Error tracking LLM metrics:', err),
        );

      scheduledMessages.push({
        user_id: userId,
        message_content: message,
        message_type: "event_reminder",
        calendar_event_id: event.calendar_event_id,
        event_title: eventTitle,
        event_start: event.event_start,
        event_end: event.event_end,
        event_details: null, // Future: Will store location, description, attendees from Google Calendar API
        scheduled_for: reminderTime.toISOString(),
        timezone,
        status: "scheduled",
        generated_via: generatedMessage.generatedVia, // 'llm' or 'template'
        llm_model: generatedMessage.model, // e.g., "deepseek/deepseek-chat"
        generation_cost_usd: generatedMessage.costUsd || null,
      });

      console.log(
        `✅ [DailySMS] Created ${generatedMessage.generatedVia} reminder for "${event.event_title}" at ${format(reminderTime, "yyyy-MM-dd HH:mm:ss")} (${message.length} chars)`,
      );
    }

    if (scheduledMessages.length === 0) {
      console.log("📝 [DailySMS] No eligible events for SMS reminders");
      return { success: true, message: "No eligible events for reminders" };
    }

    // Track quiet hours skips (non-blocking)
    if (quietHoursSkipCount > 0) {
      smsMetricsService
        .recordQuietHoursSkip(userId, quietHoursSkipCount)
        .catch((err) =>
          console.error('[DailySMS] Error tracking quiet hours skips:', err),
        );
    }

    // Check if scheduled messages would exceed daily limit
    const remainingQuota = limit - currentCount;
    if (scheduledMessages.length > remainingQuota) {
      console.log(
        `⚠️ [DailySMS] Would exceed daily limit. Limiting to ${remainingQuota} messages`,
      );

      // Track daily limit hit (non-blocking)
      smsMetricsService
        .recordDailyLimitHit(userId)
        .catch((err) =>
          console.error('[DailySMS] Error tracking daily limit hit:', err),
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
        "❌ [DailySMS] Error inserting scheduled messages:",
        insertError,
      );
      throw insertError;
    }

    console.log(
      `✅ [DailySMS] Created ${insertedMessages?.length} scheduled SMS message(s)`,
    );

    // Track scheduled count metrics (non-blocking)
    if (insertedMessages && insertedMessages.length > 0) {
      smsMetricsService
        .recordScheduled(userId, insertedMessages.length)
        .catch((err) =>
          console.error('[DailySMS] Error tracking scheduled count:', err),
        );
    }

    // Phase 4: Create sms_messages records and link to scheduled SMS
    for (const msg of insertedMessages || []) {
      // Create sms_messages record
      const { data: smsMessage, error: smsError } = await supabase
        .from("sms_messages")
        .insert({
          user_id: userId,
          phone_number: smsPrefs.phone_number,
          message_content: msg.message_content,
          status: "scheduled",
          priority: "normal",
          scheduled_for: msg.scheduled_for,
          metadata: {
            scheduled_sms_id: msg.id,
            calendar_event_id: msg.calendar_event_id,
            event_title: msg.event_title,
          },
        })
        .select()
        .single();

      if (smsError || !smsMessage) {
        console.error("❌ [DailySMS] Error creating sms_message:", smsError);
        continue; // Skip this message but continue with others
      }

      // Link sms_message_id back to scheduled SMS
      await supabase
        .from("scheduled_sms_messages")
        .update({ sms_message_id: smsMessage.id })
        .eq("id", msg.id);

      // Queue send_sms job with both IDs
      await queue.add(
        "send_sms",
        userId,
        {
          message_id: smsMessage.id, // sms_messages.id
          scheduled_sms_id: msg.id, // scheduled_sms_messages.id
          phone_number: smsPrefs.phone_number,
          message: msg.message_content,
          user_id: userId,
        },
        {
          priority: 5,
          scheduledFor: new Date(msg.scheduled_for),
          dedupKey: `send-scheduled-sms-${msg.id}`,
        },
      );

      console.log(
        `✅ [DailySMS] Created sms_message ${smsMessage.id} for scheduled SMS ${msg.id}`,
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
