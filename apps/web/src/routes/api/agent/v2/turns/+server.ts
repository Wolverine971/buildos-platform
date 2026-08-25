// apps/web/src/routes/api/agent/v2/turns/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import type { Database, LastTurnContext, ProjectFocus } from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	parseAgenticChatWorkerKillEpoch,
	verifyAgenticChatTransportLease
} from '$lib/services/agentic-chat-v2/transport-lease.server';
import {
	admitAgenticChatWorkerTurn,
	type AgenticChatWorkerAdmissionRpcClient
} from '$lib/services/agentic-chat-v2/worker-turn-admission.server';
import {
	AgenticChatWorkerPreparationError,
	prepareAgenticChatWorkerAdmission
} from '$lib/services/agentic-chat-v2/worker-turn-preparation.server';
import {
	listOwnedActiveAgenticChatWorkerTurns,
	type AgenticChatWorkerTurnGatewayClient
} from '$lib/services/agentic-chat-v2/worker-turn-gateway.server';
import { ApiResponse, HttpStatus } from '$lib/utils/api-response';
import { createLogger } from '$lib/utils/logger';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import { parseJsonRequest } from '$lib/utils/request-validation';

const logger = createLogger('API:AgentWorkerTurnsV2');
import { workerAdmissionRequestSchema } from './worker-admission-schema';

