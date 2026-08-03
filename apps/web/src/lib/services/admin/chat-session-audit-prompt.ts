import { prettyJson } from './chat-session-audit-formatters';
import {
	payloadField,
	recordArray,
	recordFromUnknown,
	stringValue
} from './chat-session-audit-payload';
import type { AuditRecord, SessionTurnRun, TimelineGroup } from './chat-session-audit-types';

export type CapturedPromptMessage = {
	role: string;
	roleLabel: string;
	content: string;
	extra: AuditRecord | null;
	characterCount: number;
};

function promptRoleLabel(role: string): string {
	switch (role.toLowerCase()) {
		case 'system':
			return 'System';
		case 'user':
			return 'User / calling agent';
		case 'assistant':
			return 'Assistant';
		case 'tool':
			return 'Tool';
		default:
			return role || 'Message';
	}
}

function contentPartText(value: unknown): string {
	if (typeof value === 'string') return value;
	const record = recordFromUnknown(value);
	if (record) {
		const text = stringValue(payloadField(record, 'text'));
		if (text) return text;
	}
	return prettyJson(value);
}

function promptContentText(value: unknown): string {
	if (typeof value === 'string') return value;
	if (Array.isArray(value)) return value.map(contentPartText).filter(Boolean).join('\n');
	if (value === null || value === undefined) return '';
	return contentPartText(value);
}

function promptMessageExtra(message: AuditRecord): AuditRecord | null {
	const extra = Object.fromEntries(
		Object.entries(message).filter(([key, value]) => {
			if (key === 'role' || key === 'content') return false;
			return value !== null && value !== undefined && value !== '';
		})
	);
	return Object.keys(extra).length > 0 ? extra : null;
}

export function promptSnapshotFromTurnRun(turnRun: SessionTurnRun | null): AuditRecord | null {
	return recordFromUnknown(turnRun?.prompt_snapshot);
}

export function capturedPromptMessages(turnRun: SessionTurnRun | null): CapturedPromptMessage[] {
	const snapshot = promptSnapshotFromTurnRun(turnRun);
	return recordArray(payloadField(snapshot ?? {}, 'model_messages')).map((message) => {
		const role = stringValue(payloadField(message, 'role')) || 'message';
		const content = promptContentText(payloadField(message, 'content'));
		return {
			role,
			roleLabel: promptRoleLabel(role),
			content,
			extra: promptMessageExtra(message),
			characterCount: content.length
		};
	});
}

export function timelineGroupRequestMessage(group: TimelineGroup): string {
	const recordedRequest = group.run?.request_message?.trim();
	if (recordedRequest) return recordedRequest;

	const userMessage = [...group.items].reverse().find((event) => {
		if (event.type !== 'message') return false;
		return stringValue(payloadField(event.payload, 'role')).toLowerCase() === 'user';
	});
	return stringValue(payloadField(userMessage?.payload ?? {}, 'content')).trim();
}
