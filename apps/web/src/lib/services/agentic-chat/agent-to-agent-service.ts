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

interface AgentToAgentErrorPayload {
	error?: string;
	message?: string;
	code?: string;
	details?: unknown;
}

export class AgentToAgentRequestError extends Error {
	constructor(
		message: string,
		public status: number,
		public code?: string,
		public details?: unknown
	) {
		super(message);
		this.name = 'AgentToAgentRequestError';
	}
}

async function buildRequestError(response: Response): Promise<AgentToAgentRequestError> {
	let payload: unknown;

	try {
		payload = await response.json();
	} catch {
		payload = await response.text().catch(() => '');
	}

	if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
		const typedPayload = payload as AgentToAgentErrorPayload;
		const message =
			typeof typedPayload.error === 'string'
				? typedPayload.error
				: typeof typedPayload.message === 'string'
					? typedPayload.message
					: `Agent message request failed (${response.status})`;

		return new AgentToAgentRequestError(
			message,
			response.status,
			typeof typedPayload.code === 'string' ? typedPayload.code : undefined,
			typedPayload.details
		);
	}

	const fallback = typeof payload === 'string' ? payload.trim() : '';
	return new AgentToAgentRequestError(
		fallback || `Agent message request failed (${response.status})`,
		response.status
	);
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
		throw await buildRequestError(res);
	}

	const body = (await res.json()) as
		| { data?: AgentToAgentMessageResponse; message?: string }
		| AgentToAgentMessageResponse;

	// Check if body is AgentToAgentMessageResponse directly
	if ('message' in body && typeof body.message === 'string') {
		return body as AgentToAgentMessageResponse;
	}

	// Check if body has nested data property
	if ('data' in body && body.data?.message) {
		return body.data;
	}

	throw new AgentToAgentRequestError('Invalid response from agent message endpoint', res.status);
}
