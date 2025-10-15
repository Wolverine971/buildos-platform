// apps/worker/src/workers/brief/emailWorker.ts
//
// ⚠️ NOTE: This worker processes LEGACY daily brief email jobs.
// New daily brief emails are sent via the notification system (emailAdapter.ts + webhook).
// This file remains for backward compatibility with queued jobs.
//
// Railway blocks SMTP ports - all email sending must go through webhooks to /web.

import { supabase } from "../../lib/supabase";
import { notifyUser, updateJobStatus } from "../shared/queueUtils";
import { LegacyJob } from "../shared/jobAdapter";
// ⚠️ DO NOT USE: EmailService uses direct SMTP which fails on Railway
// import { EmailService } from "../../lib/services/email-service";

/**
 * Job data structure for brief email sending
 * REVISED: Uses emailId instead of briefId
 */
export interface EmailBriefJobData {
  emailId: string; // ID from emails table (NOT briefId!)
}

/**
 * Process email sending for a pending brief email
 * REVISED: Fetches email record, extracts brief info from template_data
 */
export async function processEmailBriefJob(
  job: LegacyJob<EmailBriefJobData>,
): Promise<void> {
  console.log(`📧 Processing email job ${job.id}
   → Email ID: ${job.data.emailId}
   → Job Attempts: ${job.attemptsMade || 0}
   → Started At: ${new Date().toISOString()}`);

  try {
    await updateJobStatus(job.id, "processing", "email");

    const { emailId } = job.data;

    if (!emailId) {
      throw new Error(
        "Invalid job data: emailId is required but was not provided",
      );
    }

    console.log(`📬 Fetching email record ${emailId} from database...`);

    // 1. Fetch the email record from existing emails table
    const { data: email, error: emailError } = await supabase
      .from("emails")
      .select("*, email_recipients(*)")
      .eq("id", emailId)
      .single();

    if (emailError) {
      console.error(`❌ Database error fetching email ${emailId}:`, emailError);
      throw new Error(`Email record fetch failed: ${emailError.message}`);
    }

    if (!email) {
      console.error(`❌ Email record ${emailId} does not exist in database`);
      throw new Error("Email record not found: Email does not exist");
    }

    console.log(`✅ Email record found:
   → Status: ${email.status}
   → Subject: ${email.subject}
   → Created By: ${email.created_by}
   → Recipients: ${email.email_recipients?.length || 0}`);

    // Extract brief info from template_data
    const templateData = email.template_data as Record<string, any> | null;
    const briefId = templateData?.brief_id;
    const briefDate = templateData?.brief_date;
    const userId = email.created_by;

    if (!briefId || !userId) {
      throw new Error(
        `Invalid email template_data: missing brief_id or user_id`,
      );
    }

    console.log(
      `📋 Email for brief ${briefId}, date ${briefDate}, user ${userId}`,
    );

    // 2. Check if email should still be sent (user may have disabled since queuing)
    console.log(`🔍 Checking current email preferences for user ${userId}...`);

    // Check notification preferences for email opt-in
    const { data: notificationPrefs, error: notificationError } = await supabase
      .from("user_notification_preferences")
      .select("should_email_daily_brief")
      .eq("user_id", userId)
      .eq("event_type", "user") // User-level daily brief preferences
      .single();

    if (notificationError && notificationError.code !== "PGRST116") {
      console.error(
        `❌ Error fetching notification preferences for user ${userId}:`,
        notificationError,
      );
      throw new Error(
        `Failed to fetch notification preferences: ${notificationError.message}`,
      );
    }

    // Check brief preferences for is_active (brief generation)
    const { data: briefPrefs, error: briefError } = await supabase
      .from("user_brief_preferences")
      .select("is_active")
      .eq("user_id", userId)
      .single();

    if (briefError && briefError.code !== "PGRST116") {
      console.error(
        `❌ Error fetching brief preferences for user ${userId}:`,
        briefError,
      );
      throw new Error(
        `Failed to fetch brief preferences: ${briefError.message}`,
      );
    }

    console.log(`📋 User preferences:
   → should_email_daily_brief: ${notificationPrefs?.should_email_daily_brief ?? "not set"}
   → is_active: ${briefPrefs?.is_active}`);

    const shouldSendEmail =
      notificationPrefs?.should_email_daily_brief === true &&
      briefPrefs?.is_active === true;

    if (!shouldSendEmail) {
      const reason = !briefPrefs?.is_active
        ? "Brief generation not active"
        : !notificationPrefs?.should_email_daily_brief
          ? "Email notifications disabled"
          : "Preferences not configured";

      console.log(
        `📭 Email preferences changed, marking as cancelled for user ${userId}
   → Reason: ${reason}`,
      );

      // Update email status to cancelled
      await supabase
        .from("emails")
        .update({ status: "cancelled" })
        .eq("id", emailId);

      await updateJobStatus(job.id, "completed", "email_cancelled");
      await notifyUser(userId, {
        type: "email_cancelled",
        emailId,
        briefId,
        briefDate,
      });

      return;
    }

    // 3. Send email via webhook to web app (Railway blocks SMTP ports)
    // ⚠️ CRITICAL: Cannot use EmailService directly - it tries SMTP which fails on Railway
    // Must send via webhook to /web app which has no port restrictions

    // Get user email address
    const { data: user } = await supabase
      .from("users")
      .select("email")
      .eq("id", userId)
      .single();

    if (!user?.email) {
      throw new Error(`No email address found for user ${userId}`);
    }

    console.log(`📨 Sending email to ${user.email} via webhook to web app`);

    // Send via webhook to web app's email endpoint
    const webhookUrl = (
      process.env.PUBLIC_APP_URL || "https://build-os.com"
    ).trim();
    const webhookSecret = process.env.PRIVATE_BUILDOS_WEBHOOK_SECRET;

    if (!webhookSecret) {
      throw new Error("PRIVATE_BUILDOS_WEBHOOK_SECRET not configured");
    }

    const webhookResponse = await fetch(
      `${webhookUrl}/webhooks/daily-brief-email`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Signature": webhookSecret, // Simple auth for now
        },
        body: JSON.stringify({
          userId,
          briefId,
          briefDate,
          recipientEmail: user.email,
          metadata: {
            emailRecordId: emailId,
            recipientRecordId: email.email_recipients?.[0]?.id,
            trackingId: email.tracking_id,
            subject: email.subject,
          },
        }),
      },
    );

    if (!webhookResponse.ok) {
      const errorText = await webhookResponse
        .text()
        .catch(() => "Unknown error");
      throw new Error(
        `Webhook email send failed: ${webhookResponse.status} - ${errorText}`,
      );
    }

    console.log(`✅ Email sent successfully via webhook`);

    // 4. Update email status to sent (existing emails table)
    await supabase.from("emails").update({ status: "sent" }).eq("id", emailId);

    // 5. Update recipient status to sent (existing email_recipients table)
    if (email.email_recipients?.[0]?.id) {
      await supabase
        .from("email_recipients")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
        })
        .eq("id", email.email_recipients[0].id);
    }

    // 6. Complete job
    await updateJobStatus(job.id, "completed", "email_sent");

    await notifyUser(userId, {
      type: "brief_email_sent",
      emailId,
      briefId,
      briefDate,
      trackingId: email.tracking_id ?? undefined,
    });

    console.log(`✅ Email sent successfully for brief ${briefId}`);
  } catch (error: any) {
    console.error(`❌ Email job ${job.id} failed:`, error);

    // Update email status to failed (existing emails table)
    if (job.data.emailId) {
      const { data: currentEmail } = await supabase
        .from("emails")
        .select("template_data")
        .eq("id", job.data.emailId)
        .single();

      const currentTemplateData =
        (currentEmail?.template_data as Record<string, any>) || {};

      await supabase
        .from("emails")
        .update({
          status: "failed",
          template_data: {
            ...currentTemplateData,
            error: {
              message: error.message,
              timestamp: new Date().toISOString(),
            },
          },
        })
        .eq("id", job.data.emailId);
    }

    await updateJobStatus(job.id, "failed", error.message);

    // Get userId from email record for notification
    const { data: failedEmail } = await supabase
      .from("emails")
      .select("created_by, template_data")
      .eq("id", job.data.emailId)
      .single();

    if (failedEmail) {
      const failedTemplateData = failedEmail.template_data as Record<
        string,
        any
      > | null;
      await notifyUser(failedEmail.created_by, {
        type: "brief_email_failed",
        emailId: job.data.emailId,
        briefId: failedTemplateData?.brief_id,
        briefDate: failedTemplateData?.brief_date,
        error: error.message,
      });
    }

    throw error;
  }
}
