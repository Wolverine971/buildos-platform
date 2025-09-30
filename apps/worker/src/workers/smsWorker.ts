import type { LegacyJob } from "./shared/jobAdapter";
import { SMSService, TwilioClient } from "@buildos/twilio-service";
import { createClient } from "@supabase/supabase-js";
import { notifyUser, updateJobStatus } from "./shared/queueUtils";

// Conditional Twilio initialization
let twilioClient: TwilioClient | null = null;
let smsService: SMSService | null = null;

const twilioConfig = {
  accountSid: process.env.PRIVATE_TWILIO_ACCOUNT_SID,
  authToken: process.env.PRIVATE_TWILIO_AUTH_TOKEN,
  messagingServiceSid: process.env.PRIVATE_TWILIO_MESSAGING_SERVICE_SID,
  statusCallbackUrl: process.env.PRIVATE_TWILIO_STATUS_CALLBACK_URL,
};

// Only initialize if all required Twilio credentials are present
if (
  twilioConfig.accountSid &&
  twilioConfig.authToken &&
  twilioConfig.messagingServiceSid
) {
  try {
    twilioClient = new TwilioClient({
      accountSid: twilioConfig.accountSid,
      authToken: twilioConfig.authToken,
      messagingServiceSid: twilioConfig.messagingServiceSid,
      statusCallbackUrl: twilioConfig.statusCallbackUrl,
    });

    console.log();
    const supabase = createClient(
      process.env.PUBLIC_SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL!,
      process.env.PRIVATE_SUPABASE_SERVICE_KEY!,
    );

    smsService = new SMSService(twilioClient, supabase);
    console.log("Twilio SMS service initialized successfully");
  } catch (error) {
    console.error("Failed to initialize Twilio client:", error);
    twilioClient = null;
    smsService = null;
  }
} else {
  console.warn(
    "Twilio credentials not configured - SMS functionality disabled",
  );
}

const supabase = createClient(
  process.env.PUBLIC_SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL!,
  process.env.PRIVATE_SUPABASE_SERVICE_KEY!,
);

export async function processSMSJob(job: LegacyJob<any>) {
  // Check if SMS service is available
  if (!twilioClient || !smsService) {
    const errorMessage =
      "SMS service not available - Twilio credentials not configured";
    console.error(errorMessage);
    await updateJobStatus(job.id, "failed", "send_sms", errorMessage);
    throw new Error(errorMessage);
  }
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
