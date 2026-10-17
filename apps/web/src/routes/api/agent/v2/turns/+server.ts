// apps/web/src/routes/api/agent/v2/turns/+server.ts
// Admission can cross the app-wide 10s function default: a first send creates
// its session inline and a prepared-prompt miss builds context and prompt here.
export const config = { maxDuration: 60 };

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import type { Database, Json, ProjectFocus } from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	loadAdmittedWorkerSession,
	resolveAgenticChatWorkerTransportDecision
} from '$lib/services/agentic-chat-v2/worker-turn-inline-admission.server';
import {
	admitAgenticChatWorkerTurn,
	getPreparedAdmissionFailureCode,
	isHistoryWindowRaceError,
	isPreparedAdmissionRaceError,
	type AgenticChatWorkerAdmissionRpcArgs,
	type AgenticChatWorkerAdmissionRpcClient
} from '$lib/services/agentic-chat-v2/worker-turn-admission.server';
import { prepareAgenticChatWorkerAdmission } from '$lib/services/agentic-chat-v2/worker-turn-preparation.server';
import {
	listOwnedActiveAgenticChatWorkerTurns,
	type AgenticChatWorkerTurnGatewayClient
} from '$lib/services/agentic-chat-v2/worker-turn-gateway.server';
import { ApiResponse, HttpStatus } from '$lib/utils/api-response';
import { createLogger } from '$lib/utils/logger';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import { parseJsonRequest } from '$lib/utils/request-validation';
import { consumeAgenticChatTurnRateLimit } from '$lib/server/agentic-chat-turn-rate-limit';
import { startAgenticChatWorkerQueueWake } from '$lib/services/agentic-chat-v2/worker-queue-wake.server';

