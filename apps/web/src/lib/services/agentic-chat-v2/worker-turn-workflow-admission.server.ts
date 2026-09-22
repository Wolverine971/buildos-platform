// apps/web/src/lib/services/agentic-chat-v2/worker-turn-workflow-admission.server.ts
//
// Tasker 86 lightweight submission. An explicit project-review request from the
// internal cohort is saved atomically as a raw `agentic_chat_input_v4` request by
// one service RPC. No project context, history, prompt, or prepared-prompt lease is
// read here: the database derives history, hashes, and authorization under its own
// locks, and the worker gathers context after claim.
import { randomUUID } from 'node:crypto';
import {
	buildDocumentOrganizationSnapshotV2,
	buildDocumentReadSnapshotV2,
	buildDocumentEvidenceSnapshotV2,
	hashExecutableSpecialistSnapshot,
	buildPublishedSpecialistSnapshotV3,
	type SpecialistWorkbenchVersionV1,
	type PublishedSpecialistRefV1,
	type SpecialistRecommendationReceiptV1,
	DOCUMENT_ORGANIZATION_POLICY_REF,
	type ExecutableSpecialistSnapshot
} from '@buildos/agentic-chat-runtime/specialists';
import {
	AGENTIC_CHAT_WORKFLOW_LIMITS,
	AGENTIC_CHAT_PROJECT_REVIEW_V2_POLICY_REF,
	AGENTIC_CHAT_PROJECT_REVIEW_V3_POLICY_REF,
	AGENTIC_CHAT_DOCUMENT_READ_POLICY_REF,
	AGENTIC_CHAT_DOCUMENT_EVIDENCE_POLICY_REF,
	agenticChatWorkflowPolicyForRef,
	type AgenticChatProjectReviewIntentV1,
	type AgenticChatWorkflowPolicy,
	buildAgenticChatWorkflowReviewIntentV1,
	hashAgenticChatWorkflowRequestV1,
	normalizeAgenticChatText,
	parseChatWorkflowPrototypeUsers
} from '@buildos/shared-types';

/** Server-owned policy reference recorded on every v4 request. Never a browser value. */
export const AGENTIC_CHAT_WORKFLOW_V4_POLICY_REF = 'internal-project-review:v1';

export type AgenticChatWorkflowV4AdmissionPolicyV1 = {
	/** AGENTIC_CHAT_WORKFLOW_V4_ADMISSION_ENABLED, exactly `true`. Default off. */
	enabled: boolean;
	specialistWorkflowsEnabled?: boolean;
	documentReadToolsEnabled?: boolean;
	documentEvidenceHandoffEnabled?: boolean;
	publishedSpecialistsEnabled?: boolean;
	projectReviewV2Enabled?: boolean;
	projectReviewV3Enabled?: boolean;
	/** The existing internal cohort, AGENTIC_CHAT_WORKFLOW_PROTOTYPE_USER_IDS. */
	cohortUserIds: readonly string[];
};

export function resolveAgenticChatWorkflowV4AdmissionPolicy(environment: {
	AGENTIC_CHAT_WORKFLOW_V4_ADMISSION_ENABLED?: string;
	AGENTIC_CHAT_SPECIALIST_WORKFLOWS_ENABLED?: string;
	AGENTIC_CHAT_DOCUMENT_READ_TOOLS_ENABLED?: string;
	AGENTIC_CHAT_DOCUMENT_EVIDENCE_HANDOFF_ENABLED?: string;
	AGENTIC_CHAT_PUBLISHED_SPECIALISTS_ENABLED?: string;
	AGENTIC_CHAT_PROJECT_REVIEW_V2_ENABLED?: string;
	AGENTIC_CHAT_PROJECT_REVIEW_V3_ENABLED?: string;
	AGENTIC_CHAT_WORKFLOW_PROTOTYPE_USER_IDS?: string;
}): AgenticChatWorkflowV4AdmissionPolicyV1 {
	return {
		projectReviewV3Enabled:
			environment.AGENTIC_CHAT_PROJECT_REVIEW_V3_ENABLED?.trim() === 'true',
		projectReviewV2Enabled:
			environment.AGENTIC_CHAT_PROJECT_REVIEW_V2_ENABLED?.trim() === 'true',
		publishedSpecialistsEnabled:
			environment.AGENTIC_CHAT_PUBLISHED_SPECIALISTS_ENABLED?.trim() === 'true',
		enabled: environment.AGENTIC_CHAT_WORKFLOW_V4_ADMISSION_ENABLED?.trim() === 'true',
		specialistWorkflowsEnabled:
			environment.AGENTIC_CHAT_SPECIALIST_WORKFLOWS_ENABLED?.trim() === 'true',
		documentEvidenceHandoffEnabled:
			environment.AGENTIC_CHAT_DOCUMENT_EVIDENCE_HANDOFF_ENABLED?.trim() === 'true',
		documentReadToolsEnabled:
			environment.AGENTIC_CHAT_DOCUMENT_READ_TOOLS_ENABLED?.trim() === 'true',
		cohortUserIds: parseChatWorkflowPrototypeUsers(
			environment.AGENTIC_CHAT_WORKFLOW_PROTOTYPE_USER_IDS
		)
	};
}

