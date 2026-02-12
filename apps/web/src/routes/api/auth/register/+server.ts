// apps/web/src/routes/api/auth/register/+server.ts
import type { RequestHandler } from './$types';
import type { User } from '@supabase/supabase-js';
import { validateEmail } from '$lib/utils/email-validation';
import { ApiResponse, ErrorCode, HttpStatus } from '$lib/utils/api-response';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';
import { createAdminSupabaseClient } from '$lib/supabase/admin';

function getEmailDomain(value: string): string | null {
	const trimmed = value.trim().toLowerCase();
	const atIndex = trimmed.lastIndexOf('@');
	if (atIndex <= 0 || atIndex === trimmed.length - 1) return null;
	return trimmed.slice(atIndex + 1);
}

function buildProfilePayload(authUser: User, name?: string) {
	const now = new Date().toISOString();
	return {
		id: authUser.id,
		email: authUser.email as string,
		name: name || authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'User',
		is_admin: false,
		completed_onboarding: false,
		created_at: now,
		updated_at: now
	};
}

async function ensureUserProfileForRegistration({
	authUser,
	profileName,
	supabase,
	errorLogger,
	emailDomain,
	hasSession
}: {
	authUser: User;
	profileName?: string;
	supabase: App.Locals['supabase'];
	errorLogger: ErrorLoggerService;
	emailDomain: string | null;
	hasSession: boolean;
}) {
	const payload = buildProfilePayload(authUser, profileName);
	let primaryClient: App.Locals['supabase'] = supabase;

	if (!hasSession) {
		try {
			primaryClient = createAdminSupabaseClient();
		} catch (error) {
			await errorLogger.logError(error, {
				endpoint: '/api/auth/register',
				httpMethod: 'POST',
				operationType: 'auth_register_profile_admin_client_init',
				metadata: {
					emailDomain,
					userId: authUser.id,
					hasSession
				}
			});
		}
	}

	const fetchWithClient = async (client: App.Locals['supabase'], source: 'session' | 'admin') => {
		const { data, error } = await client
			.from('users')
			.select('*')
			.eq('id', authUser.id)
			.maybeSingle();

		if (!error) {
			return { user: data ?? null, error: null };
		}

		if (error.code === 'PGRST116') {
			return { user: null, error: null };
		}

		await errorLogger.logError(error, {
			endpoint: '/api/auth/register',
			httpMethod: 'POST',
			operationType: 'auth_register_profile_check',
			metadata: {
				emailDomain,
				userId: authUser.id,
				hasSession,
				source
			}
		});

		return { user: null, error };
	};

	const insertWithClient = async (
		client: App.Locals['supabase'],
		source: 'session' | 'admin'
	) => {
		const { data, error } = await client.from('users').insert(payload).select().single();

		if (!error) {
			return data;
		}

		if (error.code === '23505') {
			const { user } = await fetchWithClient(client, source);
			return user;
		}

		await errorLogger.logError(error, {
			endpoint: '/api/auth/register',
			httpMethod: 'POST',
			operationType: 'auth_register_profile_insert',
			metadata: {
				emailDomain,
				userId: authUser.id,
				hasSession,
				source
			}
		});
		return null;
	};

	const { user: existingUser } = await fetchWithClient(
		primaryClient,
		hasSession ? 'session' : 'admin'
	);
	if (existingUser) {
		return existingUser;
	}

	const insertedUser = await insertWithClient(primaryClient, hasSession ? 'session' : 'admin');
	if (insertedUser || !hasSession) {
		return insertedUser;
	}

	try {
		const adminClient = createAdminSupabaseClient();
		const { user: adminExisting } = await fetchWithClient(adminClient, 'admin');
		if (adminExisting) {
			return adminExisting;
		}
		return await insertWithClient(adminClient, 'admin');
	} catch (error) {
		await errorLogger.logError(error, {
			endpoint: '/api/auth/register',
			httpMethod: 'POST',
			operationType: 'auth_register_profile_admin_fallback',
			metadata: {
				emailDomain,
				userId: authUser.id,
				hasSession
			}
		});
		return null;
	}
}

