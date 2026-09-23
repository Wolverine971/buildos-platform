// apps/worker/src/workers/agentic-chat/workflow/preparation-store.ts
import {
	AGENTIC_CHAT_WORKFLOW_CONTEXT_VERSION,
	type AgenticChatCommittedSemanticEventReceiptV1,
	type AgenticChatPreparedWorkflowContextV1,
	type AgenticChatRecoveryFailureClassV1,
	type AgenticChatWorkflowEvidenceVersionV1,
	type AgenticChatWorkflowPhaseV1,
	type AgenticChatWorkflowRecoveryOutcomeV1,
	type JsonObject
} from '@buildos/shared-types';
import type { AgenticChatExecutionIdentityV1 } from '../turn/execution-control';
import type { BuiltAgenticChatWorkflowContextV1 } from './prepared-context';

/**
 * Tasker 86's narrow adapter over Tasker 85's frozen workflow RPCs. It owns
 * exact argument names and fail-closed receipt parsing for the preparation
 * boundary only; plan/step/dispatch/synthesis adapters belong to Tasker 87.
 */

type RpcError = { code?: string; message: string };
type RpcResponse = PromiseLike<{ data: unknown; error: RpcError | null }>;

export type AgenticChatWorkflowPreparationRpcClient = {
	rpc(name: string, args: Record<string, unknown>): RpcResponse;
};

type SelectChain = {
	eq(column: string, value: string): SelectChain;
	maybeSingle(): PromiseLike<{ data: unknown; error: RpcError | null }>;
};

/** `chat_turn_workflow_runs` is service-only and absent from the generated client types. */
export type AgenticChatWorkflowPreparationReadClient = {
	from(table: 'chat_turn_workflow_runs'): { select(columns: string): SelectChain };
};

export type AgenticChatWorkflowFenceV1 = AgenticChatExecutionIdentityV1 & {
	executionGeneration: number;
};

export type AgenticChatWorkflowFencedOutcomeReceiptV1 = {
	outcome: 'stale_generation' | 'ownership_lost' | 'cancel_requested' | 'already_terminal';
};

/** The committed receipt a workflow checkpoint returns; short when replayed. */
export type AgenticChatWorkflowEventReceiptV1 =
	| { kind: 'committed'; receipt: AgenticChatCommittedSemanticEventReceiptV1 }
	| {
			kind: 'replayed';
			eventId: string;
			sequenceIndex: number;
			executionGeneration: number;
	  }
	| { kind: 'none' };

export type AgenticChatWorkflowResumeReceiptV1 =
	| AgenticChatWorkflowFencedOutcomeReceiptV1
	| {
			outcome: 'resumed';
			phase: AgenticChatWorkflowPhaseV1;
			contextId: string | null;
			event: AgenticChatWorkflowEventReceiptV1;
	  };

export type AgenticChatWorkflowContextAcceptReceiptV1 =
	| AgenticChatWorkflowFencedOutcomeReceiptV1
	| {
			outcome: 'accepted' | 'already_accepted' | 'context_conflict';
			contextId: string;
			contextHash: string;
			deadlineAt: string | null;
			/** Database commit time; only a first acceptance reports it. */
			acceptedAt: string | null;
			event: AgenticChatWorkflowEventReceiptV1;
	  }
	| { outcome: 'deadline_expired'; deadlineAt: string | null }
	| { outcome: 'access_revoked' };

export type AgenticChatWorkflowRecoveryReceiptV1 = {
	outcome: AgenticChatWorkflowRecoveryOutcomeV1;
	executionMayRetry: boolean;
	status: string | null;
	failureCode: string | null;
};

export type AgenticChatWorkflowDurableRunV1 = {
	turnRunId: string;
	sessionId: string;
	userId: string;
	requestArtifactId: string;
	projectId: string;
	requestHash: string;
	phase: AgenticChatWorkflowPhaseV1;
	terminalOutcome: string | null;
	deadlineAt: string | null;
	wholeRunLifetimeMs: number;
	recoveryCount: number;
	/** The accepted immutable checkpoint, or null while the run is preparing. */
	context: AgenticChatPreparedWorkflowContextV1 | null;
	contextAcceptedGeneration: number | null;
};