/** The already-validated route command, reduced to what v4 admission may read. */
export type AgenticChatWorkflowV4CommandV1 = {
	clientTurnId: string;
	streamRunId: string;
	sessionId: string | null;
	context: { type: string; entityId: string | null; projectId: string | null };
	message: string;
	attachments: readonly unknown[];
	projectFocus: { focusType: string } | null;
	voiceNoteGroupId: string | null;
	reviewIntent: 'project_review' | 'document_organization' | null;
	publishedSpecialist?: PublishedSpecialistRefV1 | null;
};

export type AgenticChatWorkflowV4IneligibleReasonV1 =
	| 'not_requested'
	| 'disabled'
	| 'not_in_cohort'
	| 'not_project_scope'
	| 'attachments'
	| 'voice_note'
	| 'focused_entity'
	| 'message_bounds';

export type AgenticChatWorkflowV4EligibilityV1 =
	| {
			eligible: true;
			projectId: string;
			message: string;
			profile?: 'document_organization';
			projectReviewV2?: boolean;
			projectReviewV3?: boolean;
			documentReadTools?: boolean;
			documentEvidenceHandoff?: boolean;
	  }
	| { eligible: false; reason: AgenticChatWorkflowV4IneligibleReasonV1 };

/**
 * The browser may only ask for a review. The server switch, the cohort, and the
 * pilot shape (project-wide, text-only, bounded question) decide whether v4
 * applies. The route rejects unsupported explicit reviews; ordinary turns are unchanged.
 */
export function evaluateAgenticChatWorkflowV4Admission(input: {
	policy: AgenticChatWorkflowV4AdmissionPolicyV1;
	userId: string;
	command: AgenticChatWorkflowV4CommandV1;
}): AgenticChatWorkflowV4EligibilityV1 {
	const { command } = input;
	if (
		command.publishedSpecialist &&
		(command.reviewIntent !== 'document_organization' ||
			!input.policy.publishedSpecialistsEnabled ||
			!input.policy.documentReadToolsEnabled)
	)
		return ineligible('disabled');
	if (
		command.reviewIntent !== 'project_review' &&
		command.reviewIntent !== 'document_organization'
	)
		return ineligible('not_requested');
	if (
		command.reviewIntent === 'document_organization' &&
		!input.policy.specialistWorkflowsEnabled
	)
		return ineligible('disabled');
	if (!input.policy.enabled) return ineligible('disabled');
	if (!input.policy.cohortUserIds.includes(input.userId.toLowerCase())) {
		return ineligible('not_in_cohort');
	}
	const { type, entityId, projectId } = command.context;
	if (type !== 'project' || !projectId || entityId !== projectId) {
		return ineligible('not_project_scope');
	}
	if (command.attachments.length > 0) return ineligible('attachments');
	if (command.voiceNoteGroupId !== null) return ineligible('voice_note');
	if (command.projectFocus !== null && command.projectFocus.focusType !== 'project-wide') {
		return ineligible('focused_entity');
	}
	const message = normalizeAgenticChatText(command.message);
	const codePoints = [...message].length;
	if (
		codePoints < AGENTIC_CHAT_WORKFLOW_LIMITS.messageMinChars ||
		codePoints > AGENTIC_CHAT_WORKFLOW_LIMITS.messageMaxChars ||
		Buffer.byteLength(message, 'utf8') > AGENTIC_CHAT_WORKFLOW_LIMITS.messageMaxBytes
	) {
		return ineligible('message_bounds');
	}
	return {
		eligible: true,
		projectId,
		message,
		...(command.reviewIntent === 'project_review' && input.policy.projectReviewV3Enabled
			? { projectReviewV3: true }
			: {}),
		...(command.reviewIntent === 'project_review' && input.policy.projectReviewV2Enabled
			? { projectReviewV2: true }
			: {}),
		...(command.reviewIntent === 'document_organization'
			? {
					profile: 'document_organization' as const,
					...(input.policy.documentReadToolsEnabled
						? {
								documentReadTools: true,
								documentEvidenceHandoff:
									input.policy.documentEvidenceHandoffEnabled === true
							}
						: {})
				}
			: {})
	};
}

