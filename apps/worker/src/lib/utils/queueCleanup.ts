// apps/worker/src/lib/utils/queueCleanup.ts
import { supabase } from '../supabase';
import type { QueueJobStatus, QueueJobType } from '@buildos/shared-types';

const TERMINAL_STATUSES: QueueJobStatus[] = ['completed', 'failed', 'cancelled'];

function isMissingDeleteCompletedJobsRpc(error: { message?: string; details?: string } | null) {
	if (!error) return false;
	const text = `${error.message || ''} ${error.details || ''}`.toLowerCase();
	return text.includes('delete_old_completed_queue_jobs');
}

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
	 * Delete completed jobs older than this many days
	 * Default: 30 days (set to 0 to disable)
	 */
	completedJobsRetentionDays?: number;

	/**
	 * Job types to clean up
	 * Default: ["generate_daily_brief"]
	 */
	jobTypes?: QueueJobType[];

	/**
	 * Optional job-type filter for completed job deletion
	 * Default: all job types
	 */
	completedJobTypes?: QueueJobType[];

	/**
	 * Maximum number of completed jobs to delete per batch
	 * Default: 500
	 */
	maxDeletionBatchSize?: number;

	/**
	 * Dry run mode - log what would be cleaned up without actually doing it
	 * Default: false
	 */
	dryRun?: boolean;
}

export interface CleanupResult {
	staleCancelled: number;
	oldFailedCancelled: number;
	completedDeleted: number;
	errors: string[];
	details: {
		staleJobs: any[];
		oldFailedJobs: any[];
		completedJobs: any[];
	};
}

/**
 * Clean up stale queue jobs to prevent accidental processing of old jobs
 */
