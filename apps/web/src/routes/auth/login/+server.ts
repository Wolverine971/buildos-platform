// apps/web/src/routes/auth/login/+server.ts
import type { RequestHandler } from './$types';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';
import { routeErrorResponse, getRouteRequestId } from '$lib/server/route-error';
import {
	getEmailDomain,
	getSecurityEventLogOptions,
	getSecurityRequestContext,
	logSecurityEvent
} from '$lib/server/security-event-logger';
import { ApiResponse, ErrorCode, HttpStatus } from '$lib/utils/api-response';

export const POST: RequestHandler = async (event) => {
	const { request, platform, locals } = event;
	const { supabase } = locals;

	let body: unknown;

	try {
		body = await request.json();
	} catch {
		return ApiResponse.badRequest('Request body must be valid JSON');
	}

	if (!body || typeof body !== 'object') {
		return ApiResponse.badRequest('Request body must be an object');
	}

	const { email, password } = body as Record<string, unknown>;
	const errorLogger = ErrorLoggerService.getInstance(supabase);
	const emailDomain = typeof email === 'string' ? getEmailDomain(email) : null;
	const requestContext = getSecurityRequestContext(request);
	const securityEventOptions = getSecurityEventLogOptions(platform);
	const requestId = getRouteRequestId(event);

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
		return ApiResponse.error(
			'Email and password are required',
			HttpStatus.BAD_REQUEST,
			ErrorCode.MISSING_FIELD,
			{ fields: ['email', 'password'] },
			{ requestId }
		);
	}

	if (typeof email !== 'string' || typeof password !== 'string') {
		return ApiResponse.error(
			'Email and password must be strings',
			HttpStatus.BAD_REQUEST,
			ErrorCode.INVALID_FIELD,
			{ fields: ['email', 'password'] },
			{ requestId }
		);
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
					requestId,
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
				requestId,
				metadata: {
					emailDomain,
					flow: 'password'
				}
			});
			return ApiResponse.error(
				'Login failed - no session created',
				HttpStatus.UNAUTHORIZED,
				ErrorCode.OPERATION_FAILED,
				undefined,
				{ requestId }
			);
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
		return ApiResponse.success(
			{
				user: data.user,
				redirectTo: '/?auth_success=true&message=' + encodeURIComponent('Welcome back!')
			},
			'Logged in successfully',
			undefined,
			{ requestId }
		);
	} catch (err: unknown) {
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
		return routeErrorResponse(event, err, {
			operation: 'auth_login',
			message: 'Login failed',
			severity: 'error',
			metadata: {
				emailDomain,
				flow: 'password'
			}
		});
	}
};
