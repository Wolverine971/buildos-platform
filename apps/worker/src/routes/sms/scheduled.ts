// apps/worker/src/routes/sms/scheduled.ts
/**
 * Worker API Endpoints for Scheduled SMS Management
 *
 * These endpoints back the web app's scheduled-SMS list
 * (apps/web/src/routes/api/sms/scheduled/**):
 * - List a user's scheduled messages
 * - Cancel a scheduled message
 */

import { Request, Response, Router } from 'express';
import type { Router as ExpressRouter } from 'express';
import { supabase } from '../../lib/supabase';

const router: ExpressRouter = Router();

/**
 * POST /sms/scheduled/:id/cancel
 * Cancel a scheduled SMS message
 */
router.post('/:id/cancel', async (req: Request, res: Response) => {
	try {
		const { id } = req.params;
		const { reason } = req.body;

		console.log(`[API] Cancelling scheduled SMS: ${id}, reason: ${reason || 'none'}`);

		// Update the scheduled SMS status to cancelled
		const { data, error } = await supabase
			.from('scheduled_sms_messages')
			.update({
				status: 'cancelled',
				cancellation_reason: reason || 'manual_cancellation',
				updated_at: new Date().toISOString()
			})
			.eq('id', id)
			.select()
			.single();

		if (error) {
			console.error('[API] Error cancelling SMS:', error);
			return res.status(400).json({ error: error.message });
		}

		if (!data) {
			return res.status(404).json({ error: 'Scheduled SMS not found' });
		}

		// Cancel any pending queue jobs for this SMS
		await cancelQueueJob(id);

		console.log(`[API] Successfully cancelled SMS: ${id}`);

		return res.json({
			success: true,
			message: 'Scheduled SMS cancelled successfully',
			data
		});
	} catch (error) {
		console.error('[API] Error in cancel endpoint:', error);
		return res.status(500).json({ error: 'Internal server error' });
	}
});

/**
 * GET /sms/scheduled/user/:userId
 * Get all scheduled SMS messages for a user
 */
router.get('/user/:userId', async (req: Request, res: Response) => {
	try {
		const { userId } = req.params;
		const { status, limit = 50 } = req.query;

		console.log(`[API] Fetching scheduled SMS for user: ${userId}`);

		let query = supabase
			.from('scheduled_sms_messages')
			.select('*')
			.eq('user_id', userId)
			.order('scheduled_for', { ascending: true })
			.limit(Number(limit));

		if (status && typeof status === 'string') {
			query = query.eq('status', status);
		}

		const { data, error } = await query;

		if (error) {
			console.error('[API] Error fetching scheduled SMS:', error);
			return res.status(400).json({ error: error.message });
		}

		return res.json({
			success: true,
			count: data?.length || 0,
			data: data || []
		});
	} catch (error) {
		console.error('[API] Error in list endpoint:', error);
		return res.status(500).json({ error: 'Internal server error' });
	}
});

/**
 * Helper: Cancel pending queue job for SMS
 */
async function cancelQueueJob(scheduledSmsId: string): Promise<void> {
	try {
		const { data: jobs, error } = await supabase
			.from('queue_jobs')
			.select('id')
			.eq('job_type', 'send_sms')
			.eq('status', 'pending')
			.eq('metadata->>scheduled_sms_id', scheduledSmsId);

		if (error || !jobs) {
			return;
		}

		if (jobs.length === 0) {
			return;
		}

		await Promise.allSettled(
			jobs.map((job) =>
				supabase.rpc('cancel_job_with_reason', {
					p_job_id: job.id,
					p_reason: 'SMS message was cancelled',
					p_allow_processing: false
				})
			)
		);

		console.log(`[API] Cancelled ${jobs.length} queue jobs for SMS ${scheduledSmsId}`);
	} catch (error) {
		console.error('[API] Error cancelling queue jobs:', error);
	}
}

export default router;
