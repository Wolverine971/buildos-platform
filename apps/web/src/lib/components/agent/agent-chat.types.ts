// apps/web/src/lib/components/agent/agent-chat.types.ts
import type { ChatRole } from '@buildos/shared-types';

export type ActivityType =
	| 'tool_call'
	| 'tool_result'
	| 'plan_created'
	| 'plan_review'
	| 'state_change'
	| 'step_start'
	| 'step_complete'
	| 'executor_spawned'
	| 'executor_result'
	| 'context_shift'
	| 'ontology_loaded'
	| 'clarification'
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

export type AgentLoopState = 'thinking' | 'executing_plan' | 'waiting_on_user';

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
		| 'plan'
		| 'step'
		| 'executor'
		| 'clarification'
		| 'agent_peer';
	data?: any;
	timestamp: Date;
	tool_calls?: any;
	tool_call_id?: string;
}

export interface ThinkingBlockMessage extends UIMessage {
	type: 'thinking_block';
	activities: ActivityEntry[];
	status: 'active' | 'completed' | 'interrupted' | 'cancelled' | 'error';
	agentState?: AgentLoopState;
	isCollapsed?: boolean;
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
