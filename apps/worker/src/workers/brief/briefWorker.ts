// worker-queue/src/workers/brief/briefWorker.ts
import { format } from 'date-fns';
import { utcToZonedTime } from 'date-fns-tz';

import { supabase } from '../../lib/supabase';
import { BriefJobData, notifyUser, updateJobStatus } from '../shared/queueUtils';
import { LegacyJob } from '../shared/jobAdapter';
import { generateDailyBrief } from './briefGenerator';
import { DailyBriefEmailSender } from '../../lib/services/email-sender';


export async function processBriefJob(job: LegacyJob<BriefJobData>) {
  console.log(`🏃 Processing brief job ${job.id} for user ${job.data.userId}`);
  
  try {
    await updateJobStatus(job.id, 'processing', 'brief');
    
    // ALWAYS fetch user's timezone from preferences to ensure consistency
    const { data: preferences, error: prefError } = await supabase
      .from('user_brief_preferences')
      .select('timezone')
      .eq('user_id', job.data.userId)
      .single();
    
    if (prefError) {
      console.warn(`Failed to fetch user preferences: ${prefError.message}, using UTC`);
    }
    
    // Use timezone from preferences, fallback to job data, then UTC
    const timezone = preferences?.timezone || job.data.timezone || 'UTC';
    
    // Calculate briefDate based on the user's timezone
    let briefDate = job.data.briefDate;
    if (!briefDate) {
      // For immediate briefs, use "today" in the user's timezone
      const userCurrentTime = utcToZonedTime(new Date(), timezone);
      briefDate = format(userCurrentTime, 'yyyy-MM-dd');
    }
    
    // Validate the brief date is in the expected format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(briefDate)) {
      throw new Error(`Invalid brief date format: ${briefDate}. Expected YYYY-MM-DD`);
    }
    
    console.log(`📅 Generating brief for date: ${briefDate} (timezone: ${timezone}, current time: ${new Date().toISOString()})`);
    
    // Log timezone conversion for debugging
    const userCurrentTime = utcToZonedTime(new Date(), timezone);
    console.log(`🕐 User's current time: ${format(userCurrentTime, 'yyyy-MM-dd HH:mm:ss zzz')}`);
    
    const brief = await generateDailyBrief(
      job.data.userId, 
      briefDate,
      job.data.options,
      timezone,
      job.id // Pass the job ID
    );
    
    // Send email if user has opted in
    try {
      const emailSender = new DailyBriefEmailSender(supabase);
      const emailSent = await emailSender.sendDailyBriefEmail(
        job.data.userId,
        briefDate,
        brief
      );
      
      if (emailSent) {
        console.log(`📧 Email notification sent for brief ${brief.id}`);
      }
    } catch (emailError) {
      // Don't fail the job if email sending fails, just log the error
      console.error(`Failed to send email notification: ${emailError instanceof Error ? emailError.message : 'Unknown error'}`);
    }
    
    await updateJobStatus(job.id, 'completed', 'brief');
    
    await notifyUser(job.data.userId, 'brief_completed', {
      briefId: brief.id,
      briefDate: brief.brief_date,
      timezone: timezone,
      message: `Your daily brief for ${briefDate} is ready!`
    });
    
    console.log(`✅ Completed brief generation for user ${job.data.userId} - Date: ${briefDate}, Timezone: ${timezone}`);
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Failed to generate brief for user ${job.data.userId}:`, errorMessage);
    
    await updateJobStatus(job.id, 'failed', 'brief', errorMessage);
    
    await notifyUser(job.data.userId, 'brief_failed', {
      error: errorMessage,
      jobId: job.id,
      message: 'Brief generation failed. Click to retry.'
    });
    
    throw error;
  }
}