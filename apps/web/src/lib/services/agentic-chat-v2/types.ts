// apps/web/src/lib/services/agentic-chat-v2/types.ts
import type {
	ChatContextType,
	ChatAttachmentRef,
	ChatToolCall,
	LastTurnContext
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
};

export type FastAgentCancelReason = 'user_cancelled' | 'superseded';

export type FastAgentStreamUsage = {
	prompt_tokens?: number;
	completion_tokens?: number;
	total_tokens?: number;
};

export type FastChatHistoryMessage = {
	/** Server projection marker; never derived from message prose. */
	continuityKind?: 'failed_cleanup_v1' | 'shared_document_edit_card_v1' | 'proposal_card_v1';
	role: 'user' | 'assistant' | 'system' | 'tool';
	content: string;
	attachments?: ChatAttachmentRef[];
	tool_calls?: ChatToolCall[];
	tool_call_id?: string;
};
