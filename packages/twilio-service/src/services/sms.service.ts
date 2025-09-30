// packages/twilio-service/src/services/sms.service.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { TwilioClient } from "../client";

export class SMSService {
  private twilioClient: TwilioClient;
  private supabase: SupabaseClient<any>;

  constructor(twilioClient: TwilioClient, supabase: SupabaseClient<any>) {
    this.twilioClient = twilioClient;
    this.supabase = supabase;
  }

  async sendTaskReminder(params: {
    userId: string;
    phoneNumber: string;
    taskName: string;
    dueDate: Date;
    projectContext?: string;
  }) {
    // Get template
    const { data: template } = await this.supabase
      .from("sms_templates")
      .select("*")
      .eq("template_key", "task_reminder")
      .eq("is_active", true)
      .single();

    if (!template) {
      throw new Error("Task reminder template not found");
    }

    // Format the message
    const dueTime = this.formatRelativeTime(params.dueDate);
    const message = this.renderTemplate(template.message_template, {
      task_name: params.taskName,
      due_time: dueTime,
      task_context: params.projectContext || "",
    });

    // Check user preferences
    const canSend = await this.checkUserSMSPreferences(
      params.userId,
      "task_reminders",
    );
    if (!canSend) {
      throw new Error("User has disabled task reminder SMS");
    }

    // Create message record
    const { data: smsMessage } = await this.supabase
      .from("sms_messages")
      .insert({
        user_id: params.userId,
        phone_number: params.phoneNumber,
        message_content: message,
        template_id: template.id,
        template_vars: {
          task_name: params.taskName,
          due_time: dueTime,
          task_context: params.projectContext,
        },
        priority: this.calculatePriority(params.dueDate),
        metadata: {
          type: "task_reminder",
          task_name: params.taskName,
          due_date: params.dueDate,
        },
      })
      .select()
      .single();

    // Send via Twilio
    try {
      const twilioMessage = await this.twilioClient.sendSMS({
        to: params.phoneNumber,
        body: message,
        metadata: {
          message_id: smsMessage.id,
          user_id: params.userId,
        },
      });

      // Update with Twilio SID
      await this.supabase
        .from("sms_messages")
        .update({
          twilio_sid: twilioMessage.sid,
          status: "sent",
          sent_at: new Date().toISOString(),
        })
        .eq("id", smsMessage.id);

      // Update template usage count using SQL increment
      await this.supabase
        .from("sms_templates")
        .update({
          usage_count: template.usage_count + 1,
          last_used_at: new Date().toISOString(),
        })
        .eq("id", template.id);

      return { success: true, messageId: smsMessage.id };
    } catch (error: any) {
      // Update message with error
      await this.supabase
        .from("sms_messages")
        .update({
          status: "failed",
          twilio_error_message: error.message,
          twilio_error_code: error.code,
        })
        .eq("id", smsMessage.id);

      throw error;
    }
  }

  async sendDailyBriefNotification(params: {
    userId: string;
    phoneNumber: string;
    mainFocus: string;
    briefId: string;
  }) {
    const { data: template } = await this.supabase
      .from("sms_templates")
      .select("*")
      .eq("template_key", "daily_brief_ready")
      .eq("is_active", true)
      .single();

    if (!template) {
      throw new Error("Daily brief template not found");
    }

    const message = this.renderTemplate(template.message_template, {
      main_focus: params.mainFocus,
    });

    // Send with high priority
    return this.sendWithRetry({
      userId: params.userId,
      phoneNumber: params.phoneNumber,
      message,
      templateId: template.id,
      priority: "high",
      metadata: {
        type: "daily_brief",
        brief_id: params.briefId,
      },
    });
  }

  private async sendWithRetry(params: any, maxAttempts = 3) {
    let lastError: any;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.sendMessage(params);
      } catch (error: any) {
        lastError = error;

        // Don't retry for certain errors
        if (error.code === 21211 || error.code === 21614) {
          throw error;
        }

        // Exponential backoff
        if (attempt < maxAttempts) {
          await new Promise((resolve) =>
            setTimeout(resolve, Math.pow(2, attempt) * 1000),
          );
        }
      }
    }

    throw lastError;
  }

  private async sendMessage(params: any) {
    // Create message record
    const { data: smsMessage, error: insertError } = await this.supabase
      .from("sms_messages")
      .insert({
        user_id: params.userId,
        phone_number: params.phoneNumber,
        message_content: params.message,
        template_id: params.templateId,
        priority: params.priority || "normal",
        metadata: params.metadata || {},
      })
      .select()
      .single();

    if (insertError) throw insertError;

    try {
      // Send via Twilio
      const twilioMessage = await this.twilioClient.sendSMS({
        to: params.phoneNumber,
        body: params.message,
        metadata: {
          message_id: smsMessage.id,
          user_id: params.userId,
        },
      });

      // Update status
      await this.supabase
        .from("sms_messages")
        .update({
          twilio_sid: twilioMessage.sid,
          status: "sent",
          sent_at: new Date().toISOString(),
        })
        .eq("id", smsMessage.id);

      return { success: true, messageId: smsMessage.id };
    } catch (error: any) {
      // Update with error
      await this.supabase
        .from("sms_messages")
        .update({
          status: "failed",
          twilio_error_message: error.message,
          twilio_error_code: error.code,
        })
        .eq("id", smsMessage.id);

      throw error;
    }
  }

  private renderTemplate(template: string, vars: Record<string, any>): string {
    return template.replace(/{{(\w+)}}/g, (match, key) => {
      return vars[key] || "";
    });
  }

  private formatRelativeTime(date: Date): string {
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));

    if (hours < 1) {
      const minutes = Math.floor(diff / (1000 * 60));
      return `in ${minutes} minutes`;
    } else if (hours < 24) {
      return `in ${hours} hours`;
    } else {
      const days = Math.floor(hours / 24);
      return `in ${days} days`;
    }
  }

  private calculatePriority(dueDate: Date): string {
    const hoursUntilDue = (dueDate.getTime() - Date.now()) / (1000 * 60 * 60);

    if (hoursUntilDue < 1) return "urgent";
    if (hoursUntilDue < 24) return "high";
    if (hoursUntilDue < 72) return "normal";
    return "low";
  }

  private async checkUserSMSPreferences(
    userId: string,
    preferenceType: string,
  ): Promise<boolean> {
    const { data: prefs } = await this.supabase
      .from("user_sms_preferences")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (!prefs || !prefs.phone_verified || prefs.opted_out) {
      return false;
    }

    // Check quiet hours
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

    if (prefs.quiet_hours_start && prefs.quiet_hours_end) {
      const isInQuietHours = this.isTimeInRange(
        currentTime,
        prefs.quiet_hours_start,
        prefs.quiet_hours_end,
      );

      if (isInQuietHours && preferenceType !== "urgent_alerts") {
        return false;
      }
    }

    // Check daily limit
    if (prefs.daily_sms_count >= prefs.daily_sms_limit) {
      return false;
    }

    return prefs[preferenceType] === true;
  }

  private isTimeInRange(current: string, start: string, end: string): boolean {
    // Handle overnight quiet hours (e.g., 21:00 to 08:00)
    if (start > end) {
      return current >= start || current <= end;
    }
    return current >= start && current <= end;
  }
}
