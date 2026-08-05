// apps/worker/src/workers/agentic-chat/readOnlyProvider.ts

import { createHash } from 'node:crypto';
import {
	type JsonObject,
	type JsonValue,
	canonicalizeAgenticChatJson
} from '@buildos/shared-types';
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
import { AGENTIC_CHAT_PRODUCTION_READ_TOOLS_V1 } from './readOnlyTool';

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
 * The reviewed surface contains at most one read-only project-status call.
 * Mutating tools are absent, the second pass always sends `toolChoice: none`,
 * and no third provider pass exists.
 */
export class AgenticChatReadOnlyProviderAdapter implements AgenticChatProviderPortV1 {
	constructor(
		private readonly ports: {
			client: AgenticChatReadOnlyProviderClientPortV1;
			capacity: AgenticChatProviderCapacity;
		},
		private readonly retryableFailureCooldownMs = 2_000
	) {
		if (
			!Number.isSafeInteger(retryableFailureCooldownMs) ||
			retryableFailureCooldownMs < 1 ||
			retryableFailureCooldownMs > 60_000
		) {
			throw new Error('Read-only provider cooldown must be between 1ms and 60000ms');
		}
	}

	prepare(input: AgenticChatProviderInputV1): Promise<AgenticChatPreparedProviderInvocationV1> {
		return Promise.resolve().then(() => this.prepareInvocation(input));
	}

	private prepareInvocation(
		input: AgenticChatProviderInputV1
	): AgenticChatPreparedProviderInvocationV1 {
		throwIfAborted(input.signal);
		const request = buildReadOnlyRequest(input.executionInput, input.signal);
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
		let pendingRead: PendingReadRound | null = null;
		let readRoundCompleted = false;
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
				validateReadFeedback(pendingRead.call, feedback);
				synthesized = true;
				return this.streamSynthesis(
					buildSynthesisRequest(request, pendingRead.call, feedback),
					pendingRead.usage,
					release
				);
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
					state.setPendingRead({ call, usage: normalizeUsage(event.usage) });
					keepLeaseForSynthesis = true;
					yield {
						type: 'semantic',
						transitionId: createStableAgenticChatReadToolTransitionIdV1({
							turnRunId: request.turnRunId,
							providerToolCallId: call.id,
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
					yield {
						type: 'read_tool',
						callTransitionId: createStableAgenticChatReadToolTransitionIdV1({
							turnRunId: request.turnRunId,
							providerToolCallId: call.id,
							stage: 'call'
						}),
						resultTransitionId: createStableAgenticChatReadToolTransitionIdV1({
							turnRunId: request.turnRunId,
							providerToolCallId: call.id,
							stage: 'result'
						}),
						providerToolCallId: call.id,
						toolName: call.name,
						arguments: call.arguments
					};
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

	private async *streamSynthesis(
		request: ClientRequest,
		initialUsage: AgenticChatProviderUsageV1 | null,
		release: () => void
	): AsyncGenerator<AgenticChatProviderStepV1> {
		let finished = false;
		try {
			for await (const event of this.ports.client.stream(request)) {
				throwIfAborted(request.signal);
				if (finished) throw providerError('provider_event_after_done', 'unknown');
				if (event.type === 'text') {
					if (!event.content) throw providerError('provider_empty_text', 'unknown');
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
	if (tools.length !== 1 || tools[0]?.function.name !== call.name) {
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

function buildSynthesisRequest(
	request: ClientRequest,
	call: CompletedProviderToolCall,
	feedback: AgenticChatProviderReadSynthesisInputV1
): ClientRequest {
	return {
		...request,
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
		toolChoice: tools.length === 1 ? 'auto' : 'none',
		userId: input.claim.userId,
		sessionId: input.claim.sessionId,
		turnRunId: input.claim.turnRunId,
		streamRunId: input.streamRunId,
		clientTurnId: input.clientTurnId,
		contextType,
		entityId: nullableString(context.entityId, 'context entity id'),
		projectId: nullableString(context.projectId, 'context project id'),
		signal
	};
}

function productionReadToolsFor(
	input: AgenticChatWorkerExecutionInputV1
): readonly AgenticChatReadOnlyProviderToolV1[] {
	const surface = input.artifact.prepared.toolSurface;
	if (!surface || typeof surface !== 'object' || Array.isArray(surface)) return [];
	const names = (surface as Record<string, unknown>).toolNames;
	const allowlistedName = AGENTIC_CHAT_PRODUCTION_READ_TOOLS_V1[0].function.name;
	if (!Array.isArray(names) || !names.includes(allowlistedName)) return [];
	return JSON.parse(
		canonicalizeAgenticChatJson(AGENTIC_CHAT_PRODUCTION_READ_TOOLS_V1 as unknown as JsonValue)
	) as AgenticChatReadOnlyProviderToolV1[];
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

function throwIfAborted(signal: AbortSignal): void {
	if (!signal.aborted) return;
	throw signal.reason instanceof Error ? signal.reason : new Error('Execution aborted');
}