export type AgenticChatWorkflowV4AdmissionRpcArgs = {
	p_user_id: string;
	p_session_id: string | null;
	p_turn_run_id: string;
	p_user_message_id: string;
	p_request_artifact_id: string;
	p_stream_run_id: string;
	p_client_turn_id: string;
	p_transport_decision_id: string;
	p_correlation_id: string;
	p_project_id: string;
	p_message: string;
	p_review_intent: AgenticChatProjectReviewIntentV1;
	p_policy: AgenticChatWorkflowPolicy;
	p_policy_ref: string;
	p_request_hash: string;
	p_cache_ref: null;
	p_specialist_snapshot?: ExecutableSpecialistSnapshot;
	p_specialist_snapshot_hash?: string;
};

/**
 * Server-derived arguments only: generated identities, the leased decision id,
 * the frozen policy, the review intent derived from the normalized question,
 * and a request-hash echo the database recomputes. The pilot never sends a
 * cache reference; the worker always takes the supported fresh context load.
 */
export async function buildAgenticChatWorkflowV4AdmissionArgs(input: {
	userId: string;
	command: Pick<AgenticChatWorkflowV4CommandV1, 'clientTurnId' | 'streamRunId' | 'sessionId'>;
	eligibility: Extract<AgenticChatWorkflowV4EligibilityV1, { eligible: true }>;
	published?: {
		snapshot: SpecialistWorkbenchVersionV1;
		snapshotHash: string;
		recommendation?: SpecialistRecommendationReceiptV1;
	};
	transportDecisionId: string;
	createId?: () => string;
}): Promise<AgenticChatWorkflowV4AdmissionRpcArgs> {
	const createId = input.createId ?? randomUUID;
	const { projectId, message } = input.eligibility;
	const reviewIntent = buildAgenticChatWorkflowReviewIntentV1(message);
	const snapshot = input.published
		? await buildPublishedSpecialistSnapshotV3({
				...input.published,
				evidenceHandoff: input.eligibility.documentEvidenceHandoff
			})
		: input.eligibility.profile === 'document_organization'
			? input.eligibility.documentReadTools
				? input.eligibility.documentEvidenceHandoff
					? buildDocumentEvidenceSnapshotV2()
					: buildDocumentReadSnapshotV2()
				: buildDocumentOrganizationSnapshotV2()
			: null;
	const policyRef = snapshot
		? snapshot.profileVersion === 3
			? AGENTIC_CHAT_DOCUMENT_EVIDENCE_POLICY_REF
			: snapshot.profileVersion === 2
				? AGENTIC_CHAT_DOCUMENT_READ_POLICY_REF
				: DOCUMENT_ORGANIZATION_POLICY_REF
		: input.eligibility.projectReviewV3
			? AGENTIC_CHAT_PROJECT_REVIEW_V3_POLICY_REF
			: input.eligibility.projectReviewV2
				? AGENTIC_CHAT_PROJECT_REVIEW_V2_POLICY_REF
				: AGENTIC_CHAT_WORKFLOW_V4_POLICY_REF;
	const context = { type: 'project' as const, entityId: projectId, projectId };
	const requestHash = await hashAgenticChatWorkflowRequestV1({
		clientTurnId: input.command.clientTurnId,
		streamRunId: input.command.streamRunId,
		context,
		message,
		reviewIntent,
		policy: agenticChatWorkflowPolicyForRef(policyRef),
		policyRef
	});
	return {
		p_user_id: input.userId,
		p_session_id: input.command.sessionId,
		p_turn_run_id: generatedUuid(createId()),
		p_user_message_id: generatedUuid(createId()),
		p_request_artifact_id: generatedUuid(createId()),
		p_stream_run_id: input.command.streamRunId,
		p_client_turn_id: input.command.clientTurnId,
		p_transport_decision_id: input.transportDecisionId,
		p_correlation_id: generatedUuid(createId()),
		p_project_id: projectId,
		p_message: message,
		p_review_intent: reviewIntent,
		p_policy: agenticChatWorkflowPolicyForRef(policyRef),
		p_policy_ref: policyRef,
		p_request_hash: requestHash,
		p_cache_ref: null,
		...(snapshot
			? {
					p_specialist_snapshot: snapshot,
					p_specialist_snapshot_hash: await hashExecutableSpecialistSnapshot(snapshot)
				}
			: {})
	};
}

