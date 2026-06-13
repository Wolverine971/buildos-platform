// apps/web/src/routes/mcp/buildos/+server.ts
import type { RequestHandler } from './$types';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { getSecurityEventLogOptions } from '$lib/server/security-event-logger';
import {
	handleBuildosMcpGet,
	handleBuildosMcpOptions,
	handleBuildosMcpPost
} from '$lib/server/agent-call/mcp-connector.service';

export const OPTIONS: RequestHandler = async ({ request, url }) =>
	handleBuildosMcpOptions(request, url);

export const GET: RequestHandler = async ({ request, url, platform }) =>
	handleBuildosMcpGet({
		admin: createAdminSupabaseClient(),
		request,
		url,
		securityEventOptions: getSecurityEventLogOptions(platform)
	});

export const POST: RequestHandler = async ({ request, url, platform }) =>
	handleBuildosMcpPost({
		admin: createAdminSupabaseClient(),
		request,
		url,
		securityEventOptions: getSecurityEventLogOptions(platform)
	});
