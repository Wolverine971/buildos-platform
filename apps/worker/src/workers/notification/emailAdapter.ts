/**
 * Email Adapter for Notification System
 *
 * Sends notification emails via existing email infrastructure
 */

import { createServiceClient } from "@buildos/supabase-client";
import type { NotificationDelivery } from "@buildos/shared-types";

const supabase = createServiceClient();

export interface DeliveryResult {
  success: boolean;
  external_id?: string;
  error?: string;
}

/**
 * Rewrite links in HTML for click tracking
 */
function rewriteLinksForTracking(html: string, trackingId: string): string {
  const baseUrl = "https://build-os.com";

  // Rewrite all <a href="..."> tags to go through click tracking
  return html.replace(
    /<a\s+([^>]*?)href=["']([^"']+)["']([^>]*)>/gi,
    (match, before, url, after) => {
      // Skip if it's already a tracking link or an anchor link
      if (url.startsWith("#") || url.includes("/api/email-tracking/")) {
        return match;
      }

      // Encode the destination URL
      const encodedUrl = encodeURIComponent(url);
      const trackingUrl = `${baseUrl}/api/email-tracking/${trackingId}/click?url=${encodedUrl}`;

      return `<a ${before}href="${trackingUrl}"${after}>`;
    },
  );
}

/**
 * Format notification payload as email HTML
 */
function formatEmailTemplate(delivery: NotificationDelivery): {
  html: string;
  text: string;
} {
  const { payload } = delivery;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${payload.title || "BuildOS Notification"}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 24px;">${payload.title || "BuildOS Notification"}</h1>
  </div>

  <div style="background: #fff; padding: 30px; border: 1px solid #e1e8ed; border-top: none; border-radius: 0 0 10px 10px;">
    <div style="font-size: 16px; color: #555; margin-bottom: 20px;">
      ${payload.body || ""}
    </div>

    ${
      payload.action_url
        ? `
      <div style="text-align: center; margin: 30px 0;">
        <a href="${payload.action_url}"
           style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                  color: white;
                  padding: 12px 30px;
                  text-decoration: none;
                  border-radius: 6px;
                  display: inline-block;
                  font-weight: 600;">
          View Details
        </a>
      </div>
    `
        : ""
    }

    ${
      payload.image_url
        ? `
      <div style="margin: 20px 0;">
        <img src="${payload.image_url}" alt="" style="max-width: 100%; height: auto; border-radius: 6px;">
      </div>
    `
        : ""
    }
  </div>

  <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
    <p>This is an automated notification from BuildOS</p>
    <p>
      <a href="https://build-os.com/settings/notifications" style="color: #667eea;">Manage notification preferences</a>
    </p>
  </div>
</body>
</html>
  `.trim();

  const text = `
${payload.title || "BuildOS Notification"}

${payload.body || ""}

${payload.action_url ? `View details: ${payload.action_url}` : ""}

---
This is an automated notification from BuildOS
Manage your notification preferences: https://build-os.com/settings/notifications
  `.trim();

  return { html, text };
}

/**
 * Send email notification via existing email infrastructure
 */
export async function sendEmailNotification(
  delivery: NotificationDelivery,
): Promise<DeliveryResult> {
  try {
    // Get user email
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("email, name")
      .eq("id", delivery.recipient_user_id)
      .single();

    if (userError || !user?.email) {
      return {
        success: false,
        error: "User email not found",
      };
    }

    // Format email content
    const { html, text } = formatEmailTemplate(delivery);
    const subject = delivery.payload.title || "BuildOS Notification";

    // Generate tracking ID
    const trackingId = crypto.randomUUID();

    // Rewrite links for click tracking
    const htmlWithTrackedLinks = rewriteLinksForTracking(html, trackingId);

    // Add tracking pixel to HTML
    const trackingPixel = `<img src="https://build-os.com/api/email-tracking/${trackingId}" width="1" height="1" style="display:none;" alt="" />`;
    const htmlWithTracking = htmlWithTrackedLinks.replace(
      "</body>",
      `${trackingPixel}</body>`,
    );

    // Create email record
    const { data: emailRecord, error: emailError } = await supabase
      .from("emails")
      .insert({
        created_by: delivery.recipient_user_id,
        from_email: "noreply@build-os.com",
        from_name: "BuildOS",
        subject,
        content: htmlWithTracking,
        category: "notification",
        status: "scheduled",
        tracking_enabled: true,
        tracking_id: trackingId,
        template_data: {
          delivery_id: delivery.id,
          event_id: delivery.event_id,
          event_type: delivery.payload.event_type,
        },
      })
      .select()
      .single();

    if (emailError) {
      return {
        success: false,
        error: `Failed to create email record: ${emailError.message}`,
      };
    }

    // Create recipient record
    const { error: recipientError } = await supabase
      .from("email_recipients")
      .insert({
        email_id: emailRecord.id,
        recipient_email: user.email,
        recipient_type: "to",
        recipient_name: user.name,
        status: "pending",
      });

    if (recipientError) {
      console.error(
        "[EmailAdapter] Failed to create recipient record:",
        recipientError,
      );
    }

    // Send email immediately via webhook to web app
    const webhookUrl =
      process.env.PUBLIC_APP_URL || "https://build-os.com";
    const webhookSecret = process.env.PRIVATE_BUILDOS_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error(
        "[EmailAdapter] PRIVATE_BUILDOS_WEBHOOK_SECRET not configured - cannot send notification emails",
      );
      return {
        success: false,
        error: "Webhook secret not configured",
      };
    }

    try {
      const webhookResponse = await fetch(
        `${webhookUrl}/api/webhooks/send-notification-email`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${webhookSecret}`,
          },
          body: JSON.stringify({
            recipientEmail: user.email,
            recipientName: user.name,
            recipientUserId: delivery.recipient_user_id,
            subject,
            htmlContent: htmlWithTracking,
            textContent: text,
            trackingId,
            emailRecordId: emailRecord.id,
            deliveryId: delivery.id,
            eventId: delivery.event_id,
            eventType: delivery.payload.event_type,
          }),
        },
      );

      if (!webhookResponse.ok) {
        const errorData = (await webhookResponse
          .json()
          .catch(() => ({}))) as { error?: string };
        throw new Error(
          errorData.error || `Webhook returned ${webhookResponse.status}`,
        );
      }

      const webhookResult = (await webhookResponse.json()) as {
        messageId?: string;
      };

      console.log(
        `[EmailAdapter] ✅ Email sent via webhook for email ${emailRecord.id} (delivery ${delivery.id}, messageId: ${webhookResult.messageId})`,
      );

      return {
        success: true,
        external_id: emailRecord.id,
      };
    } catch (webhookError: any) {
      console.error(
        "[EmailAdapter] Failed to send email via webhook:",
        webhookError,
      );
      return {
        success: false,
        error: `Webhook error: ${webhookError.message}`,
      };
    }
  } catch (error: any) {
    console.error("[EmailAdapter] Failed to send email notification:", error);
    return {
      success: false,
      error: error.message || "Unknown error sending email",
    };
  }
}
