// packages/shared-types/src/agentic-chat-workflow-contract.ts
import {
	AGENTIC_CHAT_INPUT_RETENTION_MS,
	canonicalizeAgenticChatJson,
	normalizeAgenticChatText,
	type JsonObject,
	type JsonValue,
	type TurnInputArtifactV1
} from './agentic-chat-worker-contract';

/**
 * Agentic Chat workflow v1 wire contract (Tasker 85). Storage and RPCs live in
 * migrations 20260914203007/20260914203008; see
 * docs/architecture/agentic-chat-workflow-v1-contract.md. Values here must stay
 * byte-identical to their SQL counterparts; the Postgres contract test checks it.
 */
export const AGENTIC_CHAT_WORKFLOW_CONTRACT_VERSION = 'agentic_chat_workflow_v1' as const;
export const AGENTIC_CHAT_INPUT_ARTIFACT_VERSION_V4 = 'agentic_chat_input_v4' as const;
export const AGENTIC_CHAT_WORKFLOW_REQUEST_HASH_VERSION =
	'agentic_chat_workflow_request_hash_v1' as const;
export const AGENTIC_CHAT_WORKFLOW_POLICY_VERSION =
	'agentic_chat_project_review_policy_v1' as const;
export const AGENTIC_CHAT_WORKFLOW_PLAN_VERSION = 'agentic_chat_project_review_plan_v1' as const;
export const AGENTIC_CHAT_WORKFLOW_CONTEXT_VERSION = 'agentic_chat_prepared_context_v1' as const;
export const AGENTIC_CHAT_WORKFLOW_PROJECTION_VERSION =
	'agentic_chat_workflow_projection_v1' as const;
export const AGENTIC_CHAT_WORKFLOW_PRICING_VERSION = 'agentic_chat_workflow_pricing_v1' as const;
export const AGENTIC_CHAT_WORKFLOW_PLANNER_RESULT_VERSION =
	'agentic_chat_workflow_planner_result_v1' as const;
export const AGENTIC_CHAT_WORKFLOW_SYNTHESIS_RESULT_VERSION =
	'agentic_chat_workflow_synthesis_result_v1' as const;
export const AGENTIC_CHAT_WORKFLOW_ROLE_REPORT_VERSION = 'chat_workflow_role_report_v1' as const;
export const AGENTIC_CHAT_WORKFLOW_PROGRESS_EVENT_TYPE = 'workflow_progress' as const;

export const AGENTIC_CHAT_WORKFLOW_LIMITS = {
	messageMinChars: 3,
	messageMaxChars: 6_000,
	messageMaxBytes: 24 * 1024,
	historyMaxMessages: 50,
	historyMaxBytes: 256 * 1024,
	requestArtifactMaxBytes: 2 * 1024 * 1024,
	contextMaxBytes: 256 * 1024,
	evidenceMaxEntries: 256,
	planMaxBytes: 64 * 1024,
	assignmentMaxBytes: 16 * 1024,
	resultMaxBytes: 128 * 1024,
	answerMaxBytes: 128 * 1024,
	serializedRequestMaxBytes: 128 * 1024,
	physicalAttemptsPerStepAttempt: 2
} as const;

/** Tasker 83's accepted completion ceilings, including hidden reasoning. */
export const AGENTIC_CHAT_WORKFLOW_MAX_OUTPUT_TOKENS = {
	planner: 1_200,
	project_analyst: 4_000,
	risk_reviewer: 4_000,
	editor: 3_200
} as const;

export const AGENTIC_CHAT_WORKFLOW_POLICY_V1 = {
	version: AGENTIC_CHAT_WORKFLOW_POLICY_VERSION,
	workflowVersion: AGENTIC_CHAT_WORKFLOW_CONTRACT_VERSION,
	scope: 'project_text',
	domainAccess: 'read_only',
	modelTools: 'none',
	domainWrites: 'forbidden',
	recoveryPolicy: 'durable_read_only_v1',
	maxSpecialistConcurrency: 2,
	maxStepAttempts: 2,
	maxPhysicalDispatches: 16,
	maxSpendMicroUsd: 250_000,
	synthesisHeadroomMicroUsd: 50_000,
	wholeRunLifetimeMs: 900_000
} as const;

export type AgenticChatWorkflowPolicyV1 = typeof AGENTIC_CHAT_WORKFLOW_POLICY_V1;

