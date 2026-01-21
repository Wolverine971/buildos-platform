// apps/web/src/routes/auth/login/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';

function getEmailDomain(value: string): string | null {
	const trimmed = value.trim().toLowerCase();
	const atIndex = trimmed.lastIndexOf('@');
	if (atIndex <= 0 || atIndex === trimmed.length - 1) return null;
	return trimmed.slice(atIndex + 1);
}

export const POST: RequestHandler = async ({ request, locals: { supabase } }) => {
	const { email, password } = await request.json();
	const errorLogger = ErrorLoggerService.getInstance(supabase);
	const emailDomain = typeof email === 'string' ? getEmailDomain(email) : null;

	if (!email || !password) {
		return json({ error: 'Email and password are required' }, { status: 400 });
	}

	try {
		// Sign in using the server-side client
		const { data, error } = await supabase.auth.signInWithPassword({
			email: email.trim(),
			password
		});

		if (error) {
			await errorLogger.logError(
				error,
				{
					endpoint: '/auth/login',
					httpMethod: 'POST',
					operationType: 'auth_login',
					metadata: {
						emailDomain,
						flow: 'password'
					}
				},
				'warning'
			);
			return json({ error: error.message }, { status: 401 });
		}

		if (!data.session) {
			await errorLogger.logError(new Error('Login failed - no session created'), {
				endpoint: '/auth/login',
				httpMethod: 'POST',
				operationType: 'auth_login',
				metadata: {
					emailDomain,
					flow: 'password'
				}
			});
			return json({ error: 'Login failed - no session created' }, { status: 401 });
		}

		// The server-side client automatically sets cookies
		// Return success
		return json({
			success: true,
			user: data.user,
			redirectTo: '/?auth_success=true&message=' + encodeURIComponent('Welcome back!')
		});
	} catch (err: unknown) {
		console.error('Server login error:', err);
		await errorLogger.logError(err, {
			endpoint: '/auth/login',
			httpMethod: 'POST',
			operationType: 'auth_login',
			metadata: {
				emailDomain,
				flow: 'password'
			}
		});
		return json({ error: 'Login failed' }, { status: 500 });
	}
};
