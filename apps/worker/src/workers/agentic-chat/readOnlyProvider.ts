// apps/worker/src/workers/agentic-chat/readOnlyProvider.ts

import { createHash } from 'node:crypto';
import {
	type ChatToolDefinition,
	type ChatToolCall,
	type JsonObject,
	type JsonValue,
	canonicalizeAgenticChatJson
} from '@buildos/shared-types';
import {
	READ_LOOP_REPAIR_RANK,
	buildReadLoopRepairInstruction,
	buildRoundToolPattern,
	buildToolPayloadForModel,
	buildToolValidationRepairInstruction,
	parseToolArguments,
	provideAgenticChatLoopToolCatalog,
	selectReadLoopRepairEscalation,
	type ToolValidationIssue,
	validateToolCalls
} from '@buildos/agentic-chat-runtime/loop';
import type { AgenticChatWorkerExecutionInputV1 } from './executionInput';
import {
	AGENTIC_CHAT_WORKER_PROMPT_SNAPSHOT_VERSION,
	type AgenticChatPreparedProviderInvocationV1,
	AgenticChatProviderExecutionError,
	type AgenticChatProviderInputV1,
	type AgenticChatProviderPortV1,
	type AgenticChatProviderReadSynthesisInputV1,
	type AgenticChatProviderStepV1,
	type AgenticChatProviderUsageV1
} from './providerContract';
import { AgenticChatProviderCapacity, AgenticChatProviderCapacityError } from './providerCapacity';
import { createStableAgenticChatReadToolTransitionIdV1 } from './readToolIdentity';
import {
	AGENTIC_CHAT_PRODUCTION_READ_TOOL_NAMES_V1,
	isAgenticChatProductionReadToolNameV1
} from './readOnlyTool';

const DEFAULT_MAX_PROVIDER_ROUNDS = 16;
const MAX_VALIDATION_REPAIR_ROUNDS = 2;
const CANONICAL_UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const WORKER_READ_LOOP_CATALOG_ENTRIES = AGENTIC_CHAT_PRODUCTION_READ_TOOL_NAMES_V1.map(
	(toolName) => {
		const op = workerReadOpForToolName(toolName);
		return [toolName, { op, tool_name: toolName, kind: 'read' as const }] as const;
	}
);
const WORKER_READ_LOOP_CATALOG = Object.freeze({
	ops: Object.freeze(
		Object.fromEntries(
			WORKER_READ_LOOP_CATALOG_ENTRIES.map(([, entry]) => [entry.op, entry])
		)
	),
	byToolName: Object.freeze(Object.fromEntries(WORKER_READ_LOOP_CATALOG_ENTRIES))
});

// Worker and web are separate hosts. Web installs its full registry; the
// worker installs exactly the reviewed read-only catalog it can execute.
provideAgenticChatLoopToolCatalog(() => WORKER_READ_LOOP_CATALOG);

export type AgenticChatReadOnlyProviderMessageV1 = {
	role: 'system' | 'user' | 'assistant' | 'tool';
	content: string;
	tool_calls?: JsonObject[];
	tool_call_id?: string;
};

export type AgenticChatReadOnlyProviderToolV1 = {
	type: 'function';
	function: {
		name: string;
		description: string;
		parameters: JsonObject;
	};
};

export type AgenticChatReadOnlyProviderClientEventV1 =
	| { type: 'text'; content: string }
	| { type: 'reasoning'; reasoning?: string; reasoning_details?: unknown[] }
	| {
			type: 'done';
			finishedReason?: string;
			usage?: {
				promptTokens?: number;
				completionTokens?: number;
				totalTokens?: number;
				prompt_tokens?: number;
				completion_tokens?: number;
				total_tokens?: number;
			};
	  }
	| { type: 'tool_call'; toolCall: unknown }
	| { type: 'error'; error: string; retryable: boolean };

export type AgenticChatReadOnlyProviderClientPortV1 = {
	stream(input: {
		messages: readonly AgenticChatReadOnlyProviderMessageV1[];
		tools: readonly AgenticChatReadOnlyProviderToolV1[];
		toolChoice: 'none' | 'auto';
		userId: string;
		sessionId: string;
		turnRunId: string;
		streamRunId: string;
		clientTurnId: string;
		contextType: string;
		entityId: string | null;
		projectId: string | null;
		queueJobId: string;
		processingToken: string;
		executionGeneration: number;
		providerRound: 'initial' | 'synthesis';
		signal: AbortSignal;
	}): AsyncIterable<AgenticChatReadOnlyProviderClientEventV1>;
};

type ClientRequest = Parameters<AgenticChatReadOnlyProviderClientPortV1['stream']>[0];

type CompletedProviderToolCall = {
	id: string;
	name: string;
	arguments: JsonObject;
	canonicalArguments: string;
};

type PendingReadRound = {
	call: CompletedProviderToolCall;
	usage: AgenticChatProviderUsageV1 | null;
};

