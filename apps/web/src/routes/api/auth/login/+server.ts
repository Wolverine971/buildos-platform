// apps/web/src/routes/api/auth/login/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse, ErrorCode, HttpStatus } from '$lib/utils/api-response';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { supabase, safeGetSession } = locals;
	const { email, password } = await request.json();

	if (!email || !password) {
		return ApiResponse.error(
			'Email and password are required',
			HttpStatus.BAD_REQUEST,
			ErrorCode.MISSING_FIELD,
			{ fields: ['email', 'password'] }
		);
	}

	try {
		// Sign in using the server-side client
		const { data, error } = await supabase.auth.signInWithPassword({
			email: email.trim(),
			password
		});

		if (error) {
			return ApiResponse.unauthorized(error.message);
		}

		if (!data.session) {
			return ApiResponse.error(
				'Login failed - no session created',
				HttpStatus.UNAUTHORIZED,
				ErrorCode.OPERATION_FAILED
			);
		}

		// Update locals immediately for this request
		locals.session = data.session;
		locals.user = null; // Will be loaded by safeGetSession

		// Force load user data
		let { user } = await safeGetSession();

		// If user doesn't exist in public.users (edge case from old registration bug), create them now
		if (!user && data.user) {
			console.log('[Login] User missing from public.users, creating entry for:', data.user.email);

			const { data: insertedUser, error: insertError } = await supabase
				.from('users')
				.insert({
					id: data.user.id,
					email: data.user.email as string,
					name: data.user.user_metadata?.name || data.user.email?.split('@')[0] || 'User',
					is_admin: false,
					completed_onboarding: false,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.select()
				.single();

			if (insertError) {
				console.error('[Login] Error creating public.users entry:', insertError);
			} else {
				console.log('[Login] Successfully created public.users entry');
				// Use the inserted user directly (safeGetSession cache won't have it)
				user = insertedUser;
				locals.user = insertedUser;
			}
		}

		// Return success with user data
		return ApiResponse.success(
			{
				user: user || data.user
			},
			'Logged in successfully'
		);
	} catch (err: any) {
		console.error('Server login error:', err);
		return ApiResponse.internalError(err, 'Login failed');
	}
};
