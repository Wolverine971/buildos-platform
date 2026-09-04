// apps/web/src/routes/api/agent/v2/transport/+server.ts
import { randomUUID } from 'node:crypto';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { env } from '$env/dynamic/private';
import {
	AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
	type AgentChatTransportLeaseRequestV1
} from '@buildos/shared-types';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import {
	AgenticChatTransportDecisionError,
	resolveExistingAgenticChatTransportDecision,
	type AgenticChatTransportDecisionClient
} from '$lib/services/agentic-chat-v2/transport-decision.server';
import {
	issueAgenticChatTransportLease,
	parseAgenticChatWorkerKillEpoch
} from '$lib/services/agentic-chat-v2/transport-lease.server';
import { ApiResponse, HttpStatus } from '$lib/utils/api-response';
import { createLogger } from '$lib/utils/logger';
import { parseJsonRequest } from '$lib/utils/request-validation';
import { normalizeFastContextType } from '$lib/services/agentic-chat-v2/scope';

const logger = createLogger('API:AgentTransportV2');

/**
 * One execution mode since one-engine stage S8. Capability arrays stay in the
 * request so an outdated bundle is told to reload instead of being handed a
 * lease it cannot drive, but the only negotiable transport is the worker.
 */
const WORKER_MODE = 'worker_realtime' as const;
const CAPABILITY_MAX_ENTRIES = 4;

const canonicalText = (maxLength: number) =>
	z
		.string()
		.min(1)
		.max(maxLength)
		.refine((value) => value === value.trim(), 'Value must not have surrounding whitespace');

const nullableUuid = z
	.string()
	.uuid()
	.transform((value) => value.toLowerCase())
	.nullable();

const transportRequestSchema = z
	.object({
		clientTurnId: canonicalText(256),
		streamRunId: canonicalText(256),
		sessionId: nullableUuid.optional().default(null),
		context: z
			.object({
				type: canonicalText(128),
				entityId: nullableUuid,
				projectId: nullableUuid
			})
			.strict()
			.transform((context) => ({
				...context,
				type: normalizeFastContextType(context.type)
			})),
		supportedModes: z
			.array(canonicalText(64))
			.min(1)
			.max(CAPABILITY_MAX_ENTRIES)
			.refine((values) => new Set(values).size === values.length, 'Modes must be unique'),
		supportedContractVersions: z
			.array(canonicalText(64))
			.min(1)
			.max(CAPABILITY_MAX_ENTRIES)
			.refine((values) => new Set(values).size === values.length, 'Contracts must be unique'),
		priorDecisionId: nullableUuid.optional().default(null)
	})
	.strict();

export const POST: RequestHandler = async ({ request, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user?.id) return privateResponse(ApiResponse.unauthorized());

	const parsed = await parseJsonRequest(request, transportRequestSchema, {
		invalidBodyMessage: 'Invalid transport negotiation request'
	});
	if (!parsed.ok) return privateResponse(parsed.response);

	// A client that cannot drive the worker transport is an outdated bundle, not
	// a routing choice: the engine it is asking for was deleted, so it is told
	// to reload instead of being downgraded.
	if (
		!parsed.data.supportedModes.includes(WORKER_MODE) ||
		!parsed.data.supportedContractVersions.includes(AGENTIC_CHAT_WORKER_CONTRACT_VERSION)
	) {
		return privateResponse(
			ApiResponse.error(
				'This BuildOS chat client is out of date. Reload the page to continue.',
				HttpStatus.CONFLICT,
				'CLIENT_UPGRADE_REQUIRED'
			)
		);
	}

	const leaseRequest: AgentChatTransportLeaseRequestV1 = {
		clientTurnId: parsed.data.clientTurnId,
		streamRunId: parsed.data.streamRunId,
		sessionId: parsed.data.sessionId,
		context: parsed.data.context,
		supportedModes: [WORKER_MODE],
		supportedContractVersions: [AGENTIC_CHAT_WORKER_CONTRACT_VERSION],
		priorDecisionId: parsed.data.priorDecisionId
	};

	try {
		const existing = await resolveExistingAgenticChatTransportDecision({
			client: createAdminSupabaseClient() as unknown as AgenticChatTransportDecisionClient,
			userId: user.id,
			request: leaseRequest
		});

		// Existing turns retain their persisted immutable mode; every mode is the
		// worker mode. New turns are server-enabled and wait in the durable queue
		// as needed.
		const lease = issueAgenticChatTransportLease({
			secret: env.AGENTIC_CHAT_TRANSPORT_LEASE_SECRET ?? '',
			userId: user.id,
			clientTurnId: leaseRequest.clientTurnId,
			streamRunId: leaseRequest.streamRunId,
			context: leaseRequest.context,
			mode: WORKER_MODE,
			// A prior id is only a lookup hint. It becomes authoritative only when an
			// owned persisted turn proves it; otherwise the server mints a fresh id.
			decisionId: existing?.decisionId ?? randomUUID(),
			killEpoch: parseAgenticChatWorkerKillEpoch(env.AGENTIC_CHAT_WORKER_KILL_EPOCH)
		});
		return privateResponse(ApiResponse.success(lease));
	} catch (error) {
		logger.warn('Agentic Chat transport negotiation failed', {
			error,
			userId: user.id,
			clientTurnId: parsed.data.clientTurnId
		});
		if (
			error instanceof AgenticChatTransportDecisionError &&
			(error.code === 'binding_mismatch' ||
				error.code === 'ambiguous_turn' ||
				// A stored contract that is not the worker contract names a deleted
				// engine. It can never be served, so it is a conflict, not a
				// retryable outage.
				error.code === 'stored_contract_invalid')
		) {
			return privateResponse(
				ApiResponse.error(
					'Transport negotiation conflicts with an existing turn',
					HttpStatus.CONFLICT,
					'TRANSPORT_CONFLICT'
				)
			);
		}
		// Every turn is worker-owned, so an infrastructure failure here is a
		// worker outage and never a change of transport semantics.
		return workerUnavailableResponse();
	}
};

function workerUnavailableResponse(retryAfterSeconds = 2): Response {
	const response = ApiResponse.error(
		'Worker chat is temporarily unavailable. Please try again shortly.',
		HttpStatus.SERVICE_UNAVAILABLE,
		'WORKER_UNAVAILABLE'
	);
	response.headers.set('Retry-After', String(retryAfterSeconds));
	return privateResponse(response);
}

function privateResponse(response: Response): Response {
	response.headers.set('Cache-Control', 'private, no-store');
	response.headers.set('Vary', 'Authorization');
	return response;
}