/**
 * Default-off Phase 3 provider boundary. Preparation validates the immutable
 * command and reserves local provider capacity; its returned stream performs
 * the first network call only after the executor wins execution-start.
 *
 * The reviewed surface is the immutable admission artifact intersected with
 * the worker's shared read allowlist. Mutating tools are absent. Slice 18 S4
 * keeps provider calls sequential and routes each durable read result through
 * the shared payload and round policies before another provider pass begins.
 */
export class AgenticChatReadOnlyProviderAdapter implements AgenticChatProviderPortV1 {
	constructor(
		private readonly ports: {
			client: AgenticChatReadOnlyProviderClientPortV1;
			capacity: AgenticChatProviderCapacity;
		},
		private readonly retryableFailureCooldownMs = 2_000,
		private readonly maxProviderRounds = DEFAULT_MAX_PROVIDER_ROUNDS
	) {
		if (
			!Number.isSafeInteger(retryableFailureCooldownMs) ||
			retryableFailureCooldownMs < 1 ||
			retryableFailureCooldownMs > 60_000
		) {
			throw new Error('Read-only provider cooldown must be between 1ms and 60000ms');
		}
		if (!Number.isSafeInteger(maxProviderRounds) || maxProviderRounds < 1) {
			throw new Error('Read-only provider round budget must be a positive safe integer');
		}
	}

	prepare(input: AgenticChatProviderInputV1): Promise<AgenticChatPreparedProviderInvocationV1> {
		return Promise.resolve().then(() => this.prepareInvocation(input));
	}

	private prepareInvocation(
		input: AgenticChatProviderInputV1
	): AgenticChatPreparedProviderInvocationV1 {
		throwIfAborted(input.signal);
		const request = buildReadOnlyRequest(
			input.executionInput,
			input.processingToken,
			input.signal
		);
		const promptSnapshot = buildPromptSnapshot(request.messages);
		let lease;
		try {
			lease = this.ports.capacity.acquire();
		} catch (error) {
			if (error instanceof AgenticChatProviderCapacityError) {
				throw new AgenticChatProviderExecutionError(
					'provider_capacity_unavailable',
					'provider_throttle',
					error.message
				);
			}
			throw error;
		}

		let released = false;
		let streamed = false;
		let synthesized = false;
		let continued = false;
		let pendingRead: PendingReadRound | null = null;
		let readRoundCompleted = false;
		let currentRequest = request;
		let nextProviderRound = 2;
		let readOnlyRoundCount = 0;
		let readLoopRepairRank = 0;
		const readOps = new Set<string>();
		const release = () => {
			if (released) return;
			released = true;
			lease.release();
		};
		return {
			promptSnapshot,
			stream: () => {
				if (released) {
					throw new AgenticChatProviderExecutionError(
						'provider_invocation_released',
						'unknown',
						'Agentic Chat provider invocation was released before streaming'
					);
				}
				if (streamed) {
					throw new AgenticChatProviderExecutionError(
						'provider_invocation_reused',
						'unknown',
						'Agentic Chat provider invocation is single-use'
					);
				}
				streamed = true;
				return this.streamInitial(request, {
					release,
					setPendingRead(value) {
						pendingRead = value;
					},
					markReadRoundCompleted() {
						readRoundCompleted = true;
					},
					setCurrentRequest(value) {
						currentRequest = value;
					}
				});
			},
			synthesize: (feedback) => {
				if (released) {
					throw providerError('provider_invocation_released', 'unknown');
				}
				if (!streamed || !pendingRead || !readRoundCompleted) {
					throw providerError('provider_read_synthesis_not_ready', 'unknown');
				}
				if (synthesized) {
					throw providerError('provider_read_synthesis_reused', 'unknown');
				}
				if (continued) {
					throw providerError(
						'provider_read_synthesis_unavailable_after_continuation',
						'unknown'
					);
				}
				validateReadFeedback(pendingRead.call, feedback);
				synthesized = true;
				return this.streamSynthesis(
					buildSynthesisRequest(currentRequest, pendingRead.call, feedback),
					pendingRead.usage,
					release
				);
			},
			continueWithToolResults: (input) => {
				if (released) {
					throw providerError('provider_invocation_released', 'unknown');
				}
				if (synthesized) {
					throw providerError('provider_read_continuation_reused', 'unknown');
				}
				if (!streamed || !pendingRead || !readRoundCompleted) {
					throw providerError('provider_read_continuation_not_ready', 'unknown');
				}
				if (input.round !== nextProviderRound) {
					throw providerError('provider_read_continuation_round_mismatch', 'unknown');
				}
				if (input.results.length !== 1) {
					throw providerError(
						'provider_read_continuation_result_count_invalid',
						'unknown'
					);
				}

				const feedback = input.results[0]!;
				continued = true;
				const completedRead = pendingRead;
				validateReadFeedback(completedRead.call, feedback);
				const pattern = buildRoundToolPattern([
					completedProviderCallToChatToolCall(completedRead.call)
				]);
				for (const op of pattern.readOps) readOps.add(op);
				if (pattern.readOps.length > 0) readOnlyRoundCount += 1;

				currentRequest = buildContinuationRequest(
					currentRequest,
					completedRead.call,
					feedback
				);
				const roundsRemaining = Math.max(
					0,
					this.maxProviderRounds - readOnlyRoundCount
				);
				const escalation = selectReadLoopRepairEscalation({
					readOnlyRoundCount,
					roundsRemaining
				});
				if (escalation && READ_LOOP_REPAIR_RANK[escalation] > readLoopRepairRank) {
					readLoopRepairRank = READ_LOOP_REPAIR_RANK[escalation];
					currentRequest = appendSystemInstruction(
						currentRequest,
						buildReadLoopRepairInstruction([...readOps].sort(), {
							level: escalation,
							roundsRemaining
						})
					);
				}

				pendingRead = null;
				readRoundCompleted = false;
				nextProviderRound += 1;
				return this.streamContinuation(currentRequest, completedRead.usage, {
					release,
					setPendingRead(value) {
						pendingRead = value;
					},
					markReadRoundCompleted() {
						readRoundCompleted = true;
					},
					setCurrentRequest(value) {
						currentRequest = value;
					}
				});
			},
			release
		};
	}