export type AgenticChatWorkflowPreparationStorePortV1 = {
	readRun(scope: {
		turnRunId: string;
		userId: string;
	}): Promise<AgenticChatWorkflowDurableRunV1 | null>;
	hasProjectAccess(input: { userId: string; projectId: string }): Promise<boolean>;
	resume(input: {
		fence: AgenticChatWorkflowFenceV1;
		transitionId: string;
		projection: JsonObject;
		eventPayload: JsonObject;
	}): Promise<AgenticChatWorkflowResumeReceiptV1>;
	acceptContext(input: {
		fence: AgenticChatWorkflowFenceV1;
		contextId: string;
		requestArtifactId: string;
		requestHash: string;
		context: BuiltAgenticChatWorkflowContextV1;
		transitionId: string;
		projection: JsonObject;
		eventPayload: JsonObject;
	}): Promise<AgenticChatWorkflowContextAcceptReceiptV1>;
	recover(input: {
		fence: AgenticChatWorkflowFenceV1;
		failureClass: AgenticChatRecoveryFailureClassV1;
		errorMessage: string | null;
	}): Promise<AgenticChatWorkflowRecoveryReceiptV1>;
};

/**
 * A named SQL exception (`agentic_chat_*`, SQLSTATE P0001/42501) is a
 * deterministic refusal; replaying it cannot help. Anything else (network,
 * pooler, statement timeout) leaves commit status unknown.
 */
export class AgenticChatWorkflowStoreRpcError extends Error {
	readonly deterministic: boolean;

	constructor(
		readonly rpcName: string,
		readonly code: string,
		message: string
	) {
		super(`${rpcName} failed${code ? ` (${code})` : ''}: ${message}`);
		this.name = 'AgenticChatWorkflowStoreRpcError';
		this.deterministic =
			code === 'P0001' || code === '42501' || /\bagentic_chat_[a-z0-9_]+/.test(message);
	}
}

export class AgenticChatWorkflowStoreProtocolError extends Error {
	constructor(message: string) {
		super(`Invalid Agentic Chat workflow receipt: ${message}`);
		this.name = 'AgenticChatWorkflowStoreProtocolError';
	}
}

const RUN_COLUMNS = [
	'turn_run_id',
	'session_id',
	'user_id',
	'request_artifact_id',
	'project_id',
	'request_hash',
	'phase',
	'terminal_outcome',
	'deadline_at',
	'whole_run_lifetime_ms',
	'recovery_count',
	'context_id',
	'preparation_version',
	'context_identity',
	'evidence_versions',
	'context_payload',
	'context_hash',
	'context_bytes',
	'context_accepted_at',
	'context_accepted_generation'
].join(',');

