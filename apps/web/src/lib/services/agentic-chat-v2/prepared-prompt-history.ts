// apps/web/src/lib/services/agentic-chat-v2/prepared-prompt-history.ts
import type { FastChatHistoryMessage } from '$lib/services/agentic-chat-v2';
import type { FastChatHistoryCompositionResult } from './history-composer';
import type { AgenticChatHistoryStateV1 } from '@buildos/shared-types';

const PREPARED_HISTORY_ROLES = new Set<FastChatHistoryMessage['role']>([
	'user',
	'assistant',
	'system',
	'tool'
]);

export function normalizePreparedHistoryForModel(raw: unknown): FastChatHistoryMessage[] {
	const inspection = inspectPreparedHistoryForModel(raw);
	if (!inspection.ok) throw new Error(`Invalid prepared history: ${inspection.code}`);
	return inspection.history;
}

export type PreparedHistoryInspection =
	| { ok: true; history: FastChatHistoryMessage[]; state: AgenticChatHistoryStateV1 }
	| { ok: false; code: PreparedHistoryValidationErrorCode };

export type PreparedHistoryValidationErrorCode =
	| 'not_array'
	| 'too_many_messages'
	| 'invalid_message'
	| 'history_attachments_deferred'
	| 'invalid_tool_calls'
	| 'invalid_strategy'
	| 'invalid_counts';

type PreparedHistoryMessagesInspection =
	| { ok: true; history: FastChatHistoryMessage[] }
	| { ok: false; code: PreparedHistoryValidationErrorCode };

export function inspectPreparedHistorySnapshot(params: {
	historyForModel: unknown;
	historyStrategy: unknown;
	historyCompressed: unknown;
	rawHistoryCount: unknown;
	historyForModelCount: unknown;
}): PreparedHistoryInspection {
	const messages = inspectPreparedHistoryForModel(params.historyForModel);
	if (!messages.ok) return messages;
	const strategy = params.historyStrategy;
	if (
		strategy !== 'raw_history' &&
		strategy !== 'continuity_only' &&
		strategy !== 'compressed_history'
	) {
		return { ok: false, code: 'invalid_strategy' };
	}
	if (
		typeof params.historyCompressed !== 'boolean' ||
		params.historyCompressed !== (strategy === 'compressed_history') ||
		!Number.isSafeInteger(params.rawHistoryCount) ||
		(params.rawHistoryCount as number) < 0 ||
		(params.rawHistoryCount as number) > 50 ||
		!Number.isSafeInteger(params.historyForModelCount) ||
		params.historyForModelCount !== messages.history.length ||
		(strategy === 'continuity_only' &&
			(params.rawHistoryCount !== 0 || params.historyForModelCount !== 1))
	) {
		return { ok: false, code: 'invalid_counts' };
	}
	return {
		ok: true,
		history: messages.history,
		state: {
			strategy,
			compressed: params.historyCompressed,
			rawHistoryCount: params.rawHistoryCount as number,
			historyForModelCount: params.historyForModelCount as number
		}
	};
}

function inspectPreparedHistoryForModel(raw: unknown): PreparedHistoryMessagesInspection {
	if (!Array.isArray(raw)) return { ok: false, code: 'not_array' };
	if (raw.length > 50) return { ok: false, code: 'too_many_messages' };
	const history: FastChatHistoryMessage[] = [];
	for (const item of raw) {
		if (!item || typeof item !== 'object' || Array.isArray(item)) {
			return { ok: false, code: 'invalid_message' };
		}
		const message = item as Record<string, unknown>;
		const role = message.role;
		const content = message.content;
		if (
			typeof role !== 'string' ||
			!PREPARED_HISTORY_ROLES.has(role as FastChatHistoryMessage['role'])
		) {
			return { ok: false, code: 'invalid_message' };
		}
		if (typeof content !== 'string') return { ok: false, code: 'invalid_message' };
		if (
			message.attachments !== undefined &&
			(!Array.isArray(message.attachments) || message.attachments.length > 0)
		) {
			return { ok: false, code: 'history_attachments_deferred' };
		}
		if (
			message.tool_calls !== undefined &&
			(!Array.isArray(message.tool_calls) ||
				message.tool_calls.some(
					(toolCall) =>
						!toolCall || typeof toolCall !== 'object' || Array.isArray(toolCall)
				))
		) {
			return { ok: false, code: 'invalid_tool_calls' };
		}
		if (
			message.tool_call_id !== undefined &&
			message.tool_call_id !== null &&
			typeof message.tool_call_id !== 'string'
		) {
			return { ok: false, code: 'invalid_message' };
		}
		const normalized: FastChatHistoryMessage = {
			role: role as FastChatHistoryMessage['role'],
			content
		};
		if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
			normalized.tool_calls = message.tool_calls as FastChatHistoryMessage['tool_calls'];
		}
		if (typeof message.tool_call_id === 'string') {
			normalized.tool_call_id = message.tool_call_id;
		}
		history.push(normalized);
	}
	return { ok: true, history };
}

export function normalizePreparedHistoryStrategy(
	value: unknown
): FastChatHistoryCompositionResult['strategy'] {
	if (value === 'raw_history' || value === 'continuity_only' || value === 'compressed_history') {
		return value;
	}
	return 'raw_history';
}