	private async *streamInitial(
		request: ClientRequest,
		state: {
			release(): void;
			setPendingRead(value: PendingReadRound): void;
			markReadRoundCompleted(): void;
			setCurrentRequest(value: ClientRequest): void;
		}
	): AsyncGenerator<AgenticChatProviderStepV1> {
		let finished = false;
		let keepLeaseForSynthesis = false;
		let streamedText = false;
		const toolCall = createToolCallAccumulator();
		try {
			for await (const event of this.ports.client.stream(request)) {
				throwIfAborted(request.signal);
				if (finished) {
					throw providerError('provider_event_after_done', 'unknown');
				}
				if (event.type === 'text') {
					if (!event.content) throw providerError('provider_empty_text', 'unknown');
					if (toolCall.seen) {
						throw providerError('provider_mixed_text_and_tool_call', 'permanent');
					}
					streamedText = true;
					yield { type: 'text_delta', text: event.content };
					continue;
				}
				if (event.type === 'reasoning') {
					// Reasoning remains private and never enters assistant text or the
					// public event stream in the thin read-only slice.
					continue;
				}
				if (event.type === 'tool_call') {
					if (request.toolChoice === 'none') {
						throw providerError('provider_tool_call_disabled', 'permanent');
					}
					if (streamedText) {
						throw providerError('provider_mixed_text_and_tool_call', 'permanent');
					}
					appendToolCallDelta(toolCall, event.toolCall);
					continue;
				}
				if (event.type === 'error') {
					if (event.retryable) {
						this.ports.capacity.markTemporarilyUnavailable(
							this.retryableFailureCooldownMs
						);
					}
					throw new AgenticChatProviderExecutionError(
						'provider_stream_error',
						event.retryable ? 'provider_throttle' : 'unknown',
						canonicalError(event.error)
					);
				}

				const finishedReason = canonicalFinishedReason(event.finishedReason);
				const call = completeToolCall(toolCall);
				finished = true;
				if (call) {
					if (request.toolChoice !== 'auto') {
						throw providerError('provider_tool_call_disabled', 'permanent');
					}
					if (streamedText) {
						throw providerError('provider_mixed_text_and_tool_call', 'permanent');
					}
					if (finishedReason !== 'tool_calls' && finishedReason !== 'function_call') {
						throw providerError('provider_tool_finish_reason_invalid', 'unknown');
					}
					assertAllowlistedCall(call, request.tools);
					const validationIssues = validateCompletedProviderCall(call, request);
					if (validationIssues.length > 0) {
						const repairRequest = buildValidationRepairRequest(
							request,
							call,
							validationIssues
						);
						state.setCurrentRequest(repairRequest);
						keepLeaseForSynthesis = true;
						yield* this.streamContinuation(
							repairRequest,
							normalizeUsage(event.usage),
							state,
							1,
							true
						);
						continue;
					}
					state.setPendingRead({ call, usage: normalizeUsage(event.usage) });
					keepLeaseForSynthesis = true;
					yield buildPlanningStep(request, call.id);
					yield buildReadToolStep(request.turnRunId, call);
					state.markReadRoundCompleted();
					continue;
				}
				if (finishedReason === 'tool_calls' || finishedReason === 'function_call') {
					throw providerError(
						request.toolChoice === 'none'
							? 'provider_tool_call_disabled'
							: 'provider_missing_tool_call',
						request.toolChoice === 'none' ? 'permanent' : 'unknown'
					);
				}
				if (!streamedText) {
					throw providerError('provider_no_assistant_text', 'permanent');
				}
				this.ports.capacity.markAvailable();
				yield {
					type: 'finish',
					finishedReason,
					usage: normalizeUsage(event.usage)
				};
			}
			if (!finished) throw providerError('provider_missing_done', 'unknown');
		} finally {
			if (!keepLeaseForSynthesis) state.release();
		}
	}