export const POST: RequestHandler = async ({ request, locals }) => {
	let payload: { email?: string; password?: string; name?: string };

	try {
		payload = await request.json();
	} catch {
		return ApiResponse.error(
			'Invalid request body',
			HttpStatus.BAD_REQUEST,
			ErrorCode.INVALID_REQUEST
		);
	}

	const { email, password, name } = payload ?? {};
	const { supabase, safeGetSession } = locals;
	const errorLogger = ErrorLoggerService.getInstance(supabase);
	const emailDomain = typeof email === 'string' ? getEmailDomain(email) : null;

	// Validation
	if (!email || !password) {
		return ApiResponse.error(
			'Email and password are required',
			HttpStatus.BAD_REQUEST,
			ErrorCode.MISSING_FIELD,
			{ fields: ['email', 'password'] }
		);
	}

	if (
		typeof email !== 'string' ||
		typeof password !== 'string' ||
		(name !== undefined && name !== null && typeof name !== 'string')
	) {
		return ApiResponse.error(
			'Invalid registration payload',
			HttpStatus.BAD_REQUEST,
			ErrorCode.INVALID_FIELD
		);
	}

	// Email format validation (enhanced security)
	const emailValidation = validateEmail(email);
	if (!emailValidation.success) {
		return ApiResponse.error(
			emailValidation.error || 'Please enter a valid email address',
			HttpStatus.BAD_REQUEST,
			ErrorCode.INVALID_FIELD,
			{ field: 'email' }
		);
	}

	// Password validation
	if (password.length < 8) {
		return ApiResponse.error(
			'Password must be at least 8 characters long',
			HttpStatus.BAD_REQUEST,
			ErrorCode.INVALID_FIELD,
			{ field: 'password', reason: 'too_short' }
		);
	}

	// Password strength validation
	const hasUpperCase = /[A-Z]/.test(password);
	const hasLowerCase = /[a-z]/.test(password);
	const hasNumbers = /\d/.test(password);

	if (!hasUpperCase || !hasLowerCase || !hasNumbers) {
		return ApiResponse.error(
			'Password must contain at least one uppercase letter, one lowercase letter, and one number',
			HttpStatus.BAD_REQUEST,
			ErrorCode.INVALID_FIELD,
			{ field: 'password', reason: 'weak_password' }
		);
	}

	try {
		// Create the user (use validated/normalized email)
		const validatedEmail = emailValidation.email!;
		const { data, error: signUpError } = await supabase.auth.signUp({
			email: validatedEmail,
			password,
			options: {
				data: {
					name: name || validatedEmail.split('@')[0]
				}
			}
		});

		if (signUpError) {
			console.error('Registration error:', signUpError);
			const isSchemaError =
				signUpError.message.includes('column') &&
				signUpError.message.includes('does not exist');
			const isExistingUser =
				signUpError.message.includes('already registered') ||
				signUpError.message.includes('already exists') ||
				signUpError.message.includes('User already registered');
			await errorLogger.logError(
				signUpError,
				{
					endpoint: '/api/auth/register',
					httpMethod: 'POST',
					operationType: 'auth_register',
					metadata: {
						emailDomain,
						flow: 'password',
						code: signUpError.code
					}
				},
				isSchemaError ? 'critical' : isExistingUser ? 'warning' : 'error'
			);

			// Enhanced error logging for auth schema issues
			if (isSchemaError) {
				console.error('AUTH SCHEMA ERROR - Missing column detected:', {
					message: signUpError.message,
					error: signUpError,
					hint: 'Run diagnostic query: /apps/web/supabase/diagnostics/check_auth_schema.sql',
					fix: 'If provider column missing, run: /apps/web/supabase/migrations/20251022_fix_auth_identities_provider.sql'
				});

				// Return a user-friendly error while we investigate
				return ApiResponse.error(
					'Registration service is temporarily unavailable. Our team has been notified.',
					HttpStatus.SERVICE_UNAVAILABLE,
					ErrorCode.SERVICE_UNAVAILABLE,
					process.env.NODE_ENV === 'development'
						? { debug: signUpError.message }
						: undefined
				);
			}

			// Handle specific error cases
			if (isExistingUser) {
				return ApiResponse.error(
					'An account with this email already exists. Please sign in instead.',
					HttpStatus.CONFLICT,
					ErrorCode.ALREADY_EXISTS
				);
			}

			return ApiResponse.error(
				signUpError.message,
				HttpStatus.BAD_REQUEST,
				ErrorCode.OPERATION_FAILED
			);
		}

		let profileUser: any = null;

		// IMPORTANT: Create public.users entry since we can't use triggers on auth.users in Supabase
		if (data.user) {
			const hasSession = !!data.session;
			const profileName = typeof name === 'string' ? name.trim() || undefined : undefined;
			profileUser = await ensureUserProfileForRegistration({
				authUser: data.user,
				profileName,
				supabase,
				errorLogger,
				emailDomain,
				hasSession
			});
		}

		// Check if email confirmation is required
		if (data.user && !data.session) {
			return ApiResponse.success(
				{
					requiresEmailConfirmation: true
				},
				'Registration successful! Please check your email to confirm your account before signing in.'
			);
		}

		// If we have a session (auto-login successful)
		if (data.session) {
			if (!profileUser && data.user) {
				await errorLogger.logError(
					new Error('Registration failed - user profile unavailable'),
					{
						endpoint: '/api/auth/register',
						httpMethod: 'POST',
						operationType: 'auth_register_profile_required',
						metadata: {
							emailDomain,
							flow: 'password',
							userId: data.user.id
						}
					}
				);

				try {
					await supabase.auth.signOut({ scope: 'global' });
				} catch (signOutError) {
					await errorLogger.logError(signOutError, {
						endpoint: '/api/auth/register',
						httpMethod: 'POST',
						operationType: 'auth_register_cleanup_signout',
						metadata: {
							emailDomain,
							flow: 'password',
							userId: data.user.id
						}
					});
				}

				return ApiResponse.error(
					'We could not finish account setup. Please try again.',
					HttpStatus.SERVICE_UNAVAILABLE,
					ErrorCode.SERVICE_UNAVAILABLE
				);
			}

			// Update locals for this request
			locals.session = data.session;
			locals.user = profileUser ?? null;

			// Force load user data
			const { user } = await safeGetSession();

			return ApiResponse.success(
				{
					user: user || profileUser,
					requiresEmailConfirmation: false
				},
				'Registration successful'
			);
		}

		await errorLogger.logError(new Error('Registration failed - missing user/session'), {
			endpoint: '/api/auth/register',
			httpMethod: 'POST',
			operationType: 'auth_register',
			metadata: {
				emailDomain,
				flow: 'password'
			}
		});
		return ApiResponse.error(
			'Registration failed. Please try again.',
			HttpStatus.INTERNAL_SERVER_ERROR,
			ErrorCode.OPERATION_FAILED
		);
	} catch (err: any) {
		console.error('Unexpected registration error:', err);
		await errorLogger.logError(err, {
			endpoint: '/api/auth/register',
			httpMethod: 'POST',
			operationType: 'auth_register',
			metadata: {
				emailDomain,
				flow: 'password'
			}
		});

		// Network error handling
		if (err instanceof TypeError && err.message.includes('fetch')) {
			return ApiResponse.error(
				'Network error. Please check your connection and try again.',
				HttpStatus.SERVICE_UNAVAILABLE,
				ErrorCode.SERVICE_UNAVAILABLE
			);
		}

		return ApiResponse.internalError(err, 'An unexpected error occurred. Please try again.');
	}
};
