// apps/web/src/lib/services/admin/chat-session-flow-targets.ts
export type SessionFlowTargetKind = 'turn' | 'message' | 'tool' | 'audit';

export type SessionFlowTarget = {
	kind: SessionFlowTargetKind;
	domId: string;
	auditEventId?: string;
	fallbackDomId?: string;
};

function domSafeId(value: string): string {
	return encodeURIComponent(value);
}

export function conversationTurnTargetId(turnId: string): string {
	return `chat-flow-turn-${domSafeId(turnId)}`;
}

export function conversationMessageTargetId(messageId: string): string {
	return `chat-flow-message-${domSafeId(messageId)}`;
}

export function conversationActivityTargetId(turnId: string): string {
	return `chat-flow-activity-${domSafeId(turnId)}`;
}

export function conversationToolTargetId(turnId: string, toolId: string): string {
	return `chat-flow-tool-${domSafeId(turnId)}-${domSafeId(toolId)}`;
}

export function auditEventTargetId(eventId: string): string {
	return `chat-flow-audit-${domSafeId(eventId)}`;
}

export function auditTimelineTargetId(): string {
	return 'chat-flow-audit-timeline';
}
