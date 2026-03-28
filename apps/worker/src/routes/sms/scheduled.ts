// apps/worker/src/routes/sms/scheduled.ts
/**
 * Worker API Endpoints for Scheduled SMS Management
 *
 * These endpoints allow the web app to manage scheduled SMS messages:
 * - Cancel scheduled messages
 * - Update scheduled times
 * - Regenerate message content
 */

import { Router, Request, Response } from 'express';
import type { Router as ExpressRouter } from 'express';
import { supabase } from '../../lib/supabase';
import { SMSMessageGenerator } from '../../lib/services/smsMessageGenerator';

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
	} catch (error: any) {
		console.error('[API] Error in cancel endpoint:', error);
		return res.status(500).json({ error: 'Internal server error' });
	}
});

/**
 * PATCH /sms/scheduled/:id/update
 * Update the scheduled time for an SMS message
 */
router.patch('/:id/update', async (req: Request, res: Response) => {
	try {
		const { id } = req.params;
		const { scheduled_for, event_start, event_end } = req.body;

		if (!scheduled_for) {
			return res.status(400).json({ error: 'scheduled_for is required' });
		}

		console.log(`[API] Updating scheduled SMS: ${id}, new time: ${scheduled_for}`);

		// Validate the new time is in the future
		const newScheduledTime = new Date(scheduled_for);
		if (newScheduledTime < new Date()) {
			return res.status(400).json({ error: 'Scheduled time must be in the future' });
		}

		// Update the scheduled SMS
		const updateData: any = {
			scheduled_for,
			updated_at: new Date().toISOString()
		};

		if (event_start) updateData.event_start = event_start;
		if (event_end) updateData.event_end = event_end;

		const { data, error } = await supabase
			.from('scheduled_sms_messages')
			.update(updateData)
			.eq('id', id)
			.select()
			.single();

		if (error) {
			console.error('[API] Error updating SMS:', error);
			return res.status(400).json({ error: error.message });
		}

		if (!data) {
			return res.status(404).json({ error: 'Scheduled SMS not found' });
		}

		console.log(`[API] Successfully updated SMS: ${id}`);

		return res.json({
			success: true,
			message: 'Scheduled SMS updated successfully',
			data
		});
	} catch (error: any) {
		console.error('[API] Error in update endpoint:', error);
		return res.status(500).json({ error: 'Internal server error' });
	}
});

/**
 * POST /sms/scheduled/:id/regenerate
 * Regenerate the message content for a scheduled SMS
 */
router.post('/:id/regenerate', async (req: Request, res: Response) => {
	try {
		const { id } = req.params;

		console.log(`[API] Regenerating message for SMS: ${id}`);

		// Fetch the scheduled SMS with event details
		const { data: smsMessage, error: fetchError } = await supabase
			.from('scheduled_sms_messages')
			.select('*')
			.eq('id', id)
			.single();

		if (fetchError || !smsMessage) {
			console.error('[API] Error fetching SMS:', fetchError);
			return res.status(404).json({ error: 'Scheduled SMS not found' });
		}

		// Don't regenerate if already sent
		if (smsMessage.status === 'sent' || smsMessage.status === 'delivered') {
			return res.status(400).json({ error: 'Cannot regenerate sent messages' });
		}

		// Calculate lead time
		const eventStart = new Date(smsMessage.event_start || new Date());
		const scheduledFor = new Date(smsMessage.scheduled_for);
		const leadTimeMinutes = Math.round((eventStart.getTime() - scheduledFor.getTime()) / 60000);

		// Regenerate the message using LLM
		const generator = new SMSMessageGenerator();
		const regenerated = await generator.generateEventReminder(
			{
				eventId: smsMessage.calendar_event_id || '',
				title: smsMessage.event_title || 'Event',
				startTime: new Date(smsMessage.event_start || new Date()),
				endTime: new Date(smsMessage.event_end || smsMessage.event_start || new Date()),
				isAllDay: false,
				userTimezone: smsMessage.timezone || 'UTC'
			},
			leadTimeMinutes,
			smsMessage.user_id
		);

		// Update the message content
		const { data: updated, error: updateError } = await supabase
			.from('scheduled_sms_messages')
			.update({
				message_content: regenerated.content,
				generated_via: regenerated.generatedVia,
				llm_model: regenerated.model,
				generation_cost_usd: regenerated.costUsd,
				updated_at: new Date().toISOString()
			})
			.eq('id', id)
			.select()
			.single();

		if (updateError) {
			console.error('[API] Error updating regenerated message:', updateError);
			return res.status(400).json({ error: updateError.message });
		}

		console.log(`[API] Successfully regenerated SMS: ${id} (${regenerated.generatedVia})`);

		return res.json({
			success: true,
			message: 'Message regenerated successfully',
			data: updated,
			generation_method: regenerated.generatedVia
		});
	} catch (error: any) {
		console.error('[API] Error in regenerate endpoint:', error);
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
	} catch (error: any) {
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
