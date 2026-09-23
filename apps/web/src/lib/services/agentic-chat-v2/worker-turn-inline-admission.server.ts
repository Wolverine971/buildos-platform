// apps/web/src/lib/services/agentic-chat-v2/worker-turn-inline-admission.server.ts
//
// The two things a send used to fetch in separate round trips before worker
// admission, now resolved inside it: the transport decision (formerly a signed
// transport lease from a separate route) and the session row a session-less
// send creates (formerly a separate session bootstrap).
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
	type AgentChatTransportLeaseRequestV1,
	type ChatSession,
	type Database
} from '@buildos/shared-types';
import { ApiResponse, HttpStatus } from '$lib/utils/api-response';
import { createLogger } from '$lib/utils/logger';
import {
	AgenticChatTransportDecisionError,
	resolveExistingAgenticChatTransportDecision,
	type AgenticChatTransportDecisionClient
} from './transport-decision.server';

const logger = createLogger('AgenticChat:WorkerInlineAdmission');

export type AgenticChatWorkerTransportBinding = Pick<
	AgentChatTransportLeaseRequestV1,
	'clientTurnId' | 'streamRunId' | 'sessionId' | 'context'
>;

export type AgenticChatWorkerTransportDecision =
	| { ok: true; decisionId: string }
	| { ok: false; response: Response };

/**
 * Resolves the transport decision id for one owned turn binding. An existing
 * owned turn keeps its persisted id (a retry must not re-decide); otherwise the
 * server mints a fresh one. The user id must be the authenticated user; every
 * other binding field is the exact value the caller admits.
 */
export async function resolveAgenticChatWorkerTransportDecision(input: {
	client: SupabaseClient<Database>;
	userId: string;
	binding: AgenticChatWorkerTransportBinding;
}): Promise<AgenticChatWorkerTransportDecision> {
	try {
		const existing = await resolveExistingAgenticChatTransportDecision({
			client: input.client as unknown as AgenticChatTransportDecisionClient,
			userId: input.userId,
			request: {
				clientTurnId: input.binding.clientTurnId,
				streamRunId: input.binding.streamRunId,
				sessionId: input.binding.sessionId,
				context: input.binding.context,
				supportedModes: ['worker_realtime'],
				supportedContractVersions: [AGENTIC_CHAT_WORKER_CONTRACT_VERSION],
				priorDecisionId: null
			}
		});
		// An owned persisted turn keeps its id; otherwise the server mints one.
		return { ok: true, decisionId: existing?.decisionId ?? randomUUID() };
	} catch (error) {
		logger.warn('Agentic Chat transport decision failed', {
			error,
			userId: input.userId,
			clientTurnId: input.binding.clientTurnId
		});
		return { ok: false, response: agenticChatTransportDecisionFailureResponse(error) };
	}
}

/** Maps a failed transport decision to its public admission response. */
function agenticChatTransportDecisionFailureResponse(error: unknown): Response {
	if (
		error instanceof AgenticChatTransportDecisionError &&
		(error.code === 'binding_mismatch' ||
			error.code === 'ambiguous_turn' ||
			// A stored contract that is not the worker contract names a deleted
			// engine. It can never be served, so it is a conflict, not a
			// retryable outage.
			error.code === 'stored_contract_invalid')
	) {
		return ApiResponse.error(
			'Transport negotiation conflicts with an existing turn',
			HttpStatus.CONFLICT,
			'TRANSPORT_CONFLICT'
		);
	}
	// Every turn is worker-owned, so an infrastructure failure here is a
	// worker outage and never a change of transport semantics.
	const response = ApiResponse.error(
		'Worker chat is temporarily unavailable. Please try again shortly.',
		HttpStatus.SERVICE_UNAVAILABLE,
		'WORKER_UNAVAILABLE'
	);
	response.headers.set('Retry-After', '2');
	return response;
}

/**
 * Reads the owned session an admitted turn landed in. Best-effort by design:
 * the turn is already durable, so a failed read returns null and the client
 * falls back to its own session lookup instead of seeing a failed send.
 */
export async function loadAdmittedWorkerSession(input: {
	client: SupabaseClient<Database>;
	userId: string;
	sessionId: string;
}): Promise<ChatSession | null> {
	try {
		const { data, error } = await input.client
			.from('chat_sessions')
			.select('*')
			.eq('id', input.sessionId)
			.eq('user_id', input.userId)
			.maybeSingle();
		if (!error && data) return data;
		logger.warn('Admitted worker session read returned no row', {
			error,
			userId: input.userId,
			sessionId: input.sessionId
		});
	} catch (error) {
		logger.warn('Admitted worker session read failed', {
			error,
			userId: input.userId,
			sessionId: input.sessionId
		});
	}
	return null;
}