type RpcError = { code?: string; message?: string };
type RpcResult = { data: unknown; error: RpcError | null };

export type AgenticChatWorkflowV4AdmissionRpcClient = {
	rpc(
		name:
			| 'create_agentic_chat_workflow_turn_with_job_v1'
			| 'create_agentic_chat_document_review_turn_v2'
			| 'create_agentic_chat_document_review_turn_v3'
			| 'create_agentic_chat_document_review_turn_v4'
			| 'create_agentic_chat_published_review_turn_v1',
		args: AgenticChatWorkflowV4AdmissionRpcArgs
	): PromiseLike<RpcResult>;
};

export type AgenticChatWorkflowV4HandleV1 = {
	turnRunId: string;
	sessionId: string;
	streamRunId: string;
	clientTurnId: string;
	status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
};

export type AgenticChatWorkflowV4AdmissionResultV1 =
	| ({
			outcome: 'newly_admitted';
			sessionCreated: boolean;
			historyMessageCount: number;
	  } & AgenticChatWorkflowV4HandleV1)
	| ({ outcome: 'matching_duplicate' } & AgenticChatWorkflowV4HandleV1)
	| { outcome: 'idempotency_conflict'; conflictReason: string }
	| { outcome: 'active_turn_conflict' }
	| {
			outcome: 'capacity_exceeded';
			retryAfterSeconds: number;
			runningCount: number;
			queuedCount: number;
	  }
	| { outcome: 'access_denied' };

export type AgenticChatWorkflowV4AdmissionErrorCodeV1 =
	| 'session_conflict'
	| 'invalid_command'
	| 'database_error'
	| 'protocol_error';

export class AgenticChatWorkflowV4AdmissionError extends Error {
	constructor(
		readonly code: AgenticChatWorkflowV4AdmissionErrorCodeV1,
		message: string
	) {
		super(message);
		this.name = 'AgenticChatWorkflowV4AdmissionError';
	}
}

const SESSION_CONFLICT_ERRORS = [
	'agentic_chat_session_not_owned',
	'agentic_chat_workflow_admission_session_scope_mismatch'
];
const INVALID_COMMAND_ERRORS = [
	'agentic_chat_workflow_admission_invalid_message',
	'agentic_chat_workflow_admission_invalid_client_identity'
];

/** One round trip: duplicate-first, capacity, access, session, history, and enqueue. */
export async function admitAgenticChatWorkflowV4Turn(input: {
	client: AgenticChatWorkflowV4AdmissionRpcClient;
	args: AgenticChatWorkflowV4AdmissionRpcArgs;
}): Promise<AgenticChatWorkflowV4AdmissionResultV1> {
	const { data, error } = await input.client.rpc(
		input.args.p_specialist_snapshot?.version === 'agentic_chat_specialist_snapshot_v3'
			? 'create_agentic_chat_published_review_turn_v1'
			: input.args.p_specialist_snapshot
				? input.args.p_specialist_snapshot.profileVersion === 3
					? 'create_agentic_chat_document_review_turn_v4'
					: input.args.p_specialist_snapshot.profileVersion === 2
						? 'create_agentic_chat_document_review_turn_v3'
						: 'create_agentic_chat_document_review_turn_v2'
				: 'create_agentic_chat_workflow_turn_with_job_v1',
		input.args
	);
	if (error) {
		const detail = `${error.code ?? ''} ${error.message ?? ''}`.trim();
		const named = detail.match(/\bagentic_chat_[a-z0-9_]+/)?.[0] ?? null;
		if (named && SESSION_CONFLICT_ERRORS.includes(named)) {
			throw new AgenticChatWorkflowV4AdmissionError('session_conflict', named);
		}
		if (named && INVALID_COMMAND_ERRORS.includes(named)) {
			throw new AgenticChatWorkflowV4AdmissionError('invalid_command', named);
		}
		throw new AgenticChatWorkflowV4AdmissionError(
			'database_error',
			detail ? `Workflow admission failed: ${detail}` : 'Workflow admission failed'
		);
	}
	return parseReceipt(data, input.args);
}

