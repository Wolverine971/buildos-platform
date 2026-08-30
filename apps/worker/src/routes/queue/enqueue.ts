// apps/worker/src/routes/queue/enqueue.ts
import type { Application } from 'express';

import { getErrorMessage } from '../../http/errors';
import { logWorkerError } from '../../lib/errorLogger';
import { getQueueCorrelationId } from '../../lib/queueCorrelation';
import { supabase } from '../../lib/supabase';
import type { GeneralWorkerHttpQueue } from './queuePort';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Register the general worker's small enqueue-only HTTP contracts. */
export function registerGeneralEnqueueRoutes(
	app: Application,
	queue: GeneralWorkerHttpQueue
): void {
	registerOnboardingRoute(app, queue);
	registerChatClassificationRoute(app, queue);
	registerBraindumpRoute(app, queue);
}

function registerOnboardingRoute(app: Application, queue: GeneralWorkerHttpQueue): void {
	app.post('/queue/onboarding', async (req, res) => {
		try {
			const { userId, userContext, options } = req.body;
			const forceRegenerate = options?.forceRegenerate === true;

			if (!userId) {
				return res.status(400).json({ error: 'userId is required' });
			}

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

			const job = await queue.add(
				'onboarding_analysis',
				userId,
				{ userId, userContext: userContext ?? {}, options },
				{
					priority: 1,
					dedupKey: forceRegenerate
						? `onboarding-analysis-${userId}-${Date.now()}`
						: `onboarding-analysis-${userId}`
				}
			);

			return res.json({
				success: true,
				jobId: job.queue_job_id,
				correlationId: getQueueCorrelationId(job.metadata)
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
				metadata: { forceRegenerate: req.body?.options?.forceRegenerate ?? false }
			});
			return res.status(500).json({
				error: 'Failed to queue onboarding analysis',
				message: getErrorMessage(error)
			});
		}
	});
}

function registerChatClassificationRoute(app: Application, queue: GeneralWorkerHttpQueue): void {
	app.post('/queue/chat/classify', async (req, res) => {
		try {
			const { sessionId, userId } = req.body;

			if (!sessionId || !userId) {
				return res.status(400).json({ error: 'sessionId and userId are required' });
			}

			if (!UUID_PATTERN.test(sessionId) || !UUID_PATTERN.test(userId)) {
				return res.status(400).json({
					error: 'sessionId and userId must be valid UUIDs'
				});
			}

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

			const job = await queue.add(
				'classify_chat_session',
				userId,
				{ sessionId, userId },
				{ priority: 8, dedupKey: `classify-session-${sessionId}` }
			);

			console.log(
				`🏷️  API: Queued chat classification for session ${sessionId}, job ${job.queue_job_id}`
			);

			return res.json({
				success: true,
				jobId: job.queue_job_id,
				correlationId: getQueueCorrelationId(job.metadata),
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
				metadata: { sessionId: req.body?.sessionId }
			});
			return res.status(500).json({
				error: 'Failed to queue chat classification',
				message: getErrorMessage(error)
			});
		}
	});
}

function registerBraindumpRoute(app: Application, queue: GeneralWorkerHttpQueue): void {
	app.post('/queue/braindump/process', async (req, res) => {
		try {
			const { braindumpId, userId } = req.body;

			if (!braindumpId || !userId) {
				return res.status(400).json({ error: 'braindumpId and userId are required' });
			}

			if (!UUID_PATTERN.test(braindumpId) || !UUID_PATTERN.test(userId)) {
				return res.status(400).json({
					error: 'braindumpId and userId must be valid UUIDs'
				});
			}

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

			const job = await queue.add(
				'process_onto_braindump',
				userId,
				{ braindumpId, userId },
				{ priority: 7, dedupKey: `process-onto-braindump-${braindumpId}` }
			);

			console.log(
				`🧠 API: Queued captured context processing for ${braindumpId}, job ${job.queue_job_id}`
			);

			return res.json({
				success: true,
				jobId: job.queue_job_id,
				correlationId: getQueueCorrelationId(job.metadata),
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
				metadata: { braindumpId: req.body?.braindumpId }
			});
			return res.status(500).json({
				error: 'Failed to queue captured context processing',
				message: getErrorMessage(error)
			});
		}
	});
}
