// apps/worker/src/workers/agentic-chat/workflow/workflow-store.ts
import { documentEvidenceHandoffPrompt, verifyDocumentReadResult } from './document-read-tool';
import {
	type ExecutableSpecialistSnapshot,
	documentSnapshotMatchesPolicy,
	isDocumentSpecialistPolicyRef
} from '@buildos/agentic-chat-runtime/specialists';
import { loadSpecialistSnapshotV2 } from './specialist-snapshot-store';
import {
	AGENTIC_CHAT_DOCUMENT_EVIDENCE_POLICY_REF,
	agenticChatWorkflowPlanVersionForRef
} from '@buildos/shared-types';
import type {
	AgenticChatRecoveryFailureClassV1,
	AgenticChatWorkflowContextOutcomeV1,
	AgenticChatWorkflowDispatchBeginOutcomeV1,
	AgenticChatWorkflowDispatchKindV1,
	AgenticChatWorkflowDispatchReserveOutcomeV1,
	AgenticChatWorkflowDispatchSettleOutcomeV1,
	AgenticChatWorkflowDispatchStateV1,
	AgenticChatWorkflowEvidenceVersionV1,
	AgenticChatWorkflowFencedOutcomeV1,
	AgenticChatWorkflowPhaseV1,
	AgenticChatWorkflowPlanOutcomeV1,
	AgenticChatWorkflowPricingSnapshotV1,
	AgenticChatWorkflowRecoveryOutcomeV1,
	AgenticChatWorkflowResultQualityV1,
	AgenticChatWorkflowStepClaimOutcomeV1,
	AgenticChatWorkflowStepFailureOutcomeV1,
	AgenticChatWorkflowStepKeyV1,
	AgenticChatWorkflowStepResultOutcomeV1,
	AgenticChatWorkflowStepStatusV1,
	AgenticChatWorkflowSynthesisOutcomeV1,
	AgenticChatWorkflowTerminalOutcomeV1,
	AgenticChatWorkflowTextBatchOutcomeV1,
	JsonObject
} from '@buildos/shared-types';

/**
 * Tasker 87 store port over Tasker 85's frozen workflow RPCs
 * (migrations 20260914203007/20260914203008). Every mutating method is one short,
 * fenced database transaction; no provider call or context read happens inside one.
 * Expected domain outcomes are returned as values. Transport failures throw, and the
 * runner re-reads durable state before deciding what an unanswered call did.
 */
export type AgenticChatWorkflowFenceV1 = {
	turnRunId: string;
	queueJobId: string;
	processingToken: string;
	executionGeneration: number;
};

/** One committed workflow checkpoint also commits exactly one `workflow_progress` event. */
export type AgenticChatWorkflowCheckpointV1 = {
	transitionId: string;
	projection: JsonObject;
	eventPayload: JsonObject;
};

export type AgenticChatWorkflowStepRowV1 = {
	inputEvidence?: JsonObject;
	key: AgenticChatWorkflowStepKeyV1;
	status: AgenticChatWorkflowStepStatusV1;
	attemptsUsed: number;
	attemptIds: string[];
	currentAttemptId: string | null;
	currentAttemptGeneration: number | null;
	assignment: JsonObject;
	quality: AgenticChatWorkflowResultQualityV1 | null;
	result: JsonObject | null;
	resultHash: string | null;
	acceptedAttemptId: string | null;
	failureCode: string | null;
};

export type AgenticChatWorkflowDispatchRowV1 = {
	dispatchId: string;
	stepKey: AgenticChatWorkflowStepKeyV1;
	stepAttemptId: string;
	physicalAttempt: number;
	kind: AgenticChatWorkflowDispatchKindV1;
	state: AgenticChatWorkflowDispatchStateV1;
	reservedMicroUsd: number;
	actualMicroUsd: number | null;
	reservedGeneration: number;
};

/** Durable workflow truth, read with the service role; the only input the runner trusts. */
export type AgenticChatWorkflowRunStateV1 = {
	policyRef?: string;
	specialistSnapshot?: ExecutableSpecialistSnapshot;
	documentReadResult?: JsonObject;
	turnRunId: string;
	sessionId: string;
	userId: string;
	projectId: string;
	requestArtifactId: string;
	requestHash: string;
	phase: AgenticChatWorkflowPhaseV1;
	terminalOutcome: AgenticChatWorkflowTerminalOutcomeV1 | null;
	limits: {
		maxSpendMicroUsd: number;
		synthesisHeadroomMicroUsd: number;
		maxPhysicalDispatches: number;
		maxStepAttempts: number;
		wholeRunLifetimeMs: number;
	};
	deadlineAt: string | null;
	recoveryCount: number;
	context: {
		contextId: string;
		contextHash: string;
		evidenceVersions: AgenticChatWorkflowEvidenceVersionV1[];
		payload: JsonObject;
		acceptedGeneration: number;
	} | null;
	plan: { planHash: string; plan: JsonObject } | null;
	answer: {
		answerId: string | null;
		editorStepAttemptId: string | null;
		text: string;
		textSha256: string | null;
		status: 'not_started' | 'streaming' | 'accepted';
		quality: AgenticChatWorkflowResultQualityV1 | null;
		acceptedAt: string | null;
	};
	steps: Partial<Record<AgenticChatWorkflowStepKeyV1, AgenticChatWorkflowStepRowV1>>;
	dispatches: AgenticChatWorkflowDispatchRowV1[];
};

