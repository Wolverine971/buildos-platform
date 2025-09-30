// apps/web/src/routes/api/auth/register/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { email, password, name } = await request.json();
	const { supabase, safeGetSession } = locals;

	// Validation
	if (!email || !password) {
		return json({ error: 'Email and password are required' }, { status: 400 });
	}

	// Email format validation
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	if (!emailRegex.test(email)) {
		return json({ error: 'Please enter a valid email address' }, { status: 400 });
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
		// Create the user
		const { data, error: signUpError } = await supabase.auth.signUp({
			email: email.trim(),
			password,
			options: {
				data: {
					name: name || email.split('@')[0]
				}
			}
		});

		if (signUpError) {
			console.error('Registration error:', signUpError);

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
