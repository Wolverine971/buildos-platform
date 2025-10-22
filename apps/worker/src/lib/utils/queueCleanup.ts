// apps/worker/src/lib/utils/queueCleanup.ts
import { supabase } from '../supabase';
import type { QueueJobType } from '@buildos/shared-types';

export interface CleanupOptions {
	/**
	 * Cancel pending/retrying jobs scheduled more than this many hours ago
	 * Default: 24 hours
	 */
	staleThresholdHours?: number;

	/**
	 * Clean up old failed jobs older than this many days
	 * Default: 7 days (set to 0 to disable)
	 */
	oldFailedJobsDays?: number;

	/**
	 * Job types to clean up
	 * Default: ["generate_daily_brief", "generate_brief_email"]
	 */
	jobTypes?: QueueJobType[];

	/**
	 * Dry run mode - log what would be cleaned up without actually doing it
	 * Default: false
	 */
	dryRun?: boolean;
}

export interface CleanupResult {
	staleCancelled: number;
	oldFailedCancelled: number;
	errors: string[];
	details: {
		staleJobs: any[];
		oldFailedJobs: any[];
	};
}

/**
 * Clean up stale queue jobs to prevent accidental processing of old jobs
 */
export async function cleanupStaleJobs(options: CleanupOptions = {}): Promise<CleanupResult> {
	const {
		staleThresholdHours = 24,
		oldFailedJobsDays = 7,
		jobTypes = ['generate_daily_brief', 'generate_brief_email'] as QueueJobType[],
		dryRun = false
	} = options;

	const result: CleanupResult = {
		staleCancelled: 0,
		oldFailedCancelled: 0,
		errors: [],
		details: {
			staleJobs: [],
			oldFailedJobs: []
		}
	};

	console.log(`🧹 ${dryRun ? '[DRY RUN] ' : ''}Starting queue cleanup...`);
	console.log(`   Stale threshold: ${staleThresholdHours}h`);
	console.log(`   Old failed threshold: ${oldFailedJobsDays} days`);
	console.log(`   Job types: ${jobTypes.join(', ')}`);

	try {
		// 1. Find and cancel stale pending/retrying jobs
		const staleThreshold = new Date(
			Date.now() - staleThresholdHours * 60 * 60 * 1000
		).toISOString();

		const { data: staleJobs, error: staleError } = await supabase
			.from('queue_jobs')
			.select('id, queue_job_id, job_type, status, scheduled_for, created_at')
			.in('status', ['pending', 'retrying'])
			.in('job_type', jobTypes)
			.lt('scheduled_for', staleThreshold)
			.order('scheduled_for', { ascending: true });

		if (staleError) {
			result.errors.push(`Error finding stale jobs: ${staleError.message}`);
			console.error('❌ Error finding stale jobs:', staleError);
		} else if (staleJobs && staleJobs.length > 0) {
			console.log(`   Found ${staleJobs.length} stale jobs to cancel`);
			result.details.staleJobs = staleJobs;

			// Log details about what will be cancelled
			staleJobs.forEach((job: any) => {
				const age = Math.floor(
					(Date.now() - new Date(job.scheduled_for).getTime()) / (1000 * 60 * 60)
				);
				console.log(
					`     - ${job.job_type} [${job.status}] - ${age}h old (scheduled: ${job.scheduled_for})`
				);
			});

			if (!dryRun) {
				// Cancel the stale jobs
				const jobIds = staleJobs.map((job: any) => job.id);
				const { error: cancelError } = await supabase
					.from('queue_jobs')
					.update({
						status: 'cancelled',
						error_message: `Cancelled by cleanup: job scheduled >${staleThresholdHours}h ago`,
						updated_at: new Date().toISOString()
					})
					.in('id', jobIds);

				if (cancelError) {
					result.errors.push(`Error cancelling stale jobs: ${cancelError.message}`);
					console.error('❌ Error cancelling stale jobs:', cancelError);
				} else {
					result.staleCancelled = staleJobs.length;
					console.log(`   ✅ Cancelled ${staleJobs.length} stale job(s)`);
				}
			} else {
				console.log(`   [DRY RUN] Would cancel ${staleJobs.length} stale job(s)`);
			}
		} else {
			console.log('   ✅ No stale jobs found');
		}

		// 2. Clean up old failed jobs (optional)
		if (oldFailedJobsDays > 0) {
			const oldFailedThreshold = new Date(
				Date.now() - oldFailedJobsDays * 24 * 60 * 60 * 1000
			).toISOString();

			const { data: oldFailedJobs, error: oldFailedError } = await supabase
				.from('queue_jobs')
				.select(
					'id, queue_job_id, job_type, status, scheduled_for, attempts, max_attempts, error_message'
				)
				.eq('status', 'failed')
				.in('job_type', jobTypes)
				.lt('scheduled_for', oldFailedThreshold)
				.order('scheduled_for', { ascending: true });

			if (oldFailedError) {
				result.errors.push(`Error finding old failed jobs: ${oldFailedError.message}`);
				console.error('❌ Error finding old failed jobs:', oldFailedError);
			} else if (oldFailedJobs && oldFailedJobs.length > 0) {
				console.log(
					`   Found ${oldFailedJobs.length} old failed jobs (>${oldFailedJobsDays}d)`
				);
				result.details.oldFailedJobs = oldFailedJobs;

				// Log a sample
				oldFailedJobs.slice(0, 5).forEach((job: any) => {
					const age = Math.floor(
						(Date.now() - new Date(job.scheduled_for).getTime()) / (1000 * 60 * 60 * 24)
					);
					console.log(
						`     - ${job.job_type}: ${age}d old, attempts: ${job.attempts}/${job.max_attempts}`
					);
				});
				if (oldFailedJobs.length > 5) {
					console.log(`     ... and ${oldFailedJobs.length - 5} more`);
				}

				if (!dryRun) {
					// Mark as permanently failed by updating error message
					// We'll fetch and update each job to append the archive message
					for (const job of oldFailedJobs) {
						const archiveMessage = job.error_message
							? `${job.error_message} [Archived by cleanup]`
							: '[Archived by cleanup]';

						await supabase
							.from('queue_jobs')
							.update({
								error_message: archiveMessage,
								updated_at: new Date().toISOString()
							})
							.eq('id', job.id);
					}

					result.oldFailedCancelled = oldFailedJobs.length;
					console.log(
						`   ✅ Marked ${oldFailedJobs.length} old failed job(s) as archived`
					);
				} else {
					console.log(
						`   [DRY RUN] Would mark ${oldFailedJobs.length} old failed job(s) as archived`
					);
				}
			} else {
				console.log('   ✅ No old failed jobs found');
			}
		}

		console.log('🧹 Cleanup complete');
		return result;
	} catch (error: any) {
		const errorMsg = `Unexpected error during cleanup: ${error.message}`;
		result.errors.push(errorMsg);
		console.error('❌', errorMsg, error);
		return result;
	}
}