	private async *streamContinuation(
		request: ClientRequest,
		priorUsage: AgenticChatProviderUsageV1 | null,
		state: {
			release(): void;
			setPendingRead(value: PendingReadRound): void;
			markReadRoundCompleted(): void;
			setCurrentRequest(value: ClientRequest): void;
		},
		validationRepairRounds = 0,
		emitPlanningSemantic = false
	): AsyncGenerator<AgenticChatProviderStepV1> {
		let finished = false;
		let keepLeaseForContinuation = false;
		let streamedText = false;
		const toolCall = createToolCallAccumulator();
		try {
			for await (const event of this.ports.client.stream(request)) {
				throwIfAborted(request.signal);
				if (finished) throw providerError('provider_event_after_done', 'unknown');
				if (event.type === 'text') {
					if (!event.content) throw providerError('provider_empty_text', 'unknown');
					if (toolCall.seen) {
						throw providerError('provider_mixed_text_and_tool_call', 'permanent');
					}
					streamedText = true;
					yield { type: 'text_delta', text: event.content };
					continue;
				}
				if (event.type === 'reasoning') continue;
				if (event.type === 'tool_call') {
					if (request.toolChoice === 'none') {
						throw providerError('provider_tool_call_disabled', 'permanent');
					}
					if (streamedText) {
						throw providerError('provider_mixed_text_and_tool_call', 'permanent');
					}
					appendToolCallDelta(toolCall, event.toolCall);
					continue;
				}
				if (event.type === 'error') {
					if (event.retryable) {
						this.ports.capacity.markTemporarilyUnavailable(
							this.retryableFailureCooldownMs
						);
					}
					throw new AgenticChatProviderExecutionError(
						'provider_stream_error',
						event.retryable ? 'provider_throttle' : 'unknown',
						canonicalError(event.error)
					);
				}

				const finishedReason = canonicalFinishedReason(event.finishedReason);
				const call = completeToolCall(toolCall);
				const aggregateUsage = combineUsage(priorUsage, normalizeUsage(event.usage));
				finished = true;
				if (call) {
					if (request.toolChoice !== 'auto') {
						throw providerError('provider_tool_call_disabled', 'permanent');
					}
					if (streamedText) {
						throw providerError('provider_mixed_text_and_tool_call', 'permanent');
					}
					if (finishedReason !== 'tool_calls' && finishedReason !== 'function_call') {
						throw providerError('provider_tool_finish_reason_invalid', 'unknown');
					}
					assertAllowlistedCall(call, request.tools);
					const validationIssues = validateCompletedProviderCall(call, request);
					if (validationIssues.length > 0) {
						if (validationRepairRounds >= MAX_VALIDATION_REPAIR_ROUNDS) {
							throw providerError(
								'provider_tool_validation_repair_exhausted',
								'permanent'
							);
						}
						const repairRequest = buildValidationRepairRequest(
							request,
							call,
							validationIssues
						);
						state.setCurrentRequest(repairRequest);
						keepLeaseForContinuation = true;
						yield* this.streamContinuation(
							repairRequest,
							aggregateUsage,
							state,
							validationRepairRounds + 1,
							emitPlanningSemantic
						);
						continue;
					}
					state.setPendingRead({ call, usage: aggregateUsage });
					keepLeaseForContinuation = true;
					if (emitPlanningSemantic) {
						yield buildPlanningStep(request, call.id);
					}
					yield buildReadToolStep(request.turnRunId, call);
					state.markReadRoundCompleted();
					continue;
				}
				if (finishedReason === 'tool_calls' || finishedReason === 'function_call') {
					throw providerError(
						request.toolChoice === 'none'
							? 'provider_tool_call_disabled'
							: 'provider_missing_tool_call',
						request.toolChoice === 'none' ? 'permanent' : 'unknown'
					);
				}
				if (!streamedText) {
					throw providerError('provider_no_assistant_text', 'permanent');
				}
				this.ports.capacity.markAvailable();
				yield { type: 'finish', finishedReason, usage: aggregateUsage };
			}
			if (!finished) throw providerError('provider_missing_done', 'unknown');
		} finally {
			if (!keepLeaseForContinuation) state.release();
		}
	}

