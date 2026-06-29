import type { AgentRunNotification } from '$lib/types/notification.types';

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type AgentRunChatEventDetail = {
	sessionId: string;
	contextType: string;
	entityId: string | null;
	projectId: string | null;
	source: 'agent_run';
	runId: string;
};

function readString(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export async function prepareAgentRunChatEventDetail(params: {
	runId: string;
	notificationData: AgentRunNotification['data'];
	fetchFn?: FetchLike;
}): Promise<AgentRunChatEventDetail> {
	const fetcher = params.fetchFn ?? fetch;
	const response = await fetcher(`/api/agent-runs/${params.runId}/chat-session`, {
		method: 'POST',
		headers: { accept: 'application/json' }
	});
	const payload = await response.json().catch(() => null);
	if (!response.ok || !payload?.success) {
		throw new Error(payload?.error || 'Could not open chat for this run');
	}

	const data = (payload.data ?? {}) as Record<string, unknown>;
	const session = (data.session ?? {}) as Record<string, unknown>;
	const sessionId = readString(data.chat_session_id) ?? readString(session.id);
	if (!sessionId) throw new Error('Chat session was not returned');

	const projectId = readString(data.project_id) ?? params.notificationData.projectId ?? null;
	return {
		sessionId,
		contextType:
			readString(data.context_type) ??
			readString(session.context_type) ??
			params.notificationData.contextType,
		entityId: readString(data.entity_id) ?? readString(session.entity_id) ?? projectId,
		projectId,
		source: 'agent_run',
		runId: params.runId
	};
}
