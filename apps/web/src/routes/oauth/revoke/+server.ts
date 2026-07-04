// apps/web/src/routes/oauth/revoke/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import {
	OAuthConnectorError,
	resolveOAuthClient,
	revokeOAuthToken
} from '$lib/server/agent-call/oauth-connector.service';
import { logRouteError } from '$lib/server/route-error';

async function revokeError(event: RequestEvent, error: unknown) {
	if (error instanceof OAuthConnectorError) {
		return json(
			{
				error: error.code,
				error_description: error.description
			},
			{
				status: error.status,
				headers: {
					'Access-Control-Allow-Origin': '*',
					'Cache-Control': 'no-store'
				}
			}
		);
	}

	await logRouteError(event, error, {
		operation: 'oauth.revoke',
		severity: 'error'
	});
	return json(
		{
			error: 'server_error',
			error_description: 'OAuth revocation failed'
		},
		{
			status: 500,
			headers: {
				'Access-Control-Allow-Origin': '*',
				'Cache-Control': 'no-store'
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

export const POST: RequestHandler = async (event) => {
	const { request } = event;
	try {
		const form = new URLSearchParams(await request.text());
		const token = form.get('token')?.trim();
		if (!token) {
			throw new OAuthConnectorError('token is required', 400, 'invalid_request');
		}

		const admin = createAdminSupabaseClient();
		const clientId = form.get('client_id')?.trim();
		const client = clientId ? await resolveOAuthClient(admin, clientId) : null;
		if (clientId && !client) {
			throw new OAuthConnectorError('Unknown OAuth client', 401, 'invalid_client');
		}
		await revokeOAuthToken({ admin, token, client });

		return new Response(null, {
			status: 200,
			headers: {
				'Access-Control-Allow-Origin': '*',
				'Cache-Control': 'no-store'
			}
		});
	} catch (error) {
		return revokeError(event, error);
	}
};
