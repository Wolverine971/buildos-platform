// apps/web/src/lib/components/agent/agent-chat-client-actions.ts
import type { ActivityEntry } from './agent-chat.types';

export type GmailConnectionClientAction = {
	kind: 'connect_google_gmail';
	actionId: string;
	mode: 'connect' | 'reconnect';
	emailAddress: string;
	connectionId: string | null;
	title: string;
	description: string;
	buttonLabel: string;
};

export type AgentClientActionCompletion = {
	kind: 'connect_google_gmail';
	actionId: string;
	requestedEmailAddress: string;
	connectedEmailAddress: string;
	connectionId: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function findClientAction(value: unknown, depth = 0): Record<string, unknown> | null {
	if (depth > 4) return null;
	const record = asRecord(value);
	if (!record) return null;
	const direct = asRecord(record.client_action);
	if (direct) return direct;
	return findClientAction(record.result, depth + 1) ?? findClientAction(record.data, depth + 1);
}

export function extractGmailConnectionClientAction(
	activity: ActivityEntry
): GmailConnectionClientAction | null {
	if (activity.status !== 'completed') return null;
	const raw =
		findClientAction(activity.metadata?.result) ??
		findClientAction(activity.metadata?.response) ??
		findClientAction(activity.metadata);
	if (!raw || raw.kind !== 'connect_google_gmail') return null;

	const actionId = typeof raw.action_id === 'string' ? raw.action_id.trim() : '';
	const emailAddress =
		typeof raw.email_address === 'string' ? raw.email_address.trim().toLowerCase() : '';
	const mode = raw.mode === 'reconnect' ? 'reconnect' : raw.mode === 'connect' ? 'connect' : null;
	const title = typeof raw.title === 'string' ? raw.title.trim() : '';
	const description = typeof raw.description === 'string' ? raw.description.trim() : '';
	const buttonLabel = typeof raw.button_label === 'string' ? raw.button_label.trim() : '';
	const connectionId =
		typeof raw.connection_id === 'string' && raw.connection_id.trim()
			? raw.connection_id.trim()
			: null;

	if (!actionId || !emailAddress || !mode || !title || !description || !buttonLabel) return null;
	return {
		kind: 'connect_google_gmail',
		actionId,
		mode,
		emailAddress,
		connectionId,
		title,
		description,
		buttonLabel
	};
}

export function collectGmailConnectionClientActions(
	activities: ActivityEntry[]
): GmailConnectionClientAction[] {
	const actions = new Map<string, GmailConnectionClientAction>();
	for (const activity of activities) {
		const action = extractGmailConnectionClientAction(activity);
		if (action) actions.set(action.actionId, action);
	}
	return [...actions.values()];
}
