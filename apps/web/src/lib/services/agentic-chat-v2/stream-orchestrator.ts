// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator.ts
import type { ChatContextType } from '@buildos/shared-types';
import type { SmartLLMService } from '$lib/services/smart-llm-service';
import type { FastChatHistoryMessage, FastAgentStreamUsage } from './types';
import { normalizeFastContextType } from './prompt-builder';
import { buildMasterPrompt } from './master-prompt-builder';

type StreamFastChatParams = {
	llm: SmartLLMService;
	userId: string;
	sessionId: string;
	contextType: ChatContextType;
	entityId?: string | null;
	projectId?: string | null;
	history: FastChatHistoryMessage[];
	message: string;
	signal?: AbortSignal;
	onDelta: (delta: string) => Promise<void> | void;
	systemPrompt?: string;
};

export async function streamFastChat(params: StreamFastChatParams): Promise<{
	assistantText: string;
	usage?: FastAgentStreamUsage;
	finishedReason?: string;
}> {
	const { llm, userId, sessionId, contextType, entityId, history, message, signal, onDelta } =
		params;

	const normalizedContext = normalizeFastContextType(contextType);
	const systemPrompt =
		params.systemPrompt ??
		buildMasterPrompt({
			contextType: normalizedContext,
			entityId
		});

	const messages = [
		{ role: 'system', content: systemPrompt },
		...history,
		{ role: 'user', content: message }
	];

	let assistantText = '';
	let usage: FastAgentStreamUsage | undefined;
	let finishedReason: string | undefined;

	for await (const event of llm.streamText({
		messages,
		userId,
		sessionId,
		chatSessionId: sessionId,
		profile: 'balanced',
		operationType: 'agentic_chat_v2_stream',
		contextType: normalizedContext,
		entityId: entityId ?? undefined,
		projectId: params.projectId ?? undefined,
		signal
	})) {
		if (event.type === 'text' && event.content) {
			assistantText += event.content;
			await onDelta(event.content);
		} else if (event.type === 'done') {
			usage = event.usage ?? undefined;
			finishedReason = event.finished_reason ?? undefined;
		} else if (event.type === 'error') {
			throw new Error(event.error || 'LLM stream error');
		}
	}

	return { assistantText, usage, finishedReason };
}
