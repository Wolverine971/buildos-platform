// apps/web/src/lib/components/agent/agent-chat-session-load.ts
import { buildAgentChatSessionSnapshot } from './agent-chat-session';

export class ChatSessionLoadError extends Error {
	constructor(
		message: string,
		readonly status: number
	) {
		super(message);
		this.name = 'ChatSessionLoadError';
	}
}

/** Status-preserving transport around the shared restore snapshot builder. */
export async function loadChatSessionWithStatus(
	sessionId: string,
	options: { signal?: AbortSignal } = {}
) {
	const response = await fetch(`/api/chat/sessions/${sessionId}?includeVoiceNotes=1`, {
		cache: 'no-store',
		signal: options.signal
	});
	const result = await response.json().catch(() => null);
	if (!response.ok || !result?.success) {
		throw new ChatSessionLoadError(
			result?.error || 'Failed to load chat session',
			response.status
		);
	}
	return buildAgentChatSessionSnapshot(result.data);
}