type FencedOutcome = AgenticChatWorkflowFencedOutcomeV1;
export type AgenticChatWorkflowEventReceiptV1 = JsonObject | null;

export type AgenticChatWorkflowResumeReceiptV1 = {
	outcome: 'resumed' | FencedOutcome;
	event: AgenticChatWorkflowEventReceiptV1;
};
export type AgenticChatWorkflowContextReceiptV1 = {
	outcome: AgenticChatWorkflowContextOutcomeV1;
	event: AgenticChatWorkflowEventReceiptV1;
};
export type AgenticChatWorkflowPlanReceiptV1 = {
	outcome: AgenticChatWorkflowPlanOutcomeV1;
	event: AgenticChatWorkflowEventReceiptV1;
};
export type AgenticChatWorkflowClaimReceiptV1 = {
	inputEvidence?: JsonObject;
	outcome: AgenticChatWorkflowStepClaimOutcomeV1;
	stepAttemptId: string | null;
	attemptNumber: number | null;
	assignment: JsonObject | null;
	deadlineAt: string | null;
	replayed: boolean;
};
export type AgenticChatWorkflowStepResultReceiptV1 = {
	outcome: AgenticChatWorkflowStepResultOutcomeV1;
	event: AgenticChatWorkflowEventReceiptV1;
};
export type AgenticChatWorkflowStepFailureReceiptV1 = {
	outcome: AgenticChatWorkflowStepFailureOutcomeV1;
	editorSkipped: boolean;
	event: AgenticChatWorkflowEventReceiptV1;
};
export type AgenticChatWorkflowReserveReceiptV1 = {
	outcome: AgenticChatWorkflowDispatchReserveOutcomeV1;
	settlementToken: string | null;
	reservedMicroUsd: number | null;
	exposureMicroUsd: number | null;
};
export type AgenticChatWorkflowBeginReceiptV1 = {
	outcome: AgenticChatWorkflowDispatchBeginOutcomeV1;
	dispatchPermitted: boolean;
};
export type AgenticChatWorkflowSettleReceiptV1 = {
	outcome: AgenticChatWorkflowDispatchSettleOutcomeV1;
	state: AgenticChatWorkflowDispatchStateV1 | null;
	actualMicroUsd: number | null;
	exposureMicroUsd: number | null;
};
export type AgenticChatWorkflowTextBatchReceiptV1 = {
	outcome: AgenticChatWorkflowTextBatchOutcomeV1;
	durableBytes: number | null;
	event: AgenticChatWorkflowEventReceiptV1;
};
export type AgenticChatWorkflowSynthesisReceiptV1 = {
	outcome: AgenticChatWorkflowSynthesisOutcomeV1;
	event: AgenticChatWorkflowEventReceiptV1;
};
export type AgenticChatWorkflowRecoveryReceiptV1 = {
	outcome: AgenticChatWorkflowRecoveryOutcomeV1;
	executionMayRetry: boolean;
	reason: string | null;
	uncertainCostHeld: boolean;
	raw: JsonObject;
};