const PHASES = new Set(['preparing', 'assessing', 'executing', 'synthesizing', 'finished']);
const FENCED = new Set([
	'stale_generation',
	'ownership_lost',
	'cancel_requested',
	'already_terminal'
]);
const RECOVERY_OUTCOMES = new Set<AgenticChatWorkflowRecoveryOutcomeV1>([
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
]);
const SHA256 = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export class SupabaseAgenticChatWorkflowPreparationStore
	implements AgenticChatWorkflowPreparationStorePortV1
{
	constructor(
		private readonly rpcClient: AgenticChatWorkflowPreparationRpcClient,
		private readonly readClient: AgenticChatWorkflowPreparationReadClient
	) {}

	async readRun(scope: {
		turnRunId: string;
		userId: string;
	}): Promise<AgenticChatWorkflowDurableRunV1 | null> {
		const { data, error } = await this.readClient
			.from('chat_turn_workflow_runs')
			.select(RUN_COLUMNS)
			.eq('turn_run_id', scope.turnRunId)
			.eq('user_id', scope.userId)
			.maybeSingle();
		if (error) {
			throw new AgenticChatWorkflowStoreRpcError(
				'chat_turn_workflow_runs',
				error.code ?? '',
				error.message
			);
		}
		if (data === null || data === undefined) return null;
		return parseRun(data, scope);
	}

	async hasProjectAccess(input: { userId: string; projectId: string }): Promise<boolean> {
		const value = await this.call('agentic_chat_workflow_project_access_v1', {
			p_user_id: input.userId,
			p_project_id: input.projectId
		});
		if (typeof value !== 'boolean') throw protocolError('project access is not boolean');
		return value;
	}

	async resume(input: {
		fence: AgenticChatWorkflowFenceV1;
		transitionId: string;
		projection: JsonObject;
		eventPayload: JsonObject;
	}): Promise<AgenticChatWorkflowResumeReceiptV1> {
		const value = record(
			await this.call('resume_agentic_chat_workflow_projection_v1', {
				...fenceArgs(input.fence),
				p_transition_id: input.transitionId,
				p_projection: input.projection,
				p_event_payload: input.eventPayload
			}),
			'resume'
		);
		if (FENCED.has(value.outcome as string)) {
			return {
				outcome: value.outcome as AgenticChatWorkflowFencedOutcomeReceiptV1['outcome']
			};
		}
		if (value.outcome !== 'resumed' || !PHASES.has(value.phase as string)) {
			throw protocolError('resume outcome is invalid');
		}
		return {
			outcome: 'resumed',
			phase: value.phase as AgenticChatWorkflowPhaseV1,
			contextId: nullableUuid(value.context_id, 'resume context id'),
			event: parseEvent(value.event, input.fence)
		};
	}

	async acceptContext(input: {
		fence: AgenticChatWorkflowFenceV1;
		contextId: string;
		requestArtifactId: string;
		requestHash: string;
		context: BuiltAgenticChatWorkflowContextV1;
		transitionId: string;
		projection: JsonObject;
		eventPayload: JsonObject;
	}): Promise<AgenticChatWorkflowContextAcceptReceiptV1> {
		const value = record(
			await this.call('accept_agentic_chat_workflow_context_v1', {
				...fenceArgs(input.fence),
				p_context_id: input.contextId,
				p_request_artifact_id: input.requestArtifactId,
				p_request_hash: input.requestHash,
				p_preparation_version: input.context.preparationVersion,
				p_context_identity: input.context.contextIdentity,
				p_evidence_versions: input.context.evidenceVersions,
				p_context_payload: input.context.payload,
				p_context_hash: input.context.contextHash,
				p_context_bytes: input.context.payloadBytes,
				p_transition_id: input.transitionId,
				p_projection: input.projection,
				p_event_payload: input.eventPayload
			}),
			'context acceptance'
		);
		const outcome = value.outcome;
		if (FENCED.has(outcome as string)) {
			return { outcome: outcome as AgenticChatWorkflowFencedOutcomeReceiptV1['outcome'] };
		}
		if (outcome === 'deadline_expired') {
			return { outcome, deadlineAt: nullableText(value.deadline_at) };
		}
		if (outcome === 'access_revoked') return { outcome };
		if (
			outcome === 'accepted' ||
			outcome === 'already_accepted' ||
			outcome === 'context_conflict'
		) {
			const contextId = nullableUuid(value.context_id, 'accepted context id');
			if (
				contextId === null ||
				typeof value.context_hash !== 'string' ||
				!SHA256.test(value.context_hash)
			) {
				throw protocolError('context acceptance identity is invalid');
			}
			if (
				outcome !== 'context_conflict' &&
				(contextId !== input.contextId || value.context_hash !== input.context.contextHash)
			) {
				throw protocolError('context acceptance does not match the submitted checkpoint');
			}
			return {
				outcome,
				contextId,
				contextHash: value.context_hash,
				deadlineAt: nullableText(value.deadline_at),
				acceptedAt: nullableText(value.accepted_at),
				event: parseEvent(value.event, input.fence)
			};
		}
		throw protocolError('context acceptance outcome is invalid');
	}

	async recover(input: {
		fence: AgenticChatWorkflowFenceV1;
		failureClass: AgenticChatRecoveryFailureClassV1;
		errorMessage: string | null;
	}): Promise<AgenticChatWorkflowRecoveryReceiptV1> {
		const value = record(
			await this.call('recover_agentic_chat_workflow_turn_v1', {
				...fenceArgs(input.fence),
				p_failure_class: input.failureClass,
				p_error_message: input.errorMessage
			}),
			'workflow recovery'
		);
		if (!RECOVERY_OUTCOMES.has(value.outcome as AgenticChatWorkflowRecoveryOutcomeV1)) {
			throw protocolError('workflow recovery outcome is invalid');
		}
		return {
			outcome: value.outcome as AgenticChatWorkflowRecoveryOutcomeV1,
			executionMayRetry: value.execution_may_retry === true,
			status: nullableText(value.status),
			failureCode: nullableText(value.failure_code)
		};
	}

	private async call(name: string, args: Record<string, unknown>): Promise<unknown> {
		const { data, error } = await this.rpcClient.rpc(name, args);
		if (error)
			throw new AgenticChatWorkflowStoreRpcError(name, error.code ?? '', error.message);
		if (data === null || data === undefined) throw protocolError(`${name} returned no receipt`);
		return data;
	}
}

