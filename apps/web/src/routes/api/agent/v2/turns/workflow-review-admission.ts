// apps/web/src/routes/api/agent/v2/turns/workflow-review-admission.ts
//
// Tasker 86 branch of worker turn admission, kept beside +server.ts so the route
// stays under the route-size guard. It runs after lease verification and returns
// null only for ordinary turns. Explicit read-only reviews must never silently
// fall through to an ordinary turn that could execute mutations.
import { json } from '@sveltejs/kit';
import {
	admitAgenticChatWorkflowV4Turn,
	AgenticChatWorkflowV4AdmissionError,
	type AgenticChatWorkflowV4AdmissionResultV1,
	type AgenticChatWorkflowV4AdmissionRpcClient,
	type AgenticChatWorkflowV4CommandV1,
	buildAgenticChatWorkflowV4AdmissionArgs,
	evaluateAgenticChatWorkflowV4Admission,
	resolveAgenticChatWorkflowV4AdmissionPolicy
} from '$lib/services/agentic-chat-v2/worker-turn-workflow-admission.server';
import { ApiResponse, HttpStatus } from '$lib/utils/api-response';
import { createLogger } from '$lib/utils/logger';

const logger = createLogger('API:AgentWorkflowReviewTurns');

export async function admitWorkflowReviewTurnIfEligible(input: {
	environment: {
		AGENTIC_CHAT_WORKFLOW_V4_ADMISSION_ENABLED?: string;
		AGENTIC_CHAT_WORKFLOW_PROTOTYPE_USER_IDS?: string;
	};
	userId: string;
	command: AgenticChatWorkflowV4CommandV1;
	transportDecisionId: string;
	client: AgenticChatWorkflowV4AdmissionRpcClient;
	createId?: () => string;
}): Promise<Response | null> {
	const eligibility = evaluateAgenticChatWorkflowV4Admission({
		policy: resolveAgenticChatWorkflowV4AdmissionPolicy(input.environment),
		userId: input.userId,
		command: input.command
	});
	if (!eligibility.eligible) {
		if (eligibility.reason === 'not_requested') return null;
		if (eligibility.reason === 'disabled' || eligibility.reason === 'not_in_cohort') {
			return ApiResponse.error(
				'Project review is not available right now. Your draft has been kept.',
				HttpStatus.CONFLICT,
				'WORKFLOW_REVIEW_UNAVAILABLE'
			);
		}
		return ApiResponse.error(
			eligibility.reason === 'message_bounds'
				? 'Enter a project review question between 3 and 6,000 characters (up to 24 KB).'
				: 'Project review needs project-wide focus and a text-only message.',
			HttpStatus.UNPROCESSABLE_ENTITY,
			'INVALID_WORKER_COMMAND'
		);
	}

	const startedAt = performance.now();
	let preparationMs = 0;
	let admissionMs = 0;
	let result: AgenticChatWorkflowV4AdmissionResultV1;
	try {
		// Pure CPU: normalization, review intent, and one SHA-256 request echo.
		const args = await buildAgenticChatWorkflowV4AdmissionArgs({
			userId: input.userId,
			command: input.command,
			eligibility,
			transportDecisionId: input.transportDecisionId,
			createId: input.createId
		});
		preparationMs = elapsed(startedAt);
		const admissionStartedAt = performance.now();
		result = await admitAgenticChatWorkflowV4Turn({ client: input.client, args });
		admissionMs = elapsed(admissionStartedAt);
	} catch (error) {
		admissionMs = elapsed(startedAt) - preparationMs;
		logger.warn('Project review admission failed', {
			error,
			userId: input.userId,
			clientTurnId: input.command.clientTurnId
		});
		return timed(errorResponse(error), preparationMs, admissionMs);
	}

	logger.info('Project review admission timing', {
		event: 'agentic_chat_workflow_admission_timing',
		clientTurnId: input.command.clientTurnId,
		turnRunId: 'turnRunId' in result ? result.turnRunId : null,
		outcome: result.outcome,
		preparationMs,
		admissionMs,
		// The admission RPC is the only database round trip before the queue.
		preQueueDbRoundTrips: 1,
		sessionCreated: result.outcome === 'newly_admitted' ? result.sessionCreated : null,
		historyMessageCount: result.outcome === 'newly_admitted' ? result.historyMessageCount : null
	});
	return timed(outcomeResponse(result), preparationMs, admissionMs);
}

function outcomeResponse(result: AgenticChatWorkflowV4AdmissionResultV1): Response {
	switch (result.outcome) {
		case 'newly_admitted':
		case 'matching_duplicate':
			return json(
				{
					success: true,
					data: {
						outcome: result.outcome,
						handle: {
							contractVersion: 'agentic_chat_worker_v1',
							executionMode: 'worker_realtime',
							turnRunId: result.turnRunId,
							sessionId: result.sessionId,
							streamRunId: result.streamRunId,
							clientTurnId: result.clientTurnId
						},
						status: result.status,
						reviewMode: 'project_review'
					},
					timestamp: new Date().toISOString()
				},
				{ status: result.outcome === 'newly_admitted' ? 202 : 200 }
			);
		case 'capacity_exceeded': {
			const response = ApiResponse.error(
				'Too many worker turns are already waiting for this account',
				HttpStatus.TOO_MANY_REQUESTS,
				'WORKER_CAPACITY_EXCEEDED'
			);
			response.headers.set('Retry-After', String(result.retryAfterSeconds));
			return response;
		}
		case 'access_denied':
			return ApiResponse.forbidden('Worker turn access denied');
		case 'idempotency_conflict':
		case 'active_turn_conflict':
			return ApiResponse.error(
				'Worker turn admission conflicts with an existing turn',
				HttpStatus.CONFLICT,
				'WORKER_ADMISSION_CONFLICT'
			);
	}
}

function errorResponse(error: unknown): Response {
	if (error instanceof AgenticChatWorkflowV4AdmissionError) {
		if (error.code === 'session_conflict') {
			return ApiResponse.error(
				'Worker turn session conflicts with the request',
				HttpStatus.CONFLICT,
				'WORKER_SESSION_CONFLICT'
			);
		}
		if (error.code === 'invalid_command') {
			return ApiResponse.error(
				'Worker turn command is invalid',
				HttpStatus.UNPROCESSABLE_ENTITY,
				'INVALID_WORKER_COMMAND'
			);
		}
	}
	return ApiResponse.error(
		'Worker turn admission is temporarily unavailable',
		HttpStatus.SERVICE_UNAVAILABLE,
		'WORKER_ADMISSION_UNAVAILABLE'
	);
}

/** Same Server-Timing entries the client already reads; raw admission inspects no lease. */
function timed(response: Response, preparationMs: number, admissionMs: number): Response {
	response.headers.set(
		'Server-Timing',
		[
			'prepared-admission;dur=0;desc="workflow_raw"',
			`worker-preparation;dur=${Math.max(0, preparationMs)}`,
			`worker-admission;dur=${Math.max(0, admissionMs)}`
		].join(', ')
	);
	return response;
}

function elapsed(startedAt: number): number {
	return Math.max(0, Math.round((performance.now() - startedAt) * 10) / 10);
}
