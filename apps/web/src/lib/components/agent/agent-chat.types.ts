// apps/web/src/lib/components/agent/agent-chat.types.ts
import type { ChatAttachmentRef, ChatRole } from '@buildos/shared-types';

export type ActivityType =
	| 'tool_call'
	| 'tool_result'
	| 'state_change'
	| 'context_shift'
	| 'ontology_loaded'
	| 'clarification'
	| 'operation'
	| 'general';

export interface ActivityEntry {
	id: string;
	content: string;
	timestamp: Date;
	activityType: ActivityType;
	status?: 'pending' | 'completed' | 'failed';
	toolCallId?: string;
	metadata?: Record<string, any>;
}

export type AgentLoopState = 'thinking' | 'waiting_on_user';

/** A just-created entity surfaced as a tappable card in the conversation. */
export interface CreatedEntityRef {
	/** OntologyEntityKind: project | task | goal | plan | document | milestone | risk */
	kind: string;
	id: string;
	name: string;
	/** Project the entity lives in (the id itself when kind === 'project'). */
	projectId: string | null;
}

export type AgentTimelineItemSource =
	| 'turn_run'
	| 'turn_event'
	| 'tool_execution'
	| 'message'
	| 'entity_change';

export type AgentTimelineItemKind = 'step' | 'tool' | 'change' | 'message' | 'status';

export type AgentChatPanelTab = 'chat' | 'steps' | 'tools' | 'changes';

export type AgentTimelineItemStatus =
	| 'pending'
	| 'running'
	| 'completed'
	| 'failed'
	| 'partial'
	| 'needs_input'
	| 'cancelled';

export interface AgentTimelineEntityRef {
	kind: string;
	id: string;
	title?: string | null;
	projectId?: string | null;
	url?: string | null;
	operation?: 'created' | 'updated' | 'deleted' | 'linked' | 'read' | string;
}

export interface AgentTimelineToolSummary {
	name: string;
	category?: string | null;
	gatewayOp?: string | null;
	helpPath?: string | null;
	durationMs?: number | null;
	tokensConsumed?: number | null;
	argsPreview?: string | null;
	resultPreview?: string | null;
	errorMessage?: string | null;
	zeroResult?: boolean | null;
	resultCount?: number | null;
}

export interface AgentTimelineItem {
	id: string;
	sessionId: string;
	turnRunId?: string | null;
	streamRunId?: string | null;
	clientTurnId?: string | null;
	messageId?: string | null;
	source: AgentTimelineItemSource;
	kind: AgentTimelineItemKind;
	status: AgentTimelineItemStatus;
	timestamp: string;
	sequenceIndex?: number | null;
	title: string;
	summary?: string | null;
	detailPreview?: string | null;
	tool?: AgentTimelineToolSummary | null;
	projectRef?: AgentTimelineEntityRef | null;
	entityRefs: AgentTimelineEntityRef[];
	redaction?: {
		argsRedacted?: boolean;
		resultRedacted?: boolean;
		reason?: string | null;
	};
}

export interface AgentBrainDumpContext {
	id: string;
	content: string;
	title?: string | null;
	topics?: string[] | null;
	summary?: string | null;
	status?: string | null;
	error_message?: string | null;
	metadata?: Record<string, unknown> | null;
	chat_session_id?: string | null;
	created_at?: string | null;
	updated_at?: string | null;
}

export interface UIMessage {
	id: string;
	session_id?: string;
	user_id?: string;
	role?: ChatRole;
	content: string;
	created_at?: string;
	updated_at?: string;
	metadata?: Record<string, any>;
	type:
		| 'user'
		| 'assistant'
		| 'activity'
		| 'thinking_block'
		| 'clarification'
		| 'agent_peer'
		| 'created_entities';
	data?: any;
	timestamp: Date;
	tool_calls?: any;
	tool_call_id?: string;
	attachments?: ChatAttachmentRef[];
}

export type AgentChatImageAttachmentStatus =
	| 'hashing'
	| 'uploading'
	| 'processing'
	| 'ready'
	| 'deduped'
	| 'error';

export interface AgentChatImageAttachment {
	id: string;
	fileName: string;
	contentType: string;
	fileSizeBytes: number;
	previewUrl: string;
	status: AgentChatImageAttachmentStatus;
	statusLabel: string;
	attachmentKind?: 'onto_asset' | 'temporary_file';
	error?: string | null;
	assetId?: string;
	projectId?: string | null;
	storageBucket?: string | null;
	storagePath?: string | null;
	checksumSha256?: string;
	width?: number | null;
	height?: number | null;
	ocrStatus?: string | null;
	extractionSummary?: string | null;
	extractedTextPreview?: string | null;
	expiresAt?: string | null;
}

export interface ThinkingBlockMessage extends UIMessage {
	type: 'thinking_block';
	activities: ActivityEntry[];
	status: 'active' | 'completed' | 'interrupted' | 'cancelled' | 'error';
	agentState?: AgentLoopState;
	isCollapsed?: boolean;
}

export type ProjectAction = 'workspace';

export type AgentToAgentStep = 'agent' | 'project' | 'goal' | 'chat';

export interface AgentProjectSummary {
	id: string;
	name: string;
	description: string | null;
}

export interface DataMutationSummary {
	/** Whether any successful data mutation occurred */
	hasChanges: boolean;
	/** Count of successful mutations recorded during the session */
	totalMutations: number;
	/** Project IDs affected (best-effort, may be empty) */
	affectedProjectIds: string[];
	/** Whether the user sent at least one message during this modal session */
	hasMessagesSent: boolean;
	/** Session ID for callers that need session resumption */
	sessionId?: string | null;
	/** Context type used during this chat session */
	contextType?: string | null;
	/** Entity ID used during this chat session */
	entityId?: string | null;
}

export function isThinkingBlockMessage(message: UIMessage): message is ThinkingBlockMessage {
	return message.type === 'thinking_block';
}

export function findThinkingBlockById(
	id: string | null,
	sourceMessages: UIMessage[]
): ThinkingBlockMessage | undefined {
	if (!id) return undefined;
	return sourceMessages.find(
		(message): message is ThinkingBlockMessage =>
			message.id === id && isThinkingBlockMessage(message)
	);
}
