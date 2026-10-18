// apps/worker/src/workers/agentic-chat/provider/openrouter/reasoning-replay.ts
// AGENTIC_CHAT_CONTINUATION_REASONING (audit 2026-10-17 S3): what a continuation
// pass does with the model's reasoning from earlier passes of the same turn.
//
// - `default`: today's behavior, byte for byte.
// - `replay`: an acting pass's streamed reasoning is held in memory for the rest
//   of the turn and sent back on that pass's assistant tool-call message. The
//   DeepSeek V4/V4.1 encoders keep `<think>` blocks for every assistant turn
//   when tools are declared and render a missing `reasoning_content` as an empty
//   `<think></think>`, so today every continuation sees its own earlier tool calls
//   with no thinking behind them. DeepSeek's API requires the reasoning back on
//   tool-call turns (400 otherwise); Together's V4 guide asks for the same.
// - `off_after_reads`: an acting continuation whose last tool round only read runs
//   with reasoning off (`{enabled:false}`, the reasoning-off recovery's form).
//
// Both variants act only on DeepSeek V4.1 Flash routes; any other model keeps
// today's request. Reasoning is never persisted, logged, or carried across user
// turns: it lives in this process for at most one turn's TTL and is attached
// only to assistant messages after the turn's user message whose tool-call ids
// this turn's passes produced.
import type { AgenticChatTurnProviderMessageV1 } from '../contracts';
import {
	isAgenticChatControlToolNameV1,
	isAgenticChatProductionReadToolNameV1
} from '../../tools/execution-adapter';
import { isActingOutputPass } from '../output-budget';
import type { AgenticChatOpenAiCompatibleRouteV1, ClientInput } from './types';
import { isV41FlashModel } from './watchdog';

export const AGENTIC_CHAT_CONTINUATION_REASONING_MODES = [
	'default',
	'replay',
	'off_after_reads'
] as const;
export type AgenticChatContinuationReasoningMode =
	(typeof AGENTIC_CHAT_CONTINUATION_REASONING_MODES)[number];

export function isAgenticChatContinuationReasoningMode(
	value: unknown
): value is AgenticChatContinuationReasoningMode {
	return (AGENTIC_CHAT_CONTINUATION_REASONING_MODES as readonly unknown[]).includes(value);
}

/**
 * One pass's captured reasoning bytes (text plus details). The runaway cutoff
 * stops a watched pass near 9k tokens (~36 KB of text, twice that with details);
 * a pass past this bound is not replayed rather than replayed truncated.
 */
const MAX_PASS_REASONING_BYTES = 160 * 1024;
/** Further passes of a turn past this are not recorded; earlier ones stay attached. */
const MAX_TURN_REPLAY_BYTES = 512 * 1024;
/** Longer than any turn (CHAT_WORKER_TIMEOUT_MS); stale turns expire on the next write. */
const TURN_REPLAY_TTL_MS = 10 * 60_000;
const MAX_REPLAY_TURNS = 64;
const REASONING_CONTENT_KEYS = ['text', 'summary', 'data'] as const;

/** Streamed reasoning of one physical attempt, built frame by frame. */
export type ReasoningCapture = {
	text: string;
	/** `reasoning_details` blocks merged by `index`, content concatenated in order. */
	details: Map<number, Record<string, unknown>>;
	/** Streamed tool-call ids by tool-call index. */
	toolCallIds: Map<number, string>;
	bytes: number;
	overflow: boolean;
};

/** The reasoning one completed pass returned, in the shapes OpenRouter streamed it. */
export type ReplayedReasoning = Readonly<{
	reasoning?: string;
	reasoning_details?: readonly Readonly<Record<string, unknown>>[];
	bytes: number;
}>;

/** Whether this request runs the replay variant at all (and so attaches reasoning). */
export function replaysReasoning(
	mode: AgenticChatContinuationReasoningMode | undefined,
	input: ClientInput,
	route: Pick<AgenticChatOpenAiCompatibleRouteV1, 'kind' | 'model'>
): boolean {
	return (
		mode === 'replay' &&
		route.kind === 'openrouter' &&
		isV41FlashModel(route.model) &&
		isActingOutputPass(input) &&
		// An explicit effort (`none` recovery, `low` workflow) keeps today's request.
		input.reasoningEffort === undefined
	);
}

/** Whether this attempt streams its reasoning so it can be replayed later in the turn. */
export function capturesReasoning(
	mode: AgenticChatContinuationReasoningMode | undefined,
	input: ClientInput,
	route: Pick<AgenticChatOpenAiCompatibleRouteV1, 'kind' | 'model'>
): boolean {
	return replaysReasoning(mode, input, route) && input.toolChoice !== 'none';
}

