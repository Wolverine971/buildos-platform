// apps/web/src/lib/services/agentic-chat-v2/types.ts
import type {
	ChatContextType,
	ChatSession,
	ChatAttachmentRef,
	SkillActivityEvent,
	ChatToolCall,
	ChatToolResult,
	ContextShiftPayload,
	ContextUsageSnapshot,
	LastTurnContext,
	OperationEventPayload,
	AgentTimingSummary
} from '@buildos/shared-types';
import type { ProjectFocus } from '$lib/types/agent-chat-enhancement';
import type { FastChatContextCache } from './context-cache';
import { normalizeFastChatContextCache } from './context-cache';

/**
 * Canonical, already-normalized stream request. Every field has exactly one
 * name; endpoint code must read these fields only.
 */
export type FastAgentStreamRequest = {
	message?: string;
	session_id?: string;
	context_type?: ChatContextType;
	entity_id?: string;
	attachments?: ChatAttachmentRef[];
	projectFocus?: ProjectFocus | null;
	lastTurnContext?: LastTurnContext | null;
	stream_run_id?: string | number;
	client_turn_id?: string;
	voiceNoteGroupId?: string;
	/** Legacy accepted field. Stream route ignores unsigned client-carried context. */
	prewarmedContext?: FastChatContextCache | null;
	/** Trimmed; null when absent or empty. */
	preparedPromptKey?: string | null;
};

/**
 * Wire shape accepted by POST /api/agent/v2/stream. The snake_case variants
 * are deprecated aliases kept for older callers; they are resolved exactly
 * once by `normalizeFastAgentStreamRequest` and never read past the boundary.
 */
export type FastAgentStreamRequestInput = Omit<FastAgentStreamRequest, 'voiceNoteGroupId'> & {
	voiceNoteGroupId?: string | null;
	/** @deprecated Use `lastTurnContext`. */
	last_turn_context?: LastTurnContext | null;
	/** @deprecated Use `voiceNoteGroupId`. */
	voice_note_group_id?: string | null;
	/** @deprecated Legacy compatibility only; stream route ignores unsigned context. */
	prewarmed_context?: FastChatContextCache | null;
	/** @deprecated Use `preparedPromptKey`. */
	prepared_prompt_key?: string | null;
};

function normalizeOptionalKey(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

/**
 * Resolves the deprecated snake_case wire aliases into the canonical request
 * shape. This is the only place where both casings are read.
 */
export function normalizeFastAgentStreamRequest(
	input: FastAgentStreamRequestInput
): FastAgentStreamRequest {
	const {
		last_turn_context,
		voice_note_group_id,
		prewarmed_context,
		prepared_prompt_key,
		...rest
	} = input ?? {};

	return {
		...rest,
		lastTurnContext: rest.lastTurnContext ?? last_turn_context ?? null,
		voiceNoteGroupId:
			typeof rest.voiceNoteGroupId === 'string'
				? rest.voiceNoteGroupId
				: typeof voice_note_group_id === 'string'
					? voice_note_group_id
					: undefined,
		prewarmedContext: normalizeFastChatContextCache(rest.prewarmedContext ?? prewarmed_context),
		preparedPromptKey:
			normalizeOptionalKey(rest.preparedPromptKey) ??
			normalizeOptionalKey(prepared_prompt_key)
	};
}

export type FastAgentPrewarmRequest = {
	session_id?: string;
	context_type?: ChatContextType;
	entity_id?: string;
	projectFocus?: ProjectFocus | null;
	ensure_session?: boolean;
	prepare_prompt?: boolean;
};

export type FastAgentCancelReason = 'user_cancelled' | 'superseded';

export type FastAgentCancelRequest = {
	stream_run_id: string | number;
	reason: FastAgentCancelReason;
	session_id?: string;
	client_turn_id?: string;
};

export type FastAgentStreamUsage = {
	prompt_tokens?: number;
	completion_tokens?: number;
	total_tokens?: number;
};

export type FastAgentStreamEvent =
	| SkillActivityEvent
	| { type: 'context_usage'; usage: ContextUsageSnapshot }
	| { type: 'session'; session: ChatSession }
	| { type: 'last_turn_context'; context: LastTurnContext }
	| { type: 'operation'; operation: OperationEventPayload }
	| { type: 'tool_call'; tool_call: ChatToolCall }
	| {
			type: 'tool_result';
			// Canonical wire shape: snake_case only. The legacy camelCase
			// duplicates (toolName/toolCallId) and the `data` alias for
			// `result` were removed 2026-06-10; clients read `tool_name`,
			// `tool_call_id`, and `result`.
			result: ChatToolResult & {
				tool_name: string;
			};
	  }
	| { type: 'context_shift'; context_shift: ContextShiftPayload }
	| { type: 'timing'; timing: AgentTimingSummary }
	| {
			type: 'agent_state';
			state: 'thinking' | 'waiting_on_user';
			details?: string;
			activity_visibility?: 'activity_log';
	  }
	| { type: 'text_delta'; content: string }
	// `turn_rejected` marks pre-persistence denies (access denied, active turn
	// running, turn-run insert failed): those turns never persisted the user
	// message, so the client rolls back its optimistic bubble ONLY when this
	// flag is set. Mid-turn errors omit it.
	| { type: 'error'; error: string; turn_rejected?: boolean }
	| { type: 'done'; usage?: FastAgentStreamUsage; finished_reason?: string };

export type FastChatHistoryMessage = {
	role: 'user' | 'assistant' | 'system' | 'tool';
	content: string;
	attachments?: ChatAttachmentRef[];
	tool_calls?: ChatToolCall[];
	tool_call_id?: string;
};