const logger = createLogger('API:AgentWorkerTurnsV2');
import { workerAdmissionRequestSchema } from './worker-admission-schema';
import {
	privateResponse,
	withWorkerAdmissionTiming,
	workerAdmissionErrorResponse,
	workerIdempotencyConflictResponse,
	type WorkerAdmissionPhase
} from './worker-admission-responses';
import { readAgenticChatTurnSource } from './turn-source';
import {
	admitWorkflowReviewTurnIfEligible,
	pickWorkflowReviewEnvironment
} from './workflow-review-admission';
import type { AgenticChatWorkflowV4AdmissionRpcClient } from '$lib/services/agentic-chat-v2/worker-turn-workflow-admission.server';

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
	const requestReceivedAt = new Date().toISOString();
	const { user } = await safeGetSession();
	if (!user?.id) return privateResponse(ApiResponse.unauthorized());
	const turnRateLimit = consumeAgenticChatTurnRateLimit(user.id);
	if (!turnRateLimit.allowed) {
		const response = ApiResponse.error(
			'Too many chat turns. Try again shortly.',
			HttpStatus.TOO_MANY_REQUESTS,
			'AGENTIC_CHAT_RATE_LIMITED'
		);
		for (const [name, value] of Object.entries(turnRateLimit.headers)) {
			response.headers.set(name, value);
		}
		response.headers.set('Retry-After', String(turnRateLimit.retryAfterSeconds ?? 1));
		return privateResponse(response);
	}

	const parsed = await parseJsonRequest(request, workerAdmissionRequestSchema, {
		invalidBodyMessage: 'Invalid worker turn request'
	});
	if (!parsed.ok) return privateResponse(parsed.response);

	const serviceClient = createAdminSupabaseClient();
	// The transport decision is resolved here, bound to this authenticated user
	// and the exact clientTurnId, streamRunId, session, and context admitted.
	const decision = await resolveAgenticChatWorkerTransportDecision({
		client: serviceClient,
		userId: user.id,
		binding: parsed.data
	});
	if (!decision.ok) return privateResponse(decision.response);
	// A session-less send gets its session inside the admission RPC; the row is
	// returned so the client needs no separate session bootstrap round trip.
	const loadCreatedSession = parsed.data.sessionId
		? undefined
		: (sessionId: string) =>
				loadAdmittedWorkerSession({ client: serviceClient, userId: user.id, sessionId });
	// Tasker 86: an eligible explicit project review is saved raw in one RPC;
	// null keeps every other turn on the unchanged ordinary path below.
	const workflowReview = await admitWorkflowReviewTurnIfEligible({
		environment: pickWorkflowReviewEnvironment(env),
		userId: user.id,
		command: parsed.data,
		transportDecisionId: decision.decisionId,
		client: serviceClient as unknown as AgenticChatWorkflowV4AdmissionRpcClient,
		workbenchClient:
			serviceClient as unknown as import('$lib/services/agentic-chat-v2/specialist-workbench.server').SpecialistWorkbenchClient,
		loadSession: loadCreatedSession,
		wakeWorker: startAgenticChatWorkerQueueWake
	});
	if (workflowReview) return privateResponse(workflowReview);
	// Everything before the admission RPC writes nothing, so a failure there is
	// reported as "not sent" instead of "maybe sent".
	let phase: WorkerAdmissionPhase = 'preparation';
	try {
		const command = {
			clientTurnId: parsed.data.clientTurnId,
			streamRunId: parsed.data.streamRunId,
			sessionId: parsed.data.sessionId,
			context: parsed.data.context,
			message: parsed.data.message,
			attachments: parsed.data.attachments,
			projectFocus: parsed.data.projectFocus as ProjectFocus | null,
			voiceNoteGroupId: parsed.data.voiceNoteGroupId,
			preparedPromptKey: parsed.data.preparedPromptKey,
			requestedSkillId: parsed.data.requestedSkillId
		};
		const prepare = (options: { preparedPromptLineageOnly?: boolean } = {}) =>
			prepareAgenticChatWorkerAdmission({
				userClient: supabase as SupabaseClient<Database>,
				serviceClient,
				userId: user.id,
				command,
				lease: {
					decisionId: decision.decisionId,
					mode: 'worker_realtime',
					contractVersion: 'agentic_chat_worker_v1'
				},
				source: readAgenticChatTurnSource(request.headers),
				...options
			});
		let preparationMs = 0;
		// Web admission timing rides the durable payload (M2); neither the request
		// hash nor the artifact hash covers the payload.
		const admit = (args: AgenticChatWorkerAdmissionRpcArgs) => {
			phase = 'admission';
			return admitAgenticChatWorkerTurn({
				client: serviceClient as unknown as AgenticChatWorkerAdmissionRpcClient,
				args: {
					...args,
					p_request_payload: {
						...(args.p_request_payload as { [key: string]: Json | undefined }),
						preparationMs,
						requestReceivedAt
					}
				}
			});
		};
		const preparationStartedAt = Date.now();
		let preparation = await prepare();
		preparationMs = Math.max(0, Date.now() - preparationStartedAt);
		const admissionStartedAt = Date.now();
		let result;
		try {
			result = await admit(preparation.args);
		} catch (admissionError) {
			// A key consumption, expiry, or newer message can land between
			// preparation and durable admission; that must cost one slow-path retry,
			// never a failed send. These errors are raised inside the RPC, so its
			// transaction rolled back and re-preparing is safe.
			const preparedRace =
				Boolean(preparation.args.p_prepared_prompt_id) &&
				isPreparedAdmissionRaceError(admissionError);
			if (!preparedRace && !isHistoryWindowRaceError(admissionError)) throw admissionError;
			logger.warn('Admission inputs changed before claim; re-preparing once', {
				error: admissionError,
				preparedFailureCode: getPreparedAdmissionFailureCode(admissionError),
				userId: user.id,
				clientTurnId: parsed.data.clientTurnId,
				preparedPromptId: preparation.args.p_prepared_prompt_id
			});
			phase = 'preparation';
			const retryStartedAt = Date.now();
			// A prepared race keeps the key's hash lineage but never adopts its
			// content, so a later identical resend still matches this turn.
			preparation = await prepare({ preparedPromptLineageOnly: preparedRace });
			if (preparedRace) {
				// Reflect the race in both the response timing and the durable payload.
				const raceMetadata = {
					requested: true,
					hit: false,
					missReason: 'admission_race_retry',
					inspectionMs: preparation.preparedAdmissionLease.inspectionMs
				};
				preparation.preparedAdmissionLease = raceMetadata;
				(
					preparation.args.p_request_payload as Record<string, unknown>
				).preparedAdmissionLease = raceMetadata;
			}
			preparationMs += Math.max(0, Date.now() - retryStartedAt);
			result = await admit(preparation.args);
		}
		// Start the wake now but never wait for it; it outlives the response.
		if (result.outcome === 'newly_admitted') startAgenticChatWorkerQueueWake();
		const admissionMs = Math.max(0, Date.now() - admissionStartedAt);
		const timedResponse = (response: Response) =>
			withWorkerAdmissionTiming(response, {
				preparationMs,
				admissionMs,
				preparedAdmissionLease: preparation.preparedAdmissionLease
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
			return timedResponse(privateResponse(response));
		}
		if (result.outcome === 'idempotency_conflict') {
			return timedResponse(workerIdempotencyConflictResponse());
		}
		if (
			result.outcome === 'active_turn_conflict' ||
			(result.outcome === 'matching_duplicate' && result.executionMode !== 'worker_realtime')
		) {
			return timedResponse(
				privateResponse(
					ApiResponse.error(
						'Worker turn admission conflicts with an existing turn',
						HttpStatus.CONFLICT,
						'WORKER_ADMISSION_CONFLICT'
					)
				)
			);
		}

		const session = loadCreatedSession ? await loadCreatedSession(result.sessionId) : null;
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
			status: result.status,
			...(session ? { session } : {})
		};
		return timedResponse(
			privateResponse(
				json(
					{
						success: true,
						data: payload,
						timestamp: new Date().toISOString()
					},
					{ status: result.outcome === 'newly_admitted' ? 202 : 200 }
				)
			)
		);
	} catch (error) {
		logger.warn('Worker turn admission failed', {
			error,
			phase,
			userId: user.id,
			clientTurnId: parsed.data.clientTurnId
		});
		return workerAdmissionErrorResponse(error, phase);
	}
};
