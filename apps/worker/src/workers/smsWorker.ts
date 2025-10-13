// apps/worker/src/workers/smsWorker.ts
import type { LegacyJob } from './shared/jobAdapter';
import { SMSService, TwilioClient } from '@buildos/twilio-service';
import { createClient } from '@supabase/supabase-js';
import { notifyUser, updateJobStatus } from './shared/queueUtils';
import { smsMetricsService } from '@buildos/shared-utils';

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
    console.log('Twilio SMS service initialized successfully');
  } catch (error) {
    console.error('Failed to initialize Twilio client:', error);
    twilioClient = null;
    smsService = null;
  }
} else {
  console.warn(
    'Twilio credentials not configured - SMS functionality disabled',
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
      'SMS service not available - Twilio credentials not configured';
    console.error(errorMessage);
    await updateJobStatus(job.id, 'failed', 'send_sms', errorMessage);
    throw new Error(errorMessage);
  }
  const { message_id, phone_number, message, priority, scheduled_sms_id } =
    job.data;

  try {
    await updateJobStatus(job.id, 'processing', 'send_sms');

    // Update progress
    await job.updateProgress({
      current: 1,
      total: scheduled_sms_id ? 5 : 3,
      message: scheduled_sms_id ? 'Pre-send validation...' : 'Sending SMS...',
    });

    // Phase 4: Pre-send validation for scheduled SMS
    if (scheduled_sms_id) {
      console.log(
        `[SMS Worker] Pre-send validation for scheduled SMS ${scheduled_sms_id}`,
      );

      // Check if scheduled SMS is still valid
      const { data: scheduledSms, error: scheduledError } = await supabase
        .from('scheduled_sms_messages')
        .select('*, user_sms_preferences!inner(*)')
        .eq('id', scheduled_sms_id)
        .single();

      if (scheduledError || !scheduledSms) {
        throw new Error(
          `Scheduled SMS not found: ${scheduledError?.message || 'Unknown error'}`,
        );
      }

      // Check if message was cancelled
      if (scheduledSms.status === 'cancelled') {
        console.log(
          `[SMS Worker] Scheduled SMS ${scheduled_sms_id} was cancelled, skipping send`,
        );

        // Track cancelled metrics (non-blocking)
        smsMetricsService
          .recordCancelled(job.data.user_id, scheduled_sms_id, 'User cancelled')
          .catch((err: unknown) =>
            console.error(
              '[SMS Worker] Error tracking cancelled metrics:',
              err,
            ),
          );

        await updateJobStatus(
          job.id,
          'completed',
          'send_sms',
          'Message cancelled',
        );
        return { success: false, reason: 'cancelled' };
      }

      // Check quiet hours
      const now = new Date();
      const userPrefs = scheduledSms.user_sms_preferences;

      if (userPrefs.quiet_hours_start && userPrefs.quiet_hours_end) {
        const quietStart = parseInt(userPrefs.quiet_hours_start);
        const quietEnd = parseInt(userPrefs.quiet_hours_end);
        const currentHour = now.getHours();

        const isQuietHours =
          quietStart < quietEnd
            ? currentHour >= quietStart && currentHour < quietEnd
            : currentHour >= quietStart || currentHour < quietEnd;

        if (isQuietHours) {
          console.log(
            `[SMS Worker] Currently in quiet hours (${quietStart}-${quietEnd}), rescheduling`,
          );

          // Reschedule to end of quiet hours
          const rescheduleTime = new Date(now);
          rescheduleTime.setHours(quietEnd, 0, 0, 0);

          await supabase
            .from('scheduled_sms_messages')
            .update({
              scheduled_for: rescheduleTime.toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', scheduled_sms_id);

          // Re-queue job
          await supabase.rpc('add_queue_job', {
            p_user_id: job.data.user_id,
            p_job_type: 'send_sms',
            p_metadata: job.data,
            p_scheduled_for: rescheduleTime.toISOString(),
            p_priority: priority === 'urgent' ? 1 : 10,
          });

          await updateJobStatus(
            job.id,
            'completed',
            'send_sms',
            'Rescheduled due to quiet hours',
          );
          return { success: false, reason: 'quiet_hours' };
        }
      }

      // Check daily limit
      if (userPrefs.daily_sms_limit && userPrefs.daily_sms_count) {
        if (userPrefs.daily_sms_count >= userPrefs.daily_sms_limit) {
          console.log(
            `[SMS Worker] Daily SMS limit reached (${userPrefs.daily_sms_count}/${userPrefs.daily_sms_limit}), skipping`,
          );

          await supabase
            .from('scheduled_sms_messages')
            .update({
              status: 'cancelled',
              cancelled_at: new Date().toISOString(),
              last_error: 'Daily SMS limit reached',
            })
            .eq('id', scheduled_sms_id);

          await updateJobStatus(
            job.id,
            'completed',
            'send_sms',
            'Daily limit reached',
          );
          return { success: false, reason: 'daily_limit' };
        }
      }

      // Verify event still exists if calendar_event_id present
      if (scheduledSms.calendar_event_id) {
        const { data: event } = await supabase
          .from('task_calendar_events')
          .select('sync_status')
          .eq('calendar_event_id', scheduledSms.calendar_event_id)
          .single();

        if (!event || event.sync_status === 'deleted') {
          console.log(
            `[SMS Worker] Calendar event ${scheduledSms.calendar_event_id} no longer exists, cancelling SMS`,
          );

          await supabase
            .from('scheduled_sms_messages')
            .update({
              status: 'cancelled',
              cancelled_at: new Date().toISOString(),
              last_error: 'Calendar event deleted',
            })
            .eq('id', scheduled_sms_id);

          await updateJobStatus(
            job.id,
            'completed',
            'send_sms',
            'Event deleted',
          );
          return { success: false, reason: 'event_deleted' };
        }
      }

      // Update scheduled SMS status to 'sending'
      await supabase
        .from('scheduled_sms_messages')
        .update({
          status: 'sending',
          updated_at: new Date().toISOString(),
        })
        .eq('id', scheduled_sms_id);

      await job.updateProgress({
        current: 2,
        total: 5,
        message: 'Validation passed, sending SMS...',
      });
    }

    // Get message details from database
    const { data: smsMessage } = await supabase
      .from('sms_messages')
      .select('*')
      .eq('id', message_id)
      .single();

    if (!smsMessage) {
      throw new Error('SMS message not found');
    }

    // Send via Twilio
    const twilioMessage = await twilioClient.sendSMS({
      to: phone_number,
      body: message,
      metadata: {
        message_id,
        user_id: job.data.user_id,
        scheduled_sms_id: scheduled_sms_id || undefined,
      },
    });

    await job.updateProgress({
      current: scheduled_sms_id ? 3 : 2,
      total: scheduled_sms_id ? 5 : 3,
      message: 'Updating status...',
    });

    // Update message status
    await supabase
      .from('sms_messages')
      .update({
        status: 'sent',
        twilio_sid: twilioMessage.sid,
        sent_at: new Date().toISOString(),
      })
      .eq('id', message_id);

    // Phase 4: Link scheduled_sms_messages to sms_messages after successful send
    if (scheduled_sms_id) {
      console.log(
        `[SMS Worker] Linking scheduled SMS ${scheduled_sms_id} to sms_messages ${message_id}`,
      );

      await job.updateProgress({
        current: 4,
        total: 5,
        message: 'Linking scheduled SMS...',
      });

      // Fetch current send_attempts to increment it
      const { data: currentScheduledSms } = await supabase
        .from('scheduled_sms_messages')
        .select('send_attempts')
        .eq('id', scheduled_sms_id)
        .single();

      await supabase
        .from('scheduled_sms_messages')
        .update({
          status: 'sent',
          sms_message_id: message_id,
          twilio_sid: twilioMessage.sid,
          sent_at: new Date().toISOString(),
          send_attempts: (currentScheduledSms?.send_attempts ?? 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', scheduled_sms_id);

      // Increment daily SMS count
      await supabase.rpc('increment_daily_sms_count', {
        p_user_id: job.data.user_id,
      });

      console.log(
        `[SMS Worker] Successfully linked and updated scheduled SMS ${scheduled_sms_id}`,
      );
    }

    // Track sent metrics (non-blocking)
    smsMetricsService
      .recordSent(job.data.user_id, message_id, twilioMessage.sid)
      .catch((err: unknown) =>
        console.error('[SMS Worker] Error tracking sent metrics:', err),
      );

    await job.updateProgress({
      current: scheduled_sms_id ? 5 : 3,
      total: scheduled_sms_id ? 5 : 3,
      message: 'SMS sent successfully',
    });

    await updateJobStatus(job.id, 'completed', 'send_sms');

    // Notify user of successful send (optional)
    await notifyUser(job.data.user_id, 'sms_sent', {
      message_id,
      phone_number,
      scheduled_sms_id,
    });

    return {
      success: true,
      twilio_sid: twilioMessage.sid,
      scheduled_sms_id,
    };
  } catch (error: any) {
    console.error('SMS job failed:', error);

    // Update message status with error
    const { data: currentMessage } = await supabase
      .from('sms_messages')
      .select('attempt_count')
      .eq('id', message_id)
      .single();

    await supabase
      .from('sms_messages')
      .update({
        status: 'failed',
        twilio_error_message: error.message,
        attempt_count: (currentMessage?.attempt_count || 0) + 1,
      })
      .eq('id', message_id);

    // Phase 4: Update scheduled_sms_messages on failure
    if (scheduled_sms_id) {
      console.log(
        `[SMS Worker] Updating scheduled SMS ${scheduled_sms_id} with failure`,
      );

      // Fetch current send_attempts to increment it
      const { data: currentScheduledSms } = await supabase
        .from('scheduled_sms_messages')
        .select('send_attempts')
        .eq('id', scheduled_sms_id)
        .single();

      await supabase
        .from('scheduled_sms_messages')
        .update({
          status: 'failed',
          last_error: error.message,
          send_attempts: (currentScheduledSms?.send_attempts ?? 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', scheduled_sms_id);
    }

    // Track failed metrics (non-blocking)
    smsMetricsService
      .recordFailed(job.data.user_id, message_id, error.message)
      .catch((err: unknown) =>
        console.error('[SMS Worker] Error tracking failed metrics:', err),
      );

    await updateJobStatus(job.id, 'failed', 'send_sms', error.message);

    // Check if we should retry
    const { data: message } = await supabase
      .from('sms_messages')
      .select('attempt_count, max_attempts')
      .eq('id', message_id)
      .single();

    // For scheduled SMS, also check max_send_attempts
    let shouldRetry = false;
    if (scheduled_sms_id) {
      const { data: scheduledSms } = await supabase
        .from('scheduled_sms_messages')
        .select('send_attempts, max_send_attempts')
        .eq('id', scheduled_sms_id)
        .single();

      if (scheduledSms) {
        const attempts = scheduledSms.send_attempts ?? 0;
        const maxAttempts = scheduledSms.max_send_attempts ?? 3;
        shouldRetry = attempts < maxAttempts;
      }
    } else {
      const attempts = message?.attempt_count ?? 0;
      const maxAttempts = message?.max_attempts ?? 3;
      shouldRetry = Boolean(message) && attempts < maxAttempts;
    }

    if (shouldRetry) {
      // Re-queue with exponential backoff
      const attemptCount = scheduled_sms_id
        ? (
          await supabase
            .from('scheduled_sms_messages')
            .select('send_attempts')
            .eq('id', scheduled_sms_id)
            .single()
        ).data?.send_attempts || 0
        : message?.attempt_count || 0;

      const delay = Math.pow(2, attemptCount) * 60; // minutes

      await supabase.rpc('add_queue_job', {
        p_user_id: job.data.user_id,
        p_job_type: 'send_sms',
        p_metadata: job.data,
        p_scheduled_for: new Date(Date.now() + delay * 60000).toISOString(),
        p_priority: priority === 'urgent' ? 1 : 10,
      });

      console.log(
        `[SMS Worker] Scheduled retry in ${delay} seconds for ${scheduled_sms_id ? 'scheduled SMS ' + scheduled_sms_id : 'sms_message ' + message_id}`,
      );
    }

    throw error;
  }
}