export const GET: RequestHandler = async ({ url, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user?.id) return privateResponse(ApiResponse.unauthorized());
	if (
		url.searchParams.getAll('session_id').length !== 1 ||
		Array.from(url.searchParams.keys()).some((key) => key !== 'session_id')
	) {
		return privateResponse(ApiResponse.badRequest('session_id must be specified once'));
	}
	const sessionId = url.searchParams.get('session_id');
	if (sessionId === null || !isValidUUID(sessionId)) {
		return privateResponse(ApiResponse.badRequest('Invalid session id'));
	}

	try {
		const turns = await listOwnedActiveAgenticChatWorkerTurns({
			client: createAdminSupabaseClient() as unknown as AgenticChatWorkerTurnGatewayClient,
			userId: user.id,
			sessionId
		});
		return privateResponse(ApiResponse.success({ turns }));
	} catch (error) {
		logger.warn('Active owned worker turn lookup failed', {
			error,
			sessionId,
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

export const POST: RequestHandler = async ({ request, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();
	if (!user?.id) return privateResponse(ApiResponse.unauthorized());

	const parsed = await parseJsonRequest(request, workerAdmissionRequestSchema, {
		invalidBodyMessage: 'Invalid worker turn request'
	});
	if (!parsed.ok) return privateResponse(parsed.response);

	let lease;
	try {
		lease = verifyAgenticChatTransportLease({
			secret: env.AGENTIC_CHAT_TRANSPORT_LEASE_SECRET ?? '',
			token: parsed.data.leaseToken,
			expected: {
				userId: user.id,
				clientTurnId: parsed.data.clientTurnId,
				streamRunId: parsed.data.streamRunId,
				context: parsed.data.context
			},
			currentKillEpoch: parseAgenticChatWorkerKillEpoch(env.AGENTIC_CHAT_WORKER_KILL_EPOCH)
		});
	} catch (error) {
		logger.warn('Worker turn lease verification failed', {
			error,
			userId: user.id,
			clientTurnId: parsed.data.clientTurnId
		});
		return privateResponse(
			ApiResponse.error(
				'The worker transport lease must be renegotiated',
				HttpStatus.CONFLICT,
				'TRANSPORT_RENEGOTIATE'
			)
		);
	}
	if (lease.mode !== 'worker_realtime' || lease.contractVersion !== 'agentic_chat_worker_v1') {
		return privateResponse(
			ApiResponse.error(
				'A worker transport lease is required',
				HttpStatus.CONFLICT,
				'WORKER_LEASE_REQUIRED'
			)
		);
	}

	const serviceClient = createAdminSupabaseClient();
	try {
		const preparation = await prepareAgenticChatWorkerAdmission({
			userClient: supabase as SupabaseClient<Database>,
			serviceClient,
			userId: user.id,
			command: {
				clientTurnId: parsed.data.clientTurnId,
				streamRunId: parsed.data.streamRunId,
				sessionId: parsed.data.sessionId,
				context: parsed.data.context,
				message: parsed.data.message,
				attachments: parsed.data.attachments,
				projectFocus: parsed.data.projectFocus as ProjectFocus | null,
				lastTurnContext: parsed.data.lastTurnContext as LastTurnContext | null,
				voiceNoteGroupId: parsed.data.voiceNoteGroupId,
				preparedPromptKey: parsed.data.preparedPromptKey
			},
			lease: {
				decisionId: lease.decisionId,
				mode: 'worker_realtime',
				contractVersion: 'agentic_chat_worker_v1'
			}
		});
		const result = await admitAgenticChatWorkerTurn({
			client: serviceClient as unknown as AgenticChatWorkerAdmissionRpcClient,
			args: preparation.args
		});

		if (result.outcome === 'capacity_exceeded') {
			logger.warn('Worker turn emergency queue safety ceiling reached', {
				userId: user.id,
				clientTurnId: parsed.data.clientTurnId,
				capacityReason: result.capacityReason,
				runningCount: result.runningCount,
				queuedCount: result.queuedCount,
				retryAfterSeconds: result.retryAfterSeconds
			});
			const response = ApiResponse.error(
				'Too many worker turns are already waiting for this account',
				HttpStatus.TOO_MANY_REQUESTS,
				'WORKER_CAPACITY_EXCEEDED'
			);
			response.headers.set('Retry-After', String(result.retryAfterSeconds));
			return privateResponse(response);
		}
		if (
			result.outcome === 'active_turn_conflict' ||
			result.outcome === 'idempotency_conflict' ||
			(result.outcome === 'matching_duplicate' && result.executionMode !== 'worker_realtime')
		) {
			return privateResponse(
				ApiResponse.error(
					'Worker turn admission conflicts with an existing turn',
					HttpStatus.CONFLICT,
					'WORKER_ADMISSION_CONFLICT'
				)
			);
		}

		const payload = {
			outcome: result.outcome,
			handle: {
				contractVersion: 'agentic_chat_worker_v1' as const,
				executionMode: 'worker_realtime' as const,
				turnRunId: result.turnRunId,
				sessionId: result.sessionId,
				streamRunId: result.streamRunId,
				clientTurnId: result.clientTurnId
			},
			status: result.status
		};
		return privateResponse(
			json(
				{
					success: true,
					data: payload,
					timestamp: new Date().toISOString()
				},
				{ status: result.outcome === 'newly_admitted' ? 202 : 200 }
			)
		);
	} catch (error) {
		logger.warn('Worker turn admission failed', {
			error,
			userId: user.id,
			clientTurnId: parsed.data.clientTurnId
		});
		if (error instanceof AgenticChatWorkerPreparationError) {
			if (error.code === 'transport_renegotiate') {
				return privateResponse(
					ApiResponse.error(
						'This turn requires the legacy tool surface',
						HttpStatus.CONFLICT,
						'TRANSPORT_RENEGOTIATE'
					)
				);
			}
			if (error.code === 'invalid_command') {
				return privateResponse(
					ApiResponse.error(
						'Worker turn command is invalid',
						HttpStatus.UNPROCESSABLE_ENTITY,
						'INVALID_WORKER_COMMAND'
					)
				);
			}
			if (error.code === 'access_denied') {
				return privateResponse(ApiResponse.forbidden('Worker turn access denied'));
			}
			if (error.code === 'session_conflict') {
				return privateResponse(
					ApiResponse.error(
						'Worker turn session conflicts with the request',
						HttpStatus.CONFLICT,
						'WORKER_SESSION_CONFLICT'
					)
				);
			}
		}
		return privateResponse(
			ApiResponse.error(
				'Worker turn admission is temporarily unavailable',
				HttpStatus.SERVICE_UNAVAILABLE,
				'WORKER_ADMISSION_UNAVAILABLE'
			)
		);
	}
};

function privateResponse(response: Response): Response {
	response.headers.set('Cache-Control', 'private, no-store');
	response.headers.set('Vary', 'Authorization');
	return response;
}
