// apps/worker/src/worker.ts
import type {
	AssetOcrJobMetadata,
	HomeworkJobMetadata,
	ProjectContextSnapshotJobMetadata,
	ProjectIconGenerationJobMetadata,
	TreeAgentJobMetadata,
	VoiceNoteTranscriptionJobMetadata
} from '@buildos/shared-types';
import { ProcessingJob, SupabaseQueue } from './lib/supabaseQueue';
import { processBriefJob } from './workers/brief/briefWorker';
import { processOnboardingAnalysisJob } from './workers/onboarding/onboardingWorker';
import type { BriefJobData, OnboardingAnalysisJobData } from './workers/shared/queueUtils';
import { processSMSJob } from './workers/smsWorker';
import { processNotification } from './workers/notification/notificationWorker';
import { processProjectActivityBatchFlushJob } from './workers/notification/projectActivityBatchWorker';
import type {
	NotificationJobMetadata,
	ProjectActivityBatchFlushJobMetadata,
	SendSMSJobMetadata
} from '@buildos/shared-types';
import { type DailySMSJobData, processDailySMS } from './workers/dailySmsWorker';
import { processChatClassificationJob } from './workers/chat/chatSessionClassifier';
import { processBraindumpProcessingJob } from './workers/braindump/braindumpProcessor';
import type {
	BraindumpProcessingJobData,
	ChatClassificationJobData
} from './workers/shared/queueUtils';
import { processVoiceNoteTranscriptionJob } from './workers/voice-notes/voiceNoteTranscriptionWorker';
import { processAssetOcrJob } from './workers/assets/assetOcrWorker';
import { processHomeworkJob } from './workers/homework/homeworkWorker';
import { processTreeAgentJob } from './workers/tree-agent/treeAgentWorker';
import { processProjectContextSnapshotJob } from './workers/ontology/projectContextSnapshotWorker';
import { processProjectIconJob } from './workers/project-icon/projectIconWorker';
import { processCalendarSyncJob } from './workers/calendar/calendarSyncWorker';
import { createLegacyJob } from './workers/shared/jobAdapter';
import { getEnvironmentConfig, validateEnvironment } from './config/queueConfig';
import { cleanupStaleJobs } from './lib/utils/queueCleanup';

// Validate environment before starting
const { valid, errors } = validateEnvironment();
if (!valid) {
	console.error('❌ Environment validation failed:');
	errors.forEach((error) => console.error(`   - ${error}`));
	process.exit(1);
}

// Get configuration based on environment
const config = getEnvironmentConfig();

// Create queue instance with environment-based configuration
const queue = new SupabaseQueue({
	pollInterval: config.pollInterval,
	batchSize: config.batchSize,
	stalledTimeout: config.stalledTimeout
});

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * Brief generation processor
 */
async function processBrief(job: ProcessingJob<BriefJobData>) {
	const startTime = Date.now();
	const jobType =
		(job.data as { priority?: number })?.priority === 1 ? '⚡ IMMEDIATE' : '📅 SCHEDULED';

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
	} catch (error) {
		await job.log(`❌ ${jobType} brief failed: ${getErrorMessage(error)}`);
		throw error;
	}
}

/**
 * Onboarding analysis processor
 */
async function processOnboarding(job: ProcessingJob<OnboardingAnalysisJobData>) {
	await job.log('Starting onboarding analysis');

	try {
		// Convert ProcessingJob to type-safe legacy format
		const legacyJob = createLegacyJob(job);

		await processOnboardingAnalysisJob(legacyJob);
		await job.log('✅ Onboarding analysis completed');

		return { success: true };
	} catch (error) {
		await job.log(`❌ Onboarding analysis failed: ${getErrorMessage(error)}`);
		throw error;
	}
}

/**
 * SMS sending processor
 */