	private async *streamSynthesis(
		request: ClientRequest,
		initialUsage: AgenticChatProviderUsageV1 | null,
		release: () => void
	): AsyncGenerator<AgenticChatProviderStepV1> {
		let finished = false;
		let streamedText = false;
		try {
			for await (const event of this.ports.client.stream(request)) {
				throwIfAborted(request.signal);
				if (finished) throw providerError('provider_event_after_done', 'unknown');
				if (event.type === 'text') {
					if (!event.content) throw providerError('provider_empty_text', 'unknown');
					streamedText = true;
					yield { type: 'text_delta', text: event.content };
					continue;
				}
				if (event.type === 'reasoning') continue;
				if (event.type === 'tool_call') {
					throw providerError('provider_additional_tool_round_disabled', 'permanent');
				}
				if (event.type === 'error') {
					if (event.retryable) {
						this.ports.capacity.markTemporarilyUnavailable(
							this.retryableFailureCooldownMs
						);
					}
					throw new AgenticChatProviderExecutionError(
						'provider_stream_error',
						event.retryable ? 'provider_throttle' : 'unknown',
						canonicalError(event.error)
					);
				}
				const finishedReason = canonicalFinishedReason(event.finishedReason);
				if (finishedReason === 'tool_calls' || finishedReason === 'function_call') {
					throw providerError('provider_additional_tool_round_disabled', 'permanent');
				}
				if (!streamedText) {
					throw providerError('provider_no_assistant_text', 'permanent');
				}
				finished = true;
				this.ports.capacity.markAvailable();
				yield {
					type: 'finish',
					finishedReason,
					usage: combineUsage(initialUsage, normalizeUsage(event.usage))
				};
			}
			if (!finished) throw providerError('provider_missing_done', 'unknown');
		} finally {
			release();
		}
	}
}

function createToolCallAccumulator(): {
	seen: boolean;
	id: string;
	name: string;
	argumentsText: string;
} {
	return { seen: false, id: '', name: '', argumentsText: '' };
}

function appendToolCallDelta(
	state: ReturnType<typeof createToolCallAccumulator>,
	value: unknown
): void {
	if (!Array.isArray(value) || value.length !== 1) {
		throw providerError('provider_tool_call_count_exceeded', 'permanent');
	}
	const delta = requireRecord(value[0], 'provider tool-call delta');
	if (delta.index !== undefined && delta.index !== 0) {
		throw providerError('provider_tool_call_count_exceeded', 'permanent');
	}
	state.seen = true;
	if (delta.id !== undefined) {
		const id = canonicalRequiredText(delta.id, 'provider tool-call id');
		if (id.length > 512 || (state.id && state.id !== id)) {
			throw providerError('provider_tool_call_id_invalid', 'permanent');
		}
		state.id = id;
	}
	if (delta.type !== undefined && delta.type !== 'function') {
		throw providerError('provider_tool_call_type_invalid', 'permanent');
	}
	if (delta.function !== undefined) {
		const fn = requireRecord(delta.function, 'provider tool-call function');
		if (fn.name !== undefined) {
			if (typeof fn.name !== 'string' || fn.name.length === 0) {
				throw providerError('provider_tool_name_invalid', 'permanent');
			}
			state.name += fn.name;
			if (state.name.length > 256) {
				throw providerError('provider_tool_name_invalid', 'permanent');
			}
		}
		if (fn.arguments !== undefined) {
			if (typeof fn.arguments !== 'string') {
				throw providerError('provider_tool_arguments_invalid', 'permanent');
			}
			state.argumentsText += fn.arguments;
			if (Buffer.byteLength(state.argumentsText, 'utf8') > 64 * 1024) {
				throw providerError('provider_tool_arguments_too_large', 'permanent');
			}
		}
	}
}

function completeToolCall(
	state: ReturnType<typeof createToolCallAccumulator>
): CompletedProviderToolCall | null {
	if (!state.seen) return null;
	if (!state.id || !state.name || state.name !== state.name.trim()) {
		throw providerError('provider_tool_call_incomplete', 'permanent');
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(state.argumentsText || '{}');
	} catch {
		throw providerError('provider_tool_arguments_invalid', 'permanent');
	}
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw providerError('provider_tool_arguments_invalid', 'permanent');
	}
	const canonicalArguments = canonicalizeAgenticChatJson(parsed as JsonValue);
	return {
		id: state.id,
		name: state.name,
		arguments: JSON.parse(canonicalArguments) as JsonObject,
		canonicalArguments
	};
}

function assertAllowlistedCall(
	call: CompletedProviderToolCall,
	tools: readonly AgenticChatReadOnlyProviderToolV1[]
): void {
	if (!tools.some((tool) => tool.function.name === call.name)) {
		throw providerError('provider_tool_not_allowlisted', 'permanent');
	}
}

function validateReadFeedback(
	call: CompletedProviderToolCall,
	feedback: AgenticChatProviderReadSynthesisInputV1
): void {
	if (
		feedback.providerToolCallId !== call.id ||
		feedback.toolName !== call.name ||
		canonicalizeAgenticChatJson(feedback.arguments as JsonValue) !== call.canonicalArguments
	) {
		throw providerError('provider_read_feedback_mismatch', 'unknown');
	}
	canonicalizeAgenticChatJson(feedback.execution.result as JsonValue);
}

function completedProviderCallToChatToolCall(call: CompletedProviderToolCall): ChatToolCall {
	return {
		id: call.id,
		type: 'function',
		function: { name: call.name, arguments: call.canonicalArguments }
	};
}

function buildPlanningStep(
	request: ClientRequest,
	providerToolCallId: string
): Extract<AgenticChatProviderStepV1, { type: 'semantic' }> {
	return {
		type: 'semantic',
		transitionId: createStableAgenticChatReadToolTransitionIdV1({
			turnRunId: request.turnRunId,
			providerToolCallId,
			stage: 'planning'
		}),
		phase: 'stream',
		eventType: 'agent_state',
		currentActivity: 'Planning the first step...',
		eventPayload: {
			type: 'agent_state',
			state: 'thinking',
			contextType: request.contextType,
			details: 'Planning the first step...',
			activity_visibility: 'activity_log'
		}
	};
}

