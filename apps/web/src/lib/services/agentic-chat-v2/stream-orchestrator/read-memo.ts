// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/read-memo.ts
//
// Within-turn memoization of identical pure-read tool calls (WP-12, speed
// audit 2026-07-08 F4). Production turns showed the model re-issuing the
// same read with identical arguments (get_document_outline ×3,
// search_all_projects ×4 inside single turns) — each repeat burning a full
// tool execution and feeding another round. Serving the repeat from an
// in-turn cache costs nothing, and the injected notice tells the model it
// is looping instead of letting it believe the re-read produced new data.
//
// Scope guards (enforced by the orchestrator wiring, documented here):
// - only `isPureReadToolName` tools — no writes, no discovery/materializing
//   tools whose execution mutates the tool surface;
// - only successful results; failures must stay retryable;
// - exact-argument matches only (stable-stringified), so legitimately
//   different reads never collide;
// - the memo is cleared whenever an execution reaches the write executor —
//   a post-write re-read is legitimate and must hit the source.
import type { ChatToolCall, ChatToolResult } from '@buildos/shared-types';
import { parseToolArguments } from './tool-arguments';

export const REPEAT_READ_NOTICE =
	'Repeat read: this exact call already ran this turn; the earlier result is returned from cache without re-execution. Repeating it again will not produce new data — vary the arguments or continue with what you have.';

export function buildReadMemoKey(toolCall: ChatToolCall): string | null {
	const name = toolCall.function?.name?.trim().toLowerCase();
	if (!name) return null;
	const { args, error } = parseToolArguments(toolCall.function?.arguments);
	if (error) return null;
	return `${name}|${stableStringify(args)}`;
}

function stableStringify(value: unknown): string {
	if (Array.isArray(value)) {
		return `[${value.map(stableStringify).join(',')}]`;
	}
	if (value && typeof value === 'object') {
		const entries = Object.entries(value as Record<string, unknown>)
			.filter(([, entryValue]) => entryValue !== undefined)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`);
		return `{${entries.join(',')}}`;
	}
	return JSON.stringify(value) ?? 'null';
}

export function shouldMemoizeReadResult(result: ChatToolResult | null | undefined): boolean {
	return result?.success === true && !result.requires_user_action;
}

/**
 * Clone a cached read result for a repeat call. The notice and marker live
 * inside the payload (ChatToolResult is a closed interface), so they are
 * visible to the model and persist into chat_tool_executions.result for
 * telemetry (`result->>'served_from_turn_memo'`). stream_events are
 * dropped — replaying them would re-emit UI events from the first run.
 */
export function buildMemoServedResult(cached: ChatToolResult, toolCallId: string): ChatToolResult {
	const payload = cached.result;
	const noticedPayload =
		payload && typeof payload === 'object' && !Array.isArray(payload)
			? {
					served_from_turn_memo: true,
					repeat_read_notice: REPEAT_READ_NOTICE,
					...(payload as Record<string, unknown>)
				}
			: payload;
	const served: ChatToolResult = {
		...cached,
		tool_call_id: toolCallId,
		result: noticedPayload,
		duration_ms: 0
	};
	delete served.stream_events;
	return served;
}
