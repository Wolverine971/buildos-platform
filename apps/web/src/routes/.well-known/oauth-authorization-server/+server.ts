// apps/web/src/routes/.well-known/oauth-authorization-server/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { BUILDOS_OAUTH_SCOPES } from '$lib/server/agent-call/oauth-connector.service';

function metadata(origin: string) {
	return {
		issuer: origin,
		authorization_endpoint: `${origin}/oauth/authorize`,
		token_endpoint: `${origin}/oauth/token`,
		revocation_endpoint: `${origin}/oauth/revoke`,
		registration_endpoint: `${origin}/oauth/register`,
		response_types_supported: ['code'],
		grant_types_supported: ['authorization_code', 'refresh_token'],
		code_challenge_methods_supported: ['S256'],
		scopes_supported: BUILDOS_OAUTH_SCOPES,
		token_endpoint_auth_methods_supported: [
			'none',
			'client_secret_basic',
			'client_secret_post'
		],
		client_id_metadata_document_supported: true
	};
}

export const GET: RequestHandler = async ({ url }) => {
	return json(metadata(url.origin), {
		headers: {
			'Cache-Control': 'public, max-age=300',
			'Access-Control-Allow-Origin': '*'
		}
	});
};
