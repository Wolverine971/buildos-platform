// apps/web/src/routes/.well-known/oauth-protected-resource/mcp/buildos/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	BUILDOS_MCP_SERVER_NAME,
	BUILDOS_OAUTH_SCOPES,
	mcpResourceUrl
} from '$lib/server/agent-call/oauth-connector.service';

export const GET: RequestHandler = async ({ url }) => {
	return json(
		{
			resource: mcpResourceUrl(url.origin),
			resource_name: BUILDOS_MCP_SERVER_NAME,
			authorization_servers: [url.origin],
			scopes_supported: BUILDOS_OAUTH_SCOPES,
			bearer_methods_supported: ['header'],
			resource_documentation: `${url.origin}/docs/connect-agents`
		},
		{
			headers: {
				'Cache-Control': 'public, max-age=300',
				'Access-Control-Allow-Origin': '*'
			}
		}
	);
};