/** Explicit additive policy: old requests still forbid all model tools. */
export const AGENTIC_CHAT_DOCUMENT_READ_POLICY_REF = 'internal-document-organization:v3';
export const AGENTIC_CHAT_DOCUMENT_READ_POLICY_V1 = {
	...AGENTIC_CHAT_WORKFLOW_POLICY_V1,
	version: 'agentic_chat_document_read_policy_v1',
	modelTools: 'bounded_document_read_v1'
} as const;
export type AgenticChatWorkflowPolicy =
	| AgenticChatWorkflowPolicyV1
	| typeof AGENTIC_CHAT_DOCUMENT_READ_POLICY_V1;
export function agenticChatWorkflowPolicyForRef(policyRef: string): AgenticChatWorkflowPolicy {
	return policyRef === AGENTIC_CHAT_DOCUMENT_READ_POLICY_REF
		? AGENTIC_CHAT_DOCUMENT_READ_POLICY_V1
		: AGENTIC_CHAT_WORKFLOW_POLICY_V1;
}

export const AGENTIC_CHAT_WORKFLOW_ADMITTED_MODELS = [
	'deepseek/deepseek-v4.1-flash',
	'deepseek/deepseek-v4-flash'
] as const;

/** Maximum admitted rates; every reservation is computed at these rates. */
export const AGENTIC_CHAT_WORKFLOW_MAX_RATES_USD_PER_MILLION = {
	prompt: 0.3,
	completion: 1.2,
	cacheRead: 0.006
} as const;

export type AgenticChatWorkflowStepKeyV1 =
	| 'planner'
	| 'project_analyst'
	| 'risk_reviewer'
	| 'editor';

export const AGENTIC_CHAT_WORKFLOW_PLAN_STEPS_V1 = [
	{ key: 'planner', capability: 'plan_review', dependsOn: [] },
	{ key: 'project_analyst', capability: 'project_analysis', dependsOn: ['planner'] },
	{ key: 'risk_reviewer', capability: 'risk_and_alternatives', dependsOn: ['planner'] },
	{
		key: 'editor',
		capability: 'synthesize_review',
		dependsOn: ['project_analyst', 'risk_reviewer']
	}
] as const;

export type AgenticChatProjectReviewIntentV1 = {
	kind: 'project_review';
	objective: string;
	requestedCoverage: ['project_analysis', 'risk_and_alternatives'];
};

export type AgenticChatWorkflowHistoryMessageV1 = {
	sourceMessageId: string;
	role: 'user' | 'assistant';
	content: string;
	attachments: [];
	toolCalls: [];
	toolCallId: null;
};

export type AgenticChatRawWorkflowRequestV4 = {
	/** Identical to the immutable input artifact row id. */
	requestId: string;
	turnRunId: string;
	sessionId: string;
	userId: string;
	userMessageId: string;
	clientTurnId: string;
	streamRunId: string;
	message: string;
	context: { type: 'project'; entityId: string; projectId: string };
	reviewIntent: AgenticChatProjectReviewIntentV1;
	policy: AgenticChatWorkflowPolicy;
	policyRef: string;
	cacheRef: { id: string; generation: string } | null;
};

export type AgenticChatRawWorkflowInputV4 = {
	artifactVersion: typeof AGENTIC_CHAT_INPUT_ARTIFACT_VERSION_V4;
	request: AgenticChatRawWorkflowRequestV4;
	historySource: 'admission_window';
	history: AgenticChatWorkflowHistoryMessageV1[];
	requestHashVersion: typeof AGENTIC_CHAT_WORKFLOW_REQUEST_HASH_VERSION;
	requestHash: string;
	historyHash: string;
	contentHash: string;
	historyBytes: number;
	contentBytes: number;
	createdAt: string;
	retainUntil: string;
};

/** The only two admissible execution inputs. Readers must branch explicitly. */
export type AgenticChatWorkerInputV1 =
	| { kind: 'prepared'; artifact: TurnInputArtifactV1 }
	| { kind: 'raw_workflow'; artifact: AgenticChatRawWorkflowInputV4 };

export type AgenticChatWorkflowEvidenceVersionV1 = {
	kind: string;
	id: string;
	version: string;
	observedAt: string;
};

