// apps/worker/src/index.ts
// Load .env before any other import evaluates — static imports are hoisted, so
// module-level env reads (e.g. config/projectLoops.ts) run before this module's
// body. A plain dotenv.config() call in the body is too late for those flags.
import 'dotenv/config';
import cors from 'cors';
import type { Json, QueueJobStatus, QueueJobType } from '@buildos/shared-types';
import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import express from 'express';

import { supabase } from './lib/supabase';
import { logWorkerError } from './lib/errorLogger';
import { shutdownPostHog } from './lib/posthog';
import { isWorkerAuthorized } from './http/auth';
import { getErrorMessage } from './http/errors';
import { getSafeTimezone } from './http/timezone';
import { jsonParseErrorHandler } from './middleware/jsonError';
import { registerEmailTrackingRoute } from './routes/email-tracking';
import smsScheduledRoutes from './routes/sms/scheduled';
import { startScheduler } from './scheduler';
import { queueConfig } from './config/queueConfig';
import { queue, shutdownWorker, startWorker } from './worker';
import type { Server } from 'node:http';
import { classifyOntologyEntity } from './workers/ontology/ontologyClassifier';
import { getFutureNotificationScheduledFor } from './workers/brief/briefNotificationSchedule';

// Log email configuration at startup
console.log('🚀 Application starting...');
console.log('📧 Email Configuration:');
console.log(
	`   → USE_WEBHOOK_EMAIL: "${process.env.USE_WEBHOOK_EMAIL}" (type: ${typeof process.env.USE_WEBHOOK_EMAIL})`
);
console.log(`   → Is webhook enabled: ${process.env.USE_WEBHOOK_EMAIL === 'true' ? 'YES' : 'NO'}`);
console.log(`   → Webhook URL configured: ${process.env.BUILDOS_WEBHOOK_URL ? 'YES' : 'NO'}`);
console.log(`   → SMTP configured: ${process.env.SMTP_HOST ? 'YES' : 'NO'}`);

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// HTTP server handle, assigned in start(); used by graceful shutdown.
let server: Server | null = null;

// Define allowed origins
const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
const allowedOrigins = [
	...(isDevelopment
		? [
				'http://localhost:5173',
				'http://localhost:3000',
				'http://localhost:4173',
				'https://localhost:5173'
			]
		: []),
	'https://build-os.com'
].filter(Boolean);

app.use(
	cors({
		origin: function (origin, callback) {
			// Allow requests with no origin (e.g., mobile apps, curl)
			if (!origin) return callback(null, true);
			if (allowedOrigins.includes(origin)) {
				return callback(null, true);
			} else {
				return callback(new Error('Not allowed by CORS'));
			}
		},
		credentials: true
	})
);

app.use(express.json());
app.use(jsonParseErrorHandler);

registerEmailTrackingRoute(app);

const publicWorkerPaths = new Set(['/health']);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function withoutUndefinedValues(record: Record<string, unknown>): Record<string, unknown> {
	return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}

function mergeQueueMetadata(
	existingMetadata: unknown,
	requestMetadata: Record<string, unknown>
): Json {
	const existing = isRecord(existingMetadata) ? existingMetadata : {};
	const existingOptions = isRecord(existing.options) ? existing.options : {};
	const requestOptions = isRecord(requestMetadata.options) ? requestMetadata.options : {};

	// Strip undefined-valued keys so a request that computed no value (e.g. no
	// future notificationScheduledFor) cannot erase what the scheduler already
	// stored on the pending job it dedup-hit.
	return {
		...existing,
		...withoutUndefinedValues(requestMetadata),
		options: {
			...existingOptions,
			...withoutUndefinedValues(requestOptions)
		}
	} as Json;
}

app.use((req, res, next) => {
	if (req.path.startsWith('/api/email-tracking') || publicWorkerPaths.has(req.path)) {
		return next();
	}

	if (!isWorkerAuthorized(req.headers.authorization)) {
		return res.status(401).json({ error: 'Unauthorized' });
	}

	return next();
});

// Register SMS management routes
app.use('/sms/scheduled', smsScheduledRoutes);

