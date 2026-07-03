// apps/web/src/routes/api/account/password/+server.ts
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { createSupabaseServer } from '$lib/supabase/index';
import { ApiResponse } from '$lib/utils/api-response';
import { parseJsonRequest } from '$lib/utils/request-validation';

const passwordUpdateSchema = z.object({
	currentPassword: z.string(),
	newPassword: z.string()
});

export const PUT: RequestHandler = async ({ request, cookies, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();

	if (!user) {
		return ApiResponse.unauthorized('Not authenticated');
	}

	try {
		const parsed = await parseJsonRequest(request, passwordUpdateSchema);
		if (!parsed.ok) return parsed.response;
		const body = parsed.data;
		const { currentPassword, newPassword } = body;

		// Validate input
		if (!currentPassword?.trim()) {
			return ApiResponse.badRequest('Current password is required');
		}

		if (!newPassword?.trim()) {
			return ApiResponse.badRequest('New password is required');
		}

		if (newPassword.length < 6) {
			return ApiResponse.badRequest('Password must be at least 6 characters long');
		}

		if (currentPassword === newPassword) {
			return ApiResponse.badRequest('New password must be different from current password');
		}

		const supabase = createSupabaseServer(cookies);

		// First, verify the current password by attempting to sign in with it
		const { error: signInError } = await supabase.auth.signInWithPassword({
			email: user.email!,
			password: currentPassword
		});

		if (signInError) {
			console.error('Current password verification failed:', signInError);

			// Handle specific error cases for current password verification
			if (
				signInError.message.includes('Invalid login credentials') ||
				signInError.message.includes('invalid_credentials')
			) {
				return ApiResponse.badRequest('Current password is incorrect');
			}

			return ApiResponse.badRequest('Unable to verify current password');
		}

		// If current password is verified, proceed with password update
		const { data, error } = await supabase.auth.updateUser({
			password: newPassword
		});

		if (error) {
			console.error('Error updating password:', error);

			// Handle specific error cases
			if (error.message.includes('weak')) {
				return ApiResponse.badRequest(
					'Password is too weak. Please choose a stronger password.'
				);
			}

			return ApiResponse.error('Failed to update password', 500);
		}

		return ApiResponse.success({
			message: 'Password updated successfully'
		});
	} catch (error) {
		console.error('Password update error:', error);
		return ApiResponse.error('Failed to update password', 500);
	}
};