export type AgenticChatPreparedWorkflowContextV1 = {
	version: typeof AGENTIC_CHAT_WORKFLOW_CONTEXT_VERSION;
	contextId: string;
	turnRunId: string;
	requestId: string;
	requestHash: string;
	preparationVersion: string;
	contextIdentity: {
		userId: string;
		projectId: string;
		accessCheckedAt: string;
		contextLoadedAt: string;
		cacheRefUsed: string | null;
	};
	evidenceVersions: AgenticChatWorkflowEvidenceVersionV1[];
	payload: JsonObject;
	payloadBytes: number;
	contextHash: string;
	acceptedAt: string;
};

export type AgenticChatWorkflowEvidenceRefV1 = {
	kind: 'project_record';
	id: string;
	version: string;
	label: string;
};

/** Tasker 83's bounded role report with durable evidence references. */
export type AgenticChatWorkflowRoleReportV1 = {
	version: typeof AGENTIC_CHAT_WORKFLOW_ROLE_REPORT_VERSION;
	role: 'project_analyst' | 'risk_reviewer';
	summary: string;
	findings: Array<{
		claim: string;
		basis: 'recorded' | 'inferred';
		evidence: AgenticChatWorkflowEvidenceRefV1[];
	}>;
	risks: Array<{ risk: string; evidence: AgenticChatWorkflowEvidenceRefV1[] }>;
	unknowns: string[];
	recommendation: string;
	unsupportedReferences: number;
	unsupportedFindings: number;
};

export type AgenticChatWorkflowPlannerResultV1 = {
	version: typeof AGENTIC_CHAT_WORKFLOW_PLANNER_RESULT_VERSION;
	assignments: { project_analyst: JsonObject; risk_reviewer: JsonObject };
};

export type AgenticChatWorkflowPlanV1 = {
	version: typeof AGENTIC_CHAT_WORKFLOW_PLAN_VERSION;
	contextId: string;
	requestHash: string;
	planner:
		| { outcome: 'accepted'; stepAttemptId: string; resultHash: string }
		| { outcome: 'fixed_fallback'; stepAttemptId: null; resultHash: null };
	steps: typeof AGENTIC_CHAT_WORKFLOW_PLAN_STEPS_V1;
	assignments: Record<AgenticChatWorkflowStepKeyV1, JsonObject>;
};

export type AgenticChatWorkflowStepStatusV1 =
	| 'pending'
	| 'claimed'
	| 'accepted'
	| 'failed'
	| 'skipped';
export type AgenticChatWorkflowResultQualityV1 = 'complete' | 'partial';
export type AgenticChatWorkflowPhaseV1 =
	| 'preparing'
	| 'assessing'
	| 'executing'
	| 'synthesizing'
	| 'finished';
export type AgenticChatWorkflowTerminalOutcomeV1 = 'complete' | 'partial' | 'failed' | 'cancelled';

export type AgenticChatWorkflowDispatchKindV1 =
	| 'planner'
	| 'specialist'
	| 'editor'
	| 'corrective'
	| 'provider_fallback'
	| 'paid_tool';
export type AgenticChatWorkflowDispatchStateV1 =
	| 'reserved'
	| 'dispatching'
	| 'settled'
	| 'released'
	| 'uncertain';

export type AgenticChatWorkflowPricingSnapshotV1 = {
	version: typeof AGENTIC_CHAT_WORKFLOW_PRICING_VERSION;
	model: (typeof AGENTIC_CHAT_WORKFLOW_ADMITTED_MODELS)[number];
	canonicalModel: string;
	promptUsdPerMillion: string;
	completionUsdPerMillion: string;
	cacheReadUsdPerMillion: string;
	requestUsd: '0';
	source: 'openrouter_models_api';
	observedAt: string;
};

