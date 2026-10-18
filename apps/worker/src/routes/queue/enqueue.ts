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
	registerChatClassificationRoute(app, queue);
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
