// apps/web/src/routes/api/admin/users/[id]/context/+server.ts
import type { RequestHandler } from './$types';
import { EmailGenerationService } from '$lib/services/email-generation-service';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { ApiResponse } from '$lib/utils/api-response';
import { isValidUUID } from '$lib/utils/operations/validation-utils';

export const GET: RequestHandler = async ({ params, url, locals: { safeGetSession } }) => {
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

		const isBetaOnlyLookup = isBetaMember && userId === 'beta-only' && !!email;
		if (!isBetaOnlyLookup && !isValidUUID(userId)) {
			return ApiResponse.badRequest('Invalid user ID');
		}

		// Reading another user's context is a privileged admin read: a signed-in
		// session can only resolve its own actor, so this needs the admin client.
		const supabase = createAdminSupabaseClient();
		const emailService = new EmailGenerationService(supabase);

		// If this is a beta member without a user account (userId is 'beta-only')
		if (isBetaOnlyLookup && email) {
			const normalizedEmail = email.trim().toLowerCase();
			const { data: matchedUser, error: matchedUserError } = await supabase
				.from('users')
				.select('id')
				.eq('email', normalizedEmail)
				.maybeSingle();

			if (matchedUserError) {
				throw new Error(`Failed to match beta signup to user: ${matchedUserError.message}`);
			}

			const userContext = matchedUser
				? await emailService.getUserContext(matchedUser.id)
				: await emailService.getBetaMemberContext(normalizedEmail, name);
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
