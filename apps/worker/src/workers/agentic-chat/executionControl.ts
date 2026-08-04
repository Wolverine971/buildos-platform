// apps/worker/src/workers/agentic-chat/executionControl.ts
import {
	type AgenticChatExecutionStartRpcResultV1,
	type AgenticChatRecoveryFailureClassV1,
	type AgenticChatRecoveryRpcResultV1,
	type AgenticChatTerminalFinalizeRpcResultV1,
	type AgenticChatTurnClaimResultV1,
	type ChatTurnStatusV1,
	type JsonObject,
	canonicalizeAgenticChatJson,
	createAgentStreamEventIdV1
} from '@buildos/shared-types';

type RpcError = { code?: string; message: string };
type RpcResponse = PromiseLike<{ data: unknown; error: RpcError | null }>;

export type AgenticChatExecutionRpcClient = {
	rpc(name: string, args: Record<string, unknown>): RpcResponse;
};

export type AgenticChatExecutionIdentityV1 = {
	turnRunId: string;
	queueJobId: string;
	processingToken: string;
};

export type AgenticChatTerminalFinalizeInputV1 = AgenticChatExecutionIdentityV1 & {
	userId: string;
	executionGeneration: number;
	status: 'completed' | 'failed' | 'cancelled';
	finishedReason: string;
	failureCode: string | null;
	assistantMessageId: string | null;
	assistantText: string;
	assistantMetadata: JsonObject;
	promptTokens: number | null;
	completionTokens: number | null;
	totalTokens: number | null;
	projection: JsonObject;
	eventPayload: JsonObject;
	lastTurnContext?: JsonObject | null;
	lastTurnContextTransitionId?: string | null;
	publicError?: string | null;
	errorTransitionId?: string | null;
	timingDraft?: JsonObject | null;
	timingTransitionId?: string | null;
};

export type AgenticChatExecutionControlPortV1 = {
	claim(input: AgenticChatExecutionIdentityV1): Promise<AgenticChatTurnClaimResultV1>;
	begin(
		input: AgenticChatExecutionIdentityV1 & { executionGeneration: number }
	): Promise<AgenticChatExecutionStartRpcResultV1>;
	recover(
		input: AgenticChatExecutionIdentityV1 & {
			executionGeneration: number;
			failureClass: AgenticChatRecoveryFailureClassV1;
			errorMessage: string | null;
		}
	): Promise<AgenticChatRecoveryRpcResultV1>;
	finalize(
		input: AgenticChatTerminalFinalizeInputV1
	): Promise<AgenticChatTerminalFinalizeRpcResultV1>;
	completeQueueJob(input: {
		queueJobId: string;
		processingToken: string;
		result: JsonObject;
	}): Promise<boolean>;
};

export class AgenticChatExecutionControlRpcError extends Error {
	constructor(
		readonly rpcName: string,
		readonly code: string,
		message: string
	) {
		super(`${rpcName} failed${code ? ` (${code})` : ''}: ${message}`);
		this.name = 'AgenticChatExecutionControlRpcError';
	}
}

export class AgenticChatExecutionControlProtocolError extends Error {
	constructor(message: string) {
		super(`Invalid Agentic Chat execution-control receipt: ${message}`);
		this.name = 'AgenticChatExecutionControlProtocolError';
	}
}

type CommonExecutionReceipt = Record<string, unknown> & {
	turn_run_id: string;
	queue_job_id: string;
	session_id: string;
	user_id: string;
	correlation_id: string;
	execution_generation: number;
	status: ChatTurnStatusV1;
};

type CommonTerminalReceipt = Record<string, unknown> & {
	turn_run_id: string;
	queue_job_id: string;
	session_id: string;
	user_id: string;
	execution_generation: number;
	status: ChatTurnStatusV1;
};

