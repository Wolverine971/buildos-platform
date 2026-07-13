// apps/web/src/lib/services/agentic-chat-v2/stream-request-client.ts
import type { FastAgentStreamRequestInput } from './types';

export type BuildFastAgentStreamRequestParams = {
	message: string;
	sessionId?: string | null;
	contextType: FastAgentStreamRequestInput['context_type'];
	entityId?: string | null;
	attachments?: FastAgentStreamRequestInput['attachments'];
	projectFocus?: FastAgentStreamRequestInput['projectFocus'];
	lastTurnContext?: FastAgentStreamRequestInput['lastTurnContext'];
	streamRunId: string;
	clientTurnId: string;
	voiceNoteGroupId?: string | null;
	preparedPromptKey?: string | null;
};

/** Canonical browser/API-harness wire body for POST /api/agent/v2/stream. */
export function buildFastAgentStreamRequestBody(
	params: BuildFastAgentStreamRequestParams
): FastAgentStreamRequestInput {
	return {
		message: params.message,
		session_id: params.sessionId ?? undefined,
		context_type: params.contextType,
		entity_id: params.entityId ?? undefined,
		attachments: params.attachments ?? [],
		projectFocus: params.projectFocus ?? null,
		lastTurnContext: params.lastTurnContext ?? null,
		stream_run_id: params.streamRunId,
		client_turn_id: params.clientTurnId,
		voiceNoteGroupId: params.voiceNoteGroupId ?? null,
		preparedPromptKey: params.preparedPromptKey ?? null
	};
}
