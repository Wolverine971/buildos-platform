/**
 * Notification Worker - Processes notification delivery jobs
 *
 * Handles sending notifications via different channels:
 * - Browser push notifications
 * - In-app notifications
 * - Email (future)
 * - SMS (future)
 */

import { createServiceClient } from "@buildos/supabase-client";
import type {
  NotificationJobMetadata,
  NotificationDelivery,
  NotificationChannel,
  NotificationStatus,
  PushSubscription as PushSubscriptionType,
} from "@buildos/shared-types";
import webpush from "web-push";
import { sendEmailNotification } from "./emailAdapter.js";

interface ProcessingJob<T = any> {
  id: string;
  user_id: string;
  job_type: string;
  metadata: T;
  attempts: number;
  max_attempts: number;
}

const supabase = createServiceClient();

// =====================================================
// VAPID CONFIGURATION
// =====================================================

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:support@buildos.com";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} else {
  console.warn(
    "[NotificationWorker] VAPID keys not configured - push notifications will not work",
  );
}

// =====================================================
// CHANNEL ADAPTERS
// =====================================================

interface DeliveryResult {
  success: boolean;
  external_id?: string;
  error?: string;
}

/**
 * Send browser push notification
 */
async function sendPushNotification(
  delivery: NotificationDelivery,
  pushSubscription: PushSubscriptionType,
): Promise<DeliveryResult> {
  try {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      throw new Error("VAPID keys not configured");
    }

    // Format push subscription object
    const subscription = {
      endpoint: pushSubscription.endpoint,
      keys: {
        p256dh: pushSubscription.p256dh_key,
        auth: pushSubscription.auth_key,
      },
    };

    // Format notification payload
    const payload = JSON.stringify({
      title: delivery.payload.title || "BuildOS Notification",
      body: delivery.payload.body || "",
      icon:
        delivery.payload.icon_url ||
        "/AppImages/android/android-launchericon-192-192.png",
      badge: "/AppImages/android/android-launchericon-96-96.png",
      tag: delivery.payload.event_type || "notification",
      requireInteraction: delivery.payload.priority === "urgent",
      data: {
        url: delivery.payload.action_url,
        event_id: delivery.event_id,
        delivery_id: delivery.id,
        ...delivery.payload.data,
      },
    });

    // Send notification
    await webpush.sendNotification(subscription, payload, {
      TTL: 60 * 60 * 24, // 24 hours
      urgency: delivery.payload.priority === "urgent" ? "high" : "normal",
    });

    // Update last_used_at for push subscription
    await supabase
      .from("push_subscriptions")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", pushSubscription.id);

    return { success: true };
  } catch (error: any) {
    // Handle subscription expiration
    if (error.statusCode === 410 || error.statusCode === 404) {
      // Subscription expired - deactivate it
      await supabase
        .from("push_subscriptions")
        .update({ is_active: false })
        .eq("id", pushSubscription.id);

      return {
        success: false,
        error: "Push subscription expired or not found",
      };
    }

    console.error("[NotificationWorker] Push notification failed:", error);
    return {
      success: false,
      error: error.message || "Unknown push notification error",
    };
  }
}

/**
 * Send in-app notification (insert into existing notification system)
 */
async function sendInAppNotification(
  delivery: NotificationDelivery,
): Promise<DeliveryResult> {
  try {
    // Insert into existing user_notifications table
    const { error } = await supabase.from("user_notifications").insert({
      user_id: delivery.recipient_user_id,
      type: delivery.payload.type || "info",
      title: delivery.payload.title,
      message: delivery.payload.body,
      action_url: delivery.payload.action_url,
      metadata: {
        event_id: delivery.event_id,
        delivery_id: delivery.id,
        ...delivery.payload.data,
      },
    });

    if (error) {
      throw error;
    }

    return { success: true };
  } catch (error: any) {
    console.error("[NotificationWorker] In-app notification failed:", error);
    return {
      success: false,
      error: error.message || "Unknown in-app notification error",
    };
  }
}

/**
 * Route notification to appropriate channel adapter
 */
async function sendNotification(
  channel: NotificationChannel,
  delivery: NotificationDelivery,
): Promise<DeliveryResult> {
  switch (channel) {
    case "push": {
      // Get push subscription
      if (!delivery.channel_identifier) {
        return {
          success: false,
          error: "Push subscription endpoint missing",
        };
      }

      const { data: pushSub, error } = await supabase
        .from("push_subscriptions")
        .select("*")
        .eq("user_id", delivery.recipient_user_id)
        .eq("endpoint", delivery.channel_identifier)
        .eq("is_active", true)
        .single();

      if (error || !pushSub) {
        return {
          success: false,
          error: "Push subscription not found or inactive",
        };
      }

      // Convert database type to match interface
      const subscription: PushSubscriptionType = {
        ...pushSub,
        created_at: pushSub.created_at || new Date().toISOString(),
        last_used_at: pushSub.last_used_at || undefined,
        user_agent: pushSub.user_agent || undefined,
        is_active: pushSub.is_active || false,
      };

      return sendPushNotification(delivery, subscription);
    }

    case "in_app":
      return sendInAppNotification(delivery);

    case "email":
      return sendEmailNotification(delivery);

    case "sms":
      // TODO: Implement in Phase 2
      return {
        success: false,
        error: "SMS notifications not yet implemented",
      };

    default:
      return {
        success: false,
        error: `Unknown notification channel: ${channel}`,
      };
  }
}

// =====================================================
// WORKER PROCESSOR
// =====================================================

/**
 * Process a single notification job
 */
