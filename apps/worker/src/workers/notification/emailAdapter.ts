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

    // Add tracking pixel to HTML
    const trackingPixel = `<img src="https://build-os.com/api/email-tracking/${trackingId}" width="1" height="1" style="display:none;" alt="" />`;
    const htmlWithTracking = html.replace("</body>", `${trackingPixel}</body>`);

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
        status: "pending",
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

    // Queue email job for actual sending
    const { data: emailJobId, error: queueError } = await supabase.rpc(
      "add_queue_job",
      {
        p_user_id: delivery.recipient_user_id,
        p_job_type: "generate_brief_email",
        p_metadata: {
          emailId: emailRecord.id,
        },
        p_priority: 5,
        p_scheduled_for: new Date().toISOString(),
        p_dedup_key: `email-${emailRecord.id}`,
      },
    );

    if (queueError) {
      return {
        success: false,
        error: `Failed to queue email job: ${queueError.message}`,
      };
    }

    console.log(
      `[EmailAdapter] Queued email job ${emailJobId} for email ${emailRecord.id} (delivery ${delivery.id})`,
    );

    return {
      success: true,
      external_id: emailRecord.id,
    };
  } catch (error: any) {
    console.error("[EmailAdapter] Failed to send email notification:", error);
    return {
      success: false,
      error: error.message || "Unknown error sending email",
    };
  }
}
