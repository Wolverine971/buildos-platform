// apps/worker/src/lib/services/email-service.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createGmailTransporter,
  getGmailConfig,
  formatSender,
} from "./gmail-transporter";
import type { Transporter } from "nodemailer";
import { generateMinimalEmailHTML } from "../utils/emailTemplate";

// Valid email recipient statuses per database constraint
type EmailRecipientStatus =
  | "pending"
  | "sent"
  | "delivered"
  | "failed"
  | "bounced";

export interface EmailData {
  to: string;
  subject: string;
  body: string;
  plainText?: string;
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  metadata?: Record<string, any>;
  userId?: string;
  emailId?: string;
  recipientId?: string;
  trackingPixel?: string;
  useTemplate?: boolean;
}

export class EmailService {
  private supabase?: SupabaseClient;
  private transporter: Transporter | null = null;
  private gmailConfig = getGmailConfig();

  constructor(supabase?: SupabaseClient) {
    this.supabase = supabase;

    // Initialize Gmail transporter if configuration is available
    if (this.gmailConfig) {
      this.transporter = createGmailTransporter(this.gmailConfig);
      console.log("✉️ Gmail transporter initialized");
    } else {
      console.warn(
        "⚠️ Gmail not configured. Emails will be logged but not sent.",
      );
    }
  }

  /**
   * Send an email through Gmail
   */
  async sendEmail(data: EmailData): Promise<void> {
    const startTime = Date.now();
    const sentTimestamp = () => new Date().toISOString();
    const emailId = data.emailId;
    const recipientId = data.recipientId;
    let messageId: string | null = null;
    let simulated = false;
    const htmlBody =
      data.useTemplate === false
        ? data.body
        : generateMinimalEmailHTML({
            subject: data.subject,
            content: data.body,
            trackingPixel: data.trackingPixel,
          });

    try {
      // Send the actual email if transporter is configured
      if (this.transporter && this.gmailConfig) {
        const mailOptions = {
          from: formatSender(this.gmailConfig),
          to: data.to,
          subject: data.subject,
          html: htmlBody, // HTML version (wrapped if template enabled)
          text: data.plainText, // Plain text fallback
          cc: data.cc?.join(", "),
          bcc: data.bcc?.join(", "),
          replyTo:
            data.replyTo || this.gmailConfig.alias || this.gmailConfig.email,
        };

        const info = await this.transporter.sendMail(mailOptions);
        messageId = info.messageId;
        console.log(
          `✅ Email sent successfully to ${data.to} (Message ID: ${messageId})`,
        );

        // Log successful email to database
        if (this.supabase) {
          await this.supabase.from("email_logs").insert({
            to_email: data.to,
            subject: data.subject,
            body: htmlBody,
            cc: data.cc,
            bcc: data.bcc,
            reply_to: data.replyTo,
            metadata: {
              ...data.metadata,
              message_id: messageId,
              email_id: emailId,
              send_time_ms: Date.now() - startTime,
            },
            status: "sent",
            sent_at: sentTimestamp(),
            user_id: data.userId || null,
          });
        }
      } else {
        // Development mode or no email configuration - just log
        console.log("📧 Email (simulated):", {
          to: data.to,
          subject: data.subject,
          from: this.gmailConfig
            ? formatSender(this.gmailConfig)
            : "noreply@build-os.com",
        });
        simulated = true;

        // Still log to database but mark as simulated
        if (this.supabase) {
          await this.supabase.from("email_logs").insert({
            to_email: data.to,
            subject: data.subject,
            body: htmlBody,
            cc: data.cc,
            bcc: data.bcc,
            reply_to: data.replyTo,
            metadata: {
              ...data.metadata,
              simulated: true,
              reason: "Gmail not configured",
              email_id: emailId,
            },
            status: "simulated",
            sent_at: sentTimestamp(),
            user_id: data.userId || null,
          });
        }
      }

      await this.handlePostSendSuccess({
        emailId,
        recipientId,
        status: simulated ? "simulated" : "sent",
        messageId,
        metadata: data.metadata,
        simulated,
      });
    } catch (error) {
      console.error("❌ Error sending email:", error);

      // Log failed email
      if (this.supabase) {
        await this.supabase.from("email_logs").insert({
          to_email: data.to,
          subject: data.subject,
          body: htmlBody,
          status: "failed",
          error_message:
            error instanceof Error ? error.message : "Unknown error",
          metadata: {
            ...data.metadata,
            send_time_ms: Date.now() - startTime,
            email_id: emailId,
          },
          sent_at: sentTimestamp(),
          user_id: data.userId || null,
        });
      }

      await this.handlePostSendFailure({
        emailId,
        recipientId,
        error: error,
        metadata: data.metadata,
      });

      throw error;
    }
  }