// Health check endpoint — reflects queue liveness, not just Express liveness.
// Railway restarts the process on repeated 503s, which is exactly what we
// want when the claim loop is wedged or DB credentials have died.
app.get('/health', (_req, res) => {
	const queueHealth = queue.getHealth();
	res.status(queueHealth.healthy ? 200 : 503).json({
		status: queueHealth.healthy ? 'healthy' : 'unhealthy',
		timestamp: new Date().toISOString(),
		service: 'daily-brief-worker',
		queue: queueHealth
	});
});

// Immediate ontology classification (fire-and-forget caller)
app.post('/classify/ontology', async (req, res) => {
	try {
		if (!isWorkerAuthorized(req.headers.authorization)) {
			return res.status(401).json({ error: 'Unauthorized' });
		}

		const { entityType, entityId, userId, classificationSource } = req.body || {};

		if (!entityType || !entityId || !userId || !classificationSource) {
			return res.status(400).json({
				error: 'entityType, entityId, userId, and classificationSource are required'
			});
		}

		if (classificationSource !== 'create_modal') {
			return res.status(400).json({
				error: 'Invalid classificationSource'
			});
		}

		const validTypes = new Set(['task', 'plan', 'goal', 'risk', 'milestone', 'document']);

		if (!validTypes.has(entityType)) {
			return res.status(400).json({ error: 'Invalid entityType' });
		}

		const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
		if (!uuidRegex.test(entityId) || !uuidRegex.test(userId)) {
			return res.status(400).json({ error: 'Invalid entityId or userId format' });
		}

		await classifyOntologyEntity({
			entityType,
			entityId,
			userId,
			classificationSource
		});

		return res.status(202).json({ success: true });
	} catch (error) {
		console.error('[Ontology Classification] Failed:', error);
		await logWorkerError(error, {
			userId: req.body?.userId,
			endpoint: '/classify/ontology',
			httpMethod: 'POST',
			operationType: 'ontology_classification',
			errorType: 'api_error',
			severity: 'error',
			metadata: {
				entityType: req.body?.entityType,
				entityId: req.body?.entityId,
				classificationSource: req.body?.classificationSource
			}
		});
		return res.status(500).json({
			error: 'Failed to classify ontology entity',
			message: getErrorMessage(error)
		});
	}
});

