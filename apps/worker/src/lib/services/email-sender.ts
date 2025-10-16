// apps/worker/src/lib/services/email-sender.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";
import { generateMinimalEmailHTML } from "../utils/emailTemplate";
import { renderMarkdown } from "../utils/markdown";
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
  private webhookEmailService: WebhookEmailService;
  private baseUrl = "https://build-os.com";

  constructor(private supabase: SupabaseClient) {
    // ⚠️ CRITICAL: Worker is deployed on Railway which blocks SMTP ports (25, 465, 587)
    // ALL email sending MUST go through webhooks to the web app (deployed on Vercel)
    // The web app has no port restrictions and can send via Gmail SMTP

    console.log("🔍 Email Sender Constructor - Environment Check:");
    console.log(
      `   → Webhook URL: ${process.env.BUILDOS_WEBHOOK_URL || "NOT SET"}`,
    );
    console.log(
      `   → Webhook Secret configured: ${process.env.PRIVATE_BUILDOS_WEBHOOK_SECRET ? "YES" : "NO"}`,
    );

    // ALWAYS use webhooks (no SMTP fallback - Railway blocks SMTP ports)
    try {
      this.webhookEmailService = new WebhookEmailService();
      console.log(
        "✅ Email sender initialized: Using WEBHOOK service (Railway SMTP ports are blocked)",
      );
      console.log(
        `   → Webhook URL: ${process.env.BUILDOS_WEBHOOK_URL || "https://build-os.com/webhooks/daily-brief-email"}`,
      );
    } catch (error) {
      console.error(
        "❌ CRITICAL: Failed to initialize webhook email service:",
        error,
      );
      console.error("   → Email sending will NOT work!");
      console.error(
        "   → Check PRIVATE_BUILDOS_WEBHOOK_SECRET environment variable",
      );
      throw new Error(
        "Webhook email service initialization failed - email sending unavailable",
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
   * Checks should_email_daily_brief from notification preferences AND is_active from brief preferences
   */
  async shouldSendEmail(userId: string): Promise<boolean> {
    try {
      // Check notification preferences for email opt-in
      const { data: notificationPrefs, error: notificationError } =
        await this.supabase
          .from("user_notification_preferences")
          .select("should_email_daily_brief")
          .eq("user_id", userId)
          .single();

      if (notificationError && notificationError.code !== "PGRST116") {
        console.error(
          `❌ Error fetching notification preferences for user ${userId}:`,
          notificationError,
        );
        return false;
      }

      // Check brief preferences for is_active (brief generation)
      const { data: briefPrefs, error: briefError } = await this.supabase
        .from("user_brief_preferences")
        .select("is_active")
        .eq("user_id", userId)
        .single();

      if (briefError && briefError.code !== "PGRST116") {
        console.error(
          `❌ Error fetching brief preferences for user ${userId}:`,
          briefError,
        );
        return false;
      }

      if (!briefPrefs) {
        console.warn(
          `⚠️  No brief preferences found for user ${userId} - user may not have completed onboarding`,
        );
        return false;
      }

      const shouldSend =
        notificationPrefs?.should_email_daily_brief === true &&
        briefPrefs.is_active === true;

      console.log(`📧 Email eligibility check for user ${userId}:
   → should_email_daily_brief: ${notificationPrefs?.should_email_daily_brief ?? "not set"}
   → is_active: ${briefPrefs.is_active}
   → Result: ${shouldSend ? "SEND EMAIL ✅" : "SKIP EMAIL ❌"}`);

      return shouldSend;
    } catch (error) {
      console.error(
        `❌ Unexpected error checking email preferences for user ${userId}:`,
        error,
      );
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
   → Method: WEBHOOK (Railway blocks SMTP)`);

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

      // Send email via webhook to web app (Railway blocks SMTP ports)
      if (!this.webhookEmailService) {
        throw new Error(
          "Webhook email service not initialized - cannot send email",
        );
      }

      console.log(`🔗 Sending email via WEBHOOK service...`);
      console.log(`   → Email Record ID: ${emailRecord.id}`);
      console.log(`   → Tracking ID: ${trackingId}`);

      const webhookResult = await this.webhookEmailService.sendDailyBriefEmail(
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

      console.log(`📨 Daily brief email completed:
   → Sent to: ${email}
   → Date: ${briefDate}
   → Method: WEBHOOK (via web app)
   → Tracking ID: ${trackingId}
   → Success: true`);
      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(`❌ Email send failed:
   → Method attempted: WEBHOOK (via web app)
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