export type AgenticChatWorkflowStorePortV1 = {
	readDocuments?(
		fence: AgenticChatWorkflowFenceV1,
		stepAttemptId: string,
		documentIds: string[]
	): Promise<{ outcome: string; result?: JsonObject }>;

	/** Service-role read of durable truth; null when the turn has no workflow row. */
	loadRun(turnRunId: string): Promise<AgenticChatWorkflowRunStateV1 | null>;
	/** First fenced write of every generation: republish truth and reseed answer text. */
	resume(
		fence: AgenticChatWorkflowFenceV1,
		checkpoint: AgenticChatWorkflowCheckpointV1
	): Promise<AgenticChatWorkflowResumeReceiptV1>;
	/** Context preparation (Tasker 86's boundary); exposed here for fixtures and wiring. */
	acceptContext(
		fence: AgenticChatWorkflowFenceV1,
		input: {
			contextId: string;
			requestArtifactId: string;
			requestHash: string;
			preparationVersion: string;
			contextIdentity: JsonObject;
			evidenceVersions: AgenticChatWorkflowEvidenceVersionV1[];
			payload: JsonObject;
			contextHash: string;
			contextBytes: number;
		} & AgenticChatWorkflowCheckpointV1
	): Promise<AgenticChatWorkflowContextReceiptV1>;
	installPlan(
		fence: AgenticChatWorkflowFenceV1,
		input: {
			contextId: string;
			plan: JsonObject;
			planHash: string;
		} & AgenticChatWorkflowCheckpointV1
	): Promise<AgenticChatWorkflowPlanReceiptV1>;
	claimStep(
		fence: AgenticChatWorkflowFenceV1,
		input: {
			planHash: string | null;
			stepKey: AgenticChatWorkflowStepKeyV1;
			stepAttemptId: string;
		}
	): Promise<AgenticChatWorkflowClaimReceiptV1>;
	acceptStepResult(
		fence: AgenticChatWorkflowFenceV1,
		input: {
			planHash: string | null;
			stepKey: Exclude<AgenticChatWorkflowStepKeyV1, 'editor'>;
			stepAttemptId: string;
			quality: AgenticChatWorkflowResultQualityV1;
			result: JsonObject;
			resultHash: string;
			resultBytes: number;
		} & AgenticChatWorkflowCheckpointV1
	): Promise<AgenticChatWorkflowStepResultReceiptV1>;
	failStepAttempt(
		fence: AgenticChatWorkflowFenceV1,
		input: {
			planHash: string | null;
			stepKey: AgenticChatWorkflowStepKeyV1;
			stepAttemptId: string;
			failureCode: string;
			retryable: boolean;
		} & AgenticChatWorkflowCheckpointV1
	): Promise<AgenticChatWorkflowStepFailureReceiptV1>;
	reserveDispatch(
		fence: AgenticChatWorkflowFenceV1,
		input: {
			dispatchId: string;
			stepKey: AgenticChatWorkflowStepKeyV1;
			stepAttemptId: string;
			physicalAttempt: number;
			kind: AgenticChatWorkflowDispatchKindV1;
			modelRequested: string;
			pricing: AgenticChatWorkflowPricingSnapshotV1;
			serializedRequestBytes: number;
			maxOutputTokens: number;
		}
	): Promise<AgenticChatWorkflowReserveReceiptV1>;
	beginDispatch(
		fence: AgenticChatWorkflowFenceV1,
		input: { dispatchId: string }
	): Promise<AgenticChatWorkflowBeginReceiptV1>;
	/** Token-authorized, never fenced: records incurred cost and never grants work. */
	settleDispatch(input: {
		dispatchId: string;
		settlementToken: string;
		providerRequestId: string | null;
		providerUsage: JsonObject | null;
		actualMicroUsd: number | null;
		outcome: 'settled' | 'uncertain' | 'released';
	}): Promise<AgenticChatWorkflowSettleReceiptV1>;
	persistTextBatch(
		fence: AgenticChatWorkflowFenceV1,
		input: {
			answerId: string;
			editorStepAttemptId: string;
			batchId: string;
			startByte: number;
			textDelta: string;
			assistantText: string;
			deltaSha256: string;
			completeTextSha256: string;
		}
	): Promise<AgenticChatWorkflowTextBatchReceiptV1>;
	acceptSynthesis(
		fence: AgenticChatWorkflowFenceV1,
		input: {
			answerId: string;
			editorStepAttemptId: string;
			textBytes: number;
			textSha256: string;
			quality: AgenticChatWorkflowResultQualityV1;
		} & AgenticChatWorkflowCheckpointV1
	): Promise<AgenticChatWorkflowSynthesisReceiptV1>;
	/** Workflow-only atomic recovery; ordinary `recover_agentic_chat_turn` is untouched. */
	recoverTurn(
		fence: AgenticChatWorkflowFenceV1,
		input: { failureClass: AgenticChatRecoveryFailureClassV1; errorMessage: string | null }
	): Promise<AgenticChatWorkflowRecoveryReceiptV1>;
};

export class AgenticChatWorkflowStoreError extends Error {
	constructor(
		readonly operation: string,
		readonly code: string,
		message: string
	) {
		super(`${operation} failed${code ? ` (${code})` : ''}: ${message}`);
		this.name = 'AgenticChatWorkflowStoreError';
	}
}

export class AgenticChatWorkflowStoreProtocolError extends Error {
	constructor(message: string) {
		super(`Invalid Agentic Chat workflow receipt: ${message}`);
		this.name = 'AgenticChatWorkflowStoreProtocolError';
	}
}

type StoreError = { code?: string; message: string };
type StoreResponse = PromiseLike<{ data: unknown; error: StoreError | null }>;
export type AgenticChatWorkflowStoreReadQuery = StoreResponse & {
	eq(column: string, value: unknown): AgenticChatWorkflowStoreReadQuery;
	maybeSingle(): StoreResponse;
};
export type AgenticChatWorkflowStoreClient = {
	rpc(name: string, args: Record<string, unknown>): StoreResponse;
	from(table: string): { select(columns: string): AgenticChatWorkflowStoreReadQuery };
};

const RUN_COLUMNS = [
	'policy_ref',
	'turn_run_id',
	'session_id',
	'user_id',
	'project_id',
	'request_artifact_id',
	'request_hash',
	'phase',
	'terminal_outcome',
	'max_spend_micro_usd',
	'synthesis_headroom_micro_usd',
	'max_physical_dispatches',
	'max_step_attempts',
	'whole_run_lifetime_ms',
	'deadline_at',
	'recovery_count',
	'context_id',
	'context_hash',
	'evidence_versions',
	'context_payload',
	'context_accepted_generation',
	'plan',
	'plan_hash',
	'answer_id',
	'answer_editor_step_attempt_id',
	'answer_text',
	'answer_text_sha256',
	'synthesis_status',
	'synthesis_quality',
	'synthesis_accepted_at'
].join(',');
const STEP_COLUMNS = [
	'step_key',
	'plan_version',
	'status',
	'attempts_used',
	'attempt_ids',
	'current_attempt_id',
	'current_attempt_generation',
	'assignment',
	'quality',
	'result',
	'result_hash',
	'accepted_attempt_id',
	'failure_code'
].join(',');
const DISPATCH_COLUMNS = [
	'dispatch_id',
	'step_key',
	'step_attempt_id',
	'physical_attempt',
	'dispatch_kind',
	'state',
	'reserved_micro_usd',
	'actual_micro_usd',
	'reserved_generation'
].join(',');

