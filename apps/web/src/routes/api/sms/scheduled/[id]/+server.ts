// apps/web/src/routes/api/sms/scheduled/[id]/+server.ts
import { ApiResponse } from '$lib/utils/api-response';
import type { RequestHandler } from './$types';
import { PUBLIC_RAILWAY_WORKER_URL } from '$env/static/public';
import { PRIVATE_RAILWAY_WORKER_TOKEN } from '$env/static/private';

/**
 * DELETE /api/sms/scheduled/:id
 * Cancel a scheduled SMS message
 */
export const DELETE: RequestHandler = async ({ params, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized('Unauthorized');
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
			return ApiResponse.notFound('SMS message');
		}

		if (smsMessage.user_id !== user.id) {
			return ApiResponse.forbidden('Unauthorized');
		}

		const headers: Record<string, string> = {
			'Content-Type': 'application/json'
		};
		if (PRIVATE_RAILWAY_WORKER_TOKEN) {
			headers.Authorization = `Bearer ${PRIVATE_RAILWAY_WORKER_TOKEN}`;
		}

		// Call worker API to cancel
		const workerUrl = `${PUBLIC_RAILWAY_WORKER_URL}/sms/scheduled/${id}/cancel`;
		const response = await fetch(workerUrl, {
			method: 'POST',
			headers,
			body: JSON.stringify({
				reason: 'user_cancelled'
			})
		});

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({ error: 'Failed to cancel' }));
			return ApiResponse.error(
				errorData.error || 'Failed to cancel SMS message',
				response.status,
				undefined,
				{ details: errorData }
			);
		}

		const data = await response.json();
		return ApiResponse.success(data);
	} catch (error: any) {
		console.error('Error cancelling scheduled SMS:', error);
		return ApiResponse.internalError(error, error.message || 'Failed to cancel SMS message');
	}
};
