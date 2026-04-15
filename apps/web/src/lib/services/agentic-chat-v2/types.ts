// apps/web/src/lib/services/agentic-chat-v2/types.ts
import type {
	ChatContextType,
	ChatSession,
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

export type FastAgentStreamRequest = {
	message: string;
	session_id?: string;
	context_type?: ChatContextType;
	entity_id?: string;
	ontologyEntityType?: string;
	projectFocus?: ProjectFocus | null;
	lastTurnContext?: LastTurnContext | null;
	last_turn_context?: LastTurnContext | null;
	stream_run_id?: string | number;
	client_turn_id?: string;
	prompt_variant?: string | null;
	voiceNoteGroupId?: string;
	voice_note_group_id?: string;
	prewarmedContext?: FastChatContextCache | null;
	prewarmed_context?: FastChatContextCache | null;
};

export type FastAgentPrewarmRequest = {
	session_id?: string;
	context_type?: ChatContextType;
	entity_id?: string;
	projectFocus?: ProjectFocus | null;
	ensure_session?: boolean;
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
			result: ChatToolResult & {
				tool_name?: string;
				toolName?: string;
				toolCallId?: string;
				data?: any;
			};
	  }
	| { type: 'context_shift'; context_shift: ContextShiftPayload }
	| { type: 'timing'; timing: AgentTimingSummary }
	| {
			type: 'agent_state';
			state: 'thinking' | 'executing_plan' | 'waiting_on_user';
			details?: string;
	  }
	| { type: 'text_delta'; content: string }
	| { type: 'error'; error: string }
	| { type: 'done'; usage?: FastAgentStreamUsage; finished_reason?: string };

export type FastChatHistoryMessage = {
	role: 'user' | 'assistant' | 'system' | 'tool';
	content: string;
	tool_calls?: ChatToolCall[];
	tool_call_id?: string;
};
