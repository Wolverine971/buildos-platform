// apps/worker/src/config/queueConfig.ts
// Queue configuration management with environment variable support.
//
// Resolution order (highest wins): explicit env var > environment profile
// (production/development defaults) > base default. The exported `queueConfig`
// is THE resolved runtime configuration — every consumer (queue instance,
// stranded sweep, progress tracker, scheduler) must read this same object so
// grace-period math and timeouts can never diverge between components.

import dotenv from 'dotenv';
import { DEFAULT_VAPID_SUBJECT, validateVapidDetails } from './vapid';

// Load environment variables
dotenv.config();

export interface QueueConfiguration {
	// Core queue settings
	pollInterval: number; // How often to check for new jobs (ms)
	batchSize: number; // Max jobs to process concurrently
	stalledTimeout: number; // When to consider jobs stalled (ms)

	// Retry settings
	maxRetries: number; // Default max retry attempts

	// Progress tracking
	enableProgressTracking: boolean;
	progressUpdateRetries: number;

	// Health and monitoring
	statsUpdateInterval: number; // How often to log queue stats (ms)
	enableHealthChecks: boolean;

	// Performance tuning
	workerTimeout: number; // Max time for a single job (ms), unless overridden per type
	workerTimeoutByType: Record<string, number>; // Per-job-type timeout overrides (ms)

	// Queue data retention
	enableRetentionCleanup: boolean; // Enable scheduled retention cleanup
	retentionCleanupCron: string; // Cron expression for scheduled cleanup
	staleJobThresholdHours: number; // Cancel stale pending/retrying jobs older than this
	oldFailedJobsDays: number; // Archive failed jobs older than this (0 disables)
	completedJobsRetentionDays: number; // Delete completed jobs older than this (0 disables)
	cleanupBatchSize: number; // Max rows to delete per cleanup batch
}

/**
 * Parse environment variable as integer; undefined when unset so profile
 * defaults can apply.
 */
function envInt(envVar: string): number | undefined {
	const value = process.env[envVar];
	if (!value) return undefined;

	const parsed = parseInt(value, 10);
	if (isNaN(parsed)) {
		console.warn(`⚠️ Invalid integer value for ${envVar}: "${value}", ignoring`);
		return undefined;
	}

	return parsed;
}

/**
 * Parse environment variable as boolean; undefined when unset.
 */
function envBool(envVar: string): boolean | undefined {
	const value = process.env[envVar];
	if (!value) return undefined;

	const normalizedValue = value.toLowerCase();
	if (normalizedValue === 'true' || normalizedValue === '1') return true;
	if (normalizedValue === 'false' || normalizedValue === '0') return false;

	console.warn(`⚠️ Invalid boolean value for ${envVar}: "${value}", ignoring`);
	return undefined;
}

/**
 * Parse environment variable as string; undefined when unset/blank.
 */
