// worker-queue/src/worker.ts
import { SupabaseQueue, ProcessingJob } from "./lib/supabaseQueue";
import { processBriefJob } from "./workers/brief/briefWorker";
import { processPhasesJob } from "./workers/phases/phasesWorker";
import { processOnboardingAnalysisJob } from "./workers/onboarding/onboardingWorker";
import { processSMSJob } from "./workers/smsWorker";
import { createLegacyJob } from "./workers/shared/jobAdapter";
import {
  getEnvironmentConfig,
  validateEnvironment,
} from "./config/queueConfig";

// Validate environment before starting
const { valid, errors } = validateEnvironment();
if (!valid) {
  console.error("❌ Environment validation failed:");
  errors.forEach((error) => console.error(`   - ${error}`));
  process.exit(1);
}

// Get configuration based on environment
const config = getEnvironmentConfig();

// Create queue instance with environment-based configuration
const queue = new SupabaseQueue({
  pollInterval: config.pollInterval,
  batchSize: config.batchSize,
  stalledTimeout: config.stalledTimeout,
});

/**
 * Brief generation processor
 */
async function processBrief(job: ProcessingJob) {
  const startTime = Date.now();
  const jobType = job.data.priority === 1 ? "⚡ IMMEDIATE" : "📅 SCHEDULED";

  await job.log(`${jobType} brief started for user ${job.userId}`);
  await job.log(`Brief date: ${job.data.briefDate}`);

  try {
    // Convert ProcessingJob to type-safe legacy format
    const legacyJob = createLegacyJob(job);

    // Use existing brief processor with type-safe adapter
    await processBriefJob(legacyJob);

    const duration = Date.now() - startTime;
    await job.log(`✅ ${jobType} brief completed in ${duration}ms`);

    return { success: true, duration };
  } catch (error: any) {
    await job.log(`❌ ${jobType} brief failed: ${error.message}`);
    throw error;
  }
}

/**
 * Phases generation processor
 */
async function processPhases(job: ProcessingJob) {
  await job.log(`Starting phases generation for project ${job.data.projectId}`);

  try {
    // Convert ProcessingJob to type-safe legacy format
    const legacyJob = createLegacyJob(job);

    await processPhasesJob(legacyJob);
    await job.log("✅ Phases generation completed");

    return { success: true };
  } catch (error: any) {
    await job.log(`❌ Phases generation failed: ${error.message}`);
    throw error;
  }
}

/**
 * Onboarding analysis processor
 */
async function processOnboarding(job: ProcessingJob) {
  await job.log("Starting onboarding analysis");

  try {
    // Convert ProcessingJob to type-safe legacy format
    const legacyJob = createLegacyJob(job);

    await processOnboardingAnalysisJob(legacyJob);
    await job.log("✅ Onboarding analysis completed");

    return { success: true };
  } catch (error: any) {
    await job.log(`❌ Onboarding analysis failed: ${error.message}`);
    throw error;
  }
}

/**
 * SMS sending processor
 */
async function processSMS(job: ProcessingJob) {
  await job.log(`Sending SMS to ${job.data.phone_number}`);

  try {
    // Convert ProcessingJob to type-safe legacy format
    const legacyJob = createLegacyJob(job);

    await processSMSJob(legacyJob);
    await job.log("✅ SMS sent successfully");

    return { success: true };
  } catch (error: any) {
    await job.log(`❌ SMS send failed: ${error.message}`);
    throw error;
  }
}

/**
 * Start the Supabase-based worker
 */
export async function startWorker() {
  console.log("🚀 Starting worker...");

  // Register processors
  queue.process("generate_daily_brief", processBrief);
  queue.process("generate_phases", processPhases);
  queue.process("onboarding_analysis", processOnboarding);

  // Register SMS processor (will fail gracefully if Twilio not configured)
  queue.process("send_sms", processSMS);

  // Check if Twilio is configured
  const twilioEnabled = !!(
    process.env.PRIVATE_TWILIO_ACCOUNT_SID &&
    process.env.PRIVATE_TWILIO_AUTH_TOKEN &&
    process.env.PRIVATE_TWILIO_MESSAGING_SERVICE_SID
  );

  if (!twilioEnabled) {
    console.warn(
      "⚠️  SMS functionality disabled - Twilio credentials not configured",
    );
  }

  // Start processing
  await queue.start();

  // Log queue stats based on configuration
  if (config.enableHealthChecks) {
    setInterval(async () => {
      const stats = await queue.getStats();
      if (stats && stats.length > 0) {
        console.log("📊 Queue Statistics:");
        stats.forEach((stat: any) => {
          console.log(`   ${stat.job_type} - ${stat.status}: ${stat.count}`);
        });
      }
    }, config.statsUpdateInterval);

    console.log(
      `📈 Health monitoring enabled (stats every ${config.statsUpdateInterval}ms)`,
    );
  }

  // Handle graceful shutdown
  process.on("SIGTERM", () => {
    console.log("📛 SIGTERM received, stopping worker...");
    queue.stop();
    process.exit(0);
  });

  process.on("SIGINT", () => {
    console.log("📛 SIGINT received, stopping worker...");
    queue.stop();
    process.exit(0);
  });

  console.log("✅ Worker started successfully");

  // List enabled job types
  const jobTypes = [
    "brief_generation",
    "phases_generation",
    "onboarding_analysis",
  ];

  if (twilioEnabled) {
    jobTypes.push("send_sms");
  }

  console.log(`📋 Processing job types: ${jobTypes.join(", ")}`);

  return queue;
}

// Export queue instance for use in other modules
export { queue };