/** Privacy-safe projection nested under `projection.workflow` in the turn stream. */
export type AgenticChatWorkflowProjectionV1 = {
	version: typeof AGENTIC_CHAT_WORKFLOW_PROJECTION_VERSION;
	workflowVersion: typeof AGENTIC_CHAT_WORKFLOW_CONTRACT_VERSION;
	reviewIntent: 'project_review';
	phase: AgenticChatWorkflowPhaseV1;
	terminalOutcome: AgenticChatWorkflowTerminalOutcomeV1 | null;
	steps: Array<{
		key: AgenticChatWorkflowStepKeyV1;
		label: string;
		status: AgenticChatWorkflowStepStatusV1;
		quality: AgenticChatWorkflowResultQualityV1 | null;
		attemptsUsed: number;
		acceptedFinding: { summary: string; evidence: AgenticChatWorkflowEvidenceRefV1[] } | null;
		failureCode: string | null;
	}>;
	answer: {
		answerId: string | null;
		status: 'not_started' | 'streaming' | 'accepted';
		durableBytes: number;
		textSha256: string | null;
		editorStepAttemptId: string | null;
		acceptedAt: string | null;
	};
	transport: {
		executionState: 'queued' | 'active' | 'recovering' | 'terminal';
		lastDurableProgressAt: string | null;
		providerActivity: {
			state: 'idle' | 'waiting_for_capacity' | 'request_active' | 'settling';
			lastObservedAt: string | null;
		};
		delivery: {
			state: 'connected' | 'delayed' | 'reconcile_pending' | 'disconnected';
			lastObservedAt: string | null;
		};
	};
	coverageGap: string | null;
};

/** Common outcomes every fenced workflow RPC may return instead of its domain outcome. */
export type AgenticChatWorkflowFencedOutcomeV1 =
	| 'stale_generation'
	| 'ownership_lost'
	| 'cancel_requested'
	| 'already_terminal';

export type AgenticChatWorkflowAdmissionOutcomeV1 =
	| 'newly_admitted'
	| 'matching_duplicate'
	| 'idempotency_conflict'
	| 'active_turn_conflict'
	| 'capacity_exceeded'
	| 'access_denied';
export type AgenticChatWorkflowContextOutcomeV1 =
	| 'accepted'
	| 'already_accepted'
	| 'context_conflict'
	| 'deadline_expired'
	| 'access_revoked'
	| AgenticChatWorkflowFencedOutcomeV1;
export type AgenticChatWorkflowPlanOutcomeV1 =
	| 'installed'
	| 'already_installed'
	| 'plan_conflict'
	| 'context_required'
	| 'not_ready'
	| 'deadline_expired'
	| AgenticChatWorkflowFencedOutcomeV1;
export type AgenticChatWorkflowStepClaimOutcomeV1 =
	| 'claimed'
	| 'claim_conflict'
	| 'already_accepted'
	| 'not_ready'
	| 'plan_conflict'
	| 'dependency_failed'
	| 'attempts_exhausted'
	| 'budget_exhausted'
	| 'deadline_expired'
	| AgenticChatWorkflowFencedOutcomeV1;
export type AgenticChatWorkflowStepResultOutcomeV1 =
	| 'accepted'
	| 'already_accepted'
	| 'result_conflict'
	| 'stale_claim'
	| AgenticChatWorkflowFencedOutcomeV1;
export type AgenticChatWorkflowStepFailureOutcomeV1 =
	| 'retry_scheduled'
	| 'failed'
	| 'skipped'
	| 'already_accepted'
	| 'stale_claim'
	| AgenticChatWorkflowFencedOutcomeV1;
export type AgenticChatWorkflowDispatchReserveOutcomeV1 =
	| 'reserved'
	| 'already_reserved'
	| 'reservation_conflict'
	| 'pricing_unavailable'
	| 'stale_claim'
	| 'dispatch_limit'
	| 'budget_exhausted'
	| 'synthesis_headroom_required'
	| 'deadline_expired'
	| AgenticChatWorkflowFencedOutcomeV1;
export type AgenticChatWorkflowDispatchBeginOutcomeV1 =
	| 'dispatching'
	| 'already_started'
	| 'reservation_required'
	| 'stale_claim'
	| 'deadline_expired'
	| AgenticChatWorkflowFencedOutcomeV1;
export type AgenticChatWorkflowDispatchSettleOutcomeV1 =
	| 'settled'
	| 'uncertain'
	| 'already_settled'
	| 'settlement_conflict'
	| 'unknown_dispatch';
export type AgenticChatWorkflowDispatchReconcileOutcomeV1 =
	| 'reconciled'
	| 'already_reconciled'
	| 'still_uncertain'
	| 'reconciliation_conflict'
	| 'unknown_dispatch';
export type AgenticChatWorkflowTextBatchOutcomeV1 =
	| 'persisted'
	| 'already_persisted'
	| 'answer_conflict'
	| 'offset_conflict'
	| 'stream_reseed_required'
	| 'stale_claim'
	| AgenticChatWorkflowFencedOutcomeV1;
