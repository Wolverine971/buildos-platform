// apps/web/src/lib/services/agentic-chat/agent-to-agent-service.ts
// Client helper for driving agent-to-agent chat turns.

export type AgentToAgentMessageHistory = {
	role: 'agent' | 'buildos';
	content: string;
};

export interface AgentToAgentMessageRequest {
	goal: string;
	projectId: string;
	agentId: string;
	history?: AgentToAgentMessageHistory[];
}

export interface AgentToAgentMessageResponse {
	message: string;
}

export async function requestAgentToAgentMessage(
	input: AgentToAgentMessageRequest
): Promise<AgentToAgentMessageResponse> {
	const res = await fetch('/api/agentic-chat/agent-message', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(input)
	});

	if (!res.ok) {
		const fallback = await res.text();
		throw new Error(fallback || `Agent message request failed (${res.status})`);
	}

	const body = (await res.json()) as
		| { data?: AgentToAgentMessageResponse }
		| AgentToAgentMessageResponse;

	// Check if body is AgentToAgentMessageResponse directly
	if ('message' in body && typeof body.message === 'string') {
		return body as AgentToAgentMessageResponse;
	}

	// Check if body has nested data property
	if ('data' in body && body.data?.message) {
		return body.data;
	}

	throw new Error('Invalid response from agent message endpoint');
}
