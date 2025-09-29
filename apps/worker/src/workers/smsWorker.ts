import type { LegacyJob } from "./shared/jobAdapter";
import { TwilioClient, SMSService } from "@buildos/twilio-service";
import { createClient } from "@supabase/supabase-js";
import { updateJobStatus, notifyUser } from "./shared/queueUtils";

const twilioClient = new TwilioClient({
  accountSid: process.env.TWILIO_ACCOUNT_SID!,
  authToken: process.env.TWILIO_AUTH_TOKEN!,
  messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID!,
  statusCallbackUrl: process.env.TWILIO_STATUS_CALLBACK_URL,
});

const supabase = createClient(
  process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const smsService = new SMSService(twilioClient, supabase);

export async function processSMSJob(job: LegacyJob<any>) {
  const { message_id, phone_number, message, priority } = job.data;

  try {
    await updateJobStatus(job.id, "processing", "send_sms");

    // Update progress
    await job.updateProgress({
      current: 1,
      total: 3,
      message: "Sending SMS...",
    });

    // Get message details from database
    const { data: smsMessage } = await supabase
      .from("sms_messages")
      .select("*")
      .eq("id", message_id)
      .single();

    if (!smsMessage) {
      throw new Error("SMS message not found");
    }

    // Send via Twilio
    const twilioMessage = await twilioClient.sendSMS({
      to: phone_number,
      body: message,
      metadata: {
        message_id,
        user_id: job.data.user_id,
      },
    });

    await job.updateProgress({
      current: 2,
      total: 3,
      message: "Updating status...",
    });

    // Update message status
    await supabase
      .from("sms_messages")
      .update({
        status: "sent",
        twilio_sid: twilioMessage.sid,
        sent_at: new Date().toISOString(),
      })
      .eq("id", message_id);

    await job.updateProgress({
      current: 3,
      total: 3,
      message: "SMS sent successfully",
    });

    await updateJobStatus(job.id, "completed", "send_sms");

    // Notify user of successful send (optional)
    await notifyUser(job.data.user_id, "sms_sent", {
      message_id,
      phone_number,
    });

    return { success: true, twilio_sid: twilioMessage.sid };
  } catch (error: any) {
    console.error("SMS job failed:", error);

    // Update message status with error
    const { data: currentMessage } = await supabase
      .from("sms_messages")
      .select("attempt_count")
      .eq("id", message_id)
      .single();

    await supabase
      .from("sms_messages")
      .update({
        status: "failed",
        twilio_error_message: error.message,
        attempt_count: (currentMessage?.attempt_count || 0) + 1,
      })
      .eq("id", message_id);

    await updateJobStatus(job.id, "failed", "send_sms", error.message);

    // Check if we should retry
    const { data: message } = await supabase
      .from("sms_messages")
      .select("attempt_count, max_attempts")
      .eq("id", message_id)
      .single();

    if (message && message.attempt_count < message.max_attempts) {
      // Re-queue with exponential backoff
      const delay = Math.pow(2, message.attempt_count) * 60; // minutes

      await supabase.rpc("add_queue_job", {
        p_user_id: job.data.user_id,
        p_job_type: "send_sms",
        p_metadata: job.data,
        p_scheduled_for: new Date(Date.now() + delay * 60000).toISOString(),
        p_priority: priority === "urgent" ? 1 : 10,
      });
    }

    throw error;
  }
}