export type AgenticChatWorkflowSynthesisOutcomeV1 =
	| 'accepted'
	| 'already_accepted'
	| 'answer_conflict'
	| 'stale_claim'
	| AgenticChatWorkflowFencedOutcomeV1;
export type AgenticChatWorkflowRecoveryOutcomeV1 =
	| 'retry_scheduled'
	| 'already_requeued'
	| 'terminal_reconciled'
	| 'stale_generation'
	| 'ownership_lost'
	| 'cancel_requested'
	| 'policy_denied'
	| 'deadline_expired'
	| 'finalize_failed'
	| 'access_revoked'
	| 'attempts_exhausted'
	| 'budget_exhausted';

export function buildAgenticChatWorkflowReviewIntentV1(
	message: string
): AgenticChatProjectReviewIntentV1 {
	return {
		kind: 'project_review',
		objective: message,
		requestedCoverage: ['project_analysis', 'risk_and_alternatives']
	};
}

export function buildAgenticChatWorkflowRequestHashInputV1(
	request: Pick<
		AgenticChatRawWorkflowRequestV4,
		| 'clientTurnId'
		| 'streamRunId'
		| 'context'
		| 'message'
		| 'reviewIntent'
		| 'policy'
		| 'policyRef'
	>
): JsonObject {
	return {
		version: AGENTIC_CHAT_WORKFLOW_REQUEST_HASH_VERSION,
		clientTurnId: request.clientTurnId,
		streamRunId: request.streamRunId,
		context: {
			type: request.context.type,
			entityId: request.context.entityId,
			projectId: request.context.projectId
		},
		message: request.message,
		reviewIntent: request.reviewIntent as unknown as JsonObject,
		policy: request.policy as unknown as JsonObject,
		policyRef: request.policyRef
	};
}

/** Intentionally excludes `cacheRef`: cache is an optimization, not request semantics. */
export async function hashAgenticChatWorkflowRequestV1(
	request: Parameters<typeof buildAgenticChatWorkflowRequestHashInputV1>[0]
): Promise<string> {
	return sha256Hex(
		canonicalizeAgenticChatJson(buildAgenticChatWorkflowRequestHashInputV1(request))
	);
}

export type AgenticChatRawWorkflowInputHashesV4 = {
	requestHash: string;
	historyHash: string;
	contentHash: string;
	historyBytes: number;
	contentBytes: number;
};

/** Mirrors the admission RPC: every value is derived from canonical UTF-8 JSON. */
export async function hashAgenticChatRawWorkflowInputV4(
	request: AgenticChatRawWorkflowRequestV4,
	history: AgenticChatWorkflowHistoryMessageV1[]
): Promise<AgenticChatRawWorkflowInputHashesV4> {
	const requestHash = await hashAgenticChatWorkflowRequestV1(request);
	const historyText = canonicalizeAgenticChatJson(history as unknown as JsonValue);
	const historyHash = await sha256Hex(historyText);
	const contentText = canonicalizeAgenticChatJson({
		artifactVersion: AGENTIC_CHAT_INPUT_ARTIFACT_VERSION_V4,
		request: request as unknown as JsonObject,
		historySource: 'admission_window',
		history: history as unknown as JsonValue,
		requestHashVersion: AGENTIC_CHAT_WORKFLOW_REQUEST_HASH_VERSION,
		requestHash,
		historyHash
	});
	return {
		requestHash,
		historyHash,
		contentHash: await sha256Hex(contentText),
		historyBytes: utf8ByteLength(historyText),
		contentBytes: utf8ByteLength(contentText)
	};
}

/** Integer micro-USD reservation at the admitted maximum rates, rounded up. */
export function computeAgenticChatWorkflowReservationMicroUsdV1(
	serializedRequestBytes: number,
	maxOutputTokens: number
): number {
	if (
		!Number.isSafeInteger(serializedRequestBytes) ||
		serializedRequestBytes < 1 ||
		serializedRequestBytes > AGENTIC_CHAT_WORKFLOW_LIMITS.serializedRequestMaxBytes ||
		!Number.isSafeInteger(maxOutputTokens) ||
		maxOutputTokens < 1
	) {
		throw new RangeError('Workflow reservation inputs are outside the admitted bounds');
	}
	return Math.floor(((serializedRequestBytes + 1_024) * 3 + maxOutputTokens * 12 + 9) / 10);
}

