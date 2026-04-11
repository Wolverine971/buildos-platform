// apps/web/src/routes/auth/login/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';
import {
	getEmailDomain,
	getSecurityEventLogOptions,
	getSecurityRequestContext,
	logSecurityEvent
} from '$lib/server/security-event-logger';

export const POST: RequestHandler = async ({ request, platform, locals: { supabase } }) => {
	const { email, password } = await request.json();
	const errorLogger = ErrorLoggerService.getInstance(supabase);
	const emailDomain = typeof email === 'string' ? getEmailDomain(email) : null;
	const requestContext = getSecurityRequestContext(request);
	const securityEventOptions = getSecurityEventLogOptions(platform);

	if (!email || !password) {
		await logSecurityEvent(
			{
				eventType: 'auth.login.rejected',
				category: 'auth',
				outcome: 'failure',
				severity: 'low',
				actorType: 'anonymous',
				reason: 'missing_credentials',
				...requestContext,
				metadata: {
					emailDomain,
					flow: 'password'
				}
			},
			securityEventOptions
		);
		return json({ error: 'Email and password are required' }, { status: 400 });
	}

	try {
		// Sign in using the server-side client
		const { data, error } = await supabase.auth.signInWithPassword({
			email: email.trim(),
			password
		});

		if (error) {
			await logSecurityEvent(
				{
					eventType: 'auth.login.failed',
					category: 'auth',
					outcome: 'failure',
					severity: 'low',
					actorType: 'anonymous',
					reason: 'login_failed',
					...requestContext,
					metadata: {
						emailDomain,
						flow: 'password',
						authProviderErrorCode: error.code,
						authProviderStatus: error.status
					}
				},
				securityEventOptions
			);
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
			await logSecurityEvent(
				{
					eventType: 'auth.login.failed',
					category: 'auth',
					outcome: 'failure',
					severity: 'medium',
					actorType: 'anonymous',
					reason: 'session_missing',
					...requestContext,
					metadata: {
						emailDomain,
						flow: 'password'
					}
				},
				securityEventOptions
			);
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

		await logSecurityEvent(
			{
				eventType: 'auth.login.succeeded',
				category: 'auth',
				outcome: 'success',
				severity: 'info',
				actorType: 'user',
				actorUserId: data.user?.id ?? null,
				...requestContext,
				metadata: {
					emailDomain,
					flow: 'password'
				}
			},
			securityEventOptions
		);

		// The server-side client automatically sets cookies
		// Return success
		return json({
			success: true,
			user: data.user,
			redirectTo: '/?auth_success=true&message=' + encodeURIComponent('Welcome back!')
		});
	} catch (err: unknown) {
		console.error('Server login error:', err);
		await logSecurityEvent(
			{
				eventType: 'auth.login.error',
				category: 'auth',
				outcome: 'failure',
				severity: 'medium',
				actorType: 'anonymous',
				reason: err instanceof Error ? err.message : 'login_error',
				...requestContext,
				metadata: {
					emailDomain,
					flow: 'password'
				}
			},
			securityEventOptions
		);
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
