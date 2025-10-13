// apps/worker/src/workers/notification/smsAdapter.ts
/**
 * SMS Adapter for Notification System
 *
 * Sends notification SMS messages via existing Twilio infrastructure
 * Links SMS messages to notification deliveries for unified tracking
 *
 * Phase 5 Enhancement: Template-based formatting with database templates
 */

import { createServiceClient } from "@buildos/supabase-client";
import type { NotificationDelivery, Json } from "@buildos/shared-types";
import type { Logger } from "@buildos/shared-utils";
import { checkUserPreferences } from "./preferenceChecker.js";

const supabase = createServiceClient();

export interface DeliveryResult {
  success: boolean;
  external_id?: string;
  error?: string;
}

type SMSPriority = "low" | "normal" | "high" | "urgent";

/**
 * SMS Template from database
 */
interface SMSTemplate {
  template_key: string;
  message_template: string;
  template_vars: Json;
  max_length: number | null;
  is_active: boolean | null;
}

/**
 * Template cache for performance
 * Cache templates for 5 minutes to reduce database queries
 */
const templateCache = new Map<
  string,
  { template: SMSTemplate | null; timestamp: number }
>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch template from database with caching
 */
async function getTemplate(
  templateKey: string,
  smsLogger: Logger,
): Promise<SMSTemplate | null> {
  // Check cache first
  const cached = templateCache.get(templateKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.template;
  }

  try {
    const { data, error } = await supabase
      .from("sms_templates")
      .select(
        "template_key, message_template, template_vars, max_length, is_active",
      )
      .eq("template_key", templateKey)
      .eq("is_active", true)
      .single();

    if (error) {
      smsLogger.warn("SMS template not found, will use fallback", {
        templateKey,
        error: error.message,
      });
      // Cache the null result to avoid repeated failed lookups
      templateCache.set(templateKey, { template: null, timestamp: Date.now() });
      return null;
    }

    // Cache the result
    templateCache.set(templateKey, { template: data, timestamp: Date.now() });
    return data;
  } catch (error: any) {
    smsLogger.error("Error fetching SMS template", error, {
      templateKey,
    });
    return null;
  }
}

/**
 * Render template with variables
 * Supports {{variable}} syntax
 */
function renderTemplate(
  template: string,
  variables: Record<string, any>,
  smsLogger: Logger,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
    const value = variables[varName];
    if (value === undefined || value === null) {
      smsLogger.warn("Missing template variable", {
        variableName: varName,
      });
      return match; // Keep the placeholder if variable not found
    }
    return String(value);
  });
}

/**
 * Extract template variables from notification payload
 */
function extractTemplateVars(
  payload: any,
  eventType: string,
): Record<string, any> {
  // Flatten the payload structure (handle both direct props and data object)
  const flatPayload = {
    ...payload,
    ...(payload.data || {}),
  };

  // Common variables available in all templates
  const vars: Record<string, any> = {
    event_type: eventType,
  };

  // Event-specific variable extraction
  switch (eventType) {
    case "user.signup":
      vars.user_email = flatPayload.user_email || "unknown";
      vars.signup_method = flatPayload.signup_method || "web";
      break;

    case "brief.completed":
      vars.task_count = flatPayload.task_count || 0;
      vars.todays_task_count = flatPayload.todays_task_count || 0;
      vars.overdue_task_count = flatPayload.overdue_task_count || 0;
      vars.upcoming_task_count = flatPayload.upcoming_task_count || 0;
      vars.brief_date = flatPayload.brief_date || "today";
      break;

    case "task.due_soon":
      vars.task_name = flatPayload.task_name || "Task";
      vars.due_time = flatPayload.due_time || "soon";
      break;

    case "project.milestone":
      vars.project_name = flatPayload.project_name || "Project";
      vars.milestone_name = flatPayload.milestone_name || "milestone";
      break;

    default:
      // Include all payload properties as potential variables
      Object.keys(flatPayload).forEach((key) => {
        vars[key] = flatPayload[key];
      });
  }

  return vars;
}

/**
 * Format notification payload as SMS message
 * Phase 5: Uses database templates with fallback to hardcoded formatting
 */