// Queue brief endpoint
app.post('/queue/brief', async (req, res) => {
	try {
		const {
			userId,
			scheduledFor,
			briefDate: requestedBriefDate,
			timezone: requestedTimezone,
			forceImmediate,
			forceRegenerate,
			options: requestOptions // Options from frontend (includes useOntology)
		} = req.body;
		const shouldForceImmediate = forceImmediate === true;
		const shouldForceRegenerate = forceRegenerate === true;

		if (!userId) {
			return res.status(400).json({ error: 'userId is required' });
		}

		const normalizedRequestedBriefDate =
			typeof requestedBriefDate === 'string' && requestedBriefDate.trim().length > 0
				? requestedBriefDate.trim()
				: undefined;

		if (
			normalizedRequestedBriefDate &&
			!/^\d{4}-\d{2}-\d{2}$/.test(normalizedRequestedBriefDate)
		) {
			return res.status(400).json({ error: 'briefDate must use YYYY-MM-DD format' });
		}

		// Validate user exists and get timezone from centralized location
		const { data: user, error: userError } = await supabase
			.from('users')
			.select('id, timezone')
			.eq('id', userId)
			.single();

		if (userError || !user) {
			return res.status(404).json({ error: 'User not found' });
		}

		// Resolve and validate timezone (fallback to UTC if invalid)
		const rawTimezone = requestedTimezone || user.timezone || 'UTC';
		const timezone = getSafeTimezone(rawTimezone, userId);

		// Handle force regenerate
		if (shouldForceRegenerate) {
			// Use consistent timezone (from preferences or requested)
			const targetBriefDate =
				normalizedRequestedBriefDate ||
				format(toZonedTime(new Date(), timezone), 'yyyy-MM-dd');

			// Atomically cancel existing jobs for this date
			const { count } = await queue.cancelBriefJobsForDate(userId, targetBriefDate);
			if (count > 0) {
				console.log(
					`🚫 Force regenerate: Cancelled ${count} existing brief job(s) for ${targetBriefDate} (timezone: ${timezone})`
				);
			}
		}

		// Determine when to schedule the job
		let scheduleTime: Date;
		if (shouldForceImmediate || shouldForceRegenerate) {
			scheduleTime = new Date(); // Now
		} else if (scheduledFor) {
			scheduleTime = new Date(scheduledFor);
		} else {
			scheduleTime = new Date(); // Default to now
		}

		if (Number.isNaN(scheduleTime.getTime())) {
			return res.status(400).json({
				error: 'scheduledFor must be a valid date string or timestamp'
			});
		}

		// Calculate brief date
		const zonedDate = toZonedTime(scheduleTime, timezone);
		const briefDate = normalizedRequestedBriefDate || format(zonedDate, 'yyyy-MM-dd');

		let notificationScheduledFor: Date | undefined;
		let suppressNotification = false;
		if (shouldForceImmediate && !shouldForceRegenerate) {
			const { data: briefPreference, error: briefPreferenceError } = await supabase
				.from('user_brief_preferences')
				.select('time_of_day, is_active')
				.eq('user_id', userId)
				.maybeSingle();

			if (briefPreferenceError && briefPreferenceError.code !== 'PGRST116') {
				console.warn(
					`Failed to fetch brief preferences for user ${userId}: ${briefPreferenceError.message}`
				);
			} else if (briefPreference) {
				// Users who turned daily briefs off (is_active=false) may still generate
				// implicitly on app open, but must not receive brief notifications —
				// unset notificationScheduledFor would otherwise mean "notify now".
				suppressNotification = briefPreference.is_active === false;
				notificationScheduledFor = getFutureNotificationScheduledFor({
					briefDate,
					timeOfDay: briefPreference.time_of_day,
					timezone,
					isActive: briefPreference.is_active
				});
			}
		}

		const jobData = {
			briefDate,
			timezone,
			notificationScheduledFor: notificationScheduledFor?.toISOString(),
			options: {
				forceRegenerate: shouldForceRegenerate,
				requestedBriefDate: normalizedRequestedBriefDate,
				useOntology: requestOptions?.useOntology ?? true, // Default to ontology-based briefs
				includeProjects: requestOptions?.includeProjects,
				excludeProjects: requestOptions?.excludeProjects,
				suppressNotification: suppressNotification || undefined
			}
		};

		// Queue the job using Supabase queue
		let job = await queue.add('generate_daily_brief', userId, jobData, {
			priority: shouldForceImmediate ? 1 : 10,
			scheduledFor: scheduleTime,
			dedupKey: shouldForceRegenerate
				? `brief-${userId}-${briefDate}-${Date.now()}`
				: `brief-${userId}-${briefDate}`
		});

		if (
			shouldForceImmediate &&
			!shouldForceRegenerate &&
			job.status === 'pending' &&
			new Date(job.scheduled_for).getTime() > Date.now() + 1000
		) {
			const promotedAt = new Date();
			const { data: promotedJob, error: promoteError } = await supabase
				.from('queue_jobs')
				.update({
					scheduled_for: promotedAt.toISOString(),
					priority: 1,
					metadata: mergeQueueMetadata(job.metadata, jobData),
					updated_at: promotedAt.toISOString()
				})
				.eq('id', job.id)
				.eq('status', 'pending')
				.select('*')
				.single();

			if (promoteError) {
				console.warn(
					`Failed to promote deduped brief job ${job.queue_job_id}: ${promoteError.message}`
				);
			} else if (promotedJob) {
				job = promotedJob;
				console.log(`⚡ Promoted deduped brief job ${job.queue_job_id} to run now`);
			}
		}

		console.log(`📝 API: Queued brief for user ${userId}, job ${job.queue_job_id}`);

		return res.json({
			success: true,
			jobId: job.queue_job_id,
			scheduledFor: new Date(job.scheduled_for).toISOString(),
			briefDate
		});
	} catch (error) {
		console.error('Error queueing brief:', error);
		await logWorkerError(error, {
			userId: req.body?.userId,
			endpoint: '/queue/brief',
			httpMethod: 'POST',
			operationType: 'queue_brief',
			errorType: 'api_error',
			severity: 'error',
			metadata: {
				scheduledFor: req.body?.scheduledFor,
				briefDate: req.body?.briefDate,
				forceImmediate: req.body?.forceImmediate === true,
				forceRegenerate: req.body?.forceRegenerate === true
			}
		});
		return res.status(500).json({
			error: 'Failed to queue brief generation',
			message: getErrorMessage(error)
		});
	}
});

