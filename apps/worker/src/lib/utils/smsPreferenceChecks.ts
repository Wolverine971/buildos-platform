// apps/worker/src/lib/utils/smsPreferenceChecks.ts
/**
 * SMS Preference Checks - Shared Utilities
 *
 * Provides reusable functions for checking quiet hours and rate limits
 * for ALL SMS types (calendar reminders, daily briefs, etc.)
 *
 * Created: 2025-10-13 - Phase 1 of SMS notification refactor
 * Purpose: Ensure consistent quiet hours and rate limiting across all SMS flows
 */

import { utcToZonedTime, zonedTimeToUtc } from "date-fns-tz";
import { format, parseISO } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * User SMS preferences interface (subset needed for checks)
 */
export interface SMSPreferences {
  user_id: string;
  quiet_hours_start: string | null; // HH:MM:SS format
  quiet_hours_end: string | null; // HH:MM:SS format
  daily_sms_limit: number | null;
  daily_sms_count: number | null;
  daily_count_reset_at: string | null;
  timezone?: string | null; // Deprecated, use users.timezone instead
}

/**
 * Result of quiet hours check
 */
export interface QuietHoursResult {
  inQuietHours: boolean;
  rescheduleTime?: Date; // If in quiet hours, when to reschedule to
  reason?: string;
}

/**
 * Result of rate limit check
 */
export interface RateLimitResult {
  allowed: boolean;
  currentCount?: number;
  limit?: number;
  reason?: string;
}

/**
 * Check if current time is within user's quiet hours
 *
 * @param sendTime - When the SMS would be sent (defaults to now)
 * @param quietHoursStart - HH:MM:SS format (e.g., "22:00:00")
 * @param quietHoursEnd - HH:MM:SS format (e.g., "08:00:00")
 * @param timezone - User's timezone (e.g., "America/Los_Angeles")
 * @returns QuietHoursResult with inQuietHours flag and optional reschedule time
 */
export function checkQuietHours(
  sendTime: Date,
  quietHoursStart: string | null,
  quietHoursEnd: string | null,
  timezone: string,
): QuietHoursResult {
  // If no quiet hours set, allow immediately
  if (!quietHoursStart || !quietHoursEnd) {
    return { inQuietHours: false };
  }

  try {
    // Convert send time to user's timezone
    const timeInUserTz = utcToZonedTime(sendTime, timezone);
    const currentHour = timeInUserTz.getHours();
    const currentMinute = timeInUserTz.getMinutes();
    const currentMinutes = currentHour * 60 + currentMinute;

    // Parse quiet hours (HH:MM:SS format)
    const [startHour, startMin] = quietHoursStart.split(":").map(Number);
    const [endHour, endMin] = quietHoursEnd.split(":").map(Number);
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    // Check if current time is in quiet hours
    // Handle overnight quiet hours (e.g., 22:00 - 08:00)
    let inQuietHours: boolean;
    if (startMinutes < endMinutes) {
      // Normal range (e.g., 08:00 - 22:00)
      inQuietHours =
        currentMinutes >= startMinutes && currentMinutes < endMinutes;
    } else {
      // Overnight range (e.g., 22:00 - 08:00)
      inQuietHours =
        currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }

    if (!inQuietHours) {
      return { inQuietHours: false };
    }

    // Calculate when quiet hours end
    const rescheduleTime = new Date(timeInUserTz);
    rescheduleTime.setHours(endHour, endMin, 0, 0);

    // If end time is before current time, it's tomorrow
    if (rescheduleTime <= timeInUserTz) {
      rescheduleTime.setDate(rescheduleTime.getDate() + 1);
    }

    // Convert back to UTC
    const rescheduleTimeUTC = zonedTimeToUtc(rescheduleTime, timezone);

    return {
      inQuietHours: true,
      rescheduleTime: rescheduleTimeUTC,
      reason: `In quiet hours (${quietHoursStart} - ${quietHoursEnd} ${timezone})`,
    };
  } catch (error: any) {
    console.error("Error checking quiet hours:", error);
    // Fail open - if we can't check, allow the SMS
    return {
      inQuietHours: false,
      reason: `Error checking quiet hours: ${error.message}`,
    };
  }
}

/**
 * Check if user has reached their daily SMS limit
 * Also handles resetting the count if it's a new day
 *
 * @param userId - User ID
 * @param smsPrefs - User's SMS preferences
 * @param supabase - Supabase client
 * @returns RateLimitResult with allowed flag and reason
 */
