// apps/web/src/routes/api/agent-call/buildos/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { BuildosAgentRequest } from '@buildos/shared-types';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import {
	BuildosAgentCallService,
	AgentCallServiceError,
	toBuildosAgentErrorResponse
} from '$lib/server/agent-call/agent-call-service';
import { getSecurityEventLogOptions } from '$lib/server/security-event-logger';

function isBuildosAgentRequest(value: unknown): value is BuildosAgentRequest {
	return (
		Boolean(value) &&
		typeof value === 'object' &&
		typeof (value as { method?: unknown }).method === 'string'
	);
}

async function readBuildosAgentRequest(request: Request): Promise<BuildosAgentRequest> {
	let body: unknown;

	try {
		body = await request.json();
	} catch {
		throw new AgentCallServiceError('Request body must be valid JSON', 400, -32700);
	}

	if (!isBuildosAgentRequest(body)) {
		throw new AgentCallServiceError('Request body must include a method', 400, -32600);
	}

	return body;
}

export const POST: RequestHandler = async ({ request, platform }) => {
	const service = new BuildosAgentCallService(
		createAdminSupabaseClient(),
		getSecurityEventLogOptions(platform)
	);

	try {
		const body = await readBuildosAgentRequest(request);

		switch (body.method) {
			case 'call.dial':
				return json(await service.dial(request, body.params));
			case 'tools/list':
				return json(await service.listTools(request, body.params));
			case 'tools/call':
				return json(await service.callTool(request, body.params));
			case 'call.hangup':
				return json(await service.hangup(request, body.params));
			default:
				return json(
					{
						error: {
							code: -32601,
							message: `Method not found: ${(body as { method: string }).method}`
						}
					},
					{ status: 400 }
				);
		}
	} catch (error) {
		const { status, body } = toBuildosAgentErrorResponse(error);

		if (status >= 500) {
			console.error('BuildOS agent call gateway error:', error);
		}

		return json(body, { status });
	}
};