function fenceArgs(fence: AgenticChatWorkflowFenceV1): Record<string, unknown> {
	return {
		p_turn_run_id: fence.turnRunId,
		p_queue_job_id: fence.queueJobId,
		p_processing_token: fence.processingToken,
		p_execution_generation: fence.executionGeneration
	};
}

/** Tasker 87's runner publishes its checkpoint events through the same parser. */
export function parseAgenticChatWorkflowEventReceiptV1(
	value: unknown,
	fence: AgenticChatWorkflowFenceV1
): AgenticChatWorkflowEventReceiptV1 {
	return parseEvent(value, fence);
}

function parseEvent(
	value: unknown,
	fence: AgenticChatWorkflowFenceV1
): AgenticChatWorkflowEventReceiptV1 {
	if (value === null || value === undefined) return { kind: 'none' };
	const event = record(value, 'event receipt');
	if (
		!Number.isSafeInteger(event.sequence_index) ||
		(event.sequence_index as number) < 1 ||
		typeof event.event_id !== 'string' ||
		!Number.isSafeInteger(event.execution_generation)
	) {
		throw protocolError('event receipt identity is invalid');
	}
	// A full semantic-writer receipt carries the turn scope; a checkpoint replay
	// returns only the durable event coordinates.
	if (typeof event.turn_run_id === 'string') {
		if (
			event.turn_run_id !== fence.turnRunId ||
			event.queue_job_id !== fence.queueJobId ||
			event.execution_generation !== fence.executionGeneration ||
			(event.outcome !== 'persisted' && event.outcome !== 'already_persisted') ||
			typeof event.session_id !== 'string' ||
			typeof event.user_id !== 'string' ||
			typeof event.stream_run_id !== 'string' ||
			typeof event.phase !== 'string' ||
			typeof event.event_type !== 'string'
		) {
			throw protocolError('committed event receipt does not match the fenced turn');
		}
		return {
			kind: 'committed',
			receipt: event as unknown as AgenticChatCommittedSemanticEventReceiptV1
		};
	}
	return {
		kind: 'replayed',
		eventId: event.event_id,
		sequenceIndex: event.sequence_index as number,
		executionGeneration: event.execution_generation as number
	};
}

