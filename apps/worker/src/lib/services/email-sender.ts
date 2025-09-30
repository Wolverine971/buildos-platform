// apps/worker/src/lib/services/email-sender.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";
import { generateMinimalEmailHTML } from "../utils/emailTemplate";
import { renderMarkdown } from "../utils/markdown";
import { EmailService } from "./email-service";
import { WebhookEmailService } from "./webhook-email-service";

// Valid email recipient statuses per database constraint
type EmailRecipientStatus =
  | "pending"
  | "sent"
  | "delivered"
  | "failed"
  | "bounced";
const VALID_EMAIL_RECIPIENT_STATUSES: readonly EmailRecipientStatus[] = [
  "pending",
  "sent",
  "delivered",
  "failed",
  "bounced",
] as const;

export interface DailyBriefResult {
  id: string;
  summary_content: string;
  brief_date: string;
  priority_actions?: string[];
  project_brief_ids?: string[];
  metadata?: any;
  llm_analysis?: string | null;
}

export class DailyBriefEmailSender {
  private emailService: EmailService;
  private webhookEmailService: WebhookEmailService | null = null;
  private baseUrl = "https://build-os.com";
  private useWebhook: boolean;

  constructor(private supabase: SupabaseClient) {
    this.emailService = new EmailService(supabase);

    // Log the raw environment variable value for debugging
    console.log("🔍 Email Sender Constructor - Environment Check:");
    console.log(
      `   → Raw USE_WEBHOOK_EMAIL value: "${process.env.USE_WEBHOOK_EMAIL}"`,
    );
    console.log(
      `   → Type of USE_WEBHOOK_EMAIL: ${typeof process.env.USE_WEBHOOK_EMAIL}`,
    );
    console.log(
      `   → Strict equality to 'true': ${process.env.USE_WEBHOOK_EMAIL === "true"}`,
    );
    console.log(
      `   → Webhook URL present: ${process.env.BUILDOS_WEBHOOK_URL ? "YES" : "NO"}`,
    );
    console.log(
      `   → SMTP Host present: ${process.env.SMTP_HOST ? "YES" : "NO"}`,
    );

    // Use webhook if configured, otherwise fallback to direct SMTP
    this.useWebhook = process.env.USE_WEBHOOK_EMAIL === "true";
    console.log(`   → Decision: useWebhook = ${this.useWebhook}`);

    if (this.useWebhook) {
      try {
        this.webhookEmailService = new WebhookEmailService();
        console.log(
          "📨 Email sender initialized: Using WEBHOOK service for BuildOS",
        );
        console.log(
          "   → Webhook URL configured:",
          process.env.BUILDOS_WEBHOOK_URL ? "Yes" : "No",
        );
        if (process.env.BUILDOS_WEBHOOK_URL) {
          console.log(
            `   → Webhook URL domain: ${new URL(process.env.BUILDOS_WEBHOOK_URL).hostname}`,
          );
        }
      } catch (error) {
        console.error("❌ Failed to initialize webhook email service:", error);
        console.log("⚠️  Falling back to DIRECT SMTP email service");
        this.useWebhook = false;
      }
    } else {
      console.log("📧 Email sender initialized: Using DIRECT SMTP service");
      console.log(
        `   → Reason: USE_WEBHOOK_EMAIL="${process.env.USE_WEBHOOK_EMAIL}" !== 'true'`,
      );
    }
  }