// Queue onboarding analysis endpoint
app.post('/queue/onboarding', async (req, res) => {
	try {
		const { userId, userContext, options } = req.body;
		const forceRegenerate = options?.forceRegenerate === true;

		if (!userId) {
			return res.status(400).json({ error: 'userId is required' });
		}

		// Check for existing jobs unless forcing regenerate
		if (!forceRegenerate) {
			const { data: existingJobs } = await supabase
				.from('queue_jobs')
				.select('queue_job_id')
				.eq('user_id', userId)
				.eq('job_type', 'onboarding_analysis')
				.in('status', ['pending', 'processing'])
				.order('created_at', { ascending: false })
				.limit(1);

			if (existingJobs && existingJobs.length > 0) {
				return res.status(409).json({
					error: 'Onboarding analysis already in progress',
					existingJobId: existingJobs[0].queue_job_id
				});
			}
		}

		// Queue the job
		const job = await queue.add(
			'onboarding_analysis',
			userId,
			{
				userId,
				userContext: userContext ?? {},
				options
			},
			{
				priority: 1, // High priority for onboarding
				dedupKey: forceRegenerate
					? `onboarding-analysis-${userId}-${Date.now()}`
					: `onboarding-analysis-${userId}`
			}
		);

		return res.json({
			success: true,
			jobId: job.queue_job_id
		});
	} catch (error) {
		console.error('Error queueing onboarding analysis:', error);
		await logWorkerError(error, {
			userId: req.body?.userId,
			endpoint: '/queue/onboarding',
			httpMethod: 'POST',
			operationType: 'queue_onboarding_analysis',
			errorType: 'api_error',
			severity: 'error',
			metadata: {
				forceRegenerate: req.body?.options?.forceRegenerate ?? false
			}
		});
		return res.status(500).json({
			error: 'Failed to queue onboarding analysis',
			message: getErrorMessage(error)
		});
	}
});

// Queue chat session classification endpoint
app.post('/queue/chat/classify', async (req, res) => {
	try {
		const { sessionId, userId } = req.body;

		if (!sessionId || !userId) {
			return res.status(400).json({
				error: 'sessionId and userId are required'
			});
		}

		// Validate UUID format
		const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
		if (!uuidRegex.test(sessionId) || !uuidRegex.test(userId)) {
			return res.status(400).json({
				error: 'sessionId and userId must be valid UUIDs'
			});
		}

		// Check for existing classification jobs for this session
		const { data: existingJobs } = await supabase
			.from('queue_jobs')
			.select('*')
			.eq('user_id', userId)
			.eq('job_type', 'classify_chat_session')
			.eq('metadata->>sessionId', sessionId)
			.in('status', ['pending', 'processing']);

		if (existingJobs && existingJobs.length > 0) {
			return res.status(409).json({
				error: 'Classification already in progress for this session',
				existingJobId: existingJobs[0].queue_job_id
			});
		}

		// Queue the job with low priority (background task)
		const job = await queue.add(
			'classify_chat_session',
			userId,
			{
				sessionId,
				userId
			},
			{
				priority: 8, // Low priority - this is a background cleanup task
				dedupKey: `classify-session-${sessionId}` // Prevent duplicate jobs
			}
		);

		console.log(
			`🏷️  API: Queued chat classification for session ${sessionId}, job ${job.queue_job_id}`
		);

		return res.json({
			success: true,
			jobId: job.queue_job_id,
			sessionId,
			message: 'Chat session classification queued'
		});
	} catch (error) {
		console.error('Error queueing chat classification:', error);
		await logWorkerError(error, {
			userId: req.body?.userId,
			endpoint: '/queue/chat/classify',
			httpMethod: 'POST',
			operationType: 'queue_chat_classification',
			errorType: 'api_error',
			severity: 'error',
			metadata: {
				sessionId: req.body?.sessionId
			}
		});
		return res.status(500).json({
			error: 'Failed to queue chat classification',
			message: getErrorMessage(error)
		});
	}
});