const FENCED: readonly string[] = [
	'stale_generation',
	'ownership_lost',
	'cancel_requested',
	'already_terminal'
];

/** Service-role adapter over the frozen RPCs. Tables are private; reads are service-only. */
export class SupabaseAgenticChatWorkflowStore implements AgenticChatWorkflowStorePortV1 {
	private readonly snapshots = new Map<string, ExecutableSpecialistSnapshot>();
	private readonly documentReads = new Map<string, JsonObject>();
	constructor(private readonly client: AgenticChatWorkflowStoreClient) {}

	async loadRun(turnRunId: string): Promise<AgenticChatWorkflowRunStateV1 | null> {
		const runResponse = await this.client
			.from('chat_turn_workflow_runs')
			.select(RUN_COLUMNS)
			.eq('turn_run_id', turnRunId)
			.maybeSingle();
		if (runResponse.error) throw storeError('load_run', runResponse.error);
		if (runResponse.data === null || runResponse.data === undefined) return null;
		const [stepResponse, dispatchResponse] = await Promise.all([
			this.client
				.from('chat_turn_workflow_steps')
				.select(
					STEP_COLUMNS +
						((runResponse.data as Record<string, unknown>).policy_ref ===
						AGENTIC_CHAT_DOCUMENT_EVIDENCE_POLICY_REF
							? ',input_evidence'
							: '')
				)
				.eq('turn_run_id', turnRunId),
			this.client
				.from('chat_turn_workflow_dispatches')
				.select(DISPATCH_COLUMNS)
				.eq('turn_run_id', turnRunId)
		]);
		if (stepResponse.error) throw storeError('load_steps', stepResponse.error);
		if (dispatchResponse.error) throw storeError('load_dispatches', dispatchResponse.error);
		const state = parseRunState(runResponse.data, stepResponse.data, dispatchResponse.data);
		const policyRef = (runResponse.data as Record<string, unknown>).policy_ref;
		if (isDocumentSpecialistPolicyRef(policyRef)) {
			let snapshot = this.snapshots.get(turnRunId);
			if (!snapshot) {
				snapshot = await loadSpecialistSnapshotV2(this.client, state);
				if (this.snapshots.size >= 128) this.snapshots.clear();
				this.snapshots.set(turnRunId, snapshot);
			}
			if (!documentSnapshotMatchesPolicy(snapshot, String(policyRef)))
				throw new AgenticChatWorkflowStoreProtocolError('Specialist policy mismatch');
			state.specialistSnapshot = structuredClone(snapshot);
			if (snapshot.profileVersion >= 2) {
				let result = this.documentReads.get(turnRunId);
				if (!result) {
					const response = await this.client
						.from('chat_turn_document_read_batches')
						.select('request_hash,result,result_hash')
						.eq('turn_run_id', turnRunId)
						.maybeSingle();
					if (response.error) throw storeError('load_document_reads', response.error);
					if (response.data) {
						const row = response.data as Record<string, unknown>;
						if (row.request_hash !== state.requestHash)
							throw new AgenticChatWorkflowStoreProtocolError(
								'Document-read binding mismatch'
							);
						result = verifyDocumentReadResult(row.result, row.result_hash);
						if (this.documentReads.size >= 128) this.documentReads.clear();
						this.documentReads.set(turnRunId, result);
					}
				}
				if (result) state.documentReadResult = structuredClone(result);
			}
		} else if (
			typeof policyRef === 'string' &&
			policyRef.startsWith('internal-document-organization:')
		) {
			throw new AgenticChatWorkflowStoreProtocolError('Unsupported specialist profile');
		}
		if (
			state.specialistSnapshot?.profileVersion === 3 &&
			state.steps.risk_reviewer?.inputEvidence
		) {
			documentEvidenceHandoffPrompt({
				binding: state.steps.risk_reviewer.inputEvidence,
				context: state.context,
				result: state.documentReadResult,
				organizerStatus: state.steps.project_analyst?.status
			});
		}
		return state;
	}

	async readDocuments(
		fence: AgenticChatWorkflowFenceV1,
		stepAttemptId: string,
		documentIds: string[]
	) {
		const receipt = await this.call('read_agentic_chat_documents_v1', {
			...fenceArgs(fence),
			p_step_attempt_id: stepAttemptId,
			p_document_ids: documentIds
		});
		if (typeof receipt.outcome !== 'string')
			throw new AgenticChatWorkflowStoreProtocolError('Document read outcome missing');
		return {
			outcome: receipt.outcome,
			...(['read', 'replayed'].includes(receipt.outcome)
				? { result: verifyDocumentReadResult(receipt.result, receipt.result_hash) }
				: {})
		};
	}

