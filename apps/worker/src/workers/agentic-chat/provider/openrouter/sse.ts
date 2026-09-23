// apps/worker/src/workers/agentic-chat/provider/openrouter/sse.ts
// Pure SSE frame decoding and the name-level tool-call shadow that lets the
// durable attempt receipt name a rejected or truncated tool call.
import { normalizeStreamingContent } from '@buildos/smart-llm';
import type { JsonObject } from '@buildos/shared-types';
import type { AgenticChatTurnProviderClientEventV1 } from '../contracts';
import { isToolArgumentsTextTruncated } from '../stream-tool-calls';
import type { ClientInput, ObservedToolCall, StreamState } from './types';
import {
	canonicalOptionalText,
	canonicalRequiredText,
	normalizeProviderSlug,
	requireRecord
} from './canonical';
import { AgenticChatProviderNetworkError } from './errors';
import { providerFrameError } from './retry';

const REJECTED_TOOL_NAME_PATTERN = /^[A-Za-z0-9_.:-]{1,256}$/;
// Mirrors the consumer's accumulator bounds; past them the consumer rejects the
// pass without a name-level diagnostic, so the receipt must stay silent too.
const MAX_OBSERVED_TOOL_CALLS = 40;
const MAX_OBSERVED_TOOL_NAME_CHARS = 256;
const MAX_OBSERVED_TOOL_ARGUMENT_BYTES = 64 * 1024;

export function parseSseLine(
	line: string,
	state: StreamState
): { events: AgenticChatTurnProviderClientEventV1[]; done: boolean } {
	const normalized = line.endsWith('\r') ? line.slice(0, -1) : line;
	if (!normalized.trim() || normalized.startsWith(':')) return { events: [], done: false };
	if (!normalized.startsWith('data:')) return { events: [], done: false };
	const payload = normalized.slice(5).trimStart();
	if (payload === '[DONE]') return { events: [], done: true };

	let value: unknown;
	try {
		value = JSON.parse(payload);
	} catch {
		throw new AgenticChatProviderNetworkError(
			'Agentic Chat provider returned malformed SSE JSON',
			false
		);
	}
	const chunk = requireRecord(value, 'provider chunk');
	const routerAttempt = lastOpenRouterAttempt(chunk.openrouter_metadata);
	state.requestId = canonicalOptionalText(chunk.id) ?? state.requestId;
	state.modelUsed =
		canonicalOptionalText(routerAttempt?.model) ??
		canonicalOptionalText(chunk.model) ??
		state.modelUsed;
	state.provider =
		canonicalOptionalText(routerAttempt?.provider) ??
		canonicalOptionalText(chunk.provider) ??
		state.provider;
	state.providerSlug =
		canonicalOptionalText(chunk.provider_slug) ??
		normalizeProviderSlug(state.provider) ??
		state.providerSlug;
	if (chunk.error !== undefined && chunk.error !== null) {
		const error = providerFrameError(chunk.error);
		throw new AgenticChatProviderNetworkError(error.message, error.retryable);
	}
	if (chunk.usage !== undefined && chunk.usage !== null) state.rawUsage = chunk.usage;

	const choices = chunk.choices;
	if (choices === undefined || choices === null) return { events: [], done: false };
	if (!Array.isArray(choices)) {
		throw new AgenticChatProviderNetworkError(
			'Agentic Chat provider choices payload is malformed',
			false
		);
	}
	if (choices.length > 1) {
		throw new AgenticChatProviderNetworkError(
			'Agentic Chat provider returned more than one streamed choice',
			false
		);
	}
	const choice = choices[0];
	if (choice === undefined) return { events: [], done: false };
	const record = requireRecord(choice, 'provider choice');
	if (record.usage !== undefined && record.usage !== null) state.rawUsage = record.usage;
	if (record.finish_reason !== undefined && record.finish_reason !== null) {
		state.finishReason = canonicalRequiredText(record.finish_reason, 'finish reason', 256);
	}

	const events: AgenticChatTurnProviderClientEventV1[] = [];
	if (record.delta !== undefined && record.delta !== null) {
		const delta = requireRecord(record.delta, 'provider delta');
		// Reasoning deltas are not surfaced: the request sends
		// `reasoning.exclude`, and no consumer reads them. Their tokens are
		// still accounted from the usage receipt.
		if (delta.content !== undefined && delta.content !== null) {
			const normalizedContent = normalizeStreamingContent(
				delta.content,
				state.inThinkingBlock
			);
			state.inThinkingBlock = normalizedContent.inThinkingBlock;
			if (normalizedContent.text) {
				state.completionChars += normalizedContent.text.length;
				state.generatedBytes += Buffer.byteLength(normalizedContent.text, 'utf8');
				events.push({ type: 'text', content: normalizedContent.text });
			}
		}
		if (Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0) {
			state.completionChars += JSON.stringify(delta.tool_calls).length;
			for (const call of delta.tool_calls) {
				if (typeof call?.function?.arguments === 'string') {
					state.generatedBytes += Buffer.byteLength(call.function.arguments, 'utf8');
				}
			}
			observeToolCallDelta(state, delta.tool_calls);
			events.push({ type: 'tool_call', toolCall: delta.tool_calls });
		}
	}
	return { events, done: false };
}