async function formatSMSMessage(
  delivery: NotificationDelivery,
  smsLogger: Logger,
): Promise<string> {
  const { payload } = delivery;
  const eventType = payload.event_type || payload.eventType;

  // Map event type to template key
  const templateKeyMap: Record<string, string> = {
    "user.signup": "notif_user_signup",
    "brief.completed": "notif_brief_completed",
    "brief.failed": "notif_brief_failed",
    "task.due_soon": "notif_task_due_soon",
    "urgent.alert": "notif_urgent_alert",
    "project.milestone": "notif_project_milestone",
  };

  const templateKey = templateKeyMap[eventType];

  // Try to use database template first
  if (templateKey) {
    const template = await getTemplate(templateKey, smsLogger);
    if (template) {
      const variables = extractTemplateVars(payload, eventType);
      const rendered = renderTemplate(
        template.message_template,
        variables,
        smsLogger,
      );

      smsLogger.debug("Rendered SMS template", {
        templateKey,
        messageLength: rendered.length,
      });

      // Enforce max length if specified
      if (template.max_length && rendered.length > template.max_length) {
        const truncated =
          rendered.substring(0, template.max_length - 3) + "...";
        smsLogger.warn("SMS message truncated to max length", {
          originalLength: rendered.length,
          maxLength: template.max_length,
          templateKey,
        });
        return truncated;
      }

      return rendered;
    }
  }

  // Fallback to hardcoded formatting if template not found
  smsLogger.info("Using fallback SMS formatting", {
    eventType,
  });

  switch (eventType) {
    case "user.signup":
      return `BuildOS: New user ${payload.user_email || payload.data?.user_email || "unknown"} signed up via ${payload.signup_method || payload.data?.signup_method || "web"}`;

    case "brief.completed":
      const todaysCount =
        payload.todays_task_count || payload.data?.todays_task_count || 0;
      const overdueCount =
        payload.overdue_task_count || payload.data?.overdue_task_count || 0;
      const upcomingCount =
        payload.upcoming_task_count || payload.data?.upcoming_task_count || 0;

      // Build task breakdown for SMS
      const taskParts: string[] = [];
      if (todaysCount > 0) taskParts.push(`Today: ${todaysCount}`);
      if (overdueCount > 0) taskParts.push(`Overdue: ${overdueCount}`);
      if (upcomingCount > 0) taskParts.push(`Upcoming: ${upcomingCount}`);

      const taskSummary =
        taskParts.length > 0 ? taskParts.join(" | ") : "No tasks scheduled";

      return `Your BuildOS brief is ready! ${taskSummary}. Open app to view.`;

    case "brief.failed":
      return "Your daily brief failed to generate. Please check the app or contact support.";

    case "task.due_soon":
      const taskName = payload.task_name || payload.data?.task_name || "Task";
      const dueTime = payload.due_time || payload.data?.due_time || "soon";
      return `⏰ ${taskName} is due ${dueTime}`;

    default:
      // Generic fallback - truncate to fit SMS limit
      // Note: payload is guaranteed to have title and body by enrichDeliveryPayload
      const title = payload.title;
      const body = payload.body;
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
 * Shorten URLs in SMS message for click tracking
 * Replaces all HTTP(S) URLs with shortened tracking links
 *
 * @param message - Original message with URLs
 * @param deliveryId - Notification delivery ID for tracking
 * @param smsLogger - Logger instance for tracking
 * @returns Message with shortened URLs
 */
async function shortenUrlsInMessage(
  message: string,
  deliveryId: string,
  smsLogger: Logger,
): Promise<string> {
  try {
    // Regex to find URLs (supports http and https)
    const urlRegex = /(https?:\/\/[^\s<>"]+)/g;
    const urls = message.match(urlRegex) || [];

    if (urls.length === 0) {
      // No URLs found, return original message
      return message;
    }

    let result = message;
    let shortenedCount = 0;

    // Process each URL
    for (const url of urls) {
      try {
        // Call database function to create tracking link
        const { data: shortCode, error } = await supabase.rpc(
          "create_tracking_link",
          {
            p_delivery_id: deliveryId,
            p_destination_url: url,
          },
        );

        if (error) {
          smsLogger.error("Failed to shorten URL", error, {
            url: url.substring(0, 100),
            notificationDeliveryId: deliveryId,
          });
          // Keep original URL if shortening fails
          continue;
        }

        if (!shortCode) {
          smsLogger.warn("No short code generated for URL", {
            url: url.substring(0, 100),
            notificationDeliveryId: deliveryId,
          });
          continue;
        }

        // Replace URL with shortened version
        // Assumes BASE_URL is https://build-os.com (update if different)
        const shortUrl = `https://build-os.com/l/${shortCode}`;
        result = result.replace(url, shortUrl);
        shortenedCount++;

        const savedChars = url.length - shortUrl.length;
        smsLogger.debug("Shortened URL successfully", {
          originalUrl: url.substring(0, 50),
          shortUrl,
          savedChars,
        });
      } catch (error: any) {
        smsLogger.error("Error shortening URL", error, {
          url: url.substring(0, 100),
        });
        // Keep original URL if shortening fails
      }
    }

    if (shortenedCount > 0) {
      smsLogger.info("URL shortening completed", {
        shortenedCount,
        totalUrls: urls.length,
      });
    }

    return result;
  } catch (error: any) {
    smsLogger.error("Error in shortenUrlsInMessage", error);
    // Return original message if something goes wrong
    return message;
  }
}

/**
 * Send SMS notification via existing SMS infrastructure
 *
 * Flow:
 * 1. Format message from notification payload
 * 2. Shorten URLs for click tracking (Phase 3)
 * 3. Create sms_messages record with notification_delivery_id link
 * 4. Queue send_sms job (existing SMS worker will process it)
 * 5. Return success with sms_messages ID
 */
export async function sendSMSNotification(
  delivery: NotificationDelivery,
  jobLogger: Logger,
): Promise<DeliveryResult> {
  const smsLogger = jobLogger.child("sms");

  try {
    smsLogger.debug("Sending SMS notification", {
      notificationDeliveryId: delivery.id,
      recipientUserId: delivery.recipient_user_id,
    });

    // ✅ DOUBLE-CHECK USER PREFERENCES
    // This is a safety check in case preferences changed between worker check and adapter execution
    const eventType = delivery.payload.event_type || "unknown";
    const prefCheck = await checkUserPreferences(
      delivery.recipient_user_id,
      eventType,
      "sms",
      smsLogger,
    );

    if (!prefCheck.allowed) {
      smsLogger.info(
        "SMS notification cancelled - user preferences do not allow",
        {
          reason: prefCheck.reason,
          eventType,
        },
      );
      return {
        success: false,
        error: `Cancelled: ${prefCheck.reason}`,
      };
    }

    // Validate phone number is present
    if (!delivery.channel_identifier) {
      smsLogger.warn("Phone number missing from delivery record", {
        notificationDeliveryId: delivery.id,
        recipientUserId: delivery.recipient_user_id,
      });
      return {
        success: false,
        error: "Phone number missing from delivery record",
      };
    }

    const phoneNumber = delivery.channel_identifier;

    // Format SMS message from notification payload (now async with template support)
    let messageContent = await formatSMSMessage(delivery, smsLogger);

    // Shorten URLs in message for click tracking (Phase 3)
    messageContent = await shortenUrlsInMessage(
      messageContent,
      delivery.id,
      smsLogger,
    );

    // Determine priority
    const priority = mapPriority(delivery.payload.priority);

    smsLogger.debug("Formatted SMS message", {
      notificationDeliveryId: delivery.id,
      phoneNumber,
      messageLength: messageContent.length,
      priority,
    });

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
      smsLogger.error("Failed to create SMS message record", smsError, {
        notificationDeliveryId: delivery.id,
        phoneNumber,
      });
      return {
        success: false,
        error: `Failed to create SMS message: ${smsError.message}`,
      };
    }

    smsLogger.info("Created SMS message record", {
      smsMessageId: smsMessage.id,
      notificationDeliveryId: delivery.id,
    });

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
      smsLogger.error("Failed to queue SMS job", queueError, {
        smsMessageId: smsMessage.id,
        notificationDeliveryId: delivery.id,
      });

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

    smsLogger.info("SMS queued successfully", {
      smsMessageId: smsMessage.id,
      queueJobId: messageId,
      notificationDeliveryId: delivery.id,
      phoneNumber,
    });

    return {
      success: true,
      external_id: smsMessage.id, // Use sms_messages ID as external reference
    };
  } catch (error: any) {
    smsLogger.error("Failed to send SMS notification", error, {
      notificationDeliveryId: delivery.id,
      recipientUserId: delivery.recipient_user_id,
    });
    return {
      success: false,
      error: error.message || "Unknown error sending SMS",
    };
  }
}

/**
 * Clear template cache
 * Useful for testing or when templates are updated
 */
export function clearTemplateCache(): void {
  templateCache.clear();
  // Note: This is a utility function without logger context
  // Logger would be passed if called from main flow
}

/**
 * Get template cache statistics
 * Useful for monitoring and debugging
 */
export function getTemplateCacheStats(): {
  size: number;
  templates: string[];
} {
  return {
    size: templateCache.size,
    templates: Array.from(templateCache.keys()),
  };
}