	async resume(fence: AgenticChatWorkflowFenceV1, checkpoint: AgenticChatWorkflowCheckpointV1) {
		const receipt = await this.call('resume_agentic_chat_workflow_projection_v1', {
			...fenceArgs(fence),
			...checkpointArgs(checkpoint)
		});
		return {
			outcome: outcome(receipt, ['resumed']) as AgenticChatWorkflowResumeReceiptV1['outcome'],
			event: eventOf(receipt)
		};
	}

	async acceptContext(
		fence: AgenticChatWorkflowFenceV1,
		input: Parameters<AgenticChatWorkflowStorePortV1['acceptContext']>[1]
	) {
		const receipt = await this.call('accept_agentic_chat_workflow_context_v1', {
			...fenceArgs(fence),
			p_context_id: input.contextId,
			p_request_artifact_id: input.requestArtifactId,
			p_request_hash: input.requestHash,
			p_preparation_version: input.preparationVersion,
			p_context_identity: input.contextIdentity,
			p_evidence_versions: input.evidenceVersions,
			p_context_payload: input.payload,
			p_context_hash: input.contextHash,
			p_context_bytes: input.contextBytes,
			...checkpointArgs(input)
		});
		return {
			outcome: outcome(receipt, [
				'accepted',
				'already_accepted',
				'context_conflict',
				'deadline_expired',
				'access_revoked'
			]) as AgenticChatWorkflowContextOutcomeV1,
			event: eventOf(receipt)
		};
	}

	async installPlan(
		fence: AgenticChatWorkflowFenceV1,
		input: Parameters<AgenticChatWorkflowStorePortV1['installPlan']>[1]
	) {
		const receipt = await this.call('install_agentic_chat_workflow_plan_v1', {
			...fenceArgs(fence),
			p_context_id: input.contextId,
			p_plan_version: input.plan.version,
			p_plan: input.plan,
			p_plan_hash: input.planHash,
			...checkpointArgs(input)
		});
		return {
			outcome: outcome(receipt, [
				'installed',
				'already_installed',
				'plan_conflict',
				'context_required',
				'not_ready',
				'deadline_expired'
			]) as AgenticChatWorkflowPlanOutcomeV1,
			event: eventOf(receipt)
		};
	}

	async claimStep(
		fence: AgenticChatWorkflowFenceV1,
		input: Parameters<AgenticChatWorkflowStorePortV1['claimStep']>[1]
	): Promise<AgenticChatWorkflowClaimReceiptV1> {
		const receipt = await this.call('claim_agentic_chat_workflow_step_v1', {
			...fenceArgs(fence),
			p_plan_hash: input.planHash,
			p_step_key: input.stepKey,
			p_step_attempt_id: input.stepAttemptId
		});
		return {
			outcome: outcome(receipt, [
				'claimed',
				'claim_conflict',
				'already_accepted',
				'not_ready',
				'plan_conflict',
				'dependency_failed',
				'attempts_exhausted',
				'budget_exhausted',
				'deadline_expired',
				'access_revoked'
			]) as AgenticChatWorkflowStepClaimOutcomeV1,
			...(isObject(receipt.input_evidence)
				? { inputEvidence: receipt.input_evidence as JsonObject }
				: {}),
			stepAttemptId: nullableString(receipt.step_attempt_id),
			attemptNumber: nullableInteger(receipt.attempt_number),
			assignment: isObject(receipt.assignment) ? (receipt.assignment as JsonObject) : null,
			deadlineAt: nullableString(receipt.deadline_at),
			replayed: receipt.replayed === true
		};
	}

	async acceptStepResult(
		fence: AgenticChatWorkflowFenceV1,
		input: Parameters<AgenticChatWorkflowStorePortV1['acceptStepResult']>[1]
	) {
		const receipt = await this.call('accept_agentic_chat_workflow_step_result_v1', {
			...fenceArgs(fence),
			p_plan_hash: input.planHash,
			p_step_key: input.stepKey,
			p_step_attempt_id: input.stepAttemptId,
			p_quality: input.quality,
			p_result: input.result,
			p_result_hash: input.resultHash,
			p_result_bytes: input.resultBytes,
			...checkpointArgs(input)
		});
		return {
			outcome: outcome(receipt, [
				'accepted',
				'already_accepted',
				'result_conflict',
				'stale_claim'
			]) as AgenticChatWorkflowStepResultOutcomeV1,
			event: eventOf(receipt)
		};
	}

	async failStepAttempt(
		fence: AgenticChatWorkflowFenceV1,
		input: Parameters<AgenticChatWorkflowStorePortV1['failStepAttempt']>[1]
	) {
		const receipt = await this.call('fail_agentic_chat_workflow_step_attempt_v1', {
			...fenceArgs(fence),
			p_plan_hash: input.planHash,
			p_step_key: input.stepKey,
			p_step_attempt_id: input.stepAttemptId,
			p_failure_code: input.failureCode,
			p_retryable: input.retryable,
			...checkpointArgs(input)
		});
		return {
			outcome: outcome(receipt, [
				'retry_scheduled',
				'failed',
				'skipped',
				'already_accepted',
				'stale_claim'
			]) as AgenticChatWorkflowStepFailureOutcomeV1,
			editorSkipped: receipt.editor_skipped === true,
			event: eventOf(receipt)
		};
	}