function buildReadToolStep(
	turnRunId: string,
	call: CompletedProviderToolCall
): Extract<AgenticChatProviderStepV1, { type: 'read_tool' }> {
	return {
		type: 'read_tool',
		callTransitionId: createStableAgenticChatReadToolTransitionIdV1({
			turnRunId,
			providerToolCallId: call.id,
			stage: 'call'
		}),
		resultTransitionId: createStableAgenticChatReadToolTransitionIdV1({
			turnRunId,
			providerToolCallId: call.id,
			stage: 'result'
		}),
		providerToolCallId: call.id,
		toolName: call.name,
		arguments: call.arguments
	};
}

function buildContinuationRequest(
	request: ClientRequest,
	call: CompletedProviderToolCall,
	feedback: AgenticChatProviderReadSynthesisInputV1
): ClientRequest {
	const toolCall = completedProviderCallToChatToolCall(call);
	const modelPayload = buildToolPayloadForModel(
		toolCall,
		{
			tool_call_id: call.id,
			result: feedback.execution.result,
			success: true,
			duration_ms: feedback.execution.executionTimeMs ?? undefined,
			tokens_consumed: feedback.execution.tokensConsumed ?? undefined,
			requires_user_action: feedback.execution.requiresUserAction ?? undefined
		},
		parseToolArguments
	);
	return {
		...request,
		providerRound: 'synthesis',
		messages: [
			...request.messages,
			{
				role: 'assistant',
				content: '',
				tool_calls: [
					{
						id: call.id,
						type: 'function',
						function: { name: call.name, arguments: call.canonicalArguments }
					}
				]
			},
			{
				role: 'tool',
				content: canonicalizeAgenticChatJson(modelPayload as JsonValue),
				tool_call_id: call.id
			}
		],
		tools: request.tools,
		toolChoice: request.tools.length > 0 ? 'auto' : 'none'
	};
}

function validateCompletedProviderCall(
	call: CompletedProviderToolCall,
	request: ClientRequest
): ToolValidationIssue[] {
	return validateToolCalls(
		[completedProviderCallToChatToolCall(call)],
		Array.from(request.tools) as unknown as ChatToolDefinition[],
		{
			projectId:
				typeof request.projectId === 'string' &&
				CANONICAL_UUID_PATTERN.test(request.projectId)
					? request.projectId
					: null
		}
	);
}

function buildValidationRepairRequest(
	request: ClientRequest,
	call: CompletedProviderToolCall,
	issues: ToolValidationIssue[]
): ClientRequest {
	const fieldErrors = issues.flatMap((issue) => issue.errors);
	const error = `Tool validation failed: ${fieldErrors.join(' ')}`;
	const issueOp = issues.find((issue) => issue.op)?.op;
	const validationPayload: JsonObject = {
		error,
		details: { field_errors: fieldErrors }
	};
	if (issueOp) {
		validationPayload.op = issueOp;
		validationPayload.help_path = issueOp;
	}
	return appendSystemInstruction(
		{
			...request,
			providerRound: 'synthesis',
			messages: [
				...request.messages,
				{
					role: 'assistant',
					content: '',
					tool_calls: [
						{
							id: call.id,
							type: 'function',
							function: { name: call.name, arguments: call.canonicalArguments }
						}
					]
				},
				{
					role: 'tool',
					content: canonicalizeAgenticChatJson(validationPayload),
					tool_call_id: call.id
				}
			],
			tools: request.tools,
			toolChoice: request.tools.length > 0 ? 'auto' : 'none'
		},
		buildToolValidationRepairInstruction(issues, false)
	);
}

function appendSystemInstruction(request: ClientRequest, content: string): ClientRequest {
	return {
		...request,
		messages: [...request.messages, { role: 'system', content }]
	};
}

function buildSynthesisRequest(
	request: ClientRequest,
	call: CompletedProviderToolCall,
	feedback: AgenticChatProviderReadSynthesisInputV1
): ClientRequest {
	return {
		...request,
		providerRound: 'synthesis',
		messages: [
			...request.messages,
			{
				role: 'assistant',
				content: '',
				tool_calls: [
					{
						id: call.id,
						type: 'function',
						function: { name: call.name, arguments: call.canonicalArguments }
					}
				]
			},
			{
				role: 'tool',
				content: canonicalizeAgenticChatJson(feedback.execution.result as JsonValue),
				tool_call_id: call.id
			}
		],
		tools: [],
		toolChoice: 'none'
	};
}