/**
 * Get stats about potentially stale jobs without cleaning them up
 */
export async function getStaleJobStats(
	options: Pick<CleanupOptions, 'staleThresholdHours' | 'jobTypes'> = {}
): Promise<{
	staleCount: number;
	oldFailedCount: number;
	activeJobs: number;
}> {
	const {
		staleThresholdHours = 24,
		jobTypes = ['generate_daily_brief', 'generate_brief_email'] as QueueJobType[]
	} = options;

	const staleThreshold = new Date(
		Date.now() - staleThresholdHours * 60 * 60 * 1000
	).toISOString();

	// Count stale jobs
	const { count: staleCount } = await supabase
		.from('queue_jobs')
		.select('*', { count: 'exact', head: true })
		.in('status', ['pending', 'retrying'])
		.in('job_type', jobTypes)
		.lt('scheduled_for', staleThreshold);

	// Count old failed jobs (>7 days)
	const oldFailedThreshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
	const { count: oldFailedCount } = await supabase
		.from('queue_jobs')
		.select('*', { count: 'exact', head: true })
		.eq('status', 'failed')
		.in('job_type', jobTypes)
		.lt('scheduled_for', oldFailedThreshold);

	// Count active jobs
	const { count: activeJobs } = await supabase
		.from('queue_jobs')
		.select('*', { count: 'exact', head: true })
		.in('status', ['pending', 'processing', 'retrying'])
		.in('job_type', jobTypes);

	return {
		staleCount: staleCount || 0,
		oldFailedCount: oldFailedCount || 0,
		activeJobs: activeJobs || 0
	};
}
