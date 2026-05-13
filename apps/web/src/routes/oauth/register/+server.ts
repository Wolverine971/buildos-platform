// apps/web/src/routes/oauth/register/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import {
	OAuthConnectorError,
	registerDynamicOAuthClient
} from '$lib/server/agent-call/oauth-connector.service';

function errorResponse(error: unknown) {
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

	console.error('[OAuth Register] Unhandled error:', error);
	return json(
		{
			error: 'server_error',
			error_description: 'OAuth client registration failed'
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

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const client = await registerDynamicOAuthClient(createAdminSupabaseClient(), body);

		return json(
			{
				client_id: client.client_id,
				client_name: client.client_name,
				client_uri: client.client_uri,
				logo_uri: client.logo_uri,
				redirect_uris: client.redirect_uris,
				grant_types: ['authorization_code', 'refresh_token'],
				response_types: ['code'],
				scope: client.allowed_scopes.join(' '),
				token_endpoint_auth_method: 'none',
				client_id_issued_at: client.client_id_issued_at
			},
			{
				status: 201,
				headers: {
					'Access-Control-Allow-Origin': '*',
					'Cache-Control': 'no-store'
				}
			}
		);
	} catch (error) {
		return errorResponse(error);
	}
};