export class SupabaseAgenticChatExecutionControlAdapter
	implements AgenticChatExecutionControlPortV1
{
	constructor(private readonly client: AgenticChatExecutionRpcClient) {}

	async claim(input: AgenticChatExecutionIdentityV1): Promise<AgenticChatTurnClaimResultV1> {
		validateExecutionIdentity(input);
		const value = await this.call('claim_agentic_chat_turn', {
			p_turn_run_id: input.turnRunId,
			p_queue_job_id: input.queueJobId,
			p_processing_token: input.processingToken
		});
		return parseClaimReceipt(value, input);
	}

	async begin(
		input: AgenticChatExecutionIdentityV1 & { executionGeneration: number }
	): Promise<AgenticChatExecutionStartRpcResultV1> {
		validateExecutionIdentity(input);
		positiveInteger(input.executionGeneration, 'executionGeneration');
		const value = await this.call('begin_agentic_chat_turn_execution', {
			p_turn_run_id: input.turnRunId,
			p_queue_job_id: input.queueJobId,
			p_processing_token: input.processingToken,
			p_execution_generation: input.executionGeneration
		});
		return parseBeginReceipt(value, input);
	}

	async recover(
		input: AgenticChatExecutionIdentityV1 & {
			executionGeneration: number;
			failureClass: AgenticChatRecoveryFailureClassV1;
			errorMessage: string | null;
		}
	): Promise<AgenticChatRecoveryRpcResultV1> {
		validateExecutionIdentity(input);
		positiveInteger(input.executionGeneration, 'executionGeneration');
		if (!isFailureClass(input.failureClass)) throw protocolError('failure class is invalid');
		if (input.errorMessage !== null && !canonicalText(input.errorMessage, 2_000)) {
			throw protocolError('recovery error message is invalid');
		}
		const value = await this.call('recover_agentic_chat_turn', {
			p_turn_run_id: input.turnRunId,
			p_queue_job_id: input.queueJobId,
			p_processing_token: input.processingToken,
			p_execution_generation: input.executionGeneration,
			p_failure_class: input.failureClass,
			p_error_message: input.errorMessage
		});
		return parseRecoveryReceipt(value, input);
	}

	async finalize(
		input: AgenticChatTerminalFinalizeInputV1
	): Promise<AgenticChatTerminalFinalizeRpcResultV1> {
		validateExecutionIdentity(input);
		positiveInteger(input.executionGeneration, 'executionGeneration');
		canonicalUuid(input.userId, 'userId');
		if (!canonicalText(input.finishedReason, 256)) {
			throw protocolError('finished reason is invalid');
		}
		if (input.failureCode !== null && !canonicalText(input.failureCode, 128)) {
			throw protocolError('failure code is invalid');
		}
		if (input.status === 'completed' && input.failureCode !== null) {
			throw protocolError('completed finalization cannot carry a failure code');
		}
		if (input.status === 'failed' && input.failureCode === null) {
			throw protocolError('failed finalization requires a failure code');
		}
		if (input.assistantMessageId !== null) {
			canonicalUuid(input.assistantMessageId, 'assistantMessageId');
		}
		if (input.status === 'completed' && input.assistantMessageId === null) {
			throw protocolError('completed finalization requires an assistant message id');
		}
		for (const [name, value] of [
			['promptTokens', input.promptTokens],
			['completionTokens', input.completionTokens],
			['totalTokens', input.totalTokens]
		] as const) {
			if (value !== null) nonnegativeInteger(value, name);
		}
		const lastTurnContext = input.lastTurnContext ?? null;
		const lastTurnContextTransitionId = input.lastTurnContextTransitionId ?? null;
		const publicError = input.publicError ?? null;
		const errorTransitionId = input.errorTransitionId ?? null;
		const timingDraft = input.timingDraft ?? null;
		const timingTransitionId = input.timingTransitionId ?? null;
		if ((lastTurnContext === null) !== (lastTurnContextTransitionId === null)) {
			throw protocolError('last-turn context and transition id must be supplied together');
		}
		if ((timingDraft === null) !== (timingTransitionId === null)) {
			throw protocolError('timing draft and transition id must be supplied together');
		}
		if ((publicError === null) !== (errorTransitionId === null)) {
			throw protocolError('public error and transition id must be supplied together');
		}
		if (timingDraft !== null && lastTurnContext === null && publicError === null) {
			throw protocolError('timing draft requires last-turn context or public error');
		}
		if (lastTurnContext !== null && lastTurnContextTransitionId !== null) {
			if (input.status !== 'completed' && input.status !== 'cancelled') {
				throw protocolError(
					'only completed or cancelled finalization may carry last-turn context'
				);
			}
			canonicalUuid(lastTurnContextTransitionId, 'lastTurnContextTransitionId');
		}
		if (
			input.status === 'cancelled' &&
			lastTurnContext !== null &&
			(input.failureCode !== 'cancelled' ||
				input.assistantMessageId === null ||
				input.assistantText.length === 0 ||
				timingDraft === null)
		) {
			throw protocolError(
				'cancelled terminal events require a durable partial message, cancellation code, and timing'
			);
		}
		if (timingDraft !== null && timingTransitionId !== null) {
			if (
				input.status !== 'completed' &&
				input.status !== 'cancelled' &&
				input.status !== 'failed'
			) {
				throw protocolError('terminal finalization status may not carry timing');
			}
			canonicalUuid(timingTransitionId, 'timingTransitionId');
		}
		if (publicError !== null && errorTransitionId !== null) {
			if (
				input.status !== 'failed' ||
				input.assistantMessageId !== null ||
				lastTurnContext !== null ||
				timingDraft === null
			) {
				throw protocolError(
					'failed terminal events require no assistant message, no last-turn context, and timing'
				);
			}
			if (!canonicalText(publicError, 512)) {
				throw protocolError('public error must be canonical text');
			}
			canonicalUuid(errorTransitionId, 'errorTransitionId');
		}

		const rpcName =
			publicError !== null
				? 'finalize_agentic_chat_turn_with_failure_events'
				: lastTurnContext === null
					? 'finalize_agentic_chat_turn'
					: timingDraft === null
						? 'finalize_agentic_chat_turn_with_last_context'
						: 'finalize_agentic_chat_turn_with_terminal_events';
		const args: Record<string, unknown> = {
			p_turn_run_id: input.turnRunId,
			p_queue_job_id: input.queueJobId,
			p_processing_token: input.processingToken,
			p_execution_generation: input.executionGeneration,
			p_user_id: input.userId,
			p_status: input.status,
			p_finished_reason: input.finishedReason,
			p_failure_code: input.failureCode,
			p_assistant_message_id: input.assistantMessageId,
			p_assistant_text: input.assistantText,
			p_assistant_metadata: input.assistantMetadata,
			p_prompt_tokens: input.promptTokens,
			p_completion_tokens: input.completionTokens,
			p_total_tokens: input.totalTokens,
			p_projection: input.projection,
			p_event_payload: input.eventPayload
		};
		if (lastTurnContext !== null && lastTurnContextTransitionId !== null) {
			args.p_last_turn_context = lastTurnContext;
			args.p_last_turn_context_transition_id = lastTurnContextTransitionId;
		}
		if (publicError !== null && errorTransitionId !== null) {
			args.p_public_error = publicError;
			args.p_error_transition_id = errorTransitionId;
		}
		if (timingDraft !== null && timingTransitionId !== null) {
			args.p_timing_draft = timingDraft;
			args.p_timing_transition_id = timingTransitionId;
		}
		const value = await this.call(rpcName, args);
		return parseFinalizeReceipt(value, input);
	}

	async completeQueueJob(input: {
		queueJobId: string;
		processingToken: string;
		result: JsonObject;
	}): Promise<boolean> {
		canonicalUuid(input.queueJobId, 'queueJobId');
		canonicalUuid(input.processingToken, 'processingToken');
		const value = await this.call('complete_queue_job', {
			p_job_id: input.queueJobId,
			p_processing_token: input.processingToken,
			p_result: input.result
		});
		if (typeof value !== 'boolean') throw protocolError('queue completion is not boolean');
		return value;
	}

	private async call(name: string, args: Record<string, unknown>): Promise<unknown> {
		const { data, error } = await this.client.rpc(name, args);
		if (error) {
			throw new AgenticChatExecutionControlRpcError(name, error.code ?? '', error.message);
		}
		if (data === null || data === undefined) throw protocolError(`${name} returned no receipt`);
		return data;
	}
}