function parseRun(
	value: unknown,
	scope: { turnRunId: string; userId: string }
): AgenticChatWorkflowDurableRunV1 {
	const row = record(value, 'workflow run');
	if (
		row.turn_run_id !== scope.turnRunId ||
		row.user_id !== scope.userId ||
		typeof row.session_id !== 'string' ||
		typeof row.request_artifact_id !== 'string' ||
		typeof row.project_id !== 'string' ||
		typeof row.request_hash !== 'string' ||
		!SHA256.test(row.request_hash) ||
		!PHASES.has(row.phase as string) ||
		!Number.isSafeInteger(row.whole_run_lifetime_ms) ||
		!Number.isSafeInteger(row.recovery_count)
	) {
		throw protocolError('workflow run row is invalid');
	}
	let context: AgenticChatPreparedWorkflowContextV1 | null = null;
	if (row.context_id !== null && row.context_id !== undefined) {
		const identity = record(row.context_identity, 'context identity');
		if (
			typeof row.context_id !== 'string' ||
			typeof row.preparation_version !== 'string' ||
			typeof row.context_hash !== 'string' ||
			!SHA256.test(row.context_hash) ||
			!Number.isSafeInteger(row.context_bytes) ||
			typeof row.context_accepted_at !== 'string' ||
			!Array.isArray(row.evidence_versions) ||
			typeof row.context_payload !== 'object' ||
			row.context_payload === null ||
			Array.isArray(row.context_payload) ||
			identity.userId !== scope.userId ||
			identity.projectId !== row.project_id ||
			typeof identity.accessCheckedAt !== 'string' ||
			typeof identity.contextLoadedAt !== 'string' ||
			!(identity.cacheRefUsed === null || typeof identity.cacheRefUsed === 'string')
		) {
			throw protocolError('accepted context checkpoint is invalid');
		}
		context = {
			version: AGENTIC_CHAT_WORKFLOW_CONTEXT_VERSION,
			contextId: row.context_id,
			turnRunId: scope.turnRunId,
			requestId: row.request_artifact_id,
			requestHash: row.request_hash,
			preparationVersion: row.preparation_version,
			contextIdentity: {
				userId: identity.userId,
				projectId: identity.projectId,
				accessCheckedAt: identity.accessCheckedAt,
				contextLoadedAt: identity.contextLoadedAt,
				cacheRefUsed: identity.cacheRefUsed as string | null
			},
			evidenceVersions: row.evidence_versions as AgenticChatWorkflowEvidenceVersionV1[],
			payload: row.context_payload as JsonObject,
			payloadBytes: row.context_bytes as number,
			contextHash: row.context_hash,
			acceptedAt: row.context_accepted_at
		};
	}
	return {
		turnRunId: scope.turnRunId,
		sessionId: row.session_id,
		userId: scope.userId,
		requestArtifactId: row.request_artifact_id,
		projectId: row.project_id,
		requestHash: row.request_hash,
		phase: row.phase as AgenticChatWorkflowPhaseV1,
		terminalOutcome: nullableText(row.terminal_outcome),
		deadlineAt: nullableText(row.deadline_at),
		wholeRunLifetimeMs: row.whole_run_lifetime_ms as number,
		recoveryCount: row.recovery_count as number,
		context,
		contextAcceptedGeneration: Number.isSafeInteger(row.context_accepted_generation)
			? (row.context_accepted_generation as number)
			: null
	};
}

function record(value: unknown, label: string): Record<string, unknown> {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw protocolError(`${label} is not an object`);
	}
	return value as Record<string, unknown>;
}

function nullableText(value: unknown): string | null {
	return typeof value === 'string' && value.length > 0 ? value : null;
}

function nullableUuid(value: unknown, label: string): string | null {
	if (value === null || value === undefined) return null;
	if (typeof value !== 'string' || !UUID.test(value)) throw protocolError(`${label} is invalid`);
	return value;
}

function protocolError(message: string): AgenticChatWorkflowStoreProtocolError {
	return new AgenticChatWorkflowStoreProtocolError(message);
}