export type AgenticChatRawWorkflowInputValidationCodeV1 =
	| 'invalid_version'
	| 'invalid_request'
	| 'invalid_message'
	| 'invalid_policy'
	| 'invalid_review_intent'
	| 'invalid_history'
	| 'history_too_large'
	| 'artifact_too_large'
	| 'request_hash_mismatch'
	| 'history_hash_mismatch'
	| 'content_hash_mismatch'
	| 'byte_count_mismatch'
	| 'invalid_retention'
	| 'admitted_message_in_history';

export type AgenticChatRawWorkflowInputValidationResultV1 =
	| { ok: true; input: AgenticChatRawWorkflowInputV4 }
	| { ok: false; code: AgenticChatRawWorkflowInputValidationCodeV1; detail: string };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const REQUEST_KEYS = [
	'cacheRef',
	'clientTurnId',
	'context',
	'message',
	'policy',
	'policyRef',
	'requestId',
	'reviewIntent',
	'sessionId',
	'streamRunId',
	'turnRunId',
	'userId',
	'userMessageId'
];
const HISTORY_KEYS = [
	'attachments',
	'content',
	'role',
	'sourceMessageId',
	'toolCallId',
	'toolCalls'
];

/**
 * Recomputes every hash and byte count of a stored raw v4 input. The database
 * trigger enforces the same rules at insert; this reader never trusts that it ran.
 */
