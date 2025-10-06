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
async function getTemplate(templateKey: string): Promise<SMSTemplate | null> {
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
      console.warn(
        `[SMSAdapter] Template ${templateKey} not found:`,
        error.message,
      );
      // Cache the null result to avoid repeated failed lookups
      templateCache.set(templateKey, { template: null, timestamp: Date.now() });
      return null;
    }

    // Cache the result
    templateCache.set(templateKey, { template: data, timestamp: Date.now() });
    return data;
  } catch (error: any) {
    console.error(
      `[SMSAdapter] Error fetching template ${templateKey}:`,
      error,
    );
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
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
    const value = variables[varName];
    if (value === undefined || value === null) {
      console.warn(`[SMSAdapter] Missing template variable: ${varName}`);
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
    const template = await getTemplate(templateKey);
    if (template) {
      const variables = extractTemplateVars(payload, eventType);
      const rendered = renderTemplate(template.message_template, variables);

      console.log(
        `[SMSAdapter] Rendered template ${templateKey}: "${rendered}"`,
      );

      // Enforce max length if specified
      if (template.max_length && rendered.length > template.max_length) {
        const truncated =
          rendered.substring(0, template.max_length - 3) + "...";
        console.warn(
          `[SMSAdapter] Message truncated from ${rendered.length} to ${template.max_length} chars`,
        );
        return truncated;
      }

      return rendered;
    }
  }

  // Fallback to hardcoded formatting if template not found
  console.info(
    `[SMSAdapter] Using fallback formatting for event type: ${eventType}`,
  );

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

    // Format SMS message from notification payload (now async with template support)
    const messageContent = await formatSMSMessage(delivery);

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

/**
 * Clear template cache
 * Useful for testing or when templates are updated
 */
export function clearTemplateCache(): void {
  templateCache.clear();
  console.log("[SMSAdapter] Template cache cleared");
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