// Queue ontology capture processing endpoint.
app.post('/queue/braindump/process', async (req, res) => {
	try {
		const { braindumpId, userId } = req.body;

		if (!braindumpId || !userId) {
			return res.status(400).json({
				error: 'braindumpId and userId are required'
			});
		}

		// Validate UUID format
		const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
		if (!uuidRegex.test(braindumpId) || !uuidRegex.test(userId)) {
			return res.status(400).json({
				error: 'braindumpId and userId must be valid UUIDs'
			});
		}

		// Check for existing processing jobs for this captured context record.
		const { data: existingJobs } = await supabase
			.from('queue_jobs')
			.select('*')
			.eq('user_id', userId)
			.eq('job_type', 'process_onto_braindump')
			.eq('metadata->>braindumpId', braindumpId)
			.in('status', ['pending', 'processing']);

		if (existingJobs && existingJobs.length > 0) {
			return res.status(409).json({
				error: 'Processing already in progress for this captured context',
				existingJobId: existingJobs[0].queue_job_id
			});
		}

		// Queue the job with low priority (background task)
		const job = await queue.add(
			'process_onto_braindump',
			userId,
			{
				braindumpId,
				userId
			},
			{
				priority: 7, // Low priority - this is a background processing task
				dedupKey: `process-onto-braindump-${braindumpId}` // Prevent duplicate jobs
			}
		);

		console.log(
			`🧠 API: Queued captured context processing for ${braindumpId}, job ${job.queue_job_id}`
		);

		return res.json({
			success: true,
			jobId: job.queue_job_id,
			braindumpId,
			message: 'Braindump processing queued'
		});
	} catch (error) {
		console.error('Error queueing captured context processing:', error);
		await logWorkerError(error, {
			userId: req.body?.userId,
			endpoint: '/queue/braindump/process',
			httpMethod: 'POST',
			operationType: 'queue_onto_capture_processing',
			errorType: 'api_error',
			severity: 'error',
			metadata: {
				braindumpId: req.body?.braindumpId
			}
		});
		return res.status(500).json({
			error: 'Failed to queue captured context processing',
			message: getErrorMessage(error)
		});
	}
});

// Get job status endpoint
app.get('/jobs/:jobId', async (req, res) => {
	try {
		const { jobId } = req.params;

		const job = await queue.getJob(jobId);

		if (!job) {
			return res.status(404).json({ error: 'Job not found' });
		}

		return res.json(job);
	} catch (error) {
		console.error('Error fetching job:', error);
		await logWorkerError(error, {
			endpoint: '/jobs/:jobId',
			httpMethod: 'GET',
			operationType: 'queue_job_lookup',
			errorType: 'api_error',
			severity: 'error',
			metadata: {
				jobId: req.params?.jobId
			}
		});
		return res.status(500).json({
			error: 'Failed to fetch job',
			message: getErrorMessage(error)
		});
	}
});

// Get user jobs endpoint
app.get('/users/:userId/jobs', async (req, res) => {
	try {
		const { userId } = req.params;
		const { type, status, limit } = req.query;
		const jobType = typeof type === 'string' ? (type as QueueJobType) : undefined;
		const jobStatus = typeof status === 'string' ? (status as QueueJobStatus) : undefined;

		const jobs = await queue.getUserJobs(userId, {
			jobType,
			status: jobStatus,
			limit: limit ? parseInt(limit as string) : 10
		});

		res.json({
			jobs
		});
	} catch (error) {
		console.error('Error fetching user jobs:', error);
		await logWorkerError(error, {
			userId: req.params?.userId,
			endpoint: '/users/:userId/jobs',
			httpMethod: 'GET',
			operationType: 'queue_user_jobs_lookup',
			errorType: 'api_error',
			severity: 'error',
			metadata: {
				type: req.query?.type,
				status: req.query?.status,
				limit: req.query?.limit
			}
		});
		res.status(500).json({
			error: 'Failed to fetch user jobs',
			message: getErrorMessage(error)
		});
	}
});

