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
	type AgenticChatProviderUsageV1
} from './providerContract';
import { AgenticChatProviderCapacity, AgenticChatProviderCapacityError } from './providerCapacity';

export type AgenticChatReadOnlyProviderMessageV1 = {
	role: 'system' | 'user' | 'assistant' | 'tool';
	content: string;
	tool_calls?: JsonObject[];
	tool_call_id?: string;
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
		toolChoice: 'none';
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

/**
 * Default-off Phase 3 provider boundary. Preparation validates the immutable
 * command and reserves local provider capacity; its returned stream performs
 * the first network call only after the executor wins execution-start.
 *
 * The initial surface deliberately sends `toolChoice: none` and rejects every
 * attachment. Read-only tools can be added only through a separately reviewed
 * tool-loop adapter; mutating tools are unreachable here.
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
				return this.streamPrepared(request, release);
			},
			release
		};
	}

	private async *streamPrepared(
		request: Parameters<AgenticChatReadOnlyProviderClientPortV1['stream']>[0],
		release: () => void
	): AsyncGenerator<
		| { type: 'text_delta'; text: string }
		| { type: 'finish'; finishedReason: string; usage: AgenticChatProviderUsageV1 | null }
	> {
		let finished = false;
		try {
			for await (const event of this.ports.client.stream(request)) {
				throwIfAborted(request.signal);
				if (finished) {
					throw providerError('provider_event_after_done', 'unknown');
				}
				if (event.type === 'text') {
					if (!event.content) throw providerError('provider_empty_text', 'unknown');
					yield { type: 'text_delta', text: event.content };
					continue;
				}
				if (event.type === 'reasoning') {
					// Reasoning remains private and never enters assistant text or the
					// public event stream in the thin read-only slice.
					continue;
				}
				if (event.type === 'tool_call') {
					throw providerError('provider_tool_call_disabled', 'permanent');
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
					throw providerError('provider_tool_call_disabled', 'permanent');
				}
				finished = true;
				this.ports.capacity.markAvailable();
				yield {
					type: 'finish',
					finishedReason,
					usage: normalizeUsage(event.usage)
				};
			}
			if (!finished) throw providerError('provider_missing_done', 'unknown');
		} finally {
			release();
		}
	}
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
	return {
		messages,
		toolChoice: 'none',
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
