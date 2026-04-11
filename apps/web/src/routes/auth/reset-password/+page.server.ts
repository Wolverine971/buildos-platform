// apps/web/src/routes/auth/reset-password/+page.server.ts
import { redirect, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	getSecurityEventLogOptions,
	getSecurityRequestContext,
	logSecurityEvent
} from '$lib/server/security-event-logger';

const RESET_PASSWORD_PATH = '/auth/reset-password';
const RECOVERY_LINK_INVALID_MESSAGE =
	'This password reset link is invalid or expired. Please request a new one.';
const RECOVERY_SESSION_MISSING_MESSAGE =
	'Your reset session is missing or expired. Request a new password reset link and try again.';
const decodeAuthError = (value: string) => {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
};

export const load: PageServerLoad = async ({
	url,
	request,
	platform,
	locals: { safeGetSession, supabase }
}) => {
	const code = url.searchParams.get('code');
	const tokenHash = url.searchParams.get('token_hash');
	const type = url.searchParams.get('type');
	const authError = url.searchParams.get('error_description') ?? url.searchParams.get('error');
	const requestContext = getSecurityRequestContext(request);
	const securityEventOptions = getSecurityEventLogOptions(platform);

	if (code) {
		const { error } = await supabase.auth.exchangeCodeForSession(code);
		if (!error) {
			await logSecurityEvent(
				{
					eventType: 'auth.password_reset.session_established',
					category: 'auth',
					outcome: 'success',
					severity: 'info',
					actorType: 'anonymous',
					...requestContext,
					metadata: {
						flow: 'password_reset',
						method: 'code'
					}
				},
				securityEventOptions
			);
			throw redirect(303, RESET_PASSWORD_PATH);
		}

		const { session } = await safeGetSession();
		if (session) {
			throw redirect(303, RESET_PASSWORD_PATH);
		}

		await logSecurityEvent(
			{
				eventType: 'auth.password_reset.session_failed',
				category: 'auth',
				outcome: 'failure',
				severity: 'low',
				actorType: 'anonymous',
				reason: error.message,
				...requestContext,
				metadata: {
					flow: 'password_reset',
					method: 'code',
					authProviderErrorCode: error.code,
					authProviderStatus: error.status
				}
			},
			securityEventOptions
		);
		return {
			hasRecoverySession: false,
			recoveryError: RECOVERY_LINK_INVALID_MESSAGE
		};
	}

	if (tokenHash && type === 'recovery') {
		const { error } = await supabase.auth.verifyOtp({
			type: 'recovery',
			token_hash: tokenHash
		});

		if (!error) {
			await logSecurityEvent(
				{
					eventType: 'auth.password_reset.session_established',
					category: 'auth',
					outcome: 'success',
					severity: 'info',
					actorType: 'anonymous',
					...requestContext,
					metadata: {
						flow: 'password_reset',
						method: 'token_hash'
					}
				},
				securityEventOptions
			);
			throw redirect(303, RESET_PASSWORD_PATH);
		}

		const { session } = await safeGetSession();
		if (session) {
			throw redirect(303, RESET_PASSWORD_PATH);
		}

		await logSecurityEvent(
			{
				eventType: 'auth.password_reset.session_failed',
				category: 'auth',
				outcome: 'failure',
				severity: 'low',
				actorType: 'anonymous',
				reason: error.message,
				...requestContext,
				metadata: {
					flow: 'password_reset',
					method: 'token_hash',
					authProviderErrorCode: error.code,
					authProviderStatus: error.status
				}
			},
			securityEventOptions
		);
		return {
			hasRecoverySession: false,
			recoveryError: RECOVERY_LINK_INVALID_MESSAGE
		};
	}

	if (authError) {
		await logSecurityEvent(
			{
				eventType: 'auth.password_reset.link_error',
				category: 'auth',
				outcome: 'failure',
				severity: 'low',
				actorType: 'anonymous',
				reason: decodeAuthError(authError),
				...requestContext,
				metadata: {
					flow: 'password_reset'
				}
			},
			securityEventOptions
		);
		return {
			hasRecoverySession: false,
			recoveryError: decodeAuthError(authError)
		};
	}

	const { session } = await safeGetSession();

	return {
		hasRecoverySession: Boolean(session),
		recoveryError: null
	};
};

export const actions: Actions = {
	default: async ({ request, platform, locals: { supabase, safeGetSession } }) => {
		const formData = await request.formData();
		const password = formData.get('password') as string;
		const confirmPassword = formData.get('confirmPassword') as string;
		const { session } = await safeGetSession();
		const requestContext = getSecurityRequestContext(request);
		const securityEventOptions = getSecurityEventLogOptions(platform);

		if (!session) {
			await logSecurityEvent(
				{
					eventType: 'auth.password_reset.failed',
					category: 'auth',
					outcome: 'failure',
					severity: 'low',
					actorType: 'anonymous',
					reason: 'session_missing',
					...requestContext,
					metadata: {
						flow: 'password_reset'
					}
				},
				securityEventOptions
			);
			return fail(401, {
				error: RECOVERY_SESSION_MISSING_MESSAGE
			});
		}

		if (!password || !confirmPassword) {
			return fail(400, {
				error: 'Password and confirm password are required'
			});
		}

		if (password !== confirmPassword) {
			return fail(400, {
				error: 'Passwords do not match'
			});
		}

		if (password.length < 6) {
			return fail(400, {
				error: 'Password must be at least 6 characters long'
			});
		}

		const { error } = await supabase.auth.updateUser({
			password
		});

		if (error) {
			await logSecurityEvent(
				{
					eventType: 'auth.password_reset.failed',
					category: 'auth',
					outcome: 'failure',
					severity: 'low',
					actorType: 'user',
					actorUserId: session.user?.id ?? null,
					reason: error.message,
					...requestContext,
					metadata: {
						flow: 'password_reset',
						authProviderErrorCode: error.code,
						authProviderStatus: error.status
					}
				},
				securityEventOptions
			);
			if (error.message.toLowerCase().includes('auth session')) {
				return fail(401, {
					error: RECOVERY_SESSION_MISSING_MESSAGE
				});
			}

			return fail(400, {
				error: error.message
			});
		}

		await logSecurityEvent(
			{
				eventType: 'auth.password_reset.completed',
				category: 'auth',
				outcome: 'success',
				severity: 'medium',
				actorType: 'user',
				actorUserId: session.user?.id ?? null,
				...requestContext,
				metadata: {
					flow: 'password_reset'
				}
			},
			securityEventOptions
		);
		throw redirect(303, '/auth/login?message=Password updated successfully');
	}
};
