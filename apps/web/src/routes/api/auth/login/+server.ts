// apps/web/src/routes/api/auth/login/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse, ErrorCode, HttpStatus } from '$lib/utils/api-response';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';

function getEmailDomain(value: string): string | null {
	const trimmed = value.trim().toLowerCase();
	const atIndex = trimmed.lastIndexOf('@');
	if (atIndex <= 0 || atIndex === trimmed.length - 1) return null;
	return trimmed.slice(atIndex + 1);
}

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

	const emailDomain = typeof email === 'string' ? getEmailDomain(email) : null;

	try {
		// Sign in using the server-side client
		const { data, error } = await supabase.auth.signInWithPassword({
			email: email.trim(),
			password
		});

		if (error) {
			const errorLogger = ErrorLoggerService.getInstance(supabase);
			await errorLogger.logError(
				error,
				{
					endpoint: '/api/auth/login',
					httpMethod: 'POST',
					operationType: 'auth_login',
					metadata: {
						emailDomain,
						flow: 'password'
					}
				},
				'warning'
			);
			return ApiResponse.unauthorized(error.message);
		}

		if (!data.session) {
			const errorLogger = ErrorLoggerService.getInstance(supabase);
			await errorLogger.logError(new Error('Login failed - no session created'), {
				endpoint: '/api/auth/login',
				httpMethod: 'POST',
				operationType: 'auth_login',
				metadata: {
					emailDomain,
					flow: 'password'
				}
			});
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
			console.log(
				'[Login] User missing from public.users, creating entry for:',
				data.user.email
			);

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
				// Handle duplicate key error - user exists but RLS blocked the read
				if (insertError.code === '23505') {
					console.log(
						'[Login] User exists but was not readable (RLS issue), fetching directly'
					);
					// Try fetching again - the session should now be properly set
					const { data: existingUser } = await supabase
						.from('users')
						.select('*')
						.eq('id', data.user.id)
						.single();
					if (existingUser) {
						user = existingUser;
						locals.user = existingUser;
					}
				} else {
					console.error('[Login] Error creating public.users entry:', insertError);
				}
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
		const errorLogger = ErrorLoggerService.getInstance(supabase);
		await errorLogger.logError(err, {
			endpoint: '/api/auth/login',
			httpMethod: 'POST',
			operationType: 'auth_login',
			metadata: {
				emailDomain,
				flow: 'password'
			}
		});
		return ApiResponse.internalError(err, 'Login failed');
	}
};