async function processSMS(job: ProcessingJob<SendSMSJobMetadata>) {
	await job.log(`Sending SMS to ${job.data.phone_number}`);

	try {
		// Convert ProcessingJob to type-safe legacy format
		const legacyJob = createLegacyJob(job);

		await processSMSJob(legacyJob);
		await job.log('✅ SMS sent successfully');

		return { success: true };
	} catch (error) {
		await job.log(`❌ SMS send failed: ${getErrorMessage(error)}`);
		throw error;
	}
}

/**
 * Notification processor (Multi-channel notifications)
 */
async function processNotificationWrapper(job: ProcessingJob<NotificationJobMetadata>) {
	const channel = job.data.channel || 'unknown';
	await job.log(`📬 Processing ${channel} notification`);

	try {
		// Process notification (already handles ProcessingJob type)
		await processNotification(job);
		await job.log(`✅ ${channel} notification sent successfully`);

		return { success: true };
	} catch (error) {
		await job.log(`❌ ${channel} notification failed: ${getErrorMessage(error)}`);
		throw error;
	}
}

/**
 * Project activity batch flush processor
 */
async function processProjectActivityBatchFlush(
	job: ProcessingJob<ProjectActivityBatchFlushJobMetadata>
) {
	const batchId = job.data.batch_id || job.data.batchId || 'unknown';
	await job.log(`🧩 Flushing project activity batch ${batchId}`);

	try {
		const result = await processProjectActivityBatchFlushJob(job);
		await job.log(
			`✅ Project activity batch ${batchId} flush result: ${result.status}${result.event_id ? ` (event ${result.event_id})` : ''}`
		);
		return result;
	} catch (error) {
		await job.log(`❌ Project activity batch flush failed: ${getErrorMessage(error)}`);
		throw error;
	}
}

/**
 * Daily SMS scheduler processor (Calendar event reminders)
 */
async function processScheduleDailySMS(job: ProcessingJob<DailySMSJobData>) {
	const { userId, date } = job.data;
	const startTime = Date.now();

	await job.log(`📱 Daily SMS scheduling started for user ${userId}, date ${date}`);

	try {
		// Convert ProcessingJob to type-safe legacy format
		const legacyJob = createLegacyJob(job);

		// Process daily SMS scheduling
		const result = await processDailySMS(legacyJob);

		const duration = Date.now() - startTime;
		await job.log(
			`✅ Daily SMS scheduling completed in ${duration}ms - ${result.scheduled_count || 0} messages scheduled`
		);

		return result;
	} catch (error) {
		await job.log(`❌ Daily SMS scheduling failed: ${getErrorMessage(error)}`);
		throw error;
	}
}

/**
 * Chat session classification processor
 * Generates titles and extracts topics from chat sessions
 */
async function processChatClassification(job: ProcessingJob<ChatClassificationJobData>) {
	const { sessionId } = job.data;
	const startTime = Date.now();

	await job.log(`🏷️  Chat classification started for session ${sessionId}`);

	try {
		// Convert ProcessingJob to type-safe legacy format
		const legacyJob = createLegacyJob(job);

		// Process chat classification
		const result = await processChatClassificationJob(legacyJob);

		const duration = Date.now() - startTime;
		await job.log(`✅ Chat classification completed in ${duration}ms`);

		return result;
	} catch (error) {
		await job.log(`❌ Chat classification failed: ${getErrorMessage(error)}`);
		throw error;
	}
}

/**
 * Braindump processing processor
 * Generates titles, topics, and summaries from captured context
 */
async function processBraindumpProcessing(job: ProcessingJob<BraindumpProcessingJobData>) {
	const { braindumpId } = job.data;
	const startTime = Date.now();

	await job.log(`🧠 Captured context processing started for ${braindumpId}`);

	try {
		// Convert ProcessingJob to type-safe legacy format
		const legacyJob = createLegacyJob(job);

		// Process captured context
		const result = await processBraindumpProcessingJob(legacyJob);

		const duration = Date.now() - startTime;
		await job.log(`✅ Braindump processing completed in ${duration}ms`);

		return result;
	} catch (error) {
		await job.log(`❌ Braindump processing failed: ${getErrorMessage(error)}`);
		throw error;
	}
}