// Queue stats endpoint
app.get('/queue/stats', async (_req, res) => {
	try {
		const stats = await queue.getStats();
		res.json({ stats });
	} catch (error) {
		console.error('Error fetching queue stats:', error);
		await logWorkerError(error, {
			endpoint: '/queue/stats',
			httpMethod: 'GET',
			operationType: 'queue_stats_lookup',
			errorType: 'api_error',
			severity: 'error'
		});
		res.status(500).json({
			error: 'Failed to fetch queue stats',
			message: getErrorMessage(error)
		});
	}
});

// Stale jobs stats endpoint
app.get('/queue/stale-stats', async (req, res) => {
	try {
		const { getStaleJobStats } = await import('./lib/utils/queueCleanup.js');

		const thresholdHours = parseInt((req.query.thresholdHours as string) || '24');
		const completedRetentionDays = parseInt(
			(req.query.completedRetentionDays as string) || '30'
		);
		const stats = await getStaleJobStats({
			staleThresholdHours: thresholdHours,
			completedJobsRetentionDays: completedRetentionDays
		});

		res.json({
			thresholdHours,
			completedRetentionDays,
			...stats,
			message:
				stats.staleCount > 0 || stats.oldCompletedCount > 0
					? `Found ${stats.staleCount} stale and ${stats.oldCompletedCount} old completed job(s) eligible for cleanup`
					: 'No stale or old completed jobs found'
		});
	} catch (error) {
		console.error('Error fetching stale job stats:', error);
		await logWorkerError(error, {
			endpoint: '/queue/stale-stats',
			httpMethod: 'GET',
			operationType: 'queue_stale_stats_lookup',
			errorType: 'api_error',
			severity: 'error',
			metadata: {
				thresholdHours: req.query?.thresholdHours,
				completedRetentionDays: req.query?.completedRetentionDays
			}
		});
		res.status(500).json({
			error: 'Failed to fetch stale job stats',
			message: getErrorMessage(error)
		});
	}
});

// Manual cleanup endpoint
app.post('/queue/cleanup', async (req, res) => {
	try {
		const { cleanupStaleJobs } = await import('./lib/utils/queueCleanup.js');

		const {
			staleThresholdHours = queueConfig.staleJobThresholdHours,
			oldFailedJobsDays = queueConfig.oldFailedJobsDays,
			completedJobsRetentionDays = queueConfig.completedJobsRetentionDays,
			maxDeletionBatchSize = queueConfig.cleanupBatchSize,
			dryRun = false
		} = req.body;

		console.log(
			`🧹 Manual cleanup triggered (dryRun: ${dryRun}, threshold: ${staleThresholdHours}h, oldFailed: ${oldFailedJobsDays}d, completedRetention: ${completedJobsRetentionDays}d, batchSize: ${maxDeletionBatchSize})`
		);

		const result = await cleanupStaleJobs({
			staleThresholdHours,
			oldFailedJobsDays,
			completedJobsRetentionDays,
			maxDeletionBatchSize,
			dryRun
		});

		res.json({
			success: true,
			...result,
			message: dryRun
				? `Dry run completed - would cancel ${result.staleCancelled} stale job(s), archive ${result.oldFailedCancelled} old failed job(s), and delete ${result.completedDeleted} completed job(s)`
				: `Cleanup completed - cancelled ${result.staleCancelled} stale job(s), archived ${result.oldFailedCancelled} old failed job(s), and deleted ${result.completedDeleted} completed job(s)`
		});
	} catch (error) {
		console.error('Error during manual cleanup:', error);
		await logWorkerError(error, {
			endpoint: '/queue/cleanup',
			httpMethod: 'POST',
			operationType: 'manual_cleanup',
			errorType: 'api_error',
			severity: 'error',
			metadata: {
				dryRun: req.body?.dryRun ?? false
			}
		});
		res.status(500).json({
			error: 'Failed to run cleanup',
			message: getErrorMessage(error)
		});
	}
});

