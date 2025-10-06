/**
 * SMS Adapter for Notification System
 *
 * Sends notification SMS messages via existing Twilio infrastructure
 * Links SMS messages to notification deliveries for unified tracking
 */

import { createServiceClient } from "@buildos/supabase-client";
import type { NotificationDelivery } from "@buildos/shared-types";

const supabase = createServiceClient();

export interface DeliveryResult {
  success: boolean;
  external_id?: string;
  error?: string;
}

type SMSPriority = "low" | "normal" | "high" | "urgent";

/**
 * Format notification payload as SMS message
 * Keeps messages under 160 characters for standard SMS
 */
function formatSMSMessage(delivery: NotificationDelivery): string {
  const { payload } = delivery;
  const eventType = payload.event_type || payload.eventType;

  // Use event-specific formatting
  switch (eventType) {
    case "user.signup":
      return `BuildOS: New user ${payload.user_email || payload.data?.user_email || "unknown"} signed up via ${payload.signup_method || payload.data?.signup_method || "web"}`;

    case "brief.completed":
      const taskCount = payload.task_count || payload.data?.task_count || 0;
      const briefDate =
        payload.brief_date || payload.data?.brief_date || "today";
      return `Your BuildOS brief is ready! ${taskCount} tasks planned for ${briefDate}. Open app to view.`;

    case "brief.failed":
      return "Your daily brief failed to generate. Please check the app or contact support.";

    case "task.due_soon":
      const taskName = payload.task_name || payload.data?.task_name || "Task";
      const dueTime = payload.due_time || payload.data?.due_time || "soon";
      return `⏰ ${taskName} is due ${dueTime}`;

    default:
      // Generic fallback - truncate to fit SMS limit
      const title = payload.title || "BuildOS notification";
      const body = payload.body || "";
      const message = body ? `${title}: ${body}` : title;

      // Truncate to 155 chars to leave room for opt-out info if needed
      return message.length > 155 ? message.substring(0, 152) + "..." : message;
  }
}

/**
 * Map notification priority to SMS priority
 */
function mapPriority(notificationPriority?: string): SMSPriority {
  const priorityMap: Record<string, SMSPriority> = {
    low: "low",
    normal: "normal",
    high: "high",
    critical: "urgent",
    urgent: "urgent",
  };

  return priorityMap[notificationPriority || "normal"] || "normal";
}

/**
 * Send SMS notification via existing SMS infrastructure
 *
 * Flow:
 * 1. Format message from notification payload
 * 2. Create sms_messages record with notification_delivery_id link
 * 3. Queue send_sms job (existing SMS worker will process it)
 * 4. Return success with sms_messages ID
 */
export async function sendSMSNotification(
  delivery: NotificationDelivery,
): Promise<DeliveryResult> {
  try {
    // Validate phone number is present
    if (!delivery.channel_identifier) {
      return {
        success: false,
        error: "Phone number missing from delivery record",
      };
    }

    const phoneNumber = delivery.channel_identifier;

    // Format SMS message from notification payload
    const messageContent = formatSMSMessage(delivery);

    // Determine priority
    const priority = mapPriority(delivery.payload.priority);

    console.log(
      `[SMSAdapter] Formatting SMS for delivery ${delivery.id}: "${messageContent}" to ${phoneNumber}`,
    );

    // Create SMS message record with notification link
    const { data: smsMessage, error: smsError } = await supabase
      .from("sms_messages")
      .insert({
        user_id: delivery.recipient_user_id,
        phone_number: phoneNumber,
        message_content: messageContent,
        priority,
        notification_delivery_id: delivery.id, // Link to notification delivery
        status: "pending",
        metadata: {
          event_type: delivery.payload.event_type || delivery.payload.eventType,
          event_id: delivery.event_id,
          notification_delivery_id: delivery.id,
          ...delivery.payload.data,
        },
      })
      .select()
      .single();

    if (smsError) {
      console.error("[SMSAdapter] Failed to create SMS message:", smsError);
      return {
        success: false,
        error: `Failed to create SMS message: ${smsError.message}`,
      };
    }

    console.log(
      `[SMSAdapter] Created SMS message ${smsMessage.id} for delivery ${delivery.id}`,
    );

    // Queue SMS job using existing queue_sms_message RPC
    // This will be processed by the SMS worker
    const { data: messageId, error: queueError } = await supabase.rpc(
      "queue_sms_message",
      {
        p_user_id: delivery.recipient_user_id,
        p_phone_number: phoneNumber,
        p_message: messageContent,
        p_priority: priority,
        p_metadata: {
          notification_delivery_id: delivery.id,
          event_type: delivery.payload.event_type || delivery.payload.eventType,
          event_id: delivery.event_id,
        },
      },
    );

    if (queueError) {
      console.error("[SMSAdapter] Failed to queue SMS:", queueError);

      // Update SMS message status to failed
      await supabase
        .from("sms_messages")
        .update({ status: "failed" })
        .eq("id", smsMessage.id);

      return {
        success: false,
        error: `Failed to queue SMS: ${queueError.message}`,
      };
    }

    console.log(
      `[SMSAdapter] Queued SMS job (message ID: ${messageId}) for delivery ${delivery.id}`,
    );

    return {
      success: true,
      external_id: smsMessage.id, // Use sms_messages ID as external reference
    };
  } catch (error: any) {
    console.error("[SMSAdapter] Failed to send SMS notification:", error);
    return {
      success: false,
      error: error.message || "Unknown error sending SMS",
    };
  }
}