function parseClaimReceipt(
	value: unknown,
	expected: AgenticChatExecutionIdentityV1
): AgenticChatTurnClaimResultV1 {
	const receipt = commonReceipt(value, expected);
	if (typeof receipt.execution_may_start !== 'boolean') {
		throw protocolError('claim execution authority is missing');
	}
	if (receipt.outcome === 'claimed' || receipt.outcome === 'matching_current_claim') {
		if (
			receipt.status !== 'running' ||
			receipt.execution_generation < 1 ||
			!canonicalUuidValue(receipt.input_artifact_id) ||
			!canonicalUuidValue(receipt.user_message_id) ||
			(receipt.outcome === 'claimed' && receipt.execution_may_start !== true)
		) {
			throw protocolError('claim execution receipt is inconsistent');
		}
		return {
			outcome: receipt.outcome,
			executionMayStart: receipt.execution_may_start,
			turnRunId: receipt.turn_run_id,
			queueJobId: receipt.queue_job_id,
			sessionId: receipt.session_id,
			userId: receipt.user_id,
			correlationId: receipt.correlation_id,
			executionGeneration: receipt.execution_generation,
			status: 'running',
			inputArtifactId: receipt.input_artifact_id,
			userMessageId: receipt.user_message_id
		} as AgenticChatTurnClaimResultV1;
	}
	if (receipt.outcome === 'cancel_requested' || receipt.outcome === 'already_terminal') {
		if (
			receipt.execution_may_start !== false ||
			(receipt.outcome === 'already_terminal' && !isTerminalStatus(receipt.status))
		) {
			throw protocolError('non-executable claim receipt is inconsistent');
		}
		return {
			outcome: receipt.outcome,
			executionMayStart: false,
			turnRunId: receipt.turn_run_id,
			queueJobId: receipt.queue_job_id,
			sessionId: receipt.session_id,
			userId: receipt.user_id,
			correlationId: receipt.correlation_id,
			executionGeneration: receipt.execution_generation,
			status: receipt.status
		};
	}
	throw protocolError('claim outcome is invalid');
}