function combineUsage(
	initial: AgenticChatProviderUsageV1 | null,
	synthesis: AgenticChatProviderUsageV1 | null
): AgenticChatProviderUsageV1 | null {
	if (!initial || !synthesis) return null;
	const promptTokens = initial.promptTokens + synthesis.promptTokens;
	const completionTokens = initial.completionTokens + synthesis.completionTokens;
	const totalTokens = initial.totalTokens + synthesis.totalTokens;
	if (![promptTokens, completionTokens, totalTokens].every(Number.isSafeInteger)) {
		throw providerError('provider_aggregate_usage_invalid', 'unknown');
	}
	return { promptTokens, completionTokens, totalTokens };
}

function buildPromptSnapshot(
	messages: readonly AgenticChatReadOnlyProviderMessageV1[]
): NonNullable<AgenticChatPreparedProviderInvocationV1['promptSnapshot']> {
	const canonical = canonicalizeAgenticChatJson(messages as unknown as JsonValue);
	const modelMessages = JSON.parse(canonical) as JsonObject[];
	const systemPrompt = modelMessages[0]?.content;
	if (typeof systemPrompt !== 'string' || systemPrompt.length === 0) {
		throw providerError('provider_snapshot_system_prompt_invalid', 'permanent');
	}
	return {
		snapshotVersion: AGENTIC_CHAT_WORKER_PROMPT_SNAPSHOT_VERSION,
		modelMessages,
		systemPromptSha256: sha256(systemPrompt),
		messagesSha256: sha256(canonical),
		systemPromptChars: systemPrompt.length,
		messageChars: modelMessages.reduce(
			(total, message) =>
				total + (typeof message.content === 'string' ? message.content.length : 0),
			0
		),
		approxPromptTokens: modelMessages.reduce(
			(total, message) =>
				total +
				(typeof message.content === 'string' ? Math.ceil(message.content.length / 4) : 0),
			0
		)
	};
}

function sha256(value: string): string {
	return createHash('sha256').update(value, 'utf8').digest('hex');
}

function buildReadOnlyRequest(
	input: AgenticChatWorkerExecutionInputV1,
	processingToken: string,
	signal: AbortSignal
): Parameters<AgenticChatReadOnlyProviderClientPortV1['stream']>[0] {
	const systemPrompt = requiredContent(input.artifact.prepared.systemPrompt, 'system prompt');
	const userMessage = requiredContent(input.requestPayload.message, 'user message');
	const attachments = input.requestPayload.attachments;
	if (!Array.isArray(attachments) || attachments.length !== 0) {
		throw new AgenticChatProviderExecutionError(
			'attachments_disabled',
			'permanent',
			'Attachments are disabled for the Phase 3 read-only provider slice'
		);
	}

	const messages: AgenticChatReadOnlyProviderMessageV1[] = [
		{ role: 'system', content: systemPrompt }
	];
	for (const history of input.artifact.history) {
		if (history.attachments.length !== 0) {
			throw new AgenticChatProviderExecutionError(
				'history_attachments_disabled',
				'permanent',
				'History attachments are disabled for the Phase 3 read-only provider slice'
			);
		}
		const message: AgenticChatReadOnlyProviderMessageV1 = {
			role: history.role,
			content: history.content
		};
		if (history.toolCalls.length > 0) message.tool_calls = history.toolCalls;
		if (history.toolCallId) message.tool_call_id = history.toolCallId;
		messages.push(message);
	}
	messages.push({ role: 'user', content: userMessage });

	const context = requireRecord(input.requestPayload.context, 'request context');
	const contextType = canonicalRequiredText(context.type, 'context type');
	const tools = productionReadToolsFor(input);
	return {
		messages,
		tools,
		toolChoice: tools.length > 0 ? 'auto' : 'none',
		userId: input.claim.userId,
		sessionId: input.claim.sessionId,
		turnRunId: input.claim.turnRunId,
		streamRunId: input.streamRunId,
		clientTurnId: input.clientTurnId,
		contextType,
		entityId: nullableString(context.entityId, 'context entity id'),
		projectId: nullableString(context.projectId, 'context project id'),
		queueJobId: input.claim.queueJobId,
		processingToken,
		executionGeneration: input.claim.executionGeneration,
		providerRound: 'initial',
		signal
	};
}

function productionReadToolsFor(
	input: AgenticChatWorkerExecutionInputV1
): readonly AgenticChatReadOnlyProviderToolV1[] {
	const surface = input.artifact.prepared.toolSurface;
	if (!surface || typeof surface !== 'object' || Array.isArray(surface)) return [];
	const record = surface as Record<string, unknown>;
	if (!Array.isArray(record.toolNames) || !Array.isArray(record.definitions)) return [];

	const selectedNames = new Set(
		record.toolNames.filter(
			(name): name is string =>
				typeof name === 'string' && name === name.trim() && name.length > 0
		)
	);
	const seen = new Set<string>();
	const tools: AgenticChatReadOnlyProviderToolV1[] = [];
	for (const definition of record.definitions) {
		const tool = readArtifactToolDefinition(definition);
		if (
			!tool ||
			!selectedNames.has(tool.function.name) ||
			!isAgenticChatProductionReadToolNameV1(tool.function.name) ||
			seen.has(tool.function.name)
		) {
			continue;
		}
		seen.add(tool.function.name);
		tools.push(tool);
	}
	return tools;
}

