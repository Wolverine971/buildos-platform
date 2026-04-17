// apps/web/src/routes/api/billing/payment-warnings/[id]/dismiss/+server.ts
import { ApiResponse } from '$lib/utils/api-response';
import { invalidateBillingContextCache } from '$lib/server/billing-context-cache';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals: { supabase, safeGetSession }, params }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized('Unauthorized');
	}

	const warningId = params.id;
	if (!warningId) {
		return ApiResponse.badRequest('Missing payment warning id');
	}

	const { error } = await supabase
		.from('user_notifications')
		.update({ dismissed_at: new Date().toISOString() })
		.eq('id', warningId)
		.eq('user_id', user.id)
		.eq('type', 'payment_warning');

	if (error) {
		return ApiResponse.databaseError(error);
	}

	invalidateBillingContextCache(user.id);

	return ApiResponse.success({ dismissed: true });
};