	async reserveDispatch(
		fence: AgenticChatWorkflowFenceV1,
		input: Parameters<AgenticChatWorkflowStorePortV1['reserveDispatch']>[1]
	): Promise<AgenticChatWorkflowReserveReceiptV1> {
		const receipt = await this.call('reserve_agentic_chat_workflow_dispatch_v1', {
			...fenceArgs(fence),
			p_dispatch_id: input.dispatchId,
			p_step_key: input.stepKey,
			p_step_attempt_id: input.stepAttemptId,
			p_physical_attempt: input.physicalAttempt,
			p_dispatch_kind: input.kind,
			p_model_requested: input.modelRequested,
			p_pricing_snapshot: input.pricing,
			p_serialized_request_bytes: input.serializedRequestBytes,
			p_max_output_tokens: input.maxOutputTokens
		});
		return {
			outcome: outcome(receipt, [
				'reserved',
				'already_reserved',
				'reservation_conflict',
				'pricing_unavailable',
				'stale_claim',
				'dispatch_limit',
				'budget_exhausted',
				'synthesis_headroom_required',
				'deadline_expired',
				'access_revoked'
			]) as AgenticChatWorkflowDispatchReserveOutcomeV1,
			settlementToken: nullableString(receipt.settlement_token),
			reservedMicroUsd: nullableInteger(receipt.reserved_micro_usd),
			exposureMicroUsd: nullableInteger(receipt.exposure_micro_usd)
		};
	}

	async beginDispatch(fence: AgenticChatWorkflowFenceV1, input: { dispatchId: string }) {
		const receipt = await this.call('begin_agentic_chat_workflow_dispatch_v1', {
			...fenceArgs(fence),
			p_dispatch_id: input.dispatchId
		});
		const result = {
			outcome: outcome(receipt, [
				'dispatching',
				'already_started',
				'reservation_required',
				'stale_claim',
				'deadline_expired',
				'access_revoked'
			]) as AgenticChatWorkflowDispatchBeginOutcomeV1,
			dispatchPermitted: receipt.dispatch_permitted === true
		};
		if (result.dispatchPermitted !== (result.outcome === 'dispatching')) {
			throw new AgenticChatWorkflowStoreProtocolError('dispatch permit is inconsistent');
		}
		return result;
	}

	async settleDispatch(
		input: Parameters<AgenticChatWorkflowStorePortV1['settleDispatch']>[0]
	): Promise<AgenticChatWorkflowSettleReceiptV1> {
		const receipt = await this.call('settle_agentic_chat_workflow_dispatch_v1', {
			p_dispatch_id: input.dispatchId,
			p_settlement_token: input.settlementToken,
			p_provider_request_id: input.providerRequestId,
			p_provider_usage: input.providerUsage,
			p_actual_micro_usd: input.actualMicroUsd,
			p_outcome: input.outcome
		});
		const settled = outcome(
			receipt,
			['settled', 'uncertain', 'already_settled', 'settlement_conflict', 'unknown_dispatch'],
			[]
		) as AgenticChatWorkflowDispatchSettleOutcomeV1;
		return {
			outcome: settled,
			state:
				(nullableString(receipt.state) as AgenticChatWorkflowDispatchStateV1 | null) ??
				null,
			actualMicroUsd: nullableInteger(receipt.actual_micro_usd),
			exposureMicroUsd: nullableInteger(receipt.exposure_micro_usd)
		};
	}

	async persistTextBatch(
		fence: AgenticChatWorkflowFenceV1,
		input: Parameters<AgenticChatWorkflowStorePortV1['persistTextBatch']>[1]
	): Promise<AgenticChatWorkflowTextBatchReceiptV1> {
		const receipt = await this.call('persist_agentic_chat_workflow_text_batch_v1', {
			...fenceArgs(fence),
			p_answer_id: input.answerId,
			p_editor_step_attempt_id: input.editorStepAttemptId,
			p_batch_id: input.batchId,
			p_start_byte: input.startByte,
			p_text_delta: input.textDelta,
			p_assistant_text: input.assistantText,
			p_delta_sha256: input.deltaSha256,
			p_complete_text_sha256: input.completeTextSha256
		});
		return {
			outcome: outcome(receipt, [
				'persisted',
				'already_persisted',
				'answer_conflict',
				'offset_conflict',
				'stream_reseed_required',
				'stale_claim'
			]) as AgenticChatWorkflowTextBatchOutcomeV1,
			durableBytes: nullableInteger(receipt.durable_bytes),
			// The text writer's receipt is itself the durable event receipt.
			event: receipt as JsonObject
		};
	}