/**
 * Voice note transcription processor (background for long recordings)
 */
async function processVoiceNoteTranscription(
	job: ProcessingJob<VoiceNoteTranscriptionJobMetadata>
) {
	const { voiceNoteId } = job.data;

	await job.log(`🎙️ Voice note transcription started for ${voiceNoteId}`);

	try {
		const legacyJob = createLegacyJob(job);
		const result = await processVoiceNoteTranscriptionJob(legacyJob);
		await job.log('✅ Voice note transcription completed');
		return result;
	} catch (error) {
		await job.log(`❌ Voice note transcription failed: ${getErrorMessage(error)}`);
		throw error;
	}
}

/**
 * Ontology asset OCR processor
 */
async function processAssetOcr(job: ProcessingJob<AssetOcrJobMetadata>) {
	await job.log('Ontology asset OCR job received');
	try {
		const legacyJob = createLegacyJob<AssetOcrJobMetadata>(job);
		const result = await processAssetOcrJob(legacyJob);
		await job.log('Ontology asset OCR job completed');
		return result;
	} catch (error) {
		await job.log(`Ontology asset OCR job failed: ${getErrorMessage(error)}`);
		throw error;
	}
}

/**
 * Homework (long-running task) processor
 */
async function processHomework(job: ProcessingJob<HomeworkJobMetadata>) {
	await job.log('Homework job received');

	try {
		const result = await processHomeworkJob(job);
		await job.log('Homework job completed');
		return result;
	} catch (error) {
		await job.log(`Homework job failed: ${getErrorMessage(error)}`);
		throw error;
	}
}

/**
 * Tree Agent orchestration processor
 */
async function processTreeAgent(job: ProcessingJob<TreeAgentJobMetadata>) {
	await job.log('Tree Agent job received');

	try {
		const result = await processTreeAgentJob(job);
		await job.log('Tree Agent job completed');
		return result;
	} catch (error) {
		await job.log(`Tree Agent job failed: ${getErrorMessage(error)}`);
		throw error;
	}
}

/**
 * Project context snapshot processor
 */
async function processProjectContextSnapshot(
	job: ProcessingJob<ProjectContextSnapshotJobMetadata>
) {
	await job.log('Project context snapshot job received');

	try {
		const result = await processProjectContextSnapshotJob(job);
		await job.log('Project context snapshot job completed');
		return result;
	} catch (error) {
		await job.log(`Project context snapshot job failed: ${getErrorMessage(error)}`);
		throw error;
	}
}

/**
 * Project icon generation processor
 */
async function processProjectIcon(job: ProcessingJob<ProjectIconGenerationJobMetadata>) {
	await job.log('Project icon generation job received');

	try {
		const result = await processProjectIconJob(job);
		await job.log('Project icon generation job completed');
		return result;
	} catch (error) {
		await job.log(`Project icon generation job failed: ${getErrorMessage(error)}`);
		throw error;
	}
}

/**
 * Calendar sync projection processor
 */
async function processCalendarSync(job: ProcessingJob) {
	await job.log('Calendar sync job received');

	try {
		const result = await processCalendarSyncJob(job);
		await job.log('Calendar sync job completed');
		return result;
	} catch (error) {
		await job.log(`Calendar sync job failed: ${getErrorMessage(error)}`);
		throw error;
	}
}

/**
 * Start the Supabase-based worker
 */