function parseBeginReceipt(
	value: unknown,
	expected: AgenticChatExecutionIdentityV1 & { executionGeneration: number }
): AgenticChatExecutionStartRpcResultV1 {
	const receipt = commonReceipt(value, expected);
	if (typeof receipt.invoke_provider !== 'boolean') {
		throw protocolError('provider authority is missing');
	}
	if (receipt.outcome === 'started' || receipt.outcome === 'already_started') {
		if (
			receipt.status !== 'running' ||
			receipt.execution_generation !== expected.executionGeneration ||
			!isTimestamp(receipt.execution_started_at) ||
			receipt.invoke_provider !== (receipt.outcome === 'started')
		) {
			throw protocolError('provider-start receipt is inconsistent');
		}
		return receipt as unknown as AgenticChatExecutionStartRpcResultV1;
	}
	if (receipt.outcome === 'stale_generation') {
		if (
			receipt.invoke_provider !== false ||
			receipt.requested_execution_generation !== expected.executionGeneration ||
			(receipt.status !== 'queued' && receipt.status !== 'running')
		) {
			throw protocolError('stale-generation receipt is inconsistent');
		}
		return receipt as unknown as AgenticChatExecutionStartRpcResultV1;
	}
	if (receipt.outcome === 'cancel_requested' || receipt.outcome === 'already_terminal') {
		if (
			receipt.invoke_provider !== false ||
			(receipt.outcome === 'cancel_requested' && receipt.status !== 'running') ||
			(receipt.outcome === 'already_terminal' && !isTerminalStatus(receipt.status))
		) {
			throw protocolError('non-start provider receipt is inconsistent');
		}
		return receipt as unknown as AgenticChatExecutionStartRpcResultV1;
	}
	if (receipt.outcome === 'stale_context') {
		if (receipt.invoke_provider !== false || receipt.status !== 'running') {
			throw protocolError('stale-context receipt is inconsistent');
		}
		return receipt as unknown as AgenticChatExecutionStartRpcResultV1;
	}
	throw protocolError('provider-start outcome is invalid');
}

function parseRecoveryReceipt(
	value: unknown,
	expected: AgenticChatExecutionIdentityV1 & {
		executionGeneration: number;
		failureClass: AgenticChatRecoveryFailureClassV1;
	}
): AgenticChatRecoveryRpcResultV1 {
	const receipt = commonReceipt(value, expected);
	if (
		!RECOVERY_OUTCOMES.has(String(receipt.outcome)) ||
		typeof receipt.execution_may_retry !== 'boolean' ||
		!isNullableFailureClass(receipt.failure_code) ||
		(receipt.outcome === 'retry_scheduled') !== receipt.execution_may_retry ||
		((receipt.outcome === 'retry_scheduled' || receipt.outcome === 'already_requeued') &&
			receipt.status !== 'queued') ||
		((receipt.outcome === 'finalize_failed' ||
			receipt.outcome === 'finalize_cancelled' ||
			receipt.outcome === 'effect_reconciliation_required') &&
			receipt.status !== 'running') ||
		((receipt.outcome === 'queue_reconciled' || receipt.outcome === 'already_reconciled') &&
			!isTerminalStatus(receipt.status)) ||
		(receipt.outcome === 'finalize_cancelled' && receipt.failure_code !== 'cancelled') ||
		(receipt.outcome === 'finalize_failed' && receipt.failure_code === null) ||
		(receipt.outcome === 'stale_generation' &&
			(receipt.execution_generation === expected.executionGeneration ||
				receipt.requested_execution_generation !== expected.executionGeneration))
	) {
		throw protocolError('recovery receipt is inconsistent');
	}
	return receipt as unknown as AgenticChatRecoveryRpcResultV1;
}