function readArtifactToolDefinition(value: unknown): AgenticChatReadOnlyProviderToolV1 | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const record = value as Record<string, unknown>;
	if (record.type !== 'function' || !record.function || typeof record.function !== 'object') {
		return null;
	}
	const fn = record.function as Record<string, unknown>;
	if (
		typeof fn.name !== 'string' ||
		fn.name !== fn.name.trim() ||
		fn.name.length === 0 ||
		fn.name.length > 256 ||
		typeof fn.description !== 'string' ||
		fn.description.trim().length === 0 ||
		!fn.parameters ||
		typeof fn.parameters !== 'object' ||
		Array.isArray(fn.parameters) ||
		(fn.parameters as Record<string, unknown>).type !== 'object'
	) {
		return null;
	}
	try {
		const parameters = JSON.parse(
			canonicalizeAgenticChatJson(fn.parameters as JsonValue)
		) as JsonObject;
		return {
			type: 'function',
			function: {
				name: fn.name,
				description: fn.description,
				parameters
			}
		};
	} catch {
		return null;
	}
}

function normalizeUsage(
	value: Extract<AgenticChatReadOnlyProviderClientEventV1, { type: 'done' }>['usage']
): AgenticChatProviderUsageV1 | null {
	if (!value) return null;
	const promptTokens = value.promptTokens ?? value.prompt_tokens;
	const completionTokens = value.completionTokens ?? value.completion_tokens;
	const totalTokens = value.totalTokens ?? value.total_tokens;
	if (
		!nonnegativeInteger(promptTokens) ||
		!nonnegativeInteger(completionTokens) ||
		!nonnegativeInteger(totalTokens) ||
		totalTokens !== promptTokens + completionTokens
	) {
		throw providerError('provider_invalid_usage', 'unknown');
	}
	return { promptTokens, completionTokens, totalTokens };
}

function canonicalFinishedReason(value: string | undefined): string {
	if (value === undefined) return 'stop';
	return canonicalRequiredText(value, 'finished reason').slice(0, 256);
}

function canonicalRequiredText(value: unknown, label: string): string {
	if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
		throw new AgenticChatProviderExecutionError(
			`invalid_${label.replaceAll(' ', '_')}`,
			'permanent',
			`Agentic Chat ${label} is invalid`
		);
	}
	return value;
}

function requiredContent(value: unknown, label: string): string {
	if (typeof value !== 'string' || value.length === 0) {
		throw new AgenticChatProviderExecutionError(
			`invalid_${label.replaceAll(' ', '_')}`,
			'permanent',
			`Agentic Chat ${label} is invalid`
		);
	}
	return value;
}

function nullableString(value: unknown, label: string): string | null {
	if (value === null || value === undefined) return null;
	return canonicalRequiredText(value, label);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new AgenticChatProviderExecutionError(
			`invalid_${label.replaceAll(' ', '_')}`,
			'permanent',
			`Agentic Chat ${label} is invalid`
		);
	}
	return value as Record<string, unknown>;
}

function nonnegativeInteger(value: unknown): value is number {
	return Number.isSafeInteger(value) && (value as number) >= 0;
}

function canonicalError(value: string): string {
	return value.trim().slice(0, 2_000) || 'Agentic Chat provider failed';
}

function providerError(code: string, failureClass: 'permanent' | 'unknown') {
	return new AgenticChatProviderExecutionError(
		code,
		failureClass,
		`Agentic Chat read-only provider protocol failed: ${code}`
	);
}

function workerReadOpForToolName(toolName: string): string {
	const exceptions: Readonly<Record<string, string>> = {
		search_all_projects: 'x.search.all_projects',
		search_project: 'x.search.project',
		search_ontology: 'onto.search',
		get_document_tree: 'onto.document.tree.get',
		get_document_path: 'onto.document.path.get',
		list_task_documents: 'onto.task.docs.list',
		get_onto_project_graph: 'onto.project.graph.get',
		get_field_info: 'util.schema.field_info',
		get_workspace_overview: 'util.workspace.overview',
		get_project_overview: 'util.project.overview'
	};
	const exception = exceptions[toolName];
	if (exception) return exception;

	const match = /^(list|search|get|create|update|delete)_(?:onto_)?(.+)$/.exec(toolName);
	if (!match) return `x.misc.${toolName}`;
	const action = match[1]!;
	const rawEntity = match[2]!.replace(/_details$/, '');
	const singularEntities: Readonly<Record<string, string>> = {
		projects: 'project',
		tasks: 'task',
		goals: 'goal',
		plans: 'plan',
		documents: 'document',
		milestones: 'milestone',
		risks: 'risk'
	};
	return `onto.${singularEntities[rawEntity] ?? rawEntity}.${action}`;
}

function throwIfAborted(signal: AbortSignal): void {
	if (!signal.aborted) return;
	throw signal.reason instanceof Error ? signal.reason : new Error('Execution aborted');
}