	async acceptSynthesis(
		fence: AgenticChatWorkflowFenceV1,
		input: Parameters<AgenticChatWorkflowStorePortV1['acceptSynthesis']>[1]
	) {
		const receipt = await this.call('accept_agentic_chat_workflow_synthesis_v1', {
			...fenceArgs(fence),
			p_answer_id: input.answerId,
			p_editor_step_attempt_id: input.editorStepAttemptId,
			p_text_bytes: input.textBytes,
			p_text_sha256: input.textSha256,
			p_quality: input.quality,
			...checkpointArgs(input)
		});
		return {
			outcome: outcome(receipt, [
				'accepted',
				'already_accepted',
				'answer_conflict',
				'stale_claim'
			]) as AgenticChatWorkflowSynthesisOutcomeV1,
			event: eventOf(receipt)
		};
	}

	async recoverTurn(
		fence: AgenticChatWorkflowFenceV1,
		input: { failureClass: AgenticChatRecoveryFailureClassV1; errorMessage: string | null }
	): Promise<AgenticChatWorkflowRecoveryReceiptV1> {
		const receipt = await this.call('recover_agentic_chat_workflow_turn_v1', {
			...fenceArgs(fence),
			p_failure_class: input.failureClass,
			p_error_message: input.errorMessage
		});
		return parseAgenticChatWorkflowRecoveryReceiptV1(receipt);
	}

	private async call(
		name: string,
		args: Record<string, unknown>
	): Promise<Record<string, unknown>> {
		const { data, error } = await this.client.rpc(name, args);
		if (error) throw storeError(name, error);
		if (!isObject(data))
			throw new AgenticChatWorkflowStoreProtocolError(`${name} returned no receipt`);
		return data as Record<string, unknown>;
	}
}

export function parseAgenticChatWorkflowRecoveryReceiptV1(
	value: unknown
): AgenticChatWorkflowRecoveryReceiptV1 {
	if (!isObject(value))
		throw new AgenticChatWorkflowStoreProtocolError('recovery receipt is missing');
	const receipt = value as Record<string, unknown>;
	const recovered = outcome(
		receipt,
		[
			'retry_scheduled',
			'already_requeued',
			'terminal_reconciled',
			'stale_generation',
			'ownership_lost',
			'cancel_requested',
			'policy_denied',
			'deadline_expired',
			'finalize_failed',
			'access_revoked',
			'attempts_exhausted',
			'budget_exhausted'
		],
		[]
	) as AgenticChatWorkflowRecoveryOutcomeV1;
	if (typeof receipt.execution_may_retry !== 'boolean') {
		throw new AgenticChatWorkflowStoreProtocolError('recovery retry authority is missing');
	}
	if ((recovered === 'retry_scheduled') !== receipt.execution_may_retry) {
		throw new AgenticChatWorkflowStoreProtocolError('recovery retry authority is inconsistent');
	}
	return {
		outcome: recovered,
		executionMayRetry: receipt.execution_may_retry,
		reason: nullableString(receipt.reason) ?? nullableString(receipt.failure_code),
		uncertainCostHeld: receipt.uncertain_cost_held === true,
		raw: receipt as JsonObject
	};
}

