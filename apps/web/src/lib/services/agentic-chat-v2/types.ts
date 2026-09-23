// apps/web/src/lib/services/agentic-chat-v2/types.ts
import type {
	AgentTurnPhase,
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

export type FastAgentPrewarmRequest = {
	session_id?: string;
	context_type?: ChatContextType;
	entity_id?: string;
	projectFocus?: ProjectFocus | null;
	ensure_session?: boolean;
	prepare_prompt?: boolean;
	/** Continuity hint from the previous turn; rendered identically on prepared hits and misses. */
	lastTurnContext?: LastTurnContext | null;
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
	| { type: 'turn_phase'; turn_phase: AgentTurnPhase; message: string }
	| { type: 'text_delta'; content: string }
	// `turn_rejected` marks pre-persistence denies (access denied, active turn
	// running, turn-run insert failed): those turns never persisted the user
	// message, so the client rolls back its optimistic bubble ONLY when this
	// flag is set. Mid-turn errors omit it.
	| { type: 'error'; error: string; turn_rejected?: boolean }
	| {
			type: 'done';
			usage?: FastAgentStreamUsage;
			finished_reason?: string;
			completion_status?: 'completed' | 'completed_degraded' | 'failed';
			answer_source?:
				| 'model'
				| 'partial_model'
				| 'deterministic_evidence'
				| 'precise_no_evidence';
	  };

export type FastChatHistoryMessage = {
	role: 'user' | 'assistant' | 'system' | 'tool';
	content: string;
	attachments?: ChatAttachmentRef[];
	tool_calls?: ChatToolCall[];
	tool_call_id?: string;
};