export async function cleanupStaleJobs(options: CleanupOptions = {}): Promise<CleanupResult> {
	const {
		staleThresholdHours = 24,
		oldFailedJobsDays = 7,
		completedJobsRetentionDays = 30,
		jobTypes = ['generate_daily_brief'] as QueueJobType[],
		completedJobTypes,
		maxDeletionBatchSize = 500,
		dryRun = false
	} = options;

	const result: CleanupResult = {
		staleCancelled: 0,
		oldFailedCancelled: 0,
		completedDeleted: 0,
		errors: [],
		details: {
			staleJobs: [],
			oldFailedJobs: [],
			completedJobs: []
		}
	};

	console.log(`🧹 ${dryRun ? '[DRY RUN] ' : ''}Starting queue cleanup...`);
	console.log(`   Stale threshold: ${staleThresholdHours}h`);
	console.log(`   Old failed threshold: ${oldFailedJobsDays} days`);
	console.log(`   Completed retention: ${completedJobsRetentionDays} days`);
	console.log(`   Completed delete batch size: ${maxDeletionBatchSize}`);
	console.log(`   Terminal statuses: ${TERMINAL_STATUSES.join(', ')}`);
	console.log(`   Job types: ${jobTypes.join(', ')}`);
	if (completedJobTypes && completedJobTypes.length > 0) {
		console.log(`   Completed job types filter: ${completedJobTypes.join(', ')}`);
	}

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

		// 3. Delete old completed jobs (optional)
		if (completedJobsRetentionDays > 0) {
			const completedThreshold = new Date(
				Date.now() - completedJobsRetentionDays * 24 * 60 * 60 * 1000
			).toISOString();

			if (dryRun) {
				let completedCountQuery = supabase
					.from('queue_jobs')
					.select('*', { count: 'exact', head: true })
					.eq('status', 'completed')
					.lt('completed_at', completedThreshold);

				if (completedJobTypes && completedJobTypes.length > 0) {
					completedCountQuery = completedCountQuery.in('job_type', completedJobTypes);
				}

				const { count: completedCount, error: completedCountError } =
					await completedCountQuery;
				if (completedCountError) {
					result.errors.push(
						`Error counting old completed jobs: ${completedCountError.message}`
					);
					console.error('❌ Error counting old completed jobs:', completedCountError);
				} else {
					result.completedDeleted = completedCount || 0;
					if ((completedCount || 0) > 0) {
						let completedSampleQuery = supabase
							.from('queue_jobs')
							.select('id, queue_job_id, job_type, status, completed_at, created_at')
							.eq('status', 'completed')
							.lt('completed_at', completedThreshold)
							.order('completed_at', { ascending: true })
							.limit(Math.min(Math.max(1, maxDeletionBatchSize), 20));

						if (completedJobTypes && completedJobTypes.length > 0) {
							completedSampleQuery = completedSampleQuery.in(
								'job_type',
								completedJobTypes
							);
						}

						const { data: completedSample, error: completedSampleError } =
							await completedSampleQuery;

						if (completedSampleError) {
							result.errors.push(
								`Error loading old completed job samples: ${completedSampleError.message}`
							);
							console.error(
								'❌ Error loading old completed job samples:',
								completedSampleError
							);
						} else {
							result.details.completedJobs = completedSample || [];
						}

						console.log(
							`   [DRY RUN] Would delete ${completedCount} completed job(s) older than ${completedJobsRetentionDays}d`
						);
					} else {
						console.log('   ✅ No old completed jobs found');
					}
				}
			} else {
				const batchLimit = Math.max(1, maxDeletionBatchSize);
				let totalDeleted = 0;
				let usedRpcDelete = false;
				let rpcUnavailable = false;

				// Prefer database-side batched delete when available.
				while (true) {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC not in generated Supabase types
					const { data: rpcData, error: rpcError } = await (supabase as any).rpc(
						'delete_old_completed_queue_jobs',
						{
							p_retention_days: completedJobsRetentionDays,
							p_batch_size: batchLimit,
							p_job_types:
								completedJobTypes && completedJobTypes.length > 0
									? completedJobTypes
									: null
						}
					);

					if (rpcError) {
						if (isMissingDeleteCompletedJobsRpc(rpcError)) {
							rpcUnavailable = true;
							console.warn(
								'⚠️ delete_old_completed_queue_jobs RPC not found, falling back to client-side deletion'
							);
							break;
						}

						result.errors.push(
							`Error deleting old completed jobs via RPC: ${rpcError.message}`
						);
						console.error('❌ Error deleting old completed jobs via RPC:', rpcError);
						break;
					}

					usedRpcDelete = true;

					const rpcRow = Array.isArray(rpcData) ? rpcData[0] : rpcData;
					const deletedInBatch = Number(
						(rpcRow as { deleted_count?: number } | null)?.deleted_count || 0
					);
					if (!Number.isFinite(deletedInBatch) || deletedInBatch <= 0) {
						break;
					}

					totalDeleted += deletedInBatch;
					if (deletedInBatch < batchLimit) {
						break;
					}
				}

				// Backward-compatible fallback for environments where the RPC is not migrated yet.
				if (!usedRpcDelete && rpcUnavailable) {
					while (true) {
						let completedBatchQuery = supabase
							.from('queue_jobs')
							.select('id, queue_job_id, job_type, status, completed_at, created_at')
							.eq('status', 'completed')
							.lt('completed_at', completedThreshold)
							.order('completed_at', { ascending: true })
							.limit(batchLimit);

						if (completedJobTypes && completedJobTypes.length > 0) {
							completedBatchQuery = completedBatchQuery.in(
								'job_type',
								completedJobTypes
							);
						}

						const { data: completedBatch, error: completedBatchError } =
							await completedBatchQuery;

						if (completedBatchError) {
							result.errors.push(
								`Error finding old completed jobs: ${completedBatchError.message}`
							);
							console.error(
								'❌ Error finding old completed jobs:',
								completedBatchError
							);
							break;
						}

						if (!completedBatch || completedBatch.length === 0) {
							break;
						}

						if (result.details.completedJobs.length < 20) {
							const detailLimit = 20 - result.details.completedJobs.length;
							result.details.completedJobs.push(
								...completedBatch.slice(0, detailLimit)
							);
						}

						const completedIds = completedBatch.map((job: any) => job.id);
						const { error: deleteCompletedError } = await supabase
							.from('queue_jobs')
							.delete()
							.in('id', completedIds);

						if (deleteCompletedError) {
							result.errors.push(
								`Error deleting old completed jobs: ${deleteCompletedError.message}`
							);
							console.error(
								'❌ Error deleting old completed jobs:',
								deleteCompletedError
							);
							break;
						}

						totalDeleted += completedBatch.length;

						if (completedBatch.length < batchLimit) {
							break;
						}
					}
				}

				result.completedDeleted = totalDeleted;
				if (totalDeleted > 0) {
					console.log(
						`   ✅ Deleted ${totalDeleted} completed job(s) older than ${completedJobsRetentionDays}d`
					);
				}
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
	options: Pick<
		CleanupOptions,
		'staleThresholdHours' | 'jobTypes' | 'completedJobsRetentionDays' | 'completedJobTypes'
	> = {}
): Promise<{
	staleCount: number;
	oldFailedCount: number;
	oldCompletedCount: number;
	activeJobs: number;
}> {
	const {
		staleThresholdHours = 24,
		jobTypes = ['generate_daily_brief'] as QueueJobType[],
		completedJobsRetentionDays = 30,
		completedJobTypes
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

	// Count completed jobs past retention window
	let oldCompletedCount = 0;
	if (completedJobsRetentionDays > 0) {
		const oldCompletedThreshold = new Date(
			Date.now() - completedJobsRetentionDays * 24 * 60 * 60 * 1000
		).toISOString();

		let oldCompletedQuery = supabase
			.from('queue_jobs')
			.select('*', { count: 'exact', head: true })
			.eq('status', 'completed')
			.lt('completed_at', oldCompletedThreshold);

		if (completedJobTypes && completedJobTypes.length > 0) {
			oldCompletedQuery = oldCompletedQuery.in('job_type', completedJobTypes);
		}

		const { count } = await oldCompletedQuery;
		oldCompletedCount = count || 0;
	}

	// Count active jobs
	const { count: activeJobs } = await supabase
		.from('queue_jobs')
		.select('*', { count: 'exact', head: true })
		.in('status', ['pending', 'processing', 'retrying'])
		.in('job_type', jobTypes);

	return {
		staleCount: staleCount || 0,
		oldFailedCount: oldFailedCount || 0,
		oldCompletedCount,
		activeJobs: activeJobs || 0
	};
}
