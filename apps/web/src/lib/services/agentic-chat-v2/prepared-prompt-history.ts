// apps/web/src/lib/services/agentic-chat-v2/prepared-prompt-history.ts
import type { FastChatHistoryMessage } from '$lib/services/agentic-chat-v2';
import type { FastChatHistoryCompositionResult } from './history-composer';

const PREPARED_HISTORY_ROLES = new Set<FastChatHistoryMessage['role']>([
	'user',
	'assistant',
	'system',
	'tool'
]);

export function normalizePreparedHistoryForModel(raw: unknown): FastChatHistoryMessage[] {
	if (!Array.isArray(raw)) return [];
	const history: FastChatHistoryMessage[] = [];
	for (const item of raw) {
		if (!item || typeof item !== 'object') continue;
		const message = item as Record<string, unknown>;
		const role = message.role;
		const content = message.content;
		if (
			typeof role !== 'string' ||
			!PREPARED_HISTORY_ROLES.has(role as FastChatHistoryMessage['role'])
		) {
			continue;
		}
		if (typeof content !== 'string') continue;
		const normalized: FastChatHistoryMessage = {
			role: role as FastChatHistoryMessage['role'],
			content
		};
		if (typeof message.tool_call_id === 'string') {
			normalized.tool_call_id = message.tool_call_id;
		}
		history.push(normalized);
	}
	return history;
}

export function normalizePreparedHistoryStrategy(
	value: unknown
): FastChatHistoryCompositionResult['strategy'] {
	if (value === 'raw_history' || value === 'continuity_only' || value === 'compressed_history') {
		return value;
	}
	return 'raw_history';
}
