// src/routes/api/account/settings/+server.ts
import type { RequestHandler } from './$types';
import { createSupabaseServer } from '$lib/supabase/index';
import { ApiResponse } from '$lib/utils/api-response';

export const PUT: RequestHandler = async ({ request, cookies, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();

	if (!user) {
		return ApiResponse.unauthorized('Not authenticated');
	}

	try {
		const body = await request.json();
		const { name, email } = body;

		// Validate input
		if (!name?.trim() && !email?.trim()) {
			return ApiResponse.badRequest('At least one field (name or email) must be provided');
		}

		if (email && !isValidEmail(email)) {
			return ApiResponse.badRequest('Invalid email format');
		}

		const supabase = createSupabaseServer(cookies);

		// Update user metadata and email if provided
		const updateData: any = {};

		if (name?.trim()) {
			updateData.data = {
				name: name.trim()
			};
		}

		if (email?.trim() && email !== user.email) {
			updateData.email = email.trim();
		}

		const { data, error } = await supabase.auth.updateUser(updateData);

		if (error) {
			console.error('Error updating user:', error);
			return ApiResponse.error('Failed to update account information', 500);
		}

		// Update the users table with the new name
		if (name?.trim()) {
			const { error: dbError } = await supabase
				.from('users')
				.update({
					name: name.trim(),
					updated_at: new Date().toISOString()
				})
				.eq('id', user.id);

			if (dbError) {
				console.error('Error updating users table:', dbError);
				// Don't return error here as the auth update succeeded
			}
		}

		return ApiResponse.success({
			message:
				email && email !== user.email
					? 'Account updated. Please check your email to confirm the new address.'
					: 'Account updated successfully',
			user: {
				id: data.user?.id,
				email: data.user?.email,
				name: data.user?.user_metadata?.name
			}
		});
	} catch (error) {
		console.error('Account update error:', error);
		return ApiResponse.error('Failed to update account', 500);
	}
};

export const DELETE: RequestHandler = async ({ cookies, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();

	if (!user) {
		return ApiResponse.unauthorized('Not authenticated');
	}

	try {
		const supabase = createSupabaseServer(cookies);

		// Mark user as access restricted instead of hard delete
		// This preserves data integrity and allows for account recovery
		const { error: dbError } = await supabase
			.from('users')
			.update({
				access_restricted: true,
				access_restricted_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			})
			.eq('id', user.id);

		if (dbError) {
			// console.error('Error marking user as restricted:', dbError);
			return ApiResponse.error('Failed to delete account', 500);
		}

		// Sign out the user
		const { error: signOutError } = await supabase.auth.signOut();

		if (signOutError) {
			console.error('Error signing out user:', signOutError);
			// Don't return error as account is already restricted
		}

		return ApiResponse.success({
			message: 'Account has been deleted successfully'
		});
	} catch (error) {
		console.error('Account deletion error:', error);
		return ApiResponse.error('Failed to delete account', 500);
	}
};

function isValidEmail(email: string): boolean {
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	return emailRegex.test(email);
}
