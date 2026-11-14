// packages/agentic-chat-client/src/agent-chat-thinking-state.test.ts
import { describe, expect, it } from 'vitest';
import type { ActivityEntry, ThinkingBlockMessage, UIMessage } from './agent-chat.types';
import {
	appendUniqueThinkingActivity,
	finalizeWorkerThinkingBlock,
	foldWorkLogForReply,
	reopenWorkLogForNewStep,
	toggleWorkLogByHand,
	upsertWorkerThinkingBlock,
	workLogCollapsedAtTurnEnd
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
		// Same block on screen: the worker block inherits the provisional identity.
		expect(result[1]).toEqual({ ...canonical, renderKey: provisional.id });
		expect(result.filter((message) => message.type === 'thinking_block')).toHaveLength(1);
	});

	it('keeps an explicit provisional render key through promotion', () => {
		const provisional: ThinkingBlockMessage = {
			id: 'provisional-thinking',
			renderKey: 'turn:ctid-1:thinking',
			type: 'thinking_block',
			content: 'Thinking…',
			timestamp: new Date('2026-08-07T00:00:01.000Z'),
			activities: [],
			status: 'active'
		};

		const [promoted] = upsertWorkerThinkingBlock(
			[provisional],
			provisional.id,
			workerBlock('turn-1')
		);

		expect(promoted?.renderKey).toBe('turn:ctid-1:thinking');
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

		expect(result).toEqual([completed, { ...nextGeneration, renderKey: priorGeneration.id }]);
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

describe('work log fold while a turn runs', () => {
	function toolStep(id: string, status: ActivityEntry['status']): ActivityEntry {
		return {
			id,
			content: id,
			timestamp: new Date('2026-08-07T00:00:00.000Z'),
			activityType: 'tool_call',
			status
		};
	}

	const working = workerBlock('turn-fold', {
		isCollapsed: false,
		activities: [toolStep('read', 'completed')]
	});

	it('folds the moment reply text starts', () => {
		expect(foldWorkLogForReply(working)).toMatchObject({
			isCollapsed: true,
			foldSetBy: 'reply'
		});
	});

	it('is a no-op for every later piece of reply text', () => {
		const folded = foldWorkLogForReply(working);
		expect(foldWorkLogForReply(folded)).toBe(folded);
	});

	it('waits while a step is still in flight, then folds on the next reply text', () => {
		const inFlight = { ...working, activities: [toolStep('write', 'pending')] };
		expect(foldWorkLogForReply(inFlight)).toBe(inFlight);
		const landed = { ...working, activities: [toolStep('write', 'completed')] };
		expect(foldWorkLogForReply(landed).isCollapsed).toBe(true);
	});

	it('does not fold a turn that is waiting on the person, or one that has ended', () => {
		const waiting = { ...working, agentState: 'waiting_on_user' as const };
		expect(foldWorkLogForReply(waiting)).toBe(waiting);
		const ended = { ...working, status: 'error' as const };
		expect(foldWorkLogForReply(ended)).toBe(ended);
	});

	it('opens again when the model goes back to work, and folds when the reply resumes', () => {
		const folded = foldWorkLogForReply(working);
		const resumed = reopenWorkLogForNewStep(folded, {
			...folded,
			activities: [...folded.activities, toolStep('search', 'pending')]
		});
		expect(resumed.isCollapsed).toBe(false);
		expect(resumed.foldSetBy).toBeUndefined();

		// Reply text that arrives while the new step runs leaves the log open.
		expect(foldWorkLogForReply(resumed)).toBe(resumed);
		const stepDone = {
			...resumed,
			activities: [resumed.activities[0]!, toolStep('search', 'completed')]
		};
		// The step finishing does not fold it; the next reply text does.
		expect(reopenWorkLogForNewStep(resumed, stepDone)).toBe(stepDone);
		expect(foldWorkLogForReply(stepDone)).toMatchObject({
			isCollapsed: true,
			foldSetBy: 'reply'
		});
	});

	it('stays folded when an existing row changes or a hidden row is added', () => {
		const folded = foldWorkLogForReply(working);
		const rowChanged = { ...folded, activities: [toolStep('read', 'failed')] };
		expect(reopenWorkLogForNewStep(folded, rowChanged)).toBe(rowChanged);
		const hiddenRow = { ...folded, activities: [...folded.activities, activity('phase')] };
		expect(reopenWorkLogForNewStep(folded, hiddenRow)).toBe(hiddenRow);
	});

	it("keeps the person's choice for the rest of the turn", () => {
		// Opened by hand after the reply folded it: no later reply text or step moves it.
		const opened = toggleWorkLogByHand(foldWorkLogForReply(working));
		expect(opened).toMatchObject({ isCollapsed: false, foldSetBy: 'user' });
		expect(foldWorkLogForReply(opened)).toBe(opened);
		expect(workLogCollapsedAtTurnEnd(opened, 'completed')).toBe(false);

		// Closed by hand while the model works: a new step does not open it.
		const closed = toggleWorkLogByHand(working);
		const withStep = {
			...closed,
			activities: [...closed.activities, toolStep('s', 'pending')]
		};
		expect(reopenWorkLogForNewStep(closed, withStep)).toBe(withStep);
		expect(workLogCollapsedAtTurnEnd(closed, 'error')).toBe(true);
	});

	it('ends folded when the turn finishes, open when it stops or fails', () => {
		const folded = foldWorkLogForReply(working);
		expect(workLogCollapsedAtTurnEnd(working, 'completed')).toBe(true);
		expect(workLogCollapsedAtTurnEnd(folded, 'completed')).toBe(true);
		expect(workLogCollapsedAtTurnEnd(folded, 'error')).toBe(false);
		expect(workLogCollapsedAtTurnEnd(folded, 'cancelled')).toBe(false);
		expect(workLogCollapsedAtTurnEnd(working, 'interrupted')).toBe(false);

		const messages: UIMessage[] = [folded];
		const failed = finalizeWorkerThinkingBlock(messages, 'turn-fold', 'failed');
		expect(failed.messages[0]).toMatchObject({ status: 'error', isCollapsed: false });
	});
});