export async function checkAndUpdateRateLimit(
  userId: string,
  smsPrefs: SMSPreferences,
  supabase: SupabaseClient,
): Promise<RateLimitResult> {
  try {
    const limit = smsPrefs.daily_sms_limit || 10;

    // Check if count needs reset (new day)
    const today = format(new Date(), "yyyy-MM-dd");
    const lastReset = smsPrefs.daily_count_reset_at
      ? format(parseISO(smsPrefs.daily_count_reset_at), "yyyy-MM-dd")
      : null;

    let currentCount = smsPrefs.daily_sms_count || 0;

    if (!lastReset || lastReset !== today) {
      // Reset count for new day
      console.log(
        `[SMS Rate Limit] Resetting daily count for user ${userId} (new day)`,
      );

      const { error: resetError } = await supabase
        .from("user_sms_preferences")
        .update({
          daily_sms_count: 0,
          daily_count_reset_at: new Date().toISOString(),
        })
        .eq("user_id", userId);

      if (resetError) {
        console.error(
          `[SMS Rate Limit] Error resetting count for user ${userId}:`,
          resetError,
        );
        // Don't fail - use current count
      } else {
        currentCount = 0;
      }
    }

    // Check if limit reached
    if (currentCount >= limit) {
      return {
        allowed: false,
        currentCount,
        limit,
        reason: `Daily SMS limit reached (${currentCount}/${limit})`,
      };
    }

    // Increment count BEFORE sending (prevents race conditions)
    console.log(
      `[SMS Rate Limit] Incrementing count for user ${userId}: ${currentCount} -> ${currentCount + 1} (limit: ${limit})`,
    );

    const { error: incrementError } = await supabase
      .from("user_sms_preferences")
      .update({
        daily_sms_count: currentCount + 1,
      })
      .eq("user_id", userId);

    if (incrementError) {
      console.error(
        `[SMS Rate Limit] Error incrementing count for user ${userId}:`,
        incrementError,
      );
      // Don't fail the SMS - allow it but log error
    }

    return {
      allowed: true,
      currentCount: currentCount + 1,
      limit,
    };
  } catch (error: any) {
    console.error(
      `[SMS Rate Limit] Error checking rate limit for user ${userId}:`,
      error,
    );
    // Fail closed - if we can't check limits, don't send
    return {
      allowed: false,
      reason: `Error checking rate limit: ${error.message}`,
    };
  }
}

/**
 * Perform all SMS safety checks (phone verification, quiet hours, rate limits)
 *
 * @param userId - User ID
 * @param supabase - Supabase client
 * @param options - Optional overrides for send time
 * @returns Object with allowed flag, reason, and optional reschedule time
 */
export async function performSMSSafetyChecks(
  userId: string,
  supabase: SupabaseClient,
  options?: {
    sendTime?: Date; // When the SMS would be sent (defaults to now)
  },
): Promise<{
  allowed: boolean;
  reason?: string;
  rescheduleTime?: Date;
  checks: {
    phoneVerification: boolean;
    quietHours: QuietHoursResult;
    rateLimit: RateLimitResult;
  };
}> {
  const sendTime = options?.sendTime || new Date();

  try {
    // Fetch SMS preferences
    const { data: smsPrefs, error: prefsError } = await supabase
      .from("user_sms_preferences")
      .select(
        "user_id, phone_number, phone_verified, opted_out, quiet_hours_start, quiet_hours_end, daily_sms_limit, daily_sms_count, daily_count_reset_at, timezone",
      )
      .eq("user_id", userId)
      .single();

    if (prefsError || !smsPrefs) {
      return {
        allowed: false,
        reason: "SMS preferences not found",
        checks: {
          phoneVerification: false,
          quietHours: { inQuietHours: false },
          rateLimit: { allowed: false, reason: "Preferences not found" },
        },
      };
    }

    // Check 1: Phone verification - explicit null checks
    // phone_verified must be explicitly true
    if (!smsPrefs.phone_number || smsPrefs.phone_verified !== true) {
      return {
        allowed: false,
        reason: "Phone not verified",
        checks: {
          phoneVerification: false,
          quietHours: { inQuietHours: false },
          rateLimit: { allowed: true },
        },
      };
    }

    // opted_out === true means user explicitly opted out
    if (smsPrefs.opted_out === true) {
      return {
        allowed: false,
        reason: "User opted out of SMS",
        checks: {
          phoneVerification: false,
          quietHours: { inQuietHours: false },
          rateLimit: { allowed: true },
        },
      };
    }

    // Check 2: Rate limit
    const rateLimitResult = await checkAndUpdateRateLimit(
      userId,
      smsPrefs,
      supabase,
    );

    if (!rateLimitResult.allowed) {
      return {
        allowed: false,
        reason: rateLimitResult.reason,
        checks: {
          phoneVerification: true,
          quietHours: { inQuietHours: false },
          rateLimit: rateLimitResult,
        },
      };
    }

    // Check 3: Quiet hours
    // Try to use timezone from users table first, fallback to SMS prefs
    const { data: user } = await supabase
      .from("users")
      .select("timezone")
      .eq("id", userId)
      .single();

    const timezone = (user as any)?.timezone || smsPrefs.timezone || "UTC";

    const quietHoursResult = checkQuietHours(
      sendTime,
      smsPrefs.quiet_hours_start,
      smsPrefs.quiet_hours_end,
      timezone,
    );

    if (quietHoursResult.inQuietHours) {
      return {
        allowed: false,
        reason: quietHoursResult.reason,
        rescheduleTime: quietHoursResult.rescheduleTime,
        checks: {
          phoneVerification: true,
          quietHours: quietHoursResult,
          rateLimit: rateLimitResult,
        },
      };
    }

    // All checks passed
    return {
      allowed: true,
      checks: {
        phoneVerification: true,
        quietHours: quietHoursResult,
        rateLimit: rateLimitResult,
      },
    };
  } catch (error: any) {
    console.error(`[SMS Safety Checks] Error for user ${userId}:`, error);
    return {
      allowed: false,
      reason: `Error performing safety checks: ${error.message}`,
      checks: {
        phoneVerification: false,
        quietHours: { inQuietHours: false },
        rateLimit: { allowed: false, reason: "Error" },
      },
    };
  }
}
