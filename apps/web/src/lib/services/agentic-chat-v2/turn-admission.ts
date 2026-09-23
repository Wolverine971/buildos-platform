// apps/web/src/lib/services/agentic-chat-v2/turn-admission.ts
import type { Json } from '@buildos/shared-types';

export type ChatHistoryMessageRow = {
	id: string;
	role: string;
	content: string;
	metadata: Json | null;
	created_at: string | null;
};

export type ChatHistoryAttachmentRow = {
	message_id: string;
	asset_id: string | null;
	project_id: string | null;
	attachment_kind: string;
	media_type: string;
	role: string | null;
	display_order: number | null;
	metadata: Record<string, unknown> | null;
	asset: Record<string, unknown> | null;
};

export type ChatHistoryToolExecutionRow = {
	message_id: string | null;
	provider_tool_call_id?: string | null;
	tool_name: string;
	gateway_op: string | null;
	sequence_index: number | null;
	success: boolean;
	error_message: string | null;
	arguments: Json;
	result: Json | null;
};

/**
 * Bounded model-facing history captured before the current message. Worker
 * admission returns it inline; the query path in `session-service` rebuilds the
 * same shape row for row so both lineages project identically.
 */
export type ChatHistorySnapshot = {
	messages: ChatHistoryMessageRow[];
	attachments: ChatHistoryAttachmentRow[];
	interrupted_tool_executions: ChatHistoryToolExecutionRow[];
	loaded_skill_executions: ChatHistoryToolExecutionRow[];
};
