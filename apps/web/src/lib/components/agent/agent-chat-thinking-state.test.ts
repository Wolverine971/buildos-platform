// apps/web/src/lib/components/agent/agent-chat-thinking-state.test.ts
import { describe, expect, it } from 'vitest';
import type { ActivityEntry, ThinkingBlockMessage, UIMessage } from './agent-chat.types';
import {
	appendUniqueThinkingActivity,
	finalizeWorkerThinkingBlock
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