function parseFinalizeReceipt(
	value: unknown,
	expected: AgenticChatTerminalFinalizeInputV1
): AgenticChatTerminalFinalizeRpcResultV1 {
	const receipt = commonTerminalReceipt(value, expected);
	if (receipt.outcome === 'finalized' || receipt.outcome === 'already_terminal') {
		const expectedLastTurnContext = expected.lastTurnContext ?? null;
		const expectedTransitionId = expected.lastTurnContextTransitionId ?? null;
		const expectedPublicError = expected.publicError ?? null;
		const expectedErrorTransitionId = expected.errorTransitionId ?? null;
		const expectedTimingDraft = expected.timingDraft ?? null;
		const expectedTimingTransitionId = expected.timingTransitionId ?? null;
		const preterminal = receipt.preterminal_event;
		const preterminals = receipt.preterminal_events;
		if (
			!isTerminalStatus(receipt.status) ||
			!positiveIntegerValue(receipt.execution_generation) ||
			(receipt.outcome === 'finalized' &&
				receipt.execution_generation !== expected.executionGeneration) ||
			(receipt.outcome === 'finalized' && receipt.status !== expected.status) ||
			!canonicalText(receipt.finished_reason, 256) ||
			!isNullableCanonicalText(receipt.failure_code, 128) ||
			!nullableUuid(receipt.assistant_message_id) ||
			!positiveIntegerValue(receipt.terminal_sequence_index) ||
			receipt.terminal_event_id !==
				createAgentStreamEventIdV1(
					expected.turnRunId,
					receipt.execution_generation,
					receipt.terminal_sequence_index
				) ||
			!isTimestamp(receipt.terminalized_at) ||
			(receipt.status === 'completed' &&
				(receipt.assistant_message_id === null || receipt.failure_code !== null)) ||
			(receipt.status === 'failed' && receipt.failure_code === null) ||
			(receipt.outcome === 'finalized' &&
				expectedLastTurnContext !== null &&
				expectedTimingDraft === null &&
				(expectedTransitionId === null ||
					!isLastTurnContextReceipt(
						preterminal,
						expected,
						expectedLastTurnContext,
						expectedTransitionId,
						receipt.terminal_sequence_index - 1,
						receipt.session_id,
						null,
						false
					))) ||
			(receipt.outcome === 'finalized' &&
				expectedTimingDraft !== null &&
				expectedPublicError === null &&
				(expectedLastTurnContext === null ||
					expectedTransitionId === null ||
					expectedTimingTransitionId === null ||
					!Array.isArray(preterminals) ||
					preterminals.length !== 2 ||
					!isLastTurnContextReceipt(
						preterminals[0],
						expected,
						expectedLastTurnContext,
						expectedTransitionId,
						receipt.terminal_sequence_index - 2,
						receipt.session_id,
						receipt.terminalized_at,
						true
					) ||
					!isTimingReceipt(
						preterminals[1],
						expected,
						expectedTimingDraft,
						expectedTimingTransitionId,
						receipt.terminal_sequence_index - 1,
						receipt.terminalized_at,
						receipt.session_id,
						true
					))) ||
			(receipt.outcome === 'finalized' &&
				expectedPublicError !== null &&
				(expectedErrorTransitionId === null ||
					expectedTimingDraft === null ||
					expectedTimingTransitionId === null ||
					!Array.isArray(preterminals) ||
					preterminals.length !== 2 ||
					!isErrorReceipt(
						preterminals[0],
						expected,
						expectedPublicError,
						expectedErrorTransitionId,
						receipt.terminal_sequence_index - 2,
						receipt.session_id
					) ||
					!isTimingReceipt(
						preterminals[1],
						expected,
						expectedTimingDraft,
						expectedTimingTransitionId,
						receipt.terminal_sequence_index - 1,
						receipt.terminalized_at,
						receipt.session_id,
						false
					))) ||
			(receipt.outcome === 'already_terminal' &&
				(preterminal !== undefined || preterminals !== undefined)) ||
			(expectedLastTurnContext === null && preterminal !== undefined) ||
			(expectedTimingDraft !== null && preterminal !== undefined) ||
			(expectedTimingDraft === null && preterminals !== undefined) ||
			(expectedPublicError === null &&
				expectedLastTurnContext === null &&
				preterminals !== undefined)
		) {
			throw protocolError('terminal receipt is inconsistent');
		}
		return receipt as unknown as AgenticChatTerminalFinalizeRpcResultV1;
	}
	if (receipt.outcome === 'stale_generation') {
		if (
			receipt.requested_execution_generation !== expected.executionGeneration ||
			(receipt.status !== 'queued' && receipt.status !== 'running')
		) {
			throw protocolError('terminal stale-generation receipt is inconsistent');
		}
		return receipt as unknown as AgenticChatTerminalFinalizeRpcResultV1;
	}
	if (receipt.outcome === 'cancel_requested') {
		if (
			receipt.status !== 'running' ||
			!isTimestamp(receipt.cancel_requested_at) ||
			!isCancelReason(receipt.cancel_reason)
		) {
			throw protocolError('terminal cancellation receipt is inconsistent');
		}
		return receipt as unknown as AgenticChatTerminalFinalizeRpcResultV1;
	}
	throw protocolError('terminal outcome is invalid');
}

