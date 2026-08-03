// apps/web/src/routes/api/agent/v2/turns/[id]/+server.ts
import type { RequestHandler } from './$types';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import {
	getOwnedAgenticChatWorkerTurn,
	type AgenticChatWorkerTurnGatewayClient
} from '$lib/services/agentic-chat-v2/worker-turn-gateway.server';
import { ApiResponse, HttpStatus } from '$lib/utils/api-response';
import { createLogger } from '$lib/utils/logger';
import { isValidUUID } from '$lib/utils/operations/validation-utils';

const logger = createLogger('API:AgentWorkerTurnV2');

export const GET: RequestHandler = async ({ params, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user?.id) return privateResponse(ApiResponse.unauthorized());
	if (!isValidUUID(params.id)) {
		return privateResponse(ApiResponse.badRequest('Invalid turn id'));
	}

	try {
		const turn = await getOwnedAgenticChatWorkerTurn({
			client: createAdminSupabaseClient() as unknown as AgenticChatWorkerTurnGatewayClient,
			userId: user.id,
			turnRunId: params.id
		});
		if (turn === null) return privateResponse(ApiResponse.notFound('Turn'));
		return privateResponse(ApiResponse.success(turn));
	} catch (error) {
		logger.warn('Owned worker turn lookup failed', {
			error,
			turnRunId: params.id,
			userId: user.id
		});
		return privateResponse(
			ApiResponse.error(
				'Worker turn lookup is temporarily unavailable',
				HttpStatus.SERVICE_UNAVAILABLE,
				'WORKER_TURN_LOOKUP_UNAVAILABLE'
			)
		);
	}
};

function privateResponse(response: Response): Response {
	response.headers.set('Cache-Control', 'private, no-store');
	response.headers.set('Vary', 'Authorization');
	return response;
}
