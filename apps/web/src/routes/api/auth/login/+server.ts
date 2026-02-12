// apps/web/src/routes/api/auth/login/+server.ts
import type { RequestHandler } from './$types';
import type { User } from '@supabase/supabase-js';
import { ApiResponse, ErrorCode, HttpStatus } from '$lib/utils/api-response';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';
import { createAdminSupabaseClient } from '$lib/supabase/admin';

function getEmailDomain(value: string): string | null {
	const trimmed = value.trim().toLowerCase();
	const atIndex = trimmed.lastIndexOf('@');
	if (atIndex <= 0 || atIndex === trimmed.length - 1) return null;
	return trimmed.slice(atIndex + 1);
}

function buildProfilePayload(authUser: User) {
	const now = new Date().toISOString();
	return {
		id: authUser.id,
		email: authUser.email as string,
		name: authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'User',
		is_admin: false,
		completed_onboarding: false,
		created_at: now,
		updated_at: now
	};
}

async function ensureUserProfile(
	authUser: User,
	locals: App.Locals,
	errorLogger: ErrorLoggerService,
	emailDomain: string | null
) {
	const profilePayload = buildProfilePayload(authUser);
	const sessionClient = locals.supabase;

	const fetchWithClient = async (client: App.Locals['supabase'], source: 'session' | 'admin') => {
		const { data, error } = await client
			.from('users')
			.select('*')
			.eq('id', authUser.id)
			.maybeSingle();

		if (error && error.code !== 'PGRST116') {
			await errorLogger.logError(error, {
				endpoint: '/api/auth/login',
				httpMethod: 'POST',
				operationType: 'auth_login_profile_fetch',
				metadata: {
					emailDomain,
					flow: 'password',
					source,
					userId: authUser.id
				}
			});
			return null;
		}

		return data ?? null;
	};

	const insertWithClient = async (
		client: App.Locals['supabase'],
		source: 'session' | 'admin'
	) => {
		const { data, error } = await client.from('users').insert(profilePayload).select().single();

		if (!error) {
			return data;
		}

		if (error.code === '23505') {
			return fetchWithClient(client, source);
		}

		await errorLogger.logError(error, {
			endpoint: '/api/auth/login',
			httpMethod: 'POST',
			operationType: 'auth_login_profile_insert',
			metadata: {
				emailDomain,
				flow: 'password',
				source,
				userId: authUser.id
			}
		});
		return null;
	};

	const existing = await fetchWithClient(sessionClient, 'session');
	if (existing) {
		return existing;
	}

	const inserted = await insertWithClient(sessionClient, 'session');
	if (inserted) {
		return inserted;
	}

	try {
		const adminClient = createAdminSupabaseClient();
		const adminExisting = await fetchWithClient(adminClient, 'admin');
		if (adminExisting) {
			return adminExisting;
		}

		return await insertWithClient(adminClient, 'admin');
	} catch (error) {
		await errorLogger.logError(error, {
			endpoint: '/api/auth/login',
			httpMethod: 'POST',
			operationType: 'auth_login_profile_admin_fallback',
			metadata: {
				emailDomain,
				flow: 'password',
				userId: authUser.id
			}
		});
		return null;
	}
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const { supabase } = locals;
	let payload: { email?: string; password?: string };

	try {
		payload = await request.json();
	} catch {
		return ApiResponse.error(
			'Invalid request body',
			HttpStatus.BAD_REQUEST,
			ErrorCode.INVALID_REQUEST
		);
	}

	const { email, password } = payload ?? {};

	if (!email || !password) {
		return ApiResponse.error(
			'Email and password are required',
			HttpStatus.BAD_REQUEST,
			ErrorCode.MISSING_FIELD,
			{ fields: ['email', 'password'] }
		);
	}

	if (typeof email !== 'string' || typeof password !== 'string') {
		return ApiResponse.error(
			'Email and password must be strings',
			HttpStatus.BAD_REQUEST,
			ErrorCode.INVALID_FIELD,
			{ fields: ['email', 'password'] }
		);
	}

	const emailDomain = typeof email === 'string' ? getEmailDomain(email) : null;

	try {
		const errorLogger = ErrorLoggerService.getInstance(supabase);

		// Sign in using the server-side client
		const { data, error } = await supabase.auth.signInWithPassword({
			email: email.trim(),
			password
		});

		if (error) {
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
		locals.user = null;

		let profileUser = null;
		if (data.user) {
			profileUser = await ensureUserProfile(data.user, locals, errorLogger, emailDomain);
			if (profileUser) {
				locals.user = profileUser;
			}
		}

		if (data.user && !profileUser) {
			await errorLogger.logError(new Error('Login failed - user profile unavailable'), {
				endpoint: '/api/auth/login',
				httpMethod: 'POST',
				operationType: 'auth_login_profile_required',
				metadata: {
					emailDomain,
					flow: 'password',
					userId: data.user.id
				}
			});

			try {
				await supabase.auth.signOut({ scope: 'global' });
			} catch (signOutError) {
				await errorLogger.logError(signOutError, {
					endpoint: '/api/auth/login',
					httpMethod: 'POST',
					operationType: 'auth_login_cleanup_signout',
					metadata: {
						emailDomain,
						flow: 'password',
						userId: data.user.id
					}
				});
			}

			return ApiResponse.error(
				'We could not load your account profile. Please try again.',
				HttpStatus.SERVICE_UNAVAILABLE,
				ErrorCode.SERVICE_UNAVAILABLE
			);
		}

		// Return success with user data
		return ApiResponse.success(
			{
				user: profileUser
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
