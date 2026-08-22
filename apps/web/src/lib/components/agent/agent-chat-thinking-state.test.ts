// apps/web/src/lib/components/agent/agent-chat-thinking-state.test.ts
import { describe, expect, it } from 'vitest';
import type { ActivityEntry, ThinkingBlockMessage, UIMessage } from './agent-chat.types';
import {
	appendUniqueThinkingActivity,
	finalizeWorkerThinkingBlock,
	upsertWorkerThinkingBlock
} from './agent-chat-thinking-state';

function activity(id: string, eventId?: string): ActivityEntry {
	return {
		id,
		content: id,
		timestamp: new Date('2026-08-07T00:00:00.000Z'),
		activityType: 'state_change',
		...(eventId ? { metadata: { eventId } } : {})
	};
}

function workerBlock(
	turnRunId: string,
	overrides: Partial<ThinkingBlockMessage> = {}
): ThinkingBlockMessage {
	return {
		id: `worker-thinking:${turnRunId}:1`,
		type: 'thinking_block',
		content: 'BuildOS is working...',
		timestamp: new Date('2026-08-07T00:00:00.000Z'),
		activities: [],
		status: 'active',
		metadata: { turn_run_id: turnRunId },
		...overrides
	};
}

describe('agent chat thinking state', () => {
	it('deduplicates replayed semantic activities by durable event identity', () => {
		const initial = [activity('first', 'turn:1:2')];

		expect(appendUniqueThinkingActivity(initial, activity('replay', 'turn:1:2'))).toBe(initial);
		expect(appendUniqueThinkingActivity(initial, activity('next', 'turn:1:3'))).toHaveLength(2);
		expect(appendUniqueThinkingActivity(initial, activity('local'))).toHaveLength(2);
	});

	it('promotes the provisional thinking block instead of rendering a duplicate worker block', () => {
		const userMessage: UIMessage = {
			id: 'user-1',
			type: 'user',
			role: 'user',
			content: 'What is the first step?',
			timestamp: new Date('2026-08-07T00:00:00.000Z')
		};
		const provisional: ThinkingBlockMessage = {
			id: 'provisional-thinking',
			type: 'thinking_block',
			content: 'BuildOS is starting the response...',
			timestamp: new Date('2026-08-07T00:00:01.000Z'),
			activities: [],
			status: 'active'
		};
		const canonical = workerBlock('turn-1');

		const result = upsertWorkerThinkingBlock(
			[userMessage, provisional],
			provisional.id,
			canonical
		);

		expect(result).toHaveLength(2);
		expect(result[0]).toBe(userMessage);
		expect(result[1]).toBe(canonical);
		expect(result.filter((message) => message.type === 'thinking_block')).toHaveLength(1);
	});

	it('replaces a prior worker generation while preserving unrelated thinking history', () => {
		const completed = workerBlock('turn-complete', {
			status: 'completed',
			content: 'Complete'
		});
		const priorGeneration = workerBlock('turn-1');
		const nextGeneration = workerBlock('turn-1', {
			id: 'worker-thinking:turn-1:2',
			metadata: { turn_run_id: 'turn-1', execution_generation: 2 }
		});

		const result = upsertWorkerThinkingBlock(
			[completed, priorGeneration],
			priorGeneration.id,
			nextGeneration
		);

		expect(result).toEqual([completed, nextGeneration]);
	});

	it.each([
		['completed', 'completed', 'Complete'],
		['failed', 'error', 'Error'],
		['cancelled', 'cancelled', 'Cancelled']
	] as const)(
		'terminalizes only the matching worker block for %s',
		(status, blockStatus, content) => {
			const other = workerBlock('turn-2');
			const matching = workerBlock('turn-1');
			const input: UIMessage[] = [other, matching];

			const result = finalizeWorkerThinkingBlock(input, 'turn-1', status);

			expect(result.blockId).toBe(matching.id);
			expect(result.messages[0]).toBe(other);
			expect(result.messages[1]).toMatchObject({ status: blockStatus, content });
		}
	);

	it('preserves an event-finalized worker block while still returning its identity', () => {
		const completed = workerBlock('turn-1', {
			status: 'completed',
			content: 'Recovered from collected evidence'
		});
		const input: UIMessage[] = [completed];

		const result = finalizeWorkerThinkingBlock(input, 'turn-1', 'completed');

		expect(result).toEqual({ messages: input, blockId: completed.id });
	});
});
