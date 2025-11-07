// apps/web/src/routes/api/billing/context/+server.ts
import { ApiResponse } from '$lib/utils/api-response';
import type { RequestHandler } from './$types';
import { fetchBillingContext } from '$lib/server/billing-context';
import { StripeService } from '$lib/services/stripe-service';

export const GET: RequestHandler = async ({ locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();

	if (!user) {
		return ApiResponse.unauthorized('Unauthorized');
	}

	try {
		const billingContext = await fetchBillingContext(
			supabase,
			user.id,
			StripeService.isEnabled()
		);

		return ApiResponse.success(billingContext);
	} catch (error) {
		console.error('Failed to load billing context:', error);
		return ApiResponse.internalError(error, 'Failed to load billing context');
	}
};