function isLastTurnContextReceipt(
	value: unknown,
	expected: AgenticChatTerminalFinalizeInputV1,
	expectedContext: JsonObject,
	transitionId: string,
	expectedSequence: number,
	expectedSessionId: string,
	expectedTimestamp: string | null,
	requireFreshPersistence: boolean
): boolean {
	try {
		if (!value || typeof value !== 'object') return false;
		const receipt = value as Record<string, unknown>;
		const eventPayload = receipt.event_payload;
		if (!eventPayload || typeof eventPayload !== 'object' || Array.isArray(eventPayload)) {
			return false;
		}
		const payload = eventPayload as Record<string, unknown>;
		const context = payload.context;
		if (!context || typeof context !== 'object' || Array.isArray(context)) return false;
		const { timestamp, ...draft } = context as Record<string, unknown>;
		return (
			(receipt.outcome === 'persisted' || receipt.outcome === 'already_persisted') &&
			(!requireFreshPersistence || receipt.outcome === 'persisted') &&
			receipt.publish_allowed === (receipt.outcome === 'persisted') &&
			(receipt.outcome !== 'persisted' ||
				(receipt.reconcile_required === true && isTimestamp(receipt.persisted_at))) &&
			receipt.turn_run_id === expected.turnRunId &&
			receipt.queue_job_id === expected.queueJobId &&
			receipt.session_id === expectedSessionId &&
			receipt.user_id === expected.userId &&
			receipt.execution_generation === expected.executionGeneration &&
			receipt.sequence_index === expectedSequence &&
			receipt.event_id ===
				createAgentStreamEventIdV1(
					expected.turnRunId,
					expected.executionGeneration,
					expectedSequence
				) &&
			receipt.phase === 'finalize' &&
			receipt.event_type === 'last_turn_context' &&
			receipt.durable === true &&
			receipt.transition_id === transitionId &&
			payload.type === 'last_turn_context' &&
			isTimestamp(timestamp) &&
			(expectedTimestamp === null || timestampEquals(timestamp, expectedTimestamp)) &&
			canonicalizeAgenticChatJson(draft as JsonObject) ===
				canonicalizeAgenticChatJson(expectedContext)
		);
	} catch {
		return false;
	}
}

function isTimingReceipt(
	value: unknown,
	expected: AgenticChatTerminalFinalizeInputV1,
	expectedDraft: JsonObject,
	transitionId: string,
	expectedSequence: number,
	terminalizedAt: string,
	expectedSessionId: string,
	assistantPersisted: boolean
): boolean {
	try {
		if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
		const receipt = value as Record<string, unknown>;
		const eventPayload = receipt.event_payload;
		if (!eventPayload || typeof eventPayload !== 'object' || Array.isArray(eventPayload)) {
			return false;
		}
		const payload = eventPayload as Record<string, unknown>;
		const timing = payload.timing;
		if (!timing || typeof timing !== 'object' || Array.isArray(timing)) return false;
		const timingRecord = timing as Record<string, unknown>;
		const phases = timingRecord.phases;
		if (!phases || typeof phases !== 'object' || Array.isArray(phases)) return false;
		const phaseRecord = phases as Record<string, unknown>;
		const {
			assistant_persisted_at: assistantPersistedAt,
			done_emitted_at: doneEmittedAt,
			terminal_committed_at: terminalCommittedAt,
			phases: _phases,
			...draftFields
		} = timingRecord;
		const { total_request_ms: totalRequestMs, ...draftPhases } = phaseRecord;
		const reconstructedDraft = { ...draftFields, phases: draftPhases } as JsonObject;
		const admittedAt = expectedDraft.admitted_at;
		const expectedTotalRequestMs =
			typeof admittedAt === 'string'
				? timestampDifferenceMs(admittedAt, terminalizedAt)
				: null;

		return (
			receipt.outcome === 'persisted' &&
			receipt.publish_allowed === true &&
			receipt.reconcile_required === true &&
			isTimestamp(receipt.persisted_at) &&
			receipt.turn_run_id === expected.turnRunId &&
			receipt.queue_job_id === expected.queueJobId &&
			receipt.session_id === expectedSessionId &&
			receipt.user_id === expected.userId &&
			receipt.execution_generation === expected.executionGeneration &&
			receipt.sequence_index === expectedSequence &&
			receipt.event_id ===
				createAgentStreamEventIdV1(
					expected.turnRunId,
					expected.executionGeneration,
					expectedSequence
				) &&
			receipt.phase === 'finalize' &&
			receipt.event_type === 'timing' &&
			receipt.durable === true &&
			receipt.transition_id === transitionId &&
			payload.type === 'timing' &&
			isTimestamp(terminalCommittedAt) &&
			(assistantPersisted
				? isTimestamp(assistantPersistedAt) &&
					timestampEquals(assistantPersistedAt, terminalCommittedAt)
				: assistantPersistedAt === null) &&
			doneEmittedAt === null &&
			timestampEquals(terminalCommittedAt, terminalizedAt) &&
			nonnegativeNumberValue(totalRequestMs) &&
			expectedTotalRequestMs !== null &&
			totalRequestMs === expectedTotalRequestMs &&
			canonicalizeAgenticChatJson(reconstructedDraft) ===
				canonicalizeAgenticChatJson(expectedDraft)
		);
	} catch {
		return false;
	}
}

