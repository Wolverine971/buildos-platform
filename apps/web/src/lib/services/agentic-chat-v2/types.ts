// apps/web/src/lib/services/agentic-chat-v2/types.ts
import type {
	ChatContextType,
	ChatSession,
	ContextUsageSnapshot,
	OperationEventPayload
} from '@buildos/shared-types';
import type { ProjectFocus } from '$lib/types/agent-chat-enhancement';

export type FastAgentStreamRequest = {
	message: string;
	session_id?: string;
	context_type?: ChatContextType;
	entity_id?: string;
	projectFocus?: ProjectFocus | null;
	stream_run_id?: string | number;
	voiceNoteGroupId?: string;
	voice_note_group_id?: string;
};

export type FastAgentStreamUsage = {
	prompt_tokens?: number;
	completion_tokens?: number;
	total_tokens?: number;
};

export type FastAgentStreamEvent =
	| { type: 'context_usage'; usage: ContextUsageSnapshot }
	| { type: 'session'; session: ChatSession }
	| { type: 'operation'; operation: OperationEventPayload }
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
};
