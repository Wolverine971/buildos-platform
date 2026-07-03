// apps/web/src/routes/api/auth/register/+server.ts
import type { RequestHandler } from './$types';
import { z } from 'zod';
import {
	ensureUserProfileWithAuthenticatedSession,
	ensureUserProfileWithClient
} from '$lib/server/auth-user-profile';
import { validateEmail } from '$lib/utils/email-validation';
import { ApiResponse, ErrorCode, HttpStatus } from '$lib/utils/api-response';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { WelcomeSequenceService } from '$lib/server/welcome-sequence.service';
import { captureServerEvent } from '$lib/server/posthog';
import { parseJsonRequest } from '$lib/utils/request-validation';

const registerRequestSchema = z
	.object({
		email: z.string(),
		password: z.string(),
		name: z.string().nullable().optional(),
		attribution: z.unknown().optional()
	})
	.strict();

interface SignupAttribution {
	utm_source: string | null;
	utm_medium: string | null;
	utm_campaign: string | null;
	referrer: string | null;
	landing_page: string | null;
}

function sanitizeAttribution(raw: unknown): SignupAttribution | null {
	if (!raw || typeof raw !== 'object') return null;
	const pick = (key: string): string | null => {
		const value = (raw as Record<string, unknown>)[key];
		return typeof value === 'string' && value.trim() ? value.trim().slice(0, 500) : null;
	};
	const attribution: SignupAttribution = {
		utm_source: pick('utm_source'),
		utm_medium: pick('utm_medium'),
		utm_campaign: pick('utm_campaign'),
		referrer: pick('referrer'),
		landing_page: pick('landing_page')
	};
	return attribution.utm_source || attribution.referrer ? attribution : null;
}

function deriveSignupSource(attribution: SignupAttribution | null): string {
	if (attribution?.utm_source) return attribution.utm_source;
	if (attribution?.referrer) {
		try {
			return new URL(attribution.referrer).hostname;
		} catch {
			return 'referral';
		}
	}
	return 'direct';
}

function getEmailDomain(value: string): string | null {
	const trimmed = value.trim().toLowerCase();
	const atIndex = trimmed.lastIndexOf('@');
	if (atIndex <= 0 || atIndex === trimmed.length - 1) return null;
	return trimmed.slice(atIndex + 1);
}

async function ensureUserProfileForRegistration({
	authUser,
	profileName,
	supabase,
	errorLogger,
	emailDomain,
	hasSession,
	accessToken
}: {
	authUser: Parameters<typeof ensureUserProfileWithClient>[0]['authUser'];
	profileName?: string;
	supabase: App.Locals['supabase'];
	errorLogger: ErrorLoggerService;
	emailDomain: string | null;
	hasSession: boolean;
	accessToken: string | null | undefined;
}) {
	const metadata = {
		emailDomain,
		hasSession
	};

	if (hasSession) {
		return ensureUserProfileWithAuthenticatedSession({
			authUser,
			accessToken,
			sessionClient: supabase,
			errorLogger,
			endpoint: '/api/auth/register',
			fetchOperationType: 'auth_register_profile_check',
			insertOperationType: 'auth_register_profile_insert',
			metadata,
			profileName
		});
	}

	// Email-confirmation signups still have no user session to scope against.
	// Leave this admin path in place until profile creation moves post-confirmation.
	try {
		const adminClient = createAdminSupabaseClient();
		return ensureUserProfileWithClient({
			authUser,
			client: adminClient,
			source: 'admin',
			errorLogger,
			endpoint: '/api/auth/register',
			fetchOperationType: 'auth_register_profile_check',
			insertOperationType: 'auth_register_profile_insert',
			metadata,
			profileName
		});
	} catch (error) {
		await errorLogger.logError(error, {
			endpoint: '/api/auth/register',
			httpMethod: 'POST',
			operationType: 'auth_register_profile_admin_client_init',
			metadata: {
				...metadata,
				userId: authUser.id
			}
		});
		return null;
	}
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const parsed = await parseJsonRequest(request, registerRequestSchema);
	if (!parsed.ok) return parsed.response;
	const payload = parsed.data;

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
				hasSession,
				accessToken: data.session?.access_token
			});
		}

		// Signup analytics + durable first-touch attribution (both best-effort)
		if (data.user) {
			const attribution = sanitizeAttribution(payload?.attribution);
			const signupSource = deriveSignupSource(attribution);

			if (profileUser?.id) {
				try {
					const adminClient = createAdminSupabaseClient();
					await adminClient
						.from('users')
						.update({
							signup_source: signupSource,
							utm_source: attribution?.utm_source ?? null,
							utm_medium: attribution?.utm_medium ?? null,
							utm_campaign: attribution?.utm_campaign ?? null,
							referrer: attribution?.referrer ?? null
							// Cast: columns land with migration 20260701010000; remove after gen:types
						} as any)
						.eq('id', profileUser.id);
				} catch (attributionError) {
					console.error('Failed to persist signup attribution:', attributionError);
				}
			}

			await captureServerEvent(data.user.id, 'signup', {
				signup_method: 'email',
				email_domain: emailDomain,
				signup_source: signupSource,
				landing_page: attribution?.landing_page ?? null,
				$set_once: {
					signup_source: signupSource,
					utm_source: attribution?.utm_source ?? null,
					utm_medium: attribution?.utm_medium ?? null,
					utm_campaign: attribution?.utm_campaign ?? null,
					referrer: attribution?.referrer ?? null
				}
			});
		}

		if (profileUser?.id) {
			try {
				const adminClient = createAdminSupabaseClient();
				await new WelcomeSequenceService(adminClient).startSequenceForUser({
					userId: profileUser.id,
					signupMethod: 'email'
				});
			} catch (welcomeError) {
				console.error('Failed to start welcome sequence after registration:', welcomeError);
				await errorLogger.logError(welcomeError, {
					endpoint: '/api/auth/register',
					httpMethod: 'POST',
					operationType: 'welcome_sequence_start',
					metadata: {
						emailDomain,
						flow: 'password',
						userId: profileUser.id
					}
				});
			}
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
					await supabase.auth.signOut({ scope: 'local' });
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
