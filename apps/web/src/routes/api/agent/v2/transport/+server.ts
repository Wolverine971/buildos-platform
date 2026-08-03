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
	AgenticChatTransportLeaseError,
	issueAgenticChatTransportLease,
	parseAgenticChatWorkerKillEpoch
} from '$lib/services/agentic-chat-v2/transport-lease.server';
import { ApiResponse, HttpStatus } from '$lib/utils/api-response';
import { createLogger } from '$lib/utils/logger';
import { parseJsonRequest } from '$lib/utils/request-validation';
import { normalizeFastContextType } from '$lib/services/agentic-chat-v2/scope';

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

	try {
		const existing = await resolveExistingAgenticChatTransportDecision({
			client: createAdminSupabaseClient() as unknown as AgenticChatTransportDecisionClient,
			userId: user.id,
			request: parsed.data
		});
		const mode = existing?.mode ?? 'legacy_sse';
		const contractVersion = existing?.contractVersion ?? 'legacy_internal_v1';
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

		// Routing is intentionally locked to legacy for new decisions in this slice.
		// An existing worker turn may only receive its already-persisted immutable mode.
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
		if (
			error instanceof AgenticChatTransportLeaseError ||
			error instanceof AgenticChatTransportDecisionError
		) {
			return privateResponse(
				ApiResponse.error(
					'Transport negotiation is temporarily unavailable',
					HttpStatus.SERVICE_UNAVAILABLE,
					'TRANSPORT_UNAVAILABLE'
				)
			);
		}
		return privateResponse(
			ApiResponse.error(
				'Transport negotiation is temporarily unavailable',
				HttpStatus.SERVICE_UNAVAILABLE,
				'TRANSPORT_UNAVAILABLE'
			)
		);
	}
};

function privateResponse(response: Response): Response {
	response.headers.set('Cache-Control', 'private, no-store');
	response.headers.set('Vary', 'Authorization');
	return response;
}