export async function validateAgenticChatRawWorkflowInputV4(
	input: AgenticChatRawWorkflowInputV4,
	expected: { artifactId: string; turnRunId: string; sessionId: string; userId: string }
): Promise<AgenticChatRawWorkflowInputValidationResultV1> {
	const fail = (
		code: AgenticChatRawWorkflowInputValidationCodeV1,
		detail: string
	): AgenticChatRawWorkflowInputValidationResultV1 => ({ ok: false, code, detail });

	if (
		input.artifactVersion !== AGENTIC_CHAT_INPUT_ARTIFACT_VERSION_V4 ||
		input.requestHashVersion !== AGENTIC_CHAT_WORKFLOW_REQUEST_HASH_VERSION ||
		input.historySource !== 'admission_window'
	) {
		return fail('invalid_version', 'Expected an agentic_chat_input_v4 raw workflow request');
	}
	const request = input.request as unknown;
	if (!isPlainObject(request) || !hasExactKeys(request, REQUEST_KEYS)) {
		return fail('invalid_request', 'Request fields are missing or unexpected');
	}
	const typed = input.request;
	if (
		typed.requestId !== expected.artifactId ||
		typed.turnRunId !== expected.turnRunId ||
		typed.sessionId !== expected.sessionId ||
		typed.userId !== expected.userId ||
		!UUID_PATTERN.test(typed.userMessageId) ||
		!isBoundedText(typed.clientTurnId, 256) ||
		!isBoundedText(typed.streamRunId, 256) ||
		!isPlainObject(typed.context) ||
		!hasExactKeys(typed.context, ['entityId', 'projectId', 'type']) ||
		typed.context.type !== 'project' ||
		!UUID_PATTERN.test(typed.context.projectId) ||
		typed.context.entityId !== typed.context.projectId ||
		!isBoundedText(typed.policyRef, 128) ||
		!(
			typed.cacheRef === null ||
			(isPlainObject(typed.cacheRef) &&
				hasExactKeys(typed.cacheRef, ['generation', 'id']) &&
				UUID_PATTERN.test(typed.cacheRef.id) &&
				typeof typed.cacheRef.generation === 'string' &&
				typed.cacheRef.generation.length >= 1 &&
				typed.cacheRef.generation.length <= 128)
		)
	) {
		return fail('invalid_request', 'Request identity, scope, or cache reference is invalid');
	}
	if (
		typeof typed.message !== 'string' ||
		typed.message !== normalizeAgenticChatText(typed.message) ||
		[...typed.message].length < AGENTIC_CHAT_WORKFLOW_LIMITS.messageMinChars ||
		[...typed.message].length > AGENTIC_CHAT_WORKFLOW_LIMITS.messageMaxChars ||
		utf8ByteLength(typed.message) > AGENTIC_CHAT_WORKFLOW_LIMITS.messageMaxBytes
	) {
		return fail(
			'invalid_message',
			'Admitted review question is not normalized or is out of bounds'
		);
	}
	if (
		canonicalizeAgenticChatJson(typed.policy as unknown as JsonValue) !==
		canonicalizeAgenticChatJson(
			agenticChatWorkflowPolicyForRef(typed.policyRef) as unknown as JsonValue
		)
	) {
		return fail('invalid_policy', 'Request policy is not the server workflow policy');
	}
	if (
		canonicalizeAgenticChatJson(typed.reviewIntent as unknown as JsonValue) !==
		canonicalizeAgenticChatJson(
			buildAgenticChatWorkflowReviewIntentV1(typed.message) as unknown as JsonValue
		)
	) {
		return fail('invalid_review_intent', 'Review intent does not bind the admitted question');
	}
	if (
		!Array.isArray(input.history) ||
		input.history.length > AGENTIC_CHAT_WORKFLOW_LIMITS.historyMaxMessages ||
		input.history.some(
			(message) =>
				!isPlainObject(message) ||
				!hasExactKeys(message, HISTORY_KEYS) ||
				!UUID_PATTERN.test(message.sourceMessageId) ||
				(message.role !== 'user' && message.role !== 'assistant') ||
				typeof message.content !== 'string' ||
				!Array.isArray(message.attachments) ||
				message.attachments.length !== 0 ||
				!Array.isArray(message.toolCalls) ||
				message.toolCalls.length !== 0 ||
				message.toolCallId !== null
		)
	) {
		return fail('invalid_history', 'Frozen history is not text-only user/assistant history');
	}
	if (input.history.some((message) => message.sourceMessageId === typed.userMessageId)) {
		return fail(
			'admitted_message_in_history',
			'The admitted message must not appear in history'
		);
	}

	const expectedHashes = await hashAgenticChatRawWorkflowInputV4(typed, input.history);
	if (expectedHashes.historyBytes > AGENTIC_CHAT_WORKFLOW_LIMITS.historyMaxBytes) {
		return fail('history_too_large', 'Frozen history exceeds its canonical byte bound');
	}
	if (expectedHashes.requestHash !== input.requestHash) {
		return fail('request_hash_mismatch', 'Request hash does not match its semantic fields');
	}
	if (expectedHashes.historyHash !== input.historyHash) {
		return fail('history_hash_mismatch', 'History hash does not match frozen history');
	}
	if (expectedHashes.contentBytes > AGENTIC_CHAT_WORKFLOW_LIMITS.requestArtifactMaxBytes) {
		return fail('artifact_too_large', 'Raw request artifact exceeds its canonical byte bound');
	}
	if (expectedHashes.contentHash !== input.contentHash) {
		return fail('content_hash_mismatch', 'Content hash does not match the canonical artifact');
	}
	if (
		input.historyBytes !== expectedHashes.historyBytes ||
		input.contentBytes !== expectedHashes.contentBytes
	) {
		return fail('byte_count_mismatch', 'Stored canonical byte counts are inconsistent');
	}
	const createdAtMs = Date.parse(input.createdAt);
	const retainUntilMs = Date.parse(input.retainUntil);
	if (
		!Number.isFinite(createdAtMs) ||
		!Number.isFinite(retainUntilMs) ||
		retainUntilMs - createdAtMs < AGENTIC_CHAT_INPUT_RETENTION_MS
	) {
		return fail('invalid_retention', 'Raw request retention must cover at least seven days');
	}
	return { ok: true, input };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value: object, keys: readonly string[]): boolean {
	const actual = Object.keys(value).sort();
	return actual.length === keys.length && actual.every((key, index) => key === keys[index]);
}

function isBoundedText(value: unknown, maximum: number): value is string {
	return (
		typeof value === 'string' &&
		value.length > 0 &&
		value.length <= maximum &&
		value === value.trim()
	);
}

function utf8ByteLength(value: string): number {
	return new TextEncoder().encode(value).byteLength;
}

async function sha256Hex(value: string): Promise<string> {
	const subtle = globalThis.crypto?.subtle;
	if (!subtle) throw new Error('Web Crypto SHA-256 support is required');
	const digest = await subtle.digest('SHA-256', new TextEncoder().encode(value));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
		''
	);
}