  /**
   * Transform relative URLs in markdown to absolute URLs
   * Handles both markdown links [text](/path) and plain URLs
   */
  private transformMarkdownUrls(markdown: string): string {
    if (!markdown) return "";

    // Transform markdown links: [text](/path) -> [text](https://build-os.com/path)
    let transformed = markdown.replace(
      /\[([^\]]+)\]\(\/([^)]+)\)/g,
      `[$1](${this.baseUrl}/$2)`,
    );

    // Transform reference-style links: [text]: /path -> [text]: https://build-os.com/path
    transformed = transformed.replace(
      /^\[([^\]]+)\]:\s*\/(.+)$/gm,
      `[$1]: ${this.baseUrl}/$2`,
    );

    // Transform HTML links in markdown: <a href="/path"> -> <a href="https://build-os.com/path">
    transformed = transformed.replace(
      /href="\/([^"]+)"/g,
      `href="${this.baseUrl}/$1"`,
    );

    // Transform image sources: ![alt](/path) -> ![alt](https://build-os.com/path)
    transformed = transformed.replace(
      /!\[([^\]]*)\]\(\/([^)]+)\)/g,
      `![$1](${this.baseUrl}/$2)`,
    );

    // Also handle URLs that might be in the format: View project: /projects/slug
    // This handles plain text URLs that aren't in markdown link format
    transformed = transformed.replace(
      /(^|\s)(\/(?:projects|tasks|notes|phases|briefs)\/[^\s,.)]+)/gm,
      `$1${this.baseUrl}$2`,
    );

    return transformed;
  }

  /**
   * Check if user has opted in for email notifications
   */
  async shouldSendEmail(userId: string): Promise<boolean> {
    try {
      const { data: preferences } = await this.supabase
        .from("user_brief_preferences")
        .select("email_daily_brief")
        .eq("user_id", userId)
        .single();

      return preferences?.email_daily_brief === true;
    } catch (error) {
      console.error("Error checking email preferences:", error);
      return false;
    }
  }

  /**
   * Get user email address
   */
  async getUserEmail(userId: string): Promise<string | null> {
    try {
      const { data: user } = await this.supabase
        .from("users")
        .select("email")
        .eq("id", userId)
        .single();

      return user?.email || null;
    } catch (error) {
      console.error("Error fetching user email:", error);
      return null;
    }
  }

  /**
   * Generate a unique tracking ID for the email
   */
  private generateTrackingId(): string {
    return randomBytes(16).toString("hex");
  }

  /**
   * Format the brief content for email
   */
  formatBriefForEmail(
    brief: DailyBriefResult,
    briefDate: string,
  ): { htmlContent: string; plainText: string } {
    const hasAnalysis = Boolean(
      brief.llm_analysis && brief.llm_analysis.trim().length > 0,
    );
    const fallbackAnalysis = `## Analysis currently unavailable\n\nYour detailed brief is ready in BuildOS. [View the full daily brief](${this.baseUrl}/briefs/${brief.id}) for project-by-project breakdowns and task lists.`;
    const sourceContent = hasAnalysis ? brief.llm_analysis : fallbackAnalysis;
    // Transform relative URLs to absolute URLs before rendering
    const transformedContent = this.transformMarkdownUrls(sourceContent || "");

    // Use the transformed content with absolute URLs
    const htmlContent = renderMarkdown(transformedContent);
    const formattedDate = new Date(briefDate).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const wrappedContent = `
<h1 style="font-size: 20px; font-weight: 700; color: #111827; margin-bottom: 8px;">📊 Your Daily Brief</h1>
<p style="display: inline-block; background-color: #eff6ff; color: #1d4ed8; padding: 4px 12px; border-radius: 9999px; font-size: 14px; font-weight: 600; margin-bottom: 24px;">${formattedDate}</p>
<div style="margin-bottom: 24px;">
${htmlContent}
</div>
<hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
<p style="font-size: 14px; color: #4b5563; margin-bottom: 8px;">This daily brief was generated by BuildOS to help you stay focused and productive.</p>
<p style="font-size: 14px; color: #2563eb;">
	<a href="https://build-os.com/briefs/${brief.id}" style="color: #2563eb; text-decoration: none;">View in BuildOS</a>
	<span style="color: #9ca3af;"> • </span>
	<a href="https://build-os.com/settings" style="color: #2563eb; text-decoration: none;">Manage Email Preferences</a>
</p>
`.trim();

    const plainTextBody = `
Your Daily Brief - ${new Date(briefDate).toLocaleDateString()}

${transformedContent}

---
View in BuildOS: https://build-os.com/briefs/${brief.id}
Manage preferences: https://build-os.com/settings
`.trim();

    return {
      htmlContent: wrappedContent,
      plainText: plainTextBody,
    };
  }

  /**
   * Send the daily brief email
   */
  async sendDailyBriefEmail(
    userId: string,
    briefDate: string,
    brief: DailyBriefResult,
  ): Promise<boolean> {
    let emailRecordId: string | null = null;
    let recipientRecordId: string | null = null;
    try {
      // Check if user has opted in
      const shouldSend = await this.shouldSendEmail(userId);
      if (!shouldSend) {
        console.log(
          `📭 Email not sent: User ${userId} has not opted in for email briefs`,
        );
        return false;
      }

      // Get user email
      const email = await this.getUserEmail(userId);
      if (!email) {
        console.error(`📭 Email not sent: No email found for user ${userId}`);
        return false;
      }

      console.log(`📬 Preparing to send daily brief email:
   → User: ${userId}
   → Email: ${email}
   → Brief Date: ${briefDate}
   → Brief ID: ${brief.id}
   → Method: ${this.useWebhook ? "WEBHOOK" : "DIRECT SMTP"}`);

      // Generate tracking ID for this email
      const trackingId = this.generateTrackingId();
      const trackingEnabled = true; // You can make this configurable

      // Prepare email body content (HTML content fragment + plain text)
      const { htmlContent, plainText } = this.formatBriefForEmail(
        brief,
        briefDate,
      );
      const trackingPixel =
        trackingEnabled && trackingId
          ? `<img src="https://build-os.com/api/email-tracking/${trackingId}" width="1" height="1" style="display:none;" alt="" />`
          : undefined;

      // Use custom subject from metadata (for re-engagement emails) or default
      const customSubject =
        brief.metadata && typeof brief.metadata === "object"
          ? brief.metadata.email_subject
          : undefined;

      const subject =
        customSubject ||
        `Daily Brief - ${new Date(briefDate).toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
        })}`;

      const emailHtmlForStorage = generateMinimalEmailHTML({
        subject,
        content: htmlContent,
        trackingPixel,
      });

      // Create email record in database for tracking
      const { data: emailRecord, error: emailError } = await this.supabase
        .from("emails")
        .insert({
          created_by: userId,
          from_email: "noreply@build-os.com",
          from_name: "BuildOS",
          subject: subject,
          content: emailHtmlForStorage,
          category: "daily_brief",
          status: "scheduled",
          tracking_enabled: trackingEnabled,
          tracking_id: trackingEnabled ? trackingId : null,
          template_data: {
            brief_id: brief.id,
            brief_date: briefDate,
            user_id: userId,
          },
        })
        .select()
        .single();

      if (emailError) {
        console.error("Failed to create email record:", emailError);
        throw emailError;
      }
      emailRecordId = emailRecord?.id || null;

      // Create recipient record for tracking
      const recipientStatus: EmailRecipientStatus = "pending"; // Enforce valid status
      const { data: recipientRecord, error: recipientError } =
        await this.supabase
          .from("email_recipients")
          .insert({
            email_id: emailRecord.id,
            recipient_email: email,
            recipient_type: "to",
            status: recipientStatus,
          })
          .select()
          .single();

      if (recipientError) {
        console.error("Failed to create recipient record:", recipientError);
      }
      recipientRecordId = recipientRecord?.id || null;

      // Send the email via webhook or direct SMTP
      if (this.useWebhook && this.webhookEmailService) {
        // Use webhook to trigger email in main BuildOS app
        console.log(`🔗 Sending email via WEBHOOK service...`);
        console.log(`   → Email Record ID: ${emailRecord.id}`);
        console.log(`   → Tracking ID: ${trackingId}`);

        const webhookResult =
          await this.webhookEmailService.sendDailyBriefEmail(
            userId,
            brief.id,
            briefDate,
            email,
            {
              emailRecordId: emailRecord.id,
              recipientRecordId: recipientRecord?.id,
              trackingId: trackingEnabled ? trackingId : undefined,
              subject,
            },
          );

        if (!webhookResult.success) {
          console.error(`❌ Webhook email send failed: ${webhookResult.error}`);
          throw new Error(webhookResult.error || "Webhook email failed");
        }

        console.log(`✅ Webhook email sent successfully`);
        console.log(`   → Response: ${webhookResult?.error || "Email queued"}`);

        // Update email status to sent
        await this.supabase
          .from("emails")
          .update({ status: "sent" })
          .eq("id", emailRecord.id);

        const sentStatus: EmailRecipientStatus = "sent";
        await this.supabase
          .from("email_recipients")
          .update({ status: sentStatus })
          .eq("id", recipientRecord?.id);
      } else {
        // Fallback to direct email sending
        console.log(`📤 Sending email via DIRECT SMTP service...`);
        console.log(`   → Email Record ID: ${emailRecord.id}`);
        console.log(
          `   → SMTP configured: ${process.env.SMTP_HOST ? "Yes" : "No"}`,
        );

        await this.emailService.sendEmail({
          to: email,
          subject: subject,
          body: htmlContent,
          plainText: plainText,
          metadata: {
            type: "daily_brief",
            brief_date: briefDate,
            brief_id: brief.id,
            user_id: userId,
            email_id: emailRecord.id,
            tracking_id: trackingEnabled ? trackingId : undefined,
          },
          userId,
          emailId: emailRecord.id,
          recipientId: recipientRecord?.id,
          trackingPixel,
        });

        console.log(`✅ Direct SMTP email sent successfully`);
      }

      console.log(`📨 Daily brief email completed:
   → Sent to: ${email}
   → Date: ${briefDate}
   → Method: ${this.useWebhook ? "WEBHOOK" : "DIRECT SMTP"}
   → Tracking ID: ${trackingId}
   → Success: true`);
      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(`❌ Email send failed:
   → Method attempted: ${this.useWebhook ? "WEBHOOK" : "DIRECT SMTP"}
   → Error: ${errorMessage}
   → Email Record ID: ${emailRecordId || "not created"}
   → Recipient Record ID: ${recipientRecordId || "not created"}`);

      if (emailRecordId) {
        await this.supabase
          .from("emails")
          .update({ status: "failed" })
          .eq("id", emailRecordId);
      }
      if (recipientRecordId) {
        const failedStatus: EmailRecipientStatus = "failed"; // Enforce valid status
        await this.supabase
          .from("email_recipients")
          .update({ status: failedStatus, error_message: errorMessage })
          .eq("id", recipientRecordId);
      }
      console.error("Full error details:", error);
      return false;
    }
  }
}
