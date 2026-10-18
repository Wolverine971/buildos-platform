// apps/web/src/lib/types/chat-session-restore.ts
// Allowlisted database-to-UI contract. Private turn request/context snapshots
// and session runtime caches are deliberately absent.
import type { Database } from '@buildos/shared-types';

type Tables = Database['public']['Tables'];
export type RestoreHistoryWindow = {
	messageLimit: number;
	toolLimit: number;
	eventLimit: number;
	toolsTruncated: boolean;
	eventsTruncated: boolean;
	oldestMessageId: string | null;
};
export type ChatSessionRestore = {
	messages: Pick<
		Tables['chat_messages']['Row'],
		| 'id'
		| 'session_id'
		| 'user_id'
		| 'role'
		| 'content'
		| 'tool_calls'
		| 'tool_call_id'
		| 'created_at'
		| 'metadata'
	>[];
	toolExecutions: (Pick<
		Tables['chat_tool_executions']['Row'],
		| 'id'
		| 'session_id'
		| 'message_id'
		| 'turn_run_id'
		| 'stream_run_id'
		| 'client_turn_id'
		| 'provider_tool_call_id'
		| 'tool_name'
		| 'tool_category'
		| 'gateway_op'
		| 'help_path'
		| 'sequence_index'
		| 'arguments'
		| 'result'
		| 'result_count'
		| 'zero_result'
		| 'execution_time_ms'
		| 'tokens_consumed'
		| 'success'
		| 'error_message'
		| 'requires_user_action'
		| 'affected_entities'
		| 'created_at'
	> & {
		restore_payload_truncated: boolean;
	})[];
	turnRuns: Pick<
		Tables['chat_turn_runs']['Row'],
		| 'id'
		| 'session_id'
		| 'user_id'
		| 'stream_run_id'
		| 'client_turn_id'
		| 'status'
		| 'finished_reason'
		| 'request_message'
		| 'assistant_message_id'
		| 'started_at'
		| 'finished_at'
		| 'created_at'
		| 'updated_at'
	>[];
	turnEvents: Pick<
		Tables['chat_turn_events']['Row'],
		| 'id'
		| 'session_id'
		| 'user_id'
		| 'turn_run_id'
		| 'stream_run_id'
		| 'execution_generation'
		| 'event_type'
		| 'phase'
		| 'payload'
		| 'sequence_index'
		| 'created_at'
	>[];
	workflows: Array<{ turn_run_id: string; workflow: unknown }>;
	truncated: boolean;
	historyWindow: RestoreHistoryWindow;
};
