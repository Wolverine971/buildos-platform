// apps/web/src/routes/api/auth/register/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { validateEmail } from '$lib/utils/email-validation';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { email, password, name } = await request.json();
	const { supabase, safeGetSession } = locals;

	// Validation
	if (!email || !password) {
		return json({ error: 'Email and password are required' }, { status: 400 });
	}

	// Email format validation (enhanced security)
	const emailValidation = validateEmail(email);
	if (!emailValidation.success) {
		return json(
			{ error: emailValidation.error || 'Please enter a valid email address' },
			{ status: 400 }
		);
	}

	// Password validation
	if (password.length < 8) {
		return json({ error: 'Password must be at least 8 characters long' }, { status: 400 });
	}

	// Password strength validation
	const hasUpperCase = /[A-Z]/.test(password);
	const hasLowerCase = /[a-z]/.test(password);
	const hasNumbers = /\d/.test(password);

	if (!hasUpperCase || !hasLowerCase || !hasNumbers) {
		return json(
			{
				error: 'Password must contain at least one uppercase letter, one lowercase letter, and one number'
			},
			{ status: 400 }
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

			// Enhanced error logging for auth schema issues
			if (
				signUpError.message.includes('column') &&
				signUpError.message.includes('does not exist')
			) {
				console.error('AUTH SCHEMA ERROR - Missing column detected:', {
					message: signUpError.message,
					error: signUpError,
					hint: 'Run diagnostic query: /apps/web/supabase/diagnostics/check_auth_schema.sql',
					fix: 'If provider column missing, run: /apps/web/supabase/migrations/20251022_fix_auth_identities_provider.sql'
				});

				// Return a user-friendly error while we investigate
				return json(
					{
						error: 'Registration service is temporarily unavailable. Our team has been notified.',
						code: 'AUTH_SERVICE_ERROR',
						debug:
							process.env.NODE_ENV === 'development' ? signUpError.message : undefined
					},
					{ status: 503 }
				);
			}

			// Handle specific error cases
			if (
				signUpError.message.includes('already registered') ||
				signUpError.message.includes('already exists') ||
				signUpError.message.includes('User already registered')
			) {
				return json(
					{
						error: 'An account with this email already exists. Please sign in instead.',
						code: 'USER_EXISTS'
					},
					{ status: 400 }
				);
			}

			return json({ error: signUpError.message }, { status: 400 });
		}

		// IMPORTANT: Create public.users entry since we can't use triggers on auth.users in Supabase
		if (data.user) {
			console.log('Creating public.users entry for:', data.user.email);

			// First check if user already exists (shouldn't happen, but be safe)
			const { data: existingUser, error: fetchError } = await supabase
				.from('users')
				.select('id')
				.eq('id', data.user.id)
				.maybeSingle();

			if (fetchError && fetchError.code === 'PGRST116') {
				// User doesn't exist, create them
				const { error: insertError } = await supabase.from('users').insert({
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
					// Don't fail registration, but log the error
					// The user can still authenticate, and we can fix the profile later
				} else {
					console.log('Successfully created public.users entry');
				}
			} else if (!fetchError && existingUser) {
				console.log('public.users entry already exists');
			} else if (fetchError) {
				console.error('Error checking user existence:', fetchError);
			}
		}

		// Check if email confirmation is required
		if (data.user && !data.session) {
			return json({
				success: true,
				requiresEmailConfirmation: true,
				message:
					'Registration successful! Please check your email to confirm your account before signing in.'
			});
		}

		// If we have a session (auto-login successful)
		if (data.session) {
			// Update locals for this request
			locals.session = data.session;
			locals.user = null; // Will be loaded by safeGetSession

			// Force load user data
			const { user } = await safeGetSession();

			return json({
				success: true,
				user: user || data.user,
				requiresEmailConfirmation: false
			});
		}

		return json({ error: 'Registration failed. Please try again.' }, { status: 500 });
	} catch (err: any) {
		console.error('Unexpected registration error:', err);

		// Network error handling
		if (err instanceof TypeError && err.message.includes('fetch')) {
			return json(
				{
					error: 'Network error. Please check your connection and try again.'
				},
				{ status: 503 }
			);
		}

		return json({ error: 'An unexpected error occurred. Please try again.' }, { status: 500 });
	}
};