function parseReceipt(
	value: unknown,
	args: AgenticChatWorkflowV4AdmissionRpcArgs
): AgenticChatWorkflowV4AdmissionResultV1 {
	if (!isRecord(value) || value.execution_may_start !== false) {
		throw protocolError('Workflow admission receipt is invalid');
	}
	switch (value.outcome) {
		case 'newly_admitted': {
			const handle = parseHandle(value, args);
			if (
				handle.turnRunId !== args.p_turn_run_id ||
				(args.p_session_id !== null && handle.sessionId !== args.p_session_id) ||
				value.user_message_id !== args.p_user_message_id ||
				value.input_artifact_id !== args.p_request_artifact_id ||
				value.correlation_id !== args.p_correlation_id ||
				value.request_hash !== args.p_request_hash ||
				handle.status !== 'queued' ||
				!isUuid(value.queue_job_id) ||
				typeof value.session_created !== 'boolean' ||
				(args.p_session_id !== null && value.session_created) ||
				!Number.isSafeInteger(value.history_message_count) ||
				(value.history_message_count as number) < 0
			) {
				throw protocolError('New workflow admission identity is invalid');
			}
			return {
				outcome: 'newly_admitted',
				...handle,
				sessionCreated: value.session_created,
				historyMessageCount: value.history_message_count as number
			};
		}
		case 'matching_duplicate': {
			const handle = parseHandle(value, args);
			if (args.p_session_id !== null && handle.sessionId !== args.p_session_id) {
				throw protocolError('Matching workflow admission receipt is invalid');
			}
			return { outcome: 'matching_duplicate', ...handle };
		}
		case 'idempotency_conflict':
			if (typeof value.conflict_reason !== 'string' || value.conflict_reason.length === 0) {
				throw protocolError('Workflow idempotency conflict is invalid');
			}
			return { outcome: 'idempotency_conflict', conflictReason: value.conflict_reason };
		case 'active_turn_conflict':
			return { outcome: 'active_turn_conflict' };
		case 'capacity_exceeded':
			if (
				!Number.isSafeInteger(value.retry_after_seconds) ||
				(value.retry_after_seconds as number) < 1 ||
				(value.retry_after_seconds as number) > 300 ||
				!Number.isSafeInteger(value.running_count) ||
				!Number.isSafeInteger(value.queued_count)
			) {
				throw protocolError('Workflow capacity receipt is invalid');
			}
			return {
				outcome: 'capacity_exceeded',
				retryAfterSeconds: value.retry_after_seconds as number,
				runningCount: value.running_count as number,
				queuedCount: value.queued_count as number
			};
		case 'access_denied':
			return { outcome: 'access_denied' };
		default:
			throw protocolError('Workflow admission outcome is invalid');
	}
}

function parseHandle(
	value: Record<string, unknown>,
	args: AgenticChatWorkflowV4AdmissionRpcArgs
): AgenticChatWorkflowV4HandleV1 {
	const status = value.status;
	if (
		!isUuid(value.turn_run_id) ||
		!isUuid(value.session_id) ||
		value.client_turn_id !== args.p_client_turn_id ||
		value.stream_run_id !== args.p_stream_run_id ||
		value.execution_mode !== 'worker_realtime' ||
		(status !== 'queued' &&
			status !== 'running' &&
			status !== 'completed' &&
			status !== 'failed' &&
			status !== 'cancelled')
	) {
		throw protocolError('Workflow admission handle is invalid');
	}
	return {
		turnRunId: value.turn_run_id,
		sessionId: value.session_id,
		streamRunId: args.p_stream_run_id,
		clientTurnId: args.p_client_turn_id,
		status
	};
}

function generatedUuid(value: string): string {
	const normalized = value.toLowerCase();
	if (!isUuid(normalized)) throw protocolError('Generated identity is invalid');
	return normalized;
}

function isUuid(value: unknown): value is string {
	return typeof value === 'string' && UUID_PATTERN.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function ineligible(
	reason: AgenticChatWorkflowV4IneligibleReasonV1
): AgenticChatWorkflowV4EligibilityV1 {
	return { eligible: false, reason };
}

function protocolError(message: string): AgenticChatWorkflowV4AdmissionError {
	return new AgenticChatWorkflowV4AdmissionError('protocol_error', message);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
