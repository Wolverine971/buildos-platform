// apps/web/src/routes/api/admin/users/[id]/context/+server.ts
import type { RequestHandler } from './$types';
import { EmailGenerationService } from '$lib/services/email-generation-service';
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({
	params,
	url,
	locals: { supabase, safeGetSession }
}) => {
	try {
		const { user } = await safeGetSession();

		if (!user?.is_admin) {
			return ApiResponse.forbidden('Admin access required');
		}

		const userId = params.id;
		const isBetaMember = url.searchParams.get('beta') === 'true';
		const email = url.searchParams.get('email');
		const name = url.searchParams.get('name');

		if (!userId) {
			return ApiResponse.error('User ID is required');
		}

		// Get user context using the email generation service
		const emailService = new EmailGenerationService(supabase);

		// If this is a beta member without a user account (userId is 'beta-only')
		if (isBetaMember && userId === 'beta-only' && email) {
			const userContext = await emailService.getBetaMemberContext(email, name);
			return ApiResponse.success(userContext);
		}

		// Regular user context - pass userId only, let the service fetch the user's email
		const userContext = await emailService.getUserContext(userId);

		return ApiResponse.success(userContext);
	} catch (error) {
		console.error('Error fetching user context:', error);
		return ApiResponse.error(
			error instanceof Error ? error.message : 'Failed to fetch user context'
		);
	}
};