// Start the server
async function start() {
	try {
		// Add global error handlers FIRST to prevent process crashes.
		// Give the queue a short, bounded drain before exiting — the old
		// fire-and-forget `void queue.stop(); process.exit(1)` killed every
		// in-flight job mid-write, silently charging each one a retry attempt.
		const crashExit = async (label: string) => {
			try {
				const timer = new Promise((resolve) => setTimeout(resolve, 5000));
				await Promise.race([queue.stop(), timer]);
			} catch (e) {
				console.error(`Failed to stop queue during ${label} shutdown:`, e);
			} finally {
				process.exit(1);
			}
		};

		process.on('uncaughtException', (error) => {
			console.error('🚨 CRITICAL: Uncaught Exception', error);
			console.error('Stack:', error.stack);
			void logWorkerError(error, {
				operationType: 'worker_uncaught_exception',
				severity: 'critical',
				metadata: {
					source: 'process.on'
				}
			}).finally(() => {
				void crashExit('uncaughtException');
			});
		});

		process.on('unhandledRejection', (reason, promise) => {
			console.error('🚨 CRITICAL: Unhandled Rejection');
			console.error('Promise:', promise);
			console.error('Reason:', reason);
			void logWorkerError(reason, {
				operationType: 'worker_unhandled_rejection',
				severity: 'critical',
				metadata: {
					source: 'process.on'
				}
			}).finally(() => {
				void crashExit('unhandledRejection');
			});
		});

		// Start the worker
		await startWorker();

		// Start the scheduler
		startScheduler();

		// Start the API server
		server = app.listen(PORT, '0.0.0.0', () => {
			console.log(`🚀 API server running on port ${PORT}`);
			console.log(`📊 Queue dashboard: http://localhost:${PORT}/queue/stats`);
			console.log(`❤️ Health check: http://localhost:${PORT}/health`);
		});
	} catch (error) {
		console.error('Failed to start server:', error);
		await logWorkerError(error, {
			operationType: 'worker_startup',
			severity: 'critical',
			metadata: {
				phase: 'start'
			}
		});
		process.exit(1);
	}
}

// Handle shutdown gracefully — single orchestrated path.
// Order: stop accepting HTTP → drain in-flight jobs → flush PostHog → exit.
let shuttingDown = false;

async function gracefulShutdown(signal: string): Promise<void> {
	if (shuttingDown) {
		// Second signal while already draining — operator wants out now.
		console.log(`⏩ ${signal} received again, forcing exit`);
		process.exit(0);
	}
	shuttingDown = true;
	console.log(`${signal} received, shutting down gracefully...`);

	// Hard-kill safety net so shutdown can never hang past Railway's SIGKILL
	// grace window (~30s). Unref'd so it never keeps the process alive on its own.
	const hardKill = setTimeout(() => {
		console.error('⛔ Graceful shutdown timed out after 28000ms, forcing exit');
		process.exit(1);
	}, 28000);
	hardKill.unref();

	try {
		// 1. Stop accepting new HTTP requests. Bounded: server.close() waits for
		// ALL connections including idle keep-alive sockets (e.g. Railway health
		// checks), which would otherwise eat the whole drain window and let the
		// 28s hard-kill fire before jobs drain. Close idle sockets explicitly and
		// move on after 2s either way — in-flight requests keep running.
		await new Promise<void>((resolve) => {
			if (!server) return resolve();
			const httpCloseTimeout = setTimeout(() => resolve(), 2000);
			httpCloseTimeout.unref();
			server.closeIdleConnections();
			server.close(() => {
				clearTimeout(httpCloseTimeout);
				resolve();
			});
		});

		// 2. Drain in-flight queue jobs (bounded by QUEUE_DRAIN_TIMEOUT_MS)
		await shutdownWorker();

		// 3. Flush buffered analytics events
		await shutdownPostHog();
	} catch (error) {
		console.error('❌ Error during graceful shutdown:', error);
	} finally {
		clearTimeout(hardKill);
		process.exit(0);
	}
}

process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => void gracefulShutdown('SIGINT'));

// Start the application
start();
