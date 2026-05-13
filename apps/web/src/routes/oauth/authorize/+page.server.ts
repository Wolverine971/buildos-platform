// apps/web/src/routes/oauth/authorize/+page.server.ts
import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { getSecurityEventLogOptions } from '$lib/server/security-event-logger';
import {
	approveOAuthAuthorization,
	buildOAuthRedirect,
	loadOAuthAuthorizationRequest,
	loadVisibleProjectsForOAuth,
	OAuthConnectorError
} from '$lib/server/agent-call/oauth-connector.service';

function currentPathWithSearch(url: URL): string {
	return `${url.pathname}${url.search}`;
}

function authorizationUrlFromForm(form: FormData, origin: string): URL {
	const authUrl = new URL('/oauth/authorize', origin);
	for (const key of [
		'client_id',
		'redirect_uri',
		'response_type',
		'scope',
		'state',
		'code_challenge',
		'code_challenge_method',
		'resource'
	]) {
		const value = form.get(key);
		if (typeof value === 'string' && value.length > 0) {
			authUrl.searchParams.set(key, value);
		}
	}
	return authUrl;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const { user } = await locals.safeGetSession();
	if (!user) {
		throw redirect(
			303,
			`/auth/login?redirect=${encodeURIComponent(currentPathWithSearch(url))}`
		);
	}

	const admin = createAdminSupabaseClient();
	try {
		const authorizationRequest = await loadOAuthAuthorizationRequest(admin, url);
		const projects = await loadVisibleProjectsForOAuth(admin, user.id);

		return {
			authorization: {
				client_id: authorizationRequest.clientId,
				client_name: authorizationRequest.client.client_name,
				client_uri: authorizationRequest.client.client_uri,
				logo_uri: authorizationRequest.client.logo_uri,
				redirect_uri: authorizationRequest.redirectUri,
				response_type: authorizationRequest.responseType,
				scope: authorizationRequest.scope,
				state: authorizationRequest.state,
				code_challenge: authorizationRequest.codeChallenge,
				code_challenge_method: authorizationRequest.codeChallengeMethod,
				resource: authorizationRequest.resource
			},
			projects: projects.map((project) => ({
				id: project.id,
				name: project.name,
				description: project.description ?? null
			})),
			userEmail: user.email ?? null
		};
	} catch (err) {
		if (err instanceof OAuthConnectorError) {
			throw error(err.status, err.description);
		}
		console.error('[OAuth Authorize] Failed to load consent screen:', err);
		throw error(500, 'Failed to load OAuth consent screen');
	}
};

export const actions: Actions = {
	authorize: async ({ request, locals, url, platform }) => {
		const { user } = await locals.safeGetSession();
		if (!user) {
			throw redirect(
				303,
				`/auth/login?redirect=${encodeURIComponent(currentPathWithSearch(url))}`
			);
		}

		const form = await request.formData();
		const decision = form.get('decision');
		const admin = createAdminSupabaseClient();
		const authorizationUrl = authorizationUrlFromForm(form, url.origin);
		let redirectTarget: string | null = null;

		try {
			const authorizationRequest = await loadOAuthAuthorizationRequest(
				admin,
				authorizationUrl
			);

			if (decision === 'deny') {
				redirectTarget = buildOAuthRedirect({
					redirectUri: authorizationRequest.redirectUri,
					state: authorizationRequest.state,
					error: 'access_denied',
					errorDescription: 'The BuildOS connector request was denied.'
				});
			} else {
				const scopeMode =
					form.get('scope_mode') === 'read_write' ? 'read_write' : 'read_only';
				const projectScope = form.get('project_scope') === 'selected' ? 'selected' : 'all';
				const selectedProjectIds = form
					.getAll('project_ids')
					.filter(
						(value): value is string =>
							typeof value === 'string' && value.trim().length > 0
					);
				const allowedProjectIds =
					projectScope === 'selected' ? selectedProjectIds : undefined;

				const { code } = await approveOAuthAuthorization({
					admin,
					userId: user.id,
					authorizationRequest,
					scopeMode,
					allowedProjectIds,
					securityEventOptions: getSecurityEventLogOptions(platform),
					request
				});

				redirectTarget = buildOAuthRedirect({
					redirectUri: authorizationRequest.redirectUri,
					code,
					state: authorizationRequest.state
				});
			}
		} catch (err) {
			if (err instanceof OAuthConnectorError) {
				return fail(err.status, { error: err.description });
			}
			console.error('[OAuth Authorize] Approval failed:', err);
			return fail(500, { error: 'Failed to approve connector access' });
		}

		if (!redirectTarget) {
			return fail(500, { error: 'Failed to complete connector authorization' });
		}

		throw redirect(303, redirectTarget);
	}
};
