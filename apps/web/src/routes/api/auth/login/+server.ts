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

function getClientIp(headers: Headers): string | null {
	const cfConnectingIp = headers.get('cf-connecting-ip')?.trim();
	if (cfConnectingIp) return cfConnectingIp;

	const realIp = headers.get('x-real-ip')?.trim();
	if (realIp) return realIp;

	const forwardedFor = headers.get('x-forwarded-for');
	if (!forwardedFor) return null;

	const [firstIp] = forwardedFor.split(',');
	const candidate = firstIp?.trim();
	return candidate || null;
}

function getRequestId(headers: Headers): string | undefined {
	return (
		headers.get('x-request-id') ||
		headers.get('x-vercel-id') ||
		headers.get('x-amzn-trace-id') ||
		undefined
	);
}

function isEmailNotConfirmedError(error: { message?: string } | null | undefined): boolean {
	const message = (error?.message || '').toLowerCase();
	return message.includes('email not confirmed') || message.includes('email not verified');
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

function buildFallbackUser(authUser: User) {
	return {
		...buildProfilePayload(authUser),
		timezone: 'UTC'
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

	const normalizedEmail = email.trim().toLowerCase();
	const emailDomain = getEmailDomain(normalizedEmail);
	const requestId = getRequestId(request.headers);
	const clientIp = getClientIp(request.headers);
	const clientUserAgent = request.headers.get('user-agent') || null;
	const attemptMetadata = {
		attemptedEmail: normalizedEmail,
		emailDomain,
		flow: 'password',
		clientIp,
		clientUserAgent
	};

	try {
		const errorLogger = ErrorLoggerService.getInstance(supabase);

		// Sign in using the server-side client
		const { data, error } = await supabase.auth.signInWithPassword({
			email: normalizedEmail,
			password
		});

		if (error) {
			const emailNotConfirmed = isEmailNotConfirmedError(error);
			await errorLogger.logError(
				error,
				{
					endpoint: '/api/auth/login',
					httpMethod: 'POST',
					operationType: 'auth_login',
					requestId,
					metadata: {
						...attemptMetadata,
						authProviderErrorCode: error.code,
						authProviderStatus: error.status,
						reason: emailNotConfirmed ? 'email_not_confirmed' : 'login_failed'
					}
				},
				'warning'
			);

			if (emailNotConfirmed) {
				return ApiResponse.error(
					'Your email is not confirmed yet. Check your inbox and spam folder for the confirmation email.',
					HttpStatus.UNAUTHORIZED,
					ErrorCode.EMAIL_NOT_CONFIRMED,
					{
						reason: 'email_not_confirmed',
						action: 'check_email'
					}
				);
			}

			return ApiResponse.unauthorized(error.message);
		}

		if (!data.session) {
			await errorLogger.logError(
				new Error('Login failed - no session created'),
				{
					endpoint: '/api/auth/login',
					httpMethod: 'POST',
					operationType: 'auth_login',
					requestId,
					metadata: {
						...attemptMetadata
					}
				},
				'warning'
			);
			return ApiResponse.error(
				'Login failed - no session created',
				HttpStatus.UNAUTHORIZED,
				ErrorCode.OPERATION_FAILED
			);
		}

		// Ensure this server-side client is hydrated with the signed-in session
		// before attempting profile queries in the same request lifecycle.
		const { error: setSessionError } = await supabase.auth.setSession({
			access_token: data.session.access_token,
			refresh_token: data.session.refresh_token
		});

		if (setSessionError) {
			await errorLogger.logError(
				setSessionError,
				{
					endpoint: '/api/auth/login',
					httpMethod: 'POST',
					operationType: 'auth_login_set_session',
					requestId,
					metadata: {
						...attemptMetadata,
						userId: data.user?.id
					}
				},
				'warning'
			);
		}

		// Update locals immediately for this request
		locals.session = data.session;
		locals.user = null;

		let profileUser = null;
		if (data.user) {
			profileUser = await ensureUserProfile(data.user, locals, errorLogger, emailDomain);

			// If profile resolution failed in ensureUserProfile, retry through the
			// normal session path once before downgrading to a fallback payload.
			if (!profileUser) {
				const { user: safeSessionUser } = await locals.safeGetSession();
				if (safeSessionUser) {
					profileUser = safeSessionUser;
				}
			}

			if (profileUser) {
				locals.user = profileUser;
			}
		}

		if (data.user && !profileUser) {
			await errorLogger.logError(
				new Error('Login succeeded but user profile remained unavailable'),
				{
					endpoint: '/api/auth/login',
					httpMethod: 'POST',
					operationType: 'auth_login_profile_required',
					requestId,
					metadata: {
						...attemptMetadata,
						userId: data.user.id
					}
				},
				'warning'
			);

			// Do not hard-fail authentication on profile read race conditions.
			// A subsequent request can rehydrate from the canonical users row.
			profileUser = buildFallbackUser(data.user);
			locals.user = profileUser as any;
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
			requestId,
			metadata: {
				...attemptMetadata
			}
		});
		return ApiResponse.internalError(err, 'Login failed');
	}
};