/**
 * Whether this acting continuation follows a tool round that only read, so the
 * `off_after_reads` variant runs it with reasoning off. Judged from structured
 * request facts only: the pass role, and the tool names of the latest assistant
 * tool-call message of this turn. The opening pass, repairs, reviewers, forced
 * synthesis, passes after writes or control tools, and any pass with an
 * explicit effort keep today's settings.
 */
export function reasoningOffAfterReads(
	mode: AgenticChatContinuationReasoningMode | undefined,
	input: ClientInput,
	model: string
): boolean {
	return (
		mode === 'off_after_reads' &&
		isV41FlashModel(model) &&
		(input.passRole ?? 'acting') === 'acting' &&
		input.providerRound === 'synthesis' &&
		input.reasoningEffort === undefined &&
		lastToolRoundIsReadOnly(input.messages)
	);
}

/** The reasoning effort this attempt actually runs with, for the request and its receipt. */
export function effectiveReasoningEffort(
	mode: AgenticChatContinuationReasoningMode | undefined,
	input: ClientInput,
	model: string
): ClientInput['reasoningEffort'] {
	return reasoningOffAfterReads(mode, input, model) ? 'none' : input.reasoningEffort;
}

/** First index after the turn's user message; the turn's own tool loop follows it. */
function currentTurnStart(messages: readonly AgenticChatTurnProviderMessageV1[]): number {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		if (messages[index]?.role === 'user') return index + 1;
	}
	// No user message: nothing is provably this turn's.
	return messages.length;
}

function toolCallName(call: unknown): unknown {
	const fn = (call as { function?: unknown } | null)?.function;
	return fn && typeof fn === 'object' ? (fn as { name?: unknown }).name : undefined;
}

function lastToolRoundIsReadOnly(messages: readonly AgenticChatTurnProviderMessageV1[]): boolean {
	const start = currentTurnStart(messages);
	let sawToolResult = false;
	for (let index = messages.length - 1; index >= start; index -= 1) {
		const message = messages[index]!;
		if (message.role === 'tool') {
			sawToolResult = true;
			continue;
		}
		// Worker notes appended after the results (evidence coverage, budgets).
		if (message.role === 'system') continue;
		if (message.role !== 'assistant' || !message.tool_calls?.length) return false;
		return (
			sawToolResult &&
			message.tool_calls.every((call) => {
				const name = toolCallName(call);
				return (
					isAgenticChatProductionReadToolNameV1(name) &&
					!isAgenticChatControlToolNameV1(name)
				);
			})
		);
	}
	return false;
}

export function createReasoningCapture(): ReasoningCapture {
	return { text: '', details: new Map(), toolCallIds: new Map(), bytes: 0, overflow: false };
}

function addBytes(capture: ReasoningCapture, value: string): void {
	capture.bytes += Buffer.byteLength(value, 'utf8');
	if (capture.bytes > MAX_PASS_REASONING_BYTES) {
		capture.overflow = true;
		capture.text = '';
		capture.details.clear();
	}
}

/** Accumulate one SSE delta's reasoning (`reasoning` text and `reasoning_details`). */
export function captureReasoningDelta(
	capture: ReasoningCapture,
	delta: Record<string, unknown>
): void {
	if (capture.overflow) return;
	const text =
		typeof delta.reasoning === 'string'
			? delta.reasoning
			: typeof delta.reasoning_content === 'string'
				? delta.reasoning_content
				: '';
	if (text) {
		capture.text += text;
		addBytes(capture, text);
	}
	if (!Array.isArray(delta.reasoning_details)) return;
	delta.reasoning_details.forEach((detail: unknown, position: number) => {
		if (capture.overflow || !detail || typeof detail !== 'object' || Array.isArray(detail)) {
			return;
		}
		const record = detail as Record<string, unknown>;
		const index =
			typeof record.index === 'number' && Number.isSafeInteger(record.index)
				? record.index
				: position;
		const merged = capture.details.get(index) ?? {};
		for (const [key, value] of Object.entries(record)) {
			if (value === undefined || value === null) continue;
			if ((REASONING_CONTENT_KEYS as readonly string[]).includes(key)) {
				if (typeof value !== 'string') continue;
				merged[key] = (typeof merged[key] === 'string' ? merged[key] : '') + value;
				addBytes(capture, value);
			} else {
				merged[key] = value;
			}
		}
		if (!capture.overflow) capture.details.set(index, merged);
	});
}

/** Record streamed tool-call ids by index (same index rule as the consumer's accumulator). */
export function captureToolCallIds(capture: ReasoningCapture, toolCalls: readonly unknown[]): void {
	toolCalls.forEach((call, position) => {
		if (!call || typeof call !== 'object' || Array.isArray(call)) return;
		const record = call as Record<string, unknown>;
		const index = record.index ?? (toolCalls.length === 1 ? 0 : position);
		if (typeof index !== 'number' || typeof record.id !== 'string' || !record.id) return;
		capture.toolCallIds.set(index, record.id);
	});
}