export async function processNotification(
  job: ProcessingJob<NotificationJobMetadata>,
): Promise<void> {
  const { event_id, delivery_id, channel, event_type } = job.metadata;

  console.log(
    `[NotificationWorker] Processing notification job ${job.id} for delivery ${delivery_id} (${channel})`,
  );

  try {
    // Get delivery record
    const { data: delivery, error: fetchError } = await supabase
      .from("notification_deliveries")
      .select("*")
      .eq("id", delivery_id)
      .single();

    if (fetchError || !delivery) {
      throw new Error(
        `Delivery ${delivery_id} not found: ${fetchError?.message}`,
      );
    }

    // Skip if already sent
    if (delivery.status === "sent" || delivery.status === "delivered") {
      console.log(
        `[NotificationWorker] Delivery ${delivery_id} already sent, skipping`,
      );
      return;
    }

    // Send notification
    const typedDelivery: NotificationDelivery = {
      ...delivery,
      channel: delivery.channel as NotificationChannel,
      status: delivery.status as NotificationStatus,
      payload: (delivery.payload as Record<string, any>) || {},
      event_id: delivery.event_id || "",
      subscription_id: delivery.subscription_id || undefined,
      attempts: delivery.attempts || 0,
      max_attempts: delivery.max_attempts || 3,
      channel_identifier: delivery.channel_identifier || undefined,
      sent_at: delivery.sent_at || undefined,
      delivered_at: delivery.delivered_at || undefined,
      opened_at: delivery.opened_at || undefined,
      clicked_at: delivery.clicked_at || undefined,
      failed_at: delivery.failed_at || undefined,
      last_error: delivery.last_error || undefined,
      external_id: delivery.external_id || undefined,
      tracking_id: delivery.tracking_id || undefined,
      created_at: delivery.created_at || new Date().toISOString(),
      updated_at: delivery.updated_at || new Date().toISOString(),
    };

    const result = await sendNotification(channel, typedDelivery);

    // Update delivery record
    const updateData: any = {
      attempts: (delivery.attempts || 0) + 1,
      updated_at: new Date().toISOString(),
    };

    if (result.success) {
      updateData.status = "sent";
      updateData.sent_at = new Date().toISOString();
      updateData.external_id = result.external_id;

      console.log(
        `[NotificationWorker] Successfully sent notification ${delivery_id}`,
      );
    } else {
      updateData.status = "failed";
      updateData.failed_at = new Date().toISOString();
      updateData.last_error = result.error;

      console.error(
        `[NotificationWorker] Failed to send notification ${delivery_id}: ${result.error}`,
      );
    }

    const { error: updateError } = await supabase
      .from("notification_deliveries")
      .update(updateData)
      .eq("id", delivery_id);

    if (updateError) {
      console.error(
        `[NotificationWorker] Failed to update delivery record: ${updateError.message}`,
      );
    }

    // If failed and can retry, throw error to trigger retry
    if (
      !result.success &&
      (delivery.attempts || 0) + 1 < (delivery.max_attempts || 3)
    ) {
      throw new Error(result.error);
    }
  } catch (error: any) {
    console.error(
      `[NotificationWorker] Error processing notification job:`,
      error,
    );
    throw error;
  }
}

/**
 * Process notification jobs from queue
 */
export async function processNotificationJobs(): Promise<void> {
  try {
    // Claim pending notification jobs
    const { data: jobs, error } = await supabase
      .from("queue_jobs")
      .select("*")
      .eq("job_type", "send_notification")
      .eq("status", "pending")
      .lte("scheduled_for", new Date().toISOString())
      .order("scheduled_for", { ascending: true })
      .limit(10);

    if (error) {
      console.error("[NotificationWorker] Error fetching jobs:", error);
      return;
    }

    if (!jobs || jobs.length === 0) {
      return;
    }

    console.log(
      `[NotificationWorker] Processing ${jobs.length} notification jobs`,
    );

    // Process jobs in parallel
    await Promise.allSettled(
      jobs.map(async (job) => {
        try {
          // Mark as processing
          await supabase
            .from("queue_jobs")
            .update({
              status: "processing",
              started_at: new Date().toISOString(),
            })
            .eq("id", job.id);

          // Type the job metadata
          const typedJob: ProcessingJob<NotificationJobMetadata> = {
            ...job,
            metadata: job.metadata as unknown as NotificationJobMetadata,
            attempts: job.attempts || 0,
            max_attempts: job.max_attempts || 3,
          };

          // Process notification
          await processNotification(typedJob);

          // Mark as completed
          await supabase
            .from("queue_jobs")
            .update({
              status: "completed",
              completed_at: new Date().toISOString(),
            })
            .eq("id", job.id);
        } catch (error: any) {
          console.error(`[NotificationWorker] Job ${job.id} failed:`, error);

          // Mark as failed or retrying
          const currentAttempts = job.attempts || 0;
          const maxAttempts = job.max_attempts || 3;
          const isRetryable = currentAttempts < maxAttempts;

          await supabase
            .from("queue_jobs")
            .update({
              status: isRetryable ? "pending" : "failed",
              error_message: error.message,
              attempts: currentAttempts + 1,
              updated_at: new Date().toISOString(),
              // Exponential backoff for retries
              scheduled_for: isRetryable
                ? new Date(
                    Date.now() + Math.pow(2, currentAttempts) * 60000,
                  ).toISOString()
                : undefined,
            })
            .eq("id", job.id);
        }
      }),
    );
  } catch (error) {
    console.error(
      "[NotificationWorker] Fatal error in processNotificationJobs:",
      error,
    );
  }
}

// =====================================================
// EXPORTS
// =====================================================

export const notificationWorker = {
  processNotification,
  processNotificationJobs,
};