function isErrorReceipt(
	value: unknown,
	expected: AgenticChatTerminalFinalizeInputV1,
	expectedPublicError: string,
	transitionId: string,
	expectedSequence: number,
	expectedSessionId: string
): boolean {
	try {
		if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
		const receipt = value as Record<string, unknown>;
		const eventPayload = receipt.event_payload;
		if (!eventPayload || typeof eventPayload !== 'object' || Array.isArray(eventPayload)) {
			return false;
		}
		const payload = eventPayload as Record<string, unknown>;
		return (
			receipt.outcome === 'persisted' &&
			receipt.publish_allowed === true &&
			receipt.reconcile_required === true &&
			isTimestamp(receipt.persisted_at) &&
			receipt.turn_run_id === expected.turnRunId &&
			receipt.queue_job_id === expected.queueJobId &&
			receipt.session_id === expectedSessionId &&
			receipt.user_id === expected.userId &&
			receipt.execution_generation === expected.executionGeneration &&
			receipt.sequence_index === expectedSequence &&
			receipt.event_id ===
				createAgentStreamEventIdV1(
					expected.turnRunId,
					expected.executionGeneration,
					expectedSequence
				) &&
			receipt.phase === 'finalize' &&
			receipt.event_type === 'error' &&
			receipt.durable === true &&
			receipt.transition_id === transitionId &&
			payload.type === 'error' &&
			payload.error === expectedPublicError
		);
	} catch {
		return false;
	}
}

function commonReceipt(
	value: unknown,
	expected: Pick<AgenticChatExecutionIdentityV1, 'turnRunId' | 'queueJobId'>
): CommonExecutionReceipt {
	const receipt = requireRecord(value, 'receipt');
	if (
		receipt.turn_run_id !== expected.turnRunId ||
		receipt.queue_job_id !== expected.queueJobId ||
		!canonicalUuidValue(receipt.session_id) ||
		!canonicalUuidValue(receipt.user_id) ||
		!canonicalUuidValue(receipt.correlation_id) ||
		!nonnegativeIntegerValue(receipt.execution_generation) ||
		!isTurnStatus(receipt.status)
	) {
		throw protocolError('receipt identity or status is invalid');
	}
	return receipt as CommonExecutionReceipt;
}

function commonTerminalReceipt(
	value: unknown,
	expected: Pick<AgenticChatExecutionIdentityV1, 'turnRunId' | 'queueJobId'> & {
		userId: string;
	}
): CommonTerminalReceipt {
	const receipt = requireRecord(value, 'terminal receipt');
	if (
		receipt.turn_run_id !== expected.turnRunId ||
		receipt.queue_job_id !== expected.queueJobId ||
		receipt.user_id !== expected.userId ||
		!canonicalUuidValue(receipt.session_id) ||
		!nonnegativeIntegerValue(receipt.execution_generation) ||
		!isTurnStatus(receipt.status)
	) {
		throw protocolError('terminal receipt identity or status is invalid');
	}
	return receipt as CommonTerminalReceipt;
}

