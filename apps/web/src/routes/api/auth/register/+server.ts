// apps/web/src/routes/api/auth/register/+server.ts
import type { RequestHandler } from './$types';
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

export const POST: RequestHandler = async ({ request, locals }) => {
	const { email, password, name } = await request.json();
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

		// IMPORTANT: Create public.users entry since we can't use triggers on auth.users in Supabase
		if (data.user) {
			console.log('Creating public.users entry for:', data.user.email);
			const hasSession = !!data.session;
			const profileClient = hasSession ? supabase : createAdminSupabaseClient();

			if (!hasSession) {
				console.info(
					'[Register] No session after signUp; using admin client for profile insert',
					{
						userId: data.user.id,
						emailDomain
					}
				);
			}

			// First check if user already exists (shouldn't happen, but be safe)
			const { data: existingUser, error: fetchError } = await profileClient
				.from('users')
				.select('id')
				.eq('id', data.user.id)
				.maybeSingle();

			if (fetchError) {
				// Unexpected error checking user existence
				console.error('Error checking user existence:', fetchError);
				await errorLogger.logError(fetchError, {
					endpoint: '/api/auth/register',
					httpMethod: 'POST',
					operationType: 'auth_register_profile_check',
					metadata: {
						emailDomain,
						userId: data.user.id,
						hasSession,
						usedAdminClient: !hasSession
					}
				});
			} else if (existingUser) {
				// User already exists in public.users
				console.log('public.users entry already exists');
			} else {
				// User doesn't exist in public.users - create them
				// Note: .maybeSingle() returns { data: null, error: null } when no rows found
				const { error: insertError } = await profileClient.from('users').insert({
					id: data.user.id,
					email: data.user.email as string,
					name:
						name ||
						data.user.user_metadata?.name ||
						data.user.email?.split('@')[0] ||
						'User',
					is_admin: false,
					completed_onboarding: false,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
					// Note: trial_ends_at and subscription_status will be set by the BEFORE INSERT trigger on public.users
				});

				if (insertError) {
					console.error('Error creating public.users entry:', insertError);
					await errorLogger.logError(insertError, {
						endpoint: '/api/auth/register',
						httpMethod: 'POST',
						operationType: 'auth_register_profile_insert',
						metadata: {
							emailDomain,
							userId: data.user.id,
							hasSession,
							usedAdminClient: !hasSession
						}
					});
					// Don't fail registration, but log the error
					// The user can still authenticate, and we can fix the profile later
				} else {
					console.log('Successfully created public.users entry');
				}
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
			// Update locals for this request
			locals.session = data.session;
			locals.user = null; // Will be loaded by safeGetSession

			// Force load user data
			const { user } = await safeGetSession();

			return ApiResponse.success(
				{
					user: user || data.user,
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
