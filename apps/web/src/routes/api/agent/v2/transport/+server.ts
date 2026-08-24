// apps/web/src/routes/api/agent/v2/transport/+server.ts
import { randomUUID } from 'node:crypto';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { env } from '$env/dynamic/private';
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
import {
	AgenticChatWorkerUnavailableError,
	selectAgenticChatNewTransport
} from '$lib/services/agentic-chat-v2/worker-transport-routing.server';

const logger = createLogger('API:AgentTransportV2');

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
			.array(z.enum(['legacy_sse', 'worker_realtime']))
			.min(1)
			.max(2)
			.refine((values) => new Set(values).size === values.length, 'Modes must be unique'),
		supportedContractVersions: z
			.array(z.enum(['legacy_internal_v1', 'agentic_chat_worker_v1']))
			.min(1)
			.max(2)
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

	let selectedMode: 'legacy_sse' | 'worker_realtime' | null = null;
	try {
		const existing = await resolveExistingAgenticChatTransportDecision({
			client: createAdminSupabaseClient() as unknown as AgenticChatTransportDecisionClient,
			userId: user.id,
			request: parsed.data
		});
		const selected = existing
			? { mode: existing.mode, contractVersion: existing.contractVersion }
			: await selectAgenticChatNewTransport({
					supportedModes: parsed.data.supportedModes,
					supportedContractVersions: parsed.data.supportedContractVersions,
					environment: env
				});
		const { mode, contractVersion } = selected;
		selectedMode = mode;
		if (
			!parsed.data.supportedModes.includes(mode) ||
			!parsed.data.supportedContractVersions.includes(contractVersion)
		) {
			return privateResponse(
				ApiResponse.error(
					'No compatible transport is available for this turn',
					HttpStatus.CONFLICT,
					'TRANSPORT_INCOMPATIBLE'
				)
			);
		}

		// Existing turns bypass live routing and retain their already-persisted
		// immutable mode. New worker selection is server-enabled and capacity-gated.
		const lease = issueAgenticChatTransportLease({
			secret: env.AGENTIC_CHAT_TRANSPORT_LEASE_SECRET ?? '',
			userId: user.id,
			clientTurnId: parsed.data.clientTurnId,
			streamRunId: parsed.data.streamRunId,
			context: parsed.data.context,
			mode,
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
			(error.code === 'binding_mismatch' || error.code === 'ambiguous_turn')
		) {
			return privateResponse(
				ApiResponse.error(
					'Transport negotiation conflicts with an existing turn',
					HttpStatus.CONFLICT,
					'TRANSPORT_CONFLICT'
				)
			);
		}
		if (error instanceof AgenticChatWorkerUnavailableError) {
			return workerUnavailableResponse(error.retryAfterSeconds);
		}
		// A failure is worker-unavailable only after worker transport was selected,
		// or when the live routing policy could select it. The emergency rollback
		// must remain outside the worker lease/database failure domain.
		if (
			selectedMode === 'worker_realtime' ||
			(selectedMode === null && requestCouldSelectWorker(parsed.data, env))
		) {
			return workerUnavailableResponse();
		}
		return transportUnavailableResponse();
	}
};

function requestCouldSelectWorker(
	request: z.infer<typeof transportRequestSchema>,
	environment: Record<string, string | undefined>
): boolean {
	return (
		environment.AGENTIC_CHAT_WORKER_ROUTING_ENABLED === 'true' &&
		request.supportedModes.includes('worker_realtime') &&
		request.supportedContractVersions.includes('agentic_chat_worker_v1')
	);
}

function transportUnavailableResponse(): Response {
	const response = ApiResponse.error(
		'Transport negotiation is unavailable; continue with legacy chat.',
		HttpStatus.SERVICE_UNAVAILABLE,
		'TRANSPORT_UNAVAILABLE'
	);
	return privateResponse(response);
}

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