export async function startWorker() {
	console.log('🚀 Starting worker...');

	// Register processors
	queue.process('generate_daily_brief', processBrief);
	queue.process('onboarding_analysis', processOnboarding);

	// Register notification processor (multi-channel: push, email, in-app, SMS)
	queue.process('send_notification', processNotificationWrapper);
	queue.process('project_activity_batch_flush', processProjectActivityBatchFlush);

	// Register SMS processors
	queue.process('schedule_daily_sms', processScheduleDailySMS); // Daily calendar event SMS scheduling
	queue.process('send_sms', processSMS); // Send individual SMS (will fail gracefully if Twilio not configured)

	// Register chat session classification processor
	queue.process('classify_chat_session', processChatClassification);

	// Register ontology capture processing processor
	queue.process('process_onto_braindump', processBraindumpProcessing);

	// Register voice note transcription processor
	queue.process('transcribe_voice_note', processVoiceNoteTranscription);

	// Register ontology asset OCR processor
	queue.process('extract_onto_asset_ocr', processAssetOcr);

	// Register homework (long-running task) processor
	queue.process('buildos_homework', processHomework);

	// Register Tree Agent processor
	queue.process('buildos_tree_agent', processTreeAgent);

	// Register project context snapshot processor
	queue.process('build_project_context_snapshot', processProjectContextSnapshot);

	// Register project icon generation processor
	queue.process('generate_project_icon', processProjectIcon);

	// Register calendar sync projection processor
	queue.process('sync_calendar', processCalendarSync);

	// Check if Twilio is configured
	const twilioEnabled = !!(
		process.env.PRIVATE_TWILIO_ACCOUNT_SID &&
		process.env.PRIVATE_TWILIO_AUTH_TOKEN &&
		process.env.PRIVATE_TWILIO_MESSAGING_SERVICE_SID
	);

	if (!twilioEnabled) {
		console.warn('⚠️  SMS functionality disabled - Twilio credentials not configured');
	}

	// Run queue cleanup on startup to cancel stale jobs and enforce retention
	try {
		console.log('🧹 Running startup cleanup check...');
		const cleanupResult = await cleanupStaleJobs({
			staleThresholdHours: config.staleJobThresholdHours,
			oldFailedJobsDays: config.oldFailedJobsDays,
			completedJobsRetentionDays: config.completedJobsRetentionDays,
			maxDeletionBatchSize: config.cleanupBatchSize,
			dryRun: false
		});

		if (cleanupResult.staleCancelled > 0) {
			console.log(`✅ Cancelled ${cleanupResult.staleCancelled} stale job(s) on startup`);
		}
		if (cleanupResult.completedDeleted > 0) {
			console.log(`✅ Deleted ${cleanupResult.completedDeleted} completed job(s) on startup`);
		}
		if (cleanupResult.errors.length > 0) {
			console.warn('⚠️  Cleanup had errors:', cleanupResult.errors);
		}
	} catch (error) {
		console.error('❌ Startup cleanup failed:', getErrorMessage(error));
		// Continue startup even if cleanup fails - don't block the worker
	}

	// Start processing
	await queue.start();

	// Log queue stats based on configuration
	if (config.enableHealthChecks) {
		setInterval(async () => {
			const stats = await queue.getStats();
			if (stats && stats.length > 0) {
				console.log('📊 Queue Statistics:');
				stats.forEach((stat) => {
					console.log(
						`   ${String(stat.job_type)} - ${String(stat.status)}: ${String(stat.count)}`
					);
				});
			}
		}, config.statsUpdateInterval);

		console.log(`📈 Health monitoring enabled (stats every ${config.statsUpdateInterval}ms)`);
	}

	// Handle graceful shutdown
	process.on('SIGTERM', () => {
		console.log('📛 SIGTERM received, stopping worker...');
		queue.stop();
		process.exit(0);
	});

	process.on('SIGINT', () => {
		console.log('📛 SIGINT received, stopping worker...');
		queue.stop();
		process.exit(0);
	});

	console.log('✅ Worker started successfully');

	// List enabled job types
	const jobTypes = [
		'generate_daily_brief',
		'onboarding_analysis',
		'send_notification',
		'sync_calendar',
		'project_activity_batch_flush',
		'classify_chat_session',
		'process_onto_braindump',
		'buildos_tree_agent'
	];

	jobTypes.push('generate_project_icon');

	if (twilioEnabled) {
		jobTypes.push('send_sms');
	}

	console.log(`📋 Processing job types: ${jobTypes.join(', ')}`);

	return queue;
}

// Export queue instance for use in other modules
export { queue };
