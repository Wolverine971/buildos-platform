// apps/web/src/routes/oauth/token/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { getSecurityEventLogOptions } from '$lib/server/security-event-logger';
import {
	exchangeOAuthAuthorizationCode,
	exchangeOAuthRefreshToken,
	OAuthConnectorError
} from '$lib/server/agent-call/oauth-connector.service';

function tokenError(error: unknown) {
	if (error instanceof OAuthConnectorError) {
		return json(
			{
				error: error.code,
				error_description: error.description
			},
			{
				status: error.status,
				headers: {
					'Cache-Control': 'no-store',
					Pragma: 'no-cache',
					'Access-Control-Allow-Origin': '*'
				}
			}
		);
	}

	console.error('[OAuth Token] Unhandled error:', error);
	return json(
		{
			error: 'server_error',
			error_description: 'OAuth token exchange failed'
		},
		{
			status: 500,
			headers: {
				'Cache-Control': 'no-store',
				Pragma: 'no-cache',
				'Access-Control-Allow-Origin': '*'
			}
		}
	);
}

function tokenResponse(result: {
	accessToken: string;
	refreshToken: string | null;
	scope: string;
	expiresIn: number;
}) {
	return json(
		{
			access_token: result.accessToken,
			token_type: 'Bearer',
			expires_in: result.expiresIn,
			scope: result.scope,
			...(result.refreshToken ? { refresh_token: result.refreshToken } : {})
		},
		{
			headers: {
				'Cache-Control': 'no-store',
				Pragma: 'no-cache',
				'Access-Control-Allow-Origin': '*'
			}
		}
	);
}

export const OPTIONS: RequestHandler = async () =>
	new Response(null, {
		status: 204,
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'POST, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type, Authorization'
		}
	});

export const POST: RequestHandler = async ({ request, platform }) => {
	try {
		const form = new URLSearchParams(await request.text());
		const grantType = form.get('grant_type');
		const admin = createAdminSupabaseClient();
		const common = {
			admin,
			request,
			form,
			securityEventOptions: getSecurityEventLogOptions(platform)
		};

		if (grantType === 'authorization_code') {
			return tokenResponse(await exchangeOAuthAuthorizationCode(common));
		}

		if (grantType === 'refresh_token') {
			return tokenResponse(await exchangeOAuthRefreshToken(common));
		}

		return tokenError(
			new OAuthConnectorError('Unsupported grant_type', 400, 'unsupported_grant_type')
		);
	} catch (error) {
		return tokenError(error);
	}
};
