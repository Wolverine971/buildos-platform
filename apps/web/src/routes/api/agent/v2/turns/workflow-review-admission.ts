// apps/web/src/routes/api/agent/v2/turns/workflow-review-admission.ts
//
// Tasker 86 branch of worker turn admission, kept beside +server.ts so the route
// stays under the route-size guard. It runs after the transport decision and
// returns null only for ordinary turns. Explicit read-only reviews must never
// silently fall through to an ordinary turn that could execute mutations.
import { json } from '@sveltejs/kit';
import type { ChatSession } from '@buildos/shared-types';
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

import {
	getSpecialistWorkbenchVersion,
	SpecialistWorkbenchStoreError,
	type SpecialistWorkbenchClient
} from '$lib/services/agentic-chat-v2/specialist-workbench.server';
import {
	loadSelectedSpecialistRecommendation,
	SpecialistRecommendationError
} from '$lib/services/agentic-chat-v2/specialist-recommendations.server';

const logger = createLogger('API:AgentWorkflowReviewTurns');

const WORKFLOW_REVIEW_ENVIRONMENT_KEYS = [
	'AGENTIC_CHAT_WORKFLOW_V4_ADMISSION_ENABLED',
	'AGENTIC_CHAT_SPECIALIST_WORKFLOWS_ENABLED',
	'AGENTIC_CHAT_DOCUMENT_READ_TOOLS_ENABLED',
	'AGENTIC_CHAT_DOCUMENT_EVIDENCE_HANDOFF_ENABLED',
	'AGENTIC_CHAT_PUBLISHED_SPECIALISTS_ENABLED',
	'AGENTIC_CHAT_JEV_RECOMMENDATIONS_ENABLED',
	'AGENTIC_CHAT_PROJECT_REVIEW_V2_ENABLED',
	'AGENTIC_CHAT_PROJECT_REVIEW_V3_ENABLED',
	'AGENTIC_CHAT_WORKFLOW_PROTOTYPE_USER_IDS'
] as const;

export type WorkflowReviewEnvironment = Partial<
	Record<(typeof WORKFLOW_REVIEW_ENVIRONMENT_KEYS)[number], string>
>;

/** Picks only the server switches the review branch reads from the private env. */
export function pickWorkflowReviewEnvironment(
	env: Record<string, string | undefined>
): WorkflowReviewEnvironment {
	return Object.fromEntries(WORKFLOW_REVIEW_ENVIRONMENT_KEYS.map((key) => [key, env[key]]));
}

export async function admitWorkflowReviewTurnIfEligible(input: {
	environment: WorkflowReviewEnvironment;
	userId: string;
	command: AgenticChatWorkflowV4CommandV1;
	transportDecisionId: string;
	client: AgenticChatWorkflowV4AdmissionRpcClient;
	workbenchClient?: SpecialistWorkbenchClient;
	createId?: () => string;
	/** Set only for a session-less send: returns the session admission created. */
	loadSession?: (sessionId: string) => Promise<ChatSession | null>;
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
		// An explicit selection adds one owner-scoped immutable catalog read.
		let published;
		const ref = input.command.publishedSpecialist;
		if (ref) {
			if (!input.workbenchClient)
				throw new SpecialistWorkbenchStoreError(503, 'Specialist storage unavailable.');
			const selected = await getSpecialistWorkbenchVersion(
				input.workbenchClient,
				input.userId,
				ref.draftId,
				ref.version
			);
			if (
				selected.version.snapshotHash !== ref.snapshotHash ||
				selected.snapshot.draftId !== ref.draftId ||
				selected.snapshot.definition.version !== ref.version
			)
				throw new SpecialistWorkbenchStoreError(
					409,
					'The selected specialist version could not be verified. Select it again.'
				);
			let recommendation;
			if (ref.selectionDecisionId) {
				if (input.environment.AGENTIC_CHAT_JEV_RECOMMENDATIONS_ENABLED?.trim() !== 'true')
					throw new SpecialistRecommendationError(
						409,
						'Jev recommendations are not enabled.'
					);
				recommendation = await loadSelectedSpecialistRecommendation({
					client: input.workbenchClient,
					userId: input.userId,
					id: ref.selectionDecisionId,
					projectId: eligibility.projectId,
					question: eligibility.message,
					selected: ref
				});
			}
			published = {
				snapshot: selected.snapshot,
				snapshotHash: ref.snapshotHash,
				...(recommendation ? { recommendation } : {})
			};
		}
		const args = await buildAgenticChatWorkflowV4AdmissionArgs({
			userId: input.userId,
			command: input.command,
			eligibility,
			published,
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
		// Built-ins use one RPC; custom selection adds the catalog read.
		preQueueDbRoundTrips: input.command.publishedSpecialist?.selectionDecisionId
			? 3
			: input.command.publishedSpecialist
				? 2
				: 1,
		sessionCreated: result.outcome === 'newly_admitted' ? result.sessionCreated : null,
		historyMessageCount: result.outcome === 'newly_admitted' ? result.historyMessageCount : null
	});
	// Read after the durable admission and outside its timing; never fails it.
	const session =
		input.loadSession &&
		(result.outcome === 'newly_admitted' || result.outcome === 'matching_duplicate')
			? await input.loadSession(result.sessionId)
			: null;
	return timed(outcomeResponse(result, session), preparationMs, admissionMs);
}

function outcomeResponse(
	result: AgenticChatWorkflowV4AdmissionResultV1,
	session: ChatSession | null
): Response {
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
						reviewMode: 'project_review',
						...(session ? { session } : {})
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
	if (
		error instanceof SpecialistWorkbenchStoreError ||
		error instanceof SpecialistRecommendationError
	)
		return ApiResponse.error(
			'Selected specialist is unavailable. Your draft has been kept. Select a published version and try again.',
			HttpStatus.CONFLICT,
			'WORKFLOW_REVIEW_UNAVAILABLE'
		);
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