/**
 * Lenient mirror of the consumer's `appendToolCallDelta`. Anything the consumer
 * would reject without a name-level diagnostic (malformed delta, oversized name
 * or arguments, too many calls) makes the pass unobservable here rather than
 * guessing; a non-string arguments delta is the consumer's `delta_type`
 * rejection and is recorded against the call's name.
 */
function observeToolCallDelta(state: StreamState, value: readonly unknown[]): void {
	if (!state.toolCallsObservable) return;
	const unobservable = (): void => {
		state.toolCallsObservable = false;
		state.toolCalls.clear();
	};
	for (let position = 0; position < value.length; position += 1) {
		const delta = value[position];
		if (!delta || typeof delta !== 'object' || Array.isArray(delta)) return unobservable();
		const record = delta as Record<string, unknown>;
		const index = record.index ?? (value.length === 1 ? 0 : position);
		if (
			typeof index !== 'number' ||
			!Number.isSafeInteger(index) ||
			index < 0 ||
			index >= MAX_OBSERVED_TOOL_CALLS
		) {
			return unobservable();
		}
		const call = state.toolCalls.get(index) ?? {
			name: '',
			argumentsText: '',
			argumentsRejected: false
		};
		if (record.function !== undefined) {
			const fn = record.function;
			if (!fn || typeof fn !== 'object' || Array.isArray(fn)) return unobservable();
			const { name, arguments: argumentsDelta } = fn as Record<string, unknown>;
			if (name !== undefined) {
				if (typeof name !== 'string') return unobservable();
				call.name += name;
				if (call.name.length > MAX_OBSERVED_TOOL_NAME_CHARS) return unobservable();
			}
			if (argumentsDelta !== undefined) {
				if (typeof argumentsDelta !== 'string') {
					call.argumentsRejected = true;
				} else if (!call.argumentsRejected) {
					call.argumentsText += argumentsDelta;
					if (
						Buffer.byteLength(call.argumentsText, 'utf8') >
						MAX_OBSERVED_TOOL_ARGUMENT_BYTES
					) {
						return unobservable();
					}
				}
			}
		}
		state.toolCalls.set(index, call);
	}
}

/**
 * The consumer accepts an assembled name that exactly matches an advertised
 * tool, or that is an exact repetition of one (some providers resend the whole
 * name per delta). Everything else is rejected as not allowlisted.
 */
function isAdvertisedToolName(name: string, advertised: readonly string[]): boolean {
	if (advertised.includes(name)) return true;
	return advertised.some(
		(candidate) =>
			candidate.length > 0 &&
			name.length > candidate.length &&
			name.length % candidate.length === 0 &&
			candidate.repeat(name.length / candidate.length) === name
	);
}

/**
 * Mirror of the consumer's `detectToolCallPassTruncation` over the shadow
 * accumulator: streamed calls with a non-tool-call finish reason, or arguments
 * that end mid-object. Silent when the pass was unobservable or no tool
 * surface was offered (the consumer rejects those calls as disabled, which is
 * permanent and must not be retried).
 */
export function observedToolCallTruncation(
	state: StreamState,
	input: ClientInput,
	finishedReason: string
): 'finish_reason' | 'arguments' | null {
	if (!state.toolCallsObservable || state.toolCalls.size === 0 || input.toolChoice === 'none') {
		return null;
	}
	if (finishedReason !== 'tool_calls' && finishedReason !== 'function_call') {
		return 'finish_reason';
	}
	for (const call of state.toolCalls.values()) {
		if (call.argumentsRejected) continue;
		if (isToolArgumentsTextTruncated(call.argumentsText)) return 'arguments';
	}
	return null;
}

function acceptsToolArguments(call: ObservedToolCall): boolean {
	if (call.argumentsRejected) return false;
	let parsed: unknown;
	try {
		parsed = JSON.parse(call.argumentsText || '{}');
	} catch {
		return false;
	}
	return Boolean(parsed) && typeof parsed === 'object' && !Array.isArray(parsed);
}

/**
 * Name-only receipt extension for a completed attempt whose streamed tool call
 * the consumer will reject: the first such call's name (when it is a bounded
 * identifier token) and the size of the advertised surface. Emits nothing when
 * every call is acceptable, when the pass could not be observed faithfully, or
 * when no tool surface was offered — that rejection is about the disabled
 * surface, not a name.
 */
export function rejectedToolCallPayload(state: StreamState, input: ClientInput): JsonObject {
	if (!state.toolCallsObservable || state.toolCalls.size === 0 || input.toolChoice === 'none') {
		return {};
	}
	const advertised = input.tools.map((tool) => tool.function.name);
	const rejected = [...state.toolCalls.entries()]
		.sort(([left], [right]) => left - right)
		.map(([, call]) => call)
		.find(
			(call) => !isAdvertisedToolName(call.name, advertised) || !acceptsToolArguments(call)
		);
	if (!rejected) return {};
	return {
		rejected_tool_name: REJECTED_TOOL_NAME_PATTERN.test(rejected.name) ? rejected.name : null,
		advertised_tool_count: input.tools.length
	};
}

function lastOpenRouterAttempt(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const attempts = (value as Record<string, unknown>).attempts;
	if (!Array.isArray(attempts)) return null;
	const lastAttempt = attempts.at(-1);
	return lastAttempt && typeof lastAttempt === 'object' && !Array.isArray(lastAttempt)
		? (lastAttempt as Record<string, unknown>)
		: null;
}
