// apps/web/src/routes/api/sms/scheduled/[id]/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { PUBLIC_RAILWAY_WORKER_URL } from '$env/static/public';

/**
 * DELETE /api/sms/scheduled/:id
 * Cancel a scheduled SMS message
 */
export const DELETE: RequestHandler = async ({ params, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { id } = params;

	try {
		// Verify the SMS belongs to the current user
		const { data: smsMessage, error: verifyError } = await supabase
			.from('scheduled_sms_messages')
			.select('user_id')
			.eq('id', id)
			.single();

		if (verifyError || !smsMessage) {
			return json({ error: 'SMS message not found' }, { status: 404 });
		}

		if (smsMessage.user_id !== user.id) {
			return json({ error: 'Unauthorized' }, { status: 403 });
		}

		// Call worker API to cancel
		const workerUrl = `${PUBLIC_RAILWAY_WORKER_URL}/sms/scheduled/${id}/cancel`;
		const response = await fetch(workerUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				reason: 'user_cancelled'
			})
		});

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({ error: 'Failed to cancel' }));
			return json(errorData, { status: response.status });
		}

		const data = await response.json();
		return json(data);
	} catch (error: any) {
		console.error('Error cancelling scheduled SMS:', error);
		return json(
			{
				success: false,
				error: error.message || 'Failed to cancel SMS message'
			},
			{ status: 500 }
		);
	}
};