/**
 * The replayable reasoning of a completed pass, keyed by its tool-call ids in
 * call order; null when there is nothing to replay or the ids are incomplete.
 */
export function completedReasoning(
	capture: ReasoningCapture,
	toolCallIndexes: readonly number[]
): { toolCallIds: string[]; replay: ReplayedReasoning } | null {
	if (capture.overflow || toolCallIndexes.length === 0) return null;
	if (!capture.text && capture.details.size === 0) return null;
	const toolCallIds: string[] = [];
	for (const index of [...toolCallIndexes].sort((left, right) => left - right)) {
		const id = capture.toolCallIds.get(index);
		if (!id) return null;
		toolCallIds.push(id);
	}
	const details = [...capture.details.entries()]
		.sort(([left], [right]) => left - right)
		.map(([, detail]) => Object.freeze({ ...detail }));
	return {
		toolCallIds,
		replay: Object.freeze({
			...(capture.text ? { reasoning: capture.text } : {}),
			...(details.length > 0 ? { reasoning_details: Object.freeze(details) } : {}),
			bytes: capture.bytes
		})
	};
}

type TurnReplay = {
	byToolCallId: Map<string, ReplayedReasoning | 'ambiguous'>;
	bytes: number;
	updatedAtMs: number;
};

/**
 * In-memory, per-turn reasoning for the replay variant. A recorded pass is
 * immutable, so every later request of the turn sends the same bytes and the
 * provider's prefix cache stays warm. Never persisted.
 */
export class TurnReasoningReplayStore {
	private readonly turns = new Map<string, TurnReplay>();

	record(
		turnRunId: string,
		toolCallIds: readonly string[],
		replay: ReplayedReasoning,
		now = Date.now()
	): void {
		for (const [candidate, turn] of this.turns) {
			if (now - turn.updatedAtMs > TURN_REPLAY_TTL_MS) this.turns.delete(candidate);
		}
		let turn = this.turns.get(turnRunId);
		if (!turn) {
			while (this.turns.size >= MAX_REPLAY_TURNS) {
				const oldest = this.turns.keys().next().value;
				if (oldest === undefined) break;
				this.turns.delete(oldest);
			}
			turn = { byToolCallId: new Map(), bytes: 0, updatedAtMs: now };
			this.turns.set(turnRunId, turn);
		}
		turn.updatedAtMs = now;
		if (turn.bytes + replay.bytes > MAX_TURN_REPLAY_BYTES) return;
		turn.bytes += replay.bytes;
		for (const id of toolCallIds) {
			// A provider that reuses tool-call ids across passes makes the id
			// ambiguous for the rest of the turn; neither pass is replayed.
			turn.byToolCallId.set(id, turn.byToolCallId.has(id) ? 'ambiguous' : replay);
		}
	}

	/** The pass that produced exactly these calls, when one recorded pass produced them all. */
	lookup(
		turnRunId: string,
		toolCallIds: readonly string[],
		now = Date.now()
	): ReplayedReasoning | null {
		const turn = this.turns.get(turnRunId);
		if (!turn || now - turn.updatedAtMs > TURN_REPLAY_TTL_MS || toolCallIds.length === 0) {
			return null;
		}
		const first = turn.byToolCallId.get(toolCallIds[0]!);
		if (!first || first === 'ambiguous') return null;
		return toolCallIds.every((id) => turn.byToolCallId.get(id) === first) ? first : null;
	}
}

/**
 * Attach recorded reasoning to this turn's assistant tool-call messages in an
 * outgoing body. `copies` are the body's message objects, index-aligned with
 * `source`. Messages before the turn's user message are never touched.
 */
export function attachReplayedReasoning(
	copies: Record<string, unknown>[],
	source: readonly AgenticChatTurnProviderMessageV1[],
	lookup: (toolCallIds: readonly string[]) => ReplayedReasoning | null
): void {
	for (let index = currentTurnStart(source); index < source.length; index += 1) {
		const message = source[index]!;
		if (message.role !== 'assistant' || !message.tool_calls?.length) continue;
		const ids = message.tool_calls.map((call) => call.id);
		if (!ids.every((id): id is string => typeof id === 'string' && id.length > 0)) continue;
		const replay = lookup(ids);
		if (!replay) continue;
		const copy = copies[index]!;
		if (replay.reasoning !== undefined) copy.reasoning = replay.reasoning;
		if (replay.reasoning_details !== undefined)
			copy.reasoning_details = replay.reasoning_details;
	}
}