function parseRunState(
	runValue: unknown,
	stepValues: unknown,
	dispatchValues: unknown
): AgenticChatWorkflowRunStateV1 {
	const run = requireObject(runValue, 'workflow run');
	if (!Array.isArray(stepValues) || !Array.isArray(dispatchValues)) {
		throw new AgenticChatWorkflowStoreProtocolError(
			'workflow step or dispatch rows are invalid'
		);
	}
	const steps: AgenticChatWorkflowRunStateV1['steps'] = {};
	for (const value of stepValues) {
		const row = requireObject(value, 'workflow step');
		if (row.plan_version !== agenticChatWorkflowPlanVersionForRef(String(run.policy_ref)))
			continue;
		const key = row.step_key as AgenticChatWorkflowStepKeyV1;
		steps[key] = {
			...(isObject(row.input_evidence)
				? { inputEvidence: row.input_evidence as JsonObject }
				: {}),
			key,
			status: row.status as AgenticChatWorkflowStepStatusV1,
			attemptsUsed: integer(row.attempts_used, 'attempts_used'),
			attemptIds: Array.isArray(row.attempt_ids) ? (row.attempt_ids as string[]) : [],
			currentAttemptId: nullableString(row.current_attempt_id),
			currentAttemptGeneration: nullableInteger(row.current_attempt_generation),
			assignment: isObject(row.assignment) ? (row.assignment as JsonObject) : {},
			quality:
				(nullableString(row.quality) as AgenticChatWorkflowResultQualityV1 | null) ?? null,
			result: isObject(row.result) ? (row.result as JsonObject) : null,
			resultHash: nullableString(row.result_hash),
			acceptedAttemptId: nullableString(row.accepted_attempt_id),
			failureCode: nullableString(row.failure_code)
		};
	}
	const dispatches = dispatchValues.map((value) => {
		const row = requireObject(value, 'workflow dispatch');
		return {
			dispatchId: String(row.dispatch_id),
			stepKey: row.step_key as AgenticChatWorkflowStepKeyV1,
			stepAttemptId: String(row.step_attempt_id),
			physicalAttempt: integer(row.physical_attempt, 'physical_attempt'),
			kind: row.dispatch_kind as AgenticChatWorkflowDispatchKindV1,
			state: row.state as AgenticChatWorkflowDispatchStateV1,
			reservedMicroUsd: integer(row.reserved_micro_usd, 'reserved_micro_usd'),
			actualMicroUsd: nullableInteger(row.actual_micro_usd),
			reservedGeneration: integer(row.reserved_generation, 'reserved_generation')
		};
	});
	const contextId = nullableString(run.context_id);
	const planHash = nullableString(run.plan_hash);
	return {
		policyRef: String(run.policy_ref),
		turnRunId: String(run.turn_run_id),
		sessionId: String(run.session_id),
		userId: String(run.user_id),
		projectId: String(run.project_id),
		requestArtifactId: String(run.request_artifact_id),
		requestHash: String(run.request_hash),
		phase: run.phase as AgenticChatWorkflowPhaseV1,
		terminalOutcome:
			(nullableString(run.terminal_outcome) as AgenticChatWorkflowTerminalOutcomeV1 | null) ??
			null,
		limits: {
			maxSpendMicroUsd: integer(run.max_spend_micro_usd, 'max_spend_micro_usd'),
			synthesisHeadroomMicroUsd: integer(
				run.synthesis_headroom_micro_usd,
				'synthesis_headroom_micro_usd'
			),
			maxPhysicalDispatches: integer(run.max_physical_dispatches, 'max_physical_dispatches'),
			maxStepAttempts: integer(run.max_step_attempts, 'max_step_attempts'),
			wholeRunLifetimeMs: integer(run.whole_run_lifetime_ms, 'whole_run_lifetime_ms')
		},
		deadlineAt: nullableString(run.deadline_at),
		recoveryCount: integer(run.recovery_count, 'recovery_count'),
		context: contextId
			? {
					contextId,
					contextHash: String(run.context_hash),
					evidenceVersions: Array.isArray(run.evidence_versions)
						? (run.evidence_versions as AgenticChatWorkflowEvidenceVersionV1[])
						: [],
					payload: isObject(run.context_payload)
						? (run.context_payload as JsonObject)
						: {},
					acceptedGeneration: integer(
						run.context_accepted_generation,
						'context_accepted_generation'
					)
				}
			: null,
		plan: planHash && isObject(run.plan) ? { planHash, plan: run.plan as JsonObject } : null,
		answer: {
			answerId: nullableString(run.answer_id),
			editorStepAttemptId: nullableString(run.answer_editor_step_attempt_id),
			text: typeof run.answer_text === 'string' ? run.answer_text : '',
			textSha256: nullableString(run.answer_text_sha256),
			status: (nullableString(run.synthesis_status) ??
				'not_started') as AgenticChatWorkflowRunStateV1['answer']['status'],
			quality:
				(nullableString(
					run.synthesis_quality
				) as AgenticChatWorkflowResultQualityV1 | null) ?? null,
			acceptedAt: nullableString(run.synthesis_accepted_at)
		},
		steps,
		dispatches
	};
}

function fenceArgs(fence: AgenticChatWorkflowFenceV1) {
	return {
		p_turn_run_id: fence.turnRunId,
		p_queue_job_id: fence.queueJobId,
		p_processing_token: fence.processingToken,
		p_execution_generation: fence.executionGeneration
	};
}

function checkpointArgs(checkpoint: AgenticChatWorkflowCheckpointV1) {
	return {
		p_transition_id: checkpoint.transitionId,
		p_projection: checkpoint.projection,
		p_event_payload: checkpoint.eventPayload
	};
}

function outcome(
	receipt: Record<string, unknown>,
	allowed: readonly string[],
	fenced: readonly string[] = FENCED
): string {
	const value = receipt.outcome;
	if (typeof value !== 'string' || (!allowed.includes(value) && !fenced.includes(value))) {
		throw new AgenticChatWorkflowStoreProtocolError(`unexpected outcome ${String(value)}`);
	}
	return value;
}

function eventOf(receipt: Record<string, unknown>): AgenticChatWorkflowEventReceiptV1 {
	return isObject(receipt.event) ? (receipt.event as JsonObject) : null;
}

function storeError(operation: string, error: StoreError): AgenticChatWorkflowStoreError {
	return new AgenticChatWorkflowStoreError(operation, error.code ?? '', error.message);
}

function isObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
	if (!isObject(value))
		throw new AgenticChatWorkflowStoreProtocolError(`${label} is not an object`);
	return value;
}

function nullableString(value: unknown): string | null {
	return typeof value === 'string' && value.length > 0 ? value : null;
}

/** PostgREST returns bigint as a JSON number; node-postgres returns it as a string. */
function nullableInteger(value: unknown): number | null {
	if (value === null || value === undefined) return null;
	const parsed = typeof value === 'string' && /^-?\d+$/.test(value) ? Number(value) : value;
	return Number.isSafeInteger(parsed) ? (parsed as number) : null;
}

function integer(value: unknown, label: string): number {
	const parsed = nullableInteger(value);
	if (parsed === null)
		throw new AgenticChatWorkflowStoreProtocolError(`${label} is not an integer`);
	return parsed;
}
