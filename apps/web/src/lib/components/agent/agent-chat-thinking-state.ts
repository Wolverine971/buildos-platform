// apps/web/src/lib/components/agent/agent-chat-thinking-state.ts
import type { ActivityEntry, ThinkingBlockMessage, UIMessage } from './agent-chat.types';

type WorkerTerminalStatus = 'completed' | 'failed' | 'cancelled';

export function appendUniqueThinkingActivity(
	activities: ActivityEntry[],
	activity: ActivityEntry
): ActivityEntry[] {
	const eventId = activity.metadata?.eventId;
	if (
		typeof eventId === 'string' &&
		activities.some((candidate) => candidate.metadata?.eventId === eventId)
	) {
		return activities;
	}
	return [...activities, activity];
}

export function finalizeWorkerThinkingBlock(
	messages: UIMessage[],
	turnRunId: string,
	status: WorkerTerminalStatus
): { messages: UIMessage[]; blockId: string | null } {
	const index = messages.findIndex(
		(message) =>
			message.type === 'thinking_block' && message.metadata?.turn_run_id === turnRunId
	);
	if (index < 0) return { messages, blockId: null };

	const block = messages[index] as ThinkingBlockMessage;
	if (block.status !== 'active') return { messages, blockId: block.id };

	const nextBlock: ThinkingBlockMessage = {
		...block,
		status: status === 'failed' ? 'error' : status,
		content: status === 'failed' ? 'Error' : status === 'cancelled' ? 'Cancelled' : 'Complete'
	};
	const nextMessages = [...messages];
	nextMessages[index] = nextBlock;
	return { messages: nextMessages, blockId: block.id };
}