function envString(envVar: string): string | undefined {
	const value = process.env[envVar];
	if (!value) return undefined;

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

// Environment profiles supply per-environment DEFAULTS. Explicit env vars
// always override them (the pre-2026-07-23 merge order was the reverse, which
// made QUEUE_BATCH_SIZE etc. silently dead in production).
export const developmentConfig: Partial<QueueConfiguration> = {
	pollInterval: 2000, // Faster polling in development
	batchSize: 2, // Smaller batches for easier debugging
	stalledTimeout: 120000, // Shorter timeout for faster feedback
	statsUpdateInterval: 30000 // More frequent stats
};

export const productionConfig: Partial<QueueConfiguration> = {
	pollInterval: 5000, // Standard polling
	batchSize: 10, // Larger batches for better throughput
	stalledTimeout: 600000, // Longer timeout for complex jobs
	statsUpdateInterval: 300000 // Less frequent stats (5 minutes)
};

// Built-in per-job-type timeout defaults. agent_run wall-clock budgets go up
// to 20 minutes (MAX_AGENT_RUN_WALL_CLOCK_MS) — the queue wrapper must sit
// ABOVE the domain budget plus cleanup margin, or a legitimate run outlives
// its own claim and a retry can attach while it still executes.
const DEFAULT_WORKER_TIMEOUT_BY_TYPE: Record<string, number> = {
	agent_run: 23 * 60 * 1000 // 20 min max budget + 3 min finalize margin
};

/**
 * Per-type env overrides: QUEUE_WORKER_TIMEOUT_<JOB_TYPE> (job type
 * uppercased), e.g. QUEUE_WORKER_TIMEOUT_AGENT_RUN=1500000.
 */
function loadWorkerTimeoutByType(): Record<string, number> {
	const result: Record<string, number> = { ...DEFAULT_WORKER_TIMEOUT_BY_TYPE };
	const prefix = 'QUEUE_WORKER_TIMEOUT_';
	for (const key of Object.keys(process.env)) {
		if (!key.startsWith(prefix) || key === 'QUEUE_WORKER_TIMEOUT') continue;
		const jobType = key.slice(prefix.length).toLowerCase();
		const parsed = envInt(key);
		if (parsed !== undefined) {
			result[jobType] = parsed;
		}
	}
	return result;
}

/**
 * Validate configuration values and apply constraints
 */
function validateConfig(config: QueueConfiguration): QueueConfiguration {
	const validated = { ...config };

	// Ensure minimum values
	validated.pollInterval = Math.max(1000, validated.pollInterval); // Min 1 second
	validated.batchSize = Math.max(1, Math.min(20, validated.batchSize)); // 1-20 jobs
	validated.stalledTimeout = Math.max(30000, validated.stalledTimeout); // Min 30 seconds
	validated.maxRetries = Math.max(0, Math.min(10, validated.maxRetries)); // 0-10 retries
	validated.statsUpdateInterval = Math.max(10000, validated.statsUpdateInterval); // Min 10 seconds
	validated.workerTimeout = Math.max(10000, validated.workerTimeout); // Min 10 seconds
	validated.workerTimeoutByType = Object.fromEntries(
		Object.entries(validated.workerTimeoutByType).map(([type, timeout]) => [
			type,
			Math.max(10000, timeout)
		])
	);
	validated.staleJobThresholdHours = Math.max(1, validated.staleJobThresholdHours);
	validated.oldFailedJobsDays = Math.max(0, validated.oldFailedJobsDays);
	validated.completedJobsRetentionDays = Math.max(0, validated.completedJobsRetentionDays);
	validated.cleanupBatchSize = Math.max(10, Math.min(5000, validated.cleanupBatchSize));

	return validated;
}

/**
 * Resolve the runtime configuration: env var > profile default > base default.
 */
function loadQueueConfig(): QueueConfiguration {
	const env = (process.env.NODE_ENV || 'development').toLowerCase();

	let profile: Partial<QueueConfiguration> = {};
	if (env === 'production') {
		profile = productionConfig;
		console.log('🏭 Using production queue configuration profile');
	} else if (env === 'development' || env === 'dev') {
		profile = developmentConfig;
		console.log('🔧 Using development queue configuration profile');
	}

	const config: QueueConfiguration = {
		// Core settings
		pollInterval: envInt('QUEUE_POLL_INTERVAL') ?? profile.pollInterval ?? 5000,
		batchSize: envInt('QUEUE_BATCH_SIZE') ?? profile.batchSize ?? 5,
		stalledTimeout: envInt('QUEUE_STALLED_TIMEOUT') ?? profile.stalledTimeout ?? 300000,

		// Retry settings
		maxRetries: envInt('QUEUE_MAX_RETRIES') ?? profile.maxRetries ?? 3,

		// Progress tracking
		enableProgressTracking:
			envBool('QUEUE_ENABLE_PROGRESS_TRACKING') ?? profile.enableProgressTracking ?? true,
		progressUpdateRetries:
			envInt('QUEUE_PROGRESS_UPDATE_RETRIES') ?? profile.progressUpdateRetries ?? 3,

		// Health and monitoring
		statsUpdateInterval:
			envInt('QUEUE_STATS_UPDATE_INTERVAL') ?? profile.statsUpdateInterval ?? 60000,
		enableHealthChecks:
			envBool('QUEUE_ENABLE_HEALTH_CHECKS') ?? profile.enableHealthChecks ?? true,

		// Performance tuning
		workerTimeout: envInt('QUEUE_WORKER_TIMEOUT') ?? profile.workerTimeout ?? 600000, // 10 minutes default
		workerTimeoutByType: loadWorkerTimeoutByType(),

		// Data retention
		enableRetentionCleanup:
			envBool('QUEUE_RETENTION_CLEANUP_ENABLED') ?? profile.enableRetentionCleanup ?? true,
		retentionCleanupCron:
			envString('QUEUE_RETENTION_CLEANUP_CRON') ??
			profile.retentionCleanupCron ??
			'30 3 * * *',
		staleJobThresholdHours:
			envInt('QUEUE_STALE_THRESHOLD_HOURS') ?? profile.staleJobThresholdHours ?? 24,
		oldFailedJobsDays:
			envInt('QUEUE_OLD_FAILED_RETENTION_DAYS') ?? profile.oldFailedJobsDays ?? 0,
		completedJobsRetentionDays:
			envInt('QUEUE_COMPLETED_RETENTION_DAYS') ?? profile.completedJobsRetentionDays ?? 30,
		cleanupBatchSize: envInt('QUEUE_CLEANUP_BATCH_SIZE') ?? profile.cleanupBatchSize ?? 500
	};

	const validated = validateConfig(config);

	console.log('📋 Queue Configuration (resolved):');
	console.log(`   - Poll interval: ${validated.pollInterval}ms`);
	console.log(`   - Batch size: ${validated.batchSize}`);
	console.log(`   - Stalled timeout: ${validated.stalledTimeout}ms`);
	console.log(`   - Max retries: ${validated.maxRetries}`);
	console.log(`   - Worker timeout: ${validated.workerTimeout}ms`);
	console.log(
		`   - Per-type timeouts: ${
			Object.entries(validated.workerTimeoutByType)
				.map(([type, ms]) => `${type}=${ms}ms`)
				.join(', ') || 'none'
		}`
	);
	console.log(
		`   - Retention cleanup: ${validated.enableRetentionCleanup ? 'enabled' : 'disabled'}`
	);
	console.log(`   - Retention cron: ${validated.retentionCleanupCron}`);
	console.log(`   - Stale threshold: ${validated.staleJobThresholdHours}h`);
	console.log(`   - Completed retention: ${validated.completedJobsRetentionDays}d`);
	console.log(`   - Cleanup batch size: ${validated.cleanupBatchSize}`);

	return validated;
}

// THE resolved runtime configuration. Import this everywhere.
export const queueConfig = loadQueueConfig();

/**
 * Worker timeout for a specific job type (per-type override or global default).
 */
export function resolveWorkerTimeout(jobType: string): number {
	return queueConfig.workerTimeoutByType[jobType] ?? queueConfig.workerTimeout;
}

/**
 * Back-compat accessor: returns the same resolved configuration object.
 * (Historically this re-merged profiles over env vars, which silently ignored
 * env overrides in production.)
 */
export function getEnvironmentConfig(): QueueConfiguration {
	return queueConfig;
}

/**
 * Validate that required environment variables are set
 */
export function validateEnvironment(): { valid: boolean; errors: string[] } {
	const errors: string[] = [];

	// Check required environment variables
	const requiredVars = [
		'PUBLIC_SUPABASE_URL',
		'PRIVATE_SUPABASE_SERVICE_KEY',
		'PRIVATE_OPENROUTER_API_KEY', // Required for LLM analysis in briefs
		'PRIVATE_RAILWAY_WORKER_TOKEN' // Required for authenticated worker API calls
	];

	for (const varName of requiredVars) {
		if (!process.env[varName]) {
			errors.push(`Missing required environment variable: ${varName}`);
		}
	}

	// Validate PUBLIC_APP_URL (used for email/SMS tracking links)
	const appUrl = (process.env.PUBLIC_APP_URL || 'https://build-os.com').trim();
	try {
		new URL(appUrl);
	} catch {
		errors.push(
			`PUBLIC_APP_URL is invalid: "${appUrl}". Must be a valid URL (defaults to https://build-os.com)`
		);
	}

	// Conditional validation: if webhook email is enabled, webhook secret is required
	if (process.env.USE_WEBHOOK_EMAIL === 'true') {
		if (!process.env.BUILDOS_WEBHOOK_URL) {
			errors.push('BUILDOS_WEBHOOK_URL is required when USE_WEBHOOK_EMAIL=true');
		}
		if (!process.env.PRIVATE_BUILDOS_WEBHOOK_SECRET) {
			errors.push('PRIVATE_BUILDOS_WEBHOOK_SECRET is required when USE_WEBHOOK_EMAIL=true');
		}
	}

	// Conditional validation: Twilio credentials must be all-or-nothing
	const twilioVars = [
		'PRIVATE_TWILIO_ACCOUNT_SID',
		'PRIVATE_TWILIO_AUTH_TOKEN',
		'PRIVATE_TWILIO_MESSAGING_SERVICE_SID'
	];
	const twilioConfigured = twilioVars.filter((v) => process.env[v]).length;
	if (twilioConfigured > 0 && twilioConfigured < 3) {
		errors.push(
			`Partial Twilio configuration: ${twilioConfigured}/3 credentials set. All three are required (ACCOUNT_SID, AUTH_TOKEN, MESSAGING_SERVICE_SID)`
		);
	}

	// Conditional validation: VAPID keys for push notifications (warn if both not set)
	const vapidPublic = process.env.VAPID_PUBLIC_KEY;
	const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
	errors.push(
		...validateVapidDetails(
			vapidPublic,
			vapidPrivate,
			process.env.VAPID_SUBJECT || DEFAULT_VAPID_SUBJECT
		)
	);

	// Check for common configuration mistakes
	if (queueConfig.pollInterval < 1000) {
		errors.push(
			'QUEUE_POLL_INTERVAL should be at least 1000ms to avoid overwhelming the database'
		);
	}

	if (queueConfig.batchSize > 20) {
		errors.push('QUEUE_BATCH_SIZE should be 20 or less to prevent resource exhaustion');
	}

	return {
		valid: errors.length === 0,
		errors
	};
}
