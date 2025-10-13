// apps/worker/src/workers/notification/preferenceChecker.ts
/**
 * Notification Preference Checker
 *
 * Validates user preferences before sending notifications.
 * Used across worker, adapters, and webhooks to ensure we respect user preferences
 * even if they change after a delivery is queued.
 *
 * Returns both validation result and reason for logging/debugging.
 */

import { createServiceClient } from "@buildos/supabase-client";
import type { NotificationChannel } from "@buildos/shared-types";
import type { Logger } from "@buildos/shared-utils";

const supabase = createServiceClient();

export interface PreferenceCheckResult {
  allowed: boolean;
  reason: string;
  preferences?: {
    push_enabled?: boolean | null;
    in_app_enabled?: boolean | null;
    email_enabled?: boolean | null;
    sms_enabled?: boolean | null;
  };
}

/**
 * Check if user preferences allow sending notification on this channel
 *
 * Checks:
 * 1. user_notification_preferences table for channel-specific settings
 * 2. For SMS: Also checks user_sms_preferences for opt-out and verification
 *
 * @param userId - Recipient user ID
 * @param eventType - Event type (e.g., 'brief.completed')
 * @param channel - Notification channel ('push', 'in_app', 'email', 'sms')
 * @param logger - Logger instance for tracking
 * @returns PreferenceCheckResult with allowed flag and reason
 */
export async function checkUserPreferences(
  userId: string,
  eventType: string,
  channel: NotificationChannel,
  logger: Logger,
): Promise<PreferenceCheckResult> {
  const prefLogger = logger.child("preferences");

  try {
    prefLogger.debug("Checking user preferences", {
      userId,
      eventType,
      channel,
    });

    // Get notification preferences for this event type
    const { data: prefs, error: prefError } = await supabase
      .from("user_notification_preferences")
      .select("push_enabled, in_app_enabled, email_enabled, sms_enabled")
      .eq("user_id", userId)
      .eq("event_type", eventType)
      .single();

    if (prefError) {
      prefLogger.warn("No preferences found for event type", {
        userId,
        eventType,
        error: prefError.message,
      });
      return {
        allowed: false,
        reason: `No preferences found for event type: ${eventType}`,
      };
    }

    if (!prefs) {
      return {
        allowed: false,
        reason: "User preferences not found",
      };
    }

    // Check channel-specific preference
    let channelEnabled = false;
    switch (channel) {
      case "push":
        channelEnabled = prefs.push_enabled || false;
        break;
      case "in_app":
        channelEnabled = prefs.in_app_enabled || false;
        break;
      case "email":
        channelEnabled = prefs.email_enabled || false;
        break;
      case "sms":
        channelEnabled = prefs.sms_enabled || false;
        break;
      default:
        prefLogger.error("Unknown notification channel", undefined, {
          channel,
        });
        return {
          allowed: false,
          reason: `Unknown notification channel: ${channel}`,
        };
    }

    if (!channelEnabled) {
      prefLogger.info("Notification not allowed - channel disabled", {
        userId,
        eventType,
        channel,
      });
      return {
        allowed: false,
        reason: `${channel} notifications disabled for event type: ${eventType}`,
        preferences: prefs,
      };
    }

    // Additional checks for SMS channel
    if (channel === "sms") {
      const { data: smsPrefs, error: smsError } = await supabase
        .from("user_sms_preferences")
        .select("opted_out, phone_verified, phone_number")
        .eq("user_id", userId)
        .single();

      if (smsError || !smsPrefs) {
        prefLogger.warn("SMS preferences not found", {
          userId,
          error: smsError?.message,
        });
        return {
          allowed: false,
          reason: "SMS preferences not configured",
          preferences: prefs,
        };
      }

      if (smsPrefs.opted_out) {
        prefLogger.info("SMS not allowed - user opted out", {
          userId,
        });
        return {
          allowed: false,
          reason: "User opted out of SMS notifications",
          preferences: prefs,
        };
      }

      if (!smsPrefs.phone_verified) {
        prefLogger.info("SMS not allowed - phone not verified", {
          userId,
        });
        return {
          allowed: false,
          reason: "Phone number not verified",
          preferences: prefs,
        };
      }

      if (!smsPrefs.phone_number) {
        prefLogger.warn("SMS not allowed - no phone number", {
          userId,
        });
        return {
          allowed: false,
          reason: "No phone number on file",
          preferences: prefs,
        };
      }
    }

    // All checks passed
    prefLogger.debug("Notification allowed", {
      userId,
      eventType,
      channel,
    });

    return {
      allowed: true,
      reason: "User preferences allow this notification",
      preferences: prefs,
    };
  } catch (error: any) {
    prefLogger.error("Error checking user preferences", error, {
      userId,
      eventType,
      channel,
    });
    // Fail closed - if we can't check preferences, don't send
    return {
      allowed: false,
      reason: `Error checking preferences: ${error.message}`,
    };
  }
}

/**
 * Check if notification subscription is still active
 *
 * @param subscriptionId - Notification subscription ID
 * @param logger - Logger instance
 * @returns true if subscription is active, false otherwise
 */
export async function checkSubscriptionActive(
  subscriptionId: string | undefined,
  logger: Logger,
): Promise<boolean> {
  if (!subscriptionId) {
    return true; // No subscription ID means direct send (not subscription-based)
  }

  try {
    const { data: subscription, error } = await supabase
      .from("notification_subscriptions")
      .select("is_active")
      .eq("id", subscriptionId)
      .single();

    if (error || !subscription) {
      logger.warn("Subscription not found", {
        subscriptionId,
        error: error?.message,
      });
      return false;
    }

    return subscription.is_active || false;
  } catch (error: any) {
    logger.error("Error checking subscription status", error, {
      subscriptionId,
    });
    return false;
  }
}