function validateExecutionIdentity(input: AgenticChatExecutionIdentityV1): void {
	canonicalUuid(input.turnRunId, 'turnRunId');
	canonicalUuid(input.queueJobId, 'queueJobId');
	canonicalUuid(input.processingToken, 'processingToken');
}

function canonicalUuid(value: unknown, name: string): asserts value is string {
	if (!canonicalUuidValue(value)) throw protocolError(`${name} is not a canonical UUID`);
}

function canonicalUuidValue(value: unknown): value is string {
	return typeof value === 'string' && UUID_PATTERN.test(value) && value === value.toLowerCase();
}

function nullableUuid(value: unknown): value is string | null {
	return value === null || canonicalUuidValue(value);
}

function canonicalText(value: unknown, maximum: number): value is string {
	return (
		typeof value === 'string' &&
		value.length > 0 &&
		value.length <= maximum &&
		value === value.trim()
	);
}

function isNullableCanonicalText(value: unknown, maximum: number): value is string | null {
	return value === null || canonicalText(value, maximum);
}

function positiveInteger(value: number, name: string): void {
	if (!positiveIntegerValue(value)) throw protocolError(`${name} must be positive`);
}

function positiveIntegerValue(value: unknown): value is number {
	return Number.isSafeInteger(value) && (value as number) >= 1;
}

function nonnegativeInteger(value: number, name: string): void {
	if (!nonnegativeIntegerValue(value)) throw protocolError(`${name} must be nonnegative`);
}

function nonnegativeIntegerValue(value: unknown): value is number {
	return Number.isSafeInteger(value) && (value as number) >= 0;
}

function nonnegativeNumberValue(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isTimestamp(value: unknown): value is string {
	return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function timestampEquals(left: string, right: string): boolean {
	const leftMicros = timestampMicros(left);
	const rightMicros = timestampMicros(right);
	return leftMicros !== null && leftMicros === rightMicros;
}

function timestampDifferenceMs(start: string, end: string): number | null {
	const startMicros = timestampMicros(start);
	const endMicros = timestampMicros(end);
	if (startMicros === null || endMicros === null || endMicros < startMicros) return null;
	return (endMicros - startMicros) / 1_000;
}

function timestampMicros(value: string): number | null {
	const match = DATABASE_TIMESTAMP_PATTERN.exec(value);
	if (!match) return null;
	const fraction = (match[2] ?? '').padEnd(6, '0');
	const millisecondTimestamp = `${match[1]}.${fraction.slice(0, 3)}${match[3]}`;
	const milliseconds = Date.parse(millisecondTimestamp);
	if (!Number.isFinite(milliseconds)) return null;
	return milliseconds * 1_000 + Number(fraction.slice(3));
}

function isTurnStatus(value: unknown): value is ChatTurnStatusV1 {
	return (
		value === 'queued' ||
		value === 'running' ||
		value === 'completed' ||
		value === 'failed' ||
		value === 'cancelled'
	);
}

function isTerminalStatus(value: unknown): boolean {
	return value === 'completed' || value === 'failed' || value === 'cancelled';
}

function isCancelReason(value: unknown): boolean {
	return (
		value === 'user_cancelled' ||
		value === 'superseded' ||
		value === 'timeout' ||
		value === 'operator_cancelled'
	);
}

function isFailureClass(value: unknown): value is AgenticChatRecoveryFailureClassV1 {
	return (
		typeof value === 'string' && FAILURE_CLASSES.has(value as AgenticChatRecoveryFailureClassV1)
	);
}

function isNullableFailureClass(value: unknown): value is AgenticChatRecoveryFailureClassV1 | null {
	return value === null || isFailureClass(value);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw protocolError(`${label} must be an object`);
	}
	return value as Record<string, unknown>;
}

function protocolError(message: string): AgenticChatExecutionControlProtocolError {
	return new AgenticChatExecutionControlProtocolError(message);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DATABASE_TIMESTAMP_PATTERN =
	/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/;
const FAILURE_CLASSES = new Set<AgenticChatRecoveryFailureClassV1>([
	'transient_infra',
	'provider_throttle',
	'timeout_pre_start',
	'permanent',
	'stale_context',
	'publisher_overload',
	'timeout_post_start',
	'cancelled',
	'uncertain_external_commit',
	'unknown'
]);
const RECOVERY_OUTCOMES = new Set([
	'retry_scheduled',
	'already_requeued',
	'finalize_failed',
	'finalize_cancelled',
	'effect_reconciliation_required',
	'stale_generation',
	'queue_reconciled',
	'already_reconciled'
]);
