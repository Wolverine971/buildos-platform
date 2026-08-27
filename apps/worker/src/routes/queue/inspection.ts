// apps/worker/src/routes/queue/inspection.ts
import type { QueueJobStatus, QueueJobType } from '@buildos/shared-types';
import type { Application } from 'express';

import { queueConfig } from '../../config/queueConfig';
import { getErrorMessage } from '../../http/errors';
import { logWorkerError } from '../../lib/errorLogger';
import { queue } from '../../worker';

/** Register job inspection, queue health, and manual cleanup endpoints. */
export function registerQueueInspectionRoutes(app: Application): void {
	registerJobLookupRoutes(app);
	registerQueueStatsRoutes(app);
	registerQueueCleanupRoute(app);
}

function registerJobLookupRoutes(app: Application): void {
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
				metadata: { jobId: req.params?.jobId }
			});
			return res.status(500).json({
				error: 'Failed to fetch job',
				message: getErrorMessage(error)
			});
		}
	});

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

			res.json({ jobs });
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
}

function registerQueueStatsRoutes(app: Application): void {
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

	app.get('/queue/stale-stats', async (req, res) => {
		try {
			const { getStaleJobStats } = await import('../../lib/utils/queueCleanup.js');
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
}

function registerQueueCleanupRoute(app: Application): void {
	app.post('/queue/cleanup', async (req, res) => {
		try {
			const { cleanupStaleJobs } = await import('../../lib/utils/queueCleanup.js');
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
				metadata: { dryRun: req.body?.dryRun ?? false }
			});
			res.status(500).json({
				error: 'Failed to run cleanup',
				message: getErrorMessage(error)
			});
		}
	});
}
