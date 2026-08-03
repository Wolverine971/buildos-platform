// apps/web/src/routes/api/agent/v2/turns/[id]/cancel/+server.ts
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import {
	AgenticChatWorkerTurnGatewayError,
	requestOwnedAgenticChatWorkerTurnCancellation,
	type AgenticChatWorkerTurnGatewayClient
} from '$lib/services/agentic-chat-v2/worker-turn-gateway.server';
import { ApiResponse, HttpStatus } from '$lib/utils/api-response';
import { createLogger } from '$lib/utils/logger';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import { parseJsonRequest } from '$lib/utils/request-validation';

const logger = createLogger('API:AgentWorkerTurnCancelV2');
const cancelRequestSchema = z.object({ reason: z.enum(['user_cancelled', 'superseded']) }).strict();

export const POST: RequestHandler = async ({ request, params, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user?.id) return privateResponse(ApiResponse.unauthorized());
	if (!isValidUUID(params.id)) {
		return privateResponse(ApiResponse.badRequest('Invalid turn id'));
	}
	const parsed = await parseJsonRequest(request, cancelRequestSchema, {
		invalidBodyMessage: 'Invalid worker turn cancellation request'
	});
	if (!parsed.ok) return privateResponse(parsed.response);

	try {
		const result = await requestOwnedAgenticChatWorkerTurnCancellation({
			client: createAdminSupabaseClient() as unknown as AgenticChatWorkerTurnGatewayClient,
			userId: user.id,
			turnRunId: params.id,
			reason: parsed.data.reason
		});
		return privateResponse(ApiResponse.success(result));
	} catch (error) {
		logger.warn('Owned worker turn cancellation failed', {
			error,
			turnRunId: params.id,
			userId: user.id
		});
		if (error instanceof AgenticChatWorkerTurnGatewayError && error.code === 'not_found') {
			return privateResponse(ApiResponse.notFound('Turn'));
		}
		return privateResponse(
			ApiResponse.error(
				'Worker turn cancellation is temporarily unavailable',
				HttpStatus.SERVICE_UNAVAILABLE,
				'WORKER_TURN_CANCEL_UNAVAILABLE'
			)
		);
	}
};

function privateResponse(response: Response): Response {
	response.headers.set('Cache-Control', 'private, no-store');
	response.headers.set('Vary', 'Authorization');
	return response;
}
