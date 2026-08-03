// apps/web/src/routes/api/agent/v2/turns/[id]/reconcile/+server.ts
import type { RequestHandler } from './$types';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import {
	AgenticChatReconciliationRpcError,
	reconcileAgenticChatTurn,
	type AgenticChatReconciliationRpcClient
} from '$lib/services/agentic-chat-v2/reconciliation.server';
import { ApiResponse, HttpStatus } from '$lib/utils/api-response';
import { createLogger } from '$lib/utils/logger';
import { isValidUUID } from '$lib/utils/operations/validation-utils';

const logger = createLogger('API:AgentTurnV2Reconcile');
const POSTGRES_INTEGER_MAX = 2_147_483_647;

export const GET: RequestHandler = async ({ params, url, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user?.id) return ApiResponse.unauthorized();
	if (!isValidUUID(params.id)) return ApiResponse.badRequest('Invalid turn id');

	if (url.searchParams.getAll('generation').length > 1) {
		return ApiResponse.badRequest('generation must be specified once');
	}
	if (url.searchParams.getAll('after').length > 1) {
		return ApiResponse.badRequest('after must be specified once');
	}

	const generation = parseOptionalCursor(url.searchParams.get('generation'));
	const after = parseCursor(url.searchParams.get('after'), 0);
	if (generation === 'invalid') return ApiResponse.badRequest('Invalid generation cursor');
	if (after === 'invalid') return ApiResponse.badRequest('Invalid durable event cursor');
	if (generation === null && after !== 0) {
		return ApiResponse.badRequest('generation is required when after is nonzero');
	}

	try {
		const result = await reconcileAgenticChatTurn({
			client: createAdminSupabaseClient() as unknown as AgenticChatReconciliationRpcClient,
			turnRunId: params.id,
			userId: user.id,
			requestedExecutionGeneration: generation,
			afterDurableSequence: after
		});

		if (result.outcome === 'not_found') return ApiResponse.notFound('Turn');
		if (result.outcome === 'not_worker_turn') {
			return ApiResponse.error(
				'Turn does not use worker transport',
				HttpStatus.CONFLICT,
				'INVALID_EXECUTION_MODE'
			);
		}

		const response = ApiResponse.success(result);
		response.headers.set('Cache-Control', 'private, no-store');
		response.headers.set('Vary', 'Authorization');
		return response;
	} catch (error) {
		logger.warn('Worker turn reconciliation failed', {
			error,
			turnRunId: params.id,
			userId: user.id,
			generation,
			after
		});
		if (
			error instanceof AgenticChatReconciliationRpcError &&
			error.message.includes('agentic_chat_reconcile_cursor_ahead')
		) {
			return ApiResponse.error(
				'Reconciliation cursor is ahead of durable state',
				HttpStatus.CONFLICT,
				'RECONCILIATION_CURSOR_AHEAD'
			);
		}
		return ApiResponse.error(
			'Reconciliation temporarily unavailable',
			HttpStatus.SERVICE_UNAVAILABLE,
			'RECONCILIATION_UNAVAILABLE'
		);
	}
};

function parseOptionalCursor(value: string | null): number | null | 'invalid' {
	if (value === null) return null;
	return parseCursor(value, null);
}

function parseCursor<TFallback extends number | null>(
	value: string | null,
	fallback: TFallback
): number | TFallback | 'invalid' {
	if (value === null) return fallback;
	if (!/^(0|[1-9][0-9]*)$/.test(value)) return 'invalid';
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed > POSTGRES_INTEGER_MAX) return 'invalid';
	return parsed;
}
