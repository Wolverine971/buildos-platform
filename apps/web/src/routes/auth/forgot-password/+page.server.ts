// apps/web/src/routes/auth/forgot-password/+page.server.ts
import { redirect, fail } from '@sveltejs/kit';
import { getRedirectURL } from '$lib/supabase';
import {
	getEmailDomain,
	getSecurityEventLogOptions,
	getSecurityRequestContext,
	logSecurityEvent
} from '$lib/server/security-event-logger';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { safeGetSession } }) => {
	const { session } = await safeGetSession();

	if (session) {
		throw redirect(303, '/');
	}
};

export const actions: Actions = {
	default: async ({ request, platform, locals: { supabase } }) => {
		const formData = await request.formData();
		const email = formData.get('email') as string;
		const emailDomain = getEmailDomain(email);
		const requestContext = getSecurityRequestContext(request);
		const securityEventOptions = getSecurityEventLogOptions(platform);

		if (!email) {
			await logSecurityEvent(
				{
					eventType: 'auth.password_reset.request_rejected',
					category: 'auth',
					outcome: 'failure',
					severity: 'low',
					actorType: 'anonymous',
					reason: 'missing_email',
					...requestContext,
					metadata: {
						flow: 'password_reset'
					}
				},
				securityEventOptions
			);
			return fail(400, {
				error: 'Email is required',
				email
			});
		}

		const { error } = await supabase.auth.resetPasswordForEmail(email, {
			redirectTo: getRedirectURL('/auth/reset-password')
		});

		if (error) {
			await logSecurityEvent(
				{
					eventType: 'auth.password_reset.request_failed',
					category: 'auth',
					outcome: 'failure',
					severity: 'low',
					actorType: 'anonymous',
					reason: error.message,
					...requestContext,
					metadata: {
						emailDomain,
						flow: 'password_reset',
						authProviderErrorCode: error.code,
						authProviderStatus: error.status
					}
				},
				securityEventOptions
			);
			return fail(400, {
				error: error.message,
				email
			});
		}

		await logSecurityEvent(
			{
				eventType: 'auth.password_reset.requested',
				category: 'auth',
				outcome: 'success',
				severity: 'info',
				actorType: 'anonymous',
				...requestContext,
				metadata: {
					emailDomain,
					flow: 'password_reset'
				}
			},
			securityEventOptions
		);

		return {
			success: true,
			message: 'Check your email for a password reset link.'
		};
	}
};