  private async handlePostSendSuccess(params: {
    emailId?: string;
    recipientId?: string;
    status: "sent" | "simulated";
    messageId: string | null;
    metadata?: Record<string, any>;
    simulated: boolean;
  }): Promise<void> {
    const { emailId, recipientId, status, messageId, metadata, simulated } =
      params;
    if (!emailId && !recipientId) return;

    const sentAt = new Date().toISOString();
    const normalizedStatus = status === "simulated" ? "sent" : status;

    if (!this.supabase) return;

    const updates: PromiseLike<unknown>[] = [];
    if (emailId) {
      updates.push(
        this.supabase
          .from("emails")
          .update({
            status: normalizedStatus,
            sent_at: sentAt,
          })
          .eq("id", emailId),
      );
    }

    if (recipientId) {
      const sentStatus: EmailRecipientStatus = "sent"; // Enforce valid status
      updates.push(
        this.supabase
          .from("email_recipients")
          .update({
            status: sentStatus,
            sent_at: sentAt,
            delivered_at: simulated ? null : sentAt,
            error_message: null,
          })
          .eq("id", recipientId),
      );
    }

    if (emailId) {
      updates.push(
        this.supabase.from("email_tracking_events").insert({
          email_id: emailId,
          recipient_id: recipientId || null,
          event_type: "sent",
          timestamp: sentAt,
          event_data: {
            message_id: messageId,
            simulated,
            metadata: metadata || null,
          },
        }),
      );
    }

    await Promise.all(updates);
  }

  private async handlePostSendFailure(params: {
    emailId?: string;
    recipientId?: string;
    error: unknown;
    metadata?: Record<string, any>;
  }): Promise<void> {
    const { emailId, recipientId, error, metadata } = params;
    if (!emailId && !recipientId) return;

    if (!this.supabase) return;

    const failedAt = new Date().toISOString();
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    const updates: PromiseLike<unknown>[] = [];
    if (emailId) {
      updates.push(
        this.supabase
          .from("emails")
          .update({
            status: "failed",
            sent_at: failedAt,
          })
          .eq("id", emailId),
      );
    }

    if (recipientId) {
      const failedStatus: EmailRecipientStatus = "failed"; // Enforce valid status
      updates.push(
        this.supabase
          .from("email_recipients")
          .update({
            status: failedStatus,
            sent_at: failedAt,
            error_message: errorMessage,
          })
          .eq("id", recipientId),
      );
    }

    if (emailId) {
      updates.push(
        this.supabase.from("email_tracking_events").insert({
          email_id: emailId,
          recipient_id: recipientId || null,
          event_type: "failed",
          timestamp: failedAt,
          event_data: {
            error_message: errorMessage,
            metadata: metadata || null,
          },
        }),
      );
    }

    await Promise.all(updates);
  }

  /**
   * Send a templated email
   */
  async sendTemplatedEmail(
    to: string,
    templateId: string,
    variables: Record<string, string>,
  ): Promise<void> {
    if (!this.supabase) {
      throw new Error("Supabase client not configured");
    }

    // Fetch template from database
    const { data: template } = await this.supabase
      .from("email_templates")
      .select("subject, body")
      .eq("id", templateId)
      .single();

    if (!template) {
      throw new Error(`Email template ${templateId} not found`);
    }

    // Replace variables in template
    let subject = template.subject;
    let body = template.body;

    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, "g");
      subject = subject.replace(regex, value);
      body = body.replace(regex, value);
    });

    await this.sendEmail({ to, subject, body });
  }

  /**
   * Get email logs for a user
   */
  async getUserEmailLogs(userId: string, limit = 50): Promise<any[]> {
    if (!this.supabase) {
      return [];
    }

    const { data } = await this.supabase
      .from("email_logs")
      .select("*")
      .eq("user_id", userId)
      .order("sent_at", { ascending: false })
      .limit(limit);

    return data || [];
  }
}
