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

/**
 * Install the canonical worker thinking block without leaving the optimistic
 * pre-admission block behind. The stream controller creates that provisional
 * block before it knows the authoritative turn-run id; the first worker
 * reconciliation promotes it into the generation-scoped block in-place.
 */
export function upsertWorkerThinkingBlock(
	messages: UIMessage[],
	currentBlockId: string | null,
	workerBlock: ThinkingBlockMessage
): UIMessage[] {
	const turnRunId = workerBlock.metadata?.turn_run_id;
	if (!turnRunId) return messages;

	const activeTurnPlaceholderId = `active-turn-${turnRunId}`;
	const existingCanonicalIndex = messages.findIndex(
		(message) => message.type === 'thinking_block' && message.id === workerBlock.id
	);
	const provisionalIndex = currentBlockId
		? messages.findIndex(
				(message) =>
					message.id === currentBlockId &&
					message.type === 'thinking_block' &&
					(message as ThinkingBlockMessage).status === 'active' &&
					!message.metadata?.turn_run_id
			)
		: -1;
	const priorGenerationIndex = messages.findIndex(
		(message) =>
			message.type === 'thinking_block' && message.metadata?.turn_run_id === turnRunId
	);
	const insertionIndex =
		existingCanonicalIndex >= 0
			? existingCanonicalIndex
			: provisionalIndex >= 0
				? provisionalIndex
				: priorGenerationIndex >= 0
					? priorGenerationIndex
					: messages.length;
	const blockToInsert =
		existingCanonicalIndex >= 0
			? (messages[existingCanonicalIndex] as ThinkingBlockMessage)
			: workerBlock;

	const nextMessages: UIMessage[] = [];
	for (let index = 0; index < messages.length; index += 1) {
		const message = messages[index]!;
		if (index === insertionIndex) {
			nextMessages.push(blockToInsert);
			continue;
		}
		if (message.id === activeTurnPlaceholderId) continue;
		if (index === provisionalIndex) continue;
		if (message.type === 'thinking_block' && message.metadata?.turn_run_id === turnRunId) {
			continue;
		}
		nextMessages.push(message);
	}
	if (insertionIndex === messages.length) {
		nextMessages.push(blockToInsert);
	}
	return nextMessages;
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
