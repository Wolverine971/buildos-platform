// apps/worker/src/workers/brief/emailWorker.ts
import { supabase } from "../../lib/supabase";
import { notifyUser, updateJobStatus } from "../shared/queueUtils";
import { LegacyJob } from "../shared/jobAdapter";
import { EmailService } from "../../lib/services/email-service";

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
    const { data: preferences, error: prefError } = await supabase
      .from("user_brief_preferences")
      .select("email_daily_brief, is_active")
      .eq("user_id", userId)
      .single();

    if (prefError) {
      console.error(
        `❌ Error fetching preferences for user ${userId}:`,
        prefError,
      );
      throw new Error(`Failed to fetch preferences: ${prefError.message}`);
    }

    console.log(`📋 User preferences:
   → email_daily_brief: ${preferences?.email_daily_brief}
   → is_active: ${preferences?.is_active}`);

    if (!preferences?.email_daily_brief || !preferences?.is_active) {
      console.log(
        `📭 Email preferences changed, marking as cancelled for user ${userId}
   → Reason: ${!preferences?.is_active ? "Preferences not active" : "Email daily brief disabled"}`,
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

    // 3. Send email using existing email service
    // The email record already has the content, just need to send it
    const emailService = new EmailService(supabase);

    // Get user email address
    const { data: user } = await supabase
      .from("users")
      .select("email")
      .eq("id", userId)
      .single();

    if (!user?.email) {
      throw new Error(`No email address found for user ${userId}`);
    }

    console.log(`📨 Sending email to ${user.email}`);

    // Send email (content already in email.content)
    // EmailService will handle webhook vs SMTP
    await emailService.sendEmail({
      to: user.email,
      subject: email.subject,
      body: email.content, // HTML already generated
      metadata: {
        type: "daily_brief",
        brief_id: briefId,
        brief_date: briefDate,
        user_id: userId,
        email_id: emailId,
        tracking_id: email.tracking_id ?? undefined,
      },
      userId: userId,
      emailId: emailId,
      recipientId: email.email_recipients?.[0]?.id ?? undefined,
      trackingPixel:
        email.tracking_enabled && email.tracking_id
          ? `<img src="https://build-os.com/api/email-tracking/${email.tracking_id}" width="1" height="1" style="display:none;" alt="" />`
          : undefined,
    });

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
