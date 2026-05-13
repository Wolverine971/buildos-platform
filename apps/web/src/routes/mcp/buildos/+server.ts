// apps/web/src/routes/mcp/buildos/+server.ts
import type { RequestHandler } from './$types';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { getSecurityEventLogOptions } from '$lib/server/security-event-logger';
import {
	handleBuildosMcpGet,
	handleBuildosMcpPost
} from '$lib/server/agent-call/mcp-connector.service';

export const OPTIONS: RequestHandler = async () =>
	new Response(null, {
		status: 204,
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type, Authorization, MCP-Protocol-Version'
		}
	});

export const GET: RequestHandler = async ({ url }) => handleBuildosMcpGet(url);

export const POST: RequestHandler = async ({ request, url, platform }) =>
	handleBuildosMcpPost({
		admin: createAdminSupabaseClient(),
		request,
		url,
		securityEventOptions: getSecurityEventLogOptions(platform)
	});
