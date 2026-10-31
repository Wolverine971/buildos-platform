// apps/mobile/tests/chat-store.test.ts
import { describe, expect, it } from 'vitest';
import type { ChatSessionHistoryResponse } from '@buildos/api-client';
import type { AgentSSEMessage } from '@buildos/shared-types';

import { createSessionStore, type WorkRow, type WorkerTurnHandle } from '@/lib/chat/session-store';
import { formatSeconds, workAside, workHeadline } from '@/lib/chat/work-summary';

const handle: WorkerTurnHandle = {
	contractVersion: 'agentic_chat_worker_v1',
	executionMode: 'worker_realtime',
	streamRunId: 'stream_1',
	clientTurnId: 'turn_1',
	sessionId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
	turnRunId: '11111111-2222-4333-8444-555555555555'
};

function semantic<T extends AgentSSEMessage['type']>(
	type: T,
	payload: Omit<Extract<AgentSSEMessage, { type: T }>, 'type'>
): AgentSSEMessage {
	return { type, turn_run_id: handle.turnRunId, ...payload } as AgentSSEMessage;
}

function makeStore(start = 1_000_000) {
	let clock = start;
	let ids = 0;
	const store = createSessionStore({ now: () => clock, makeId: () => `row_${++ids}` });
	return { store, tick: (ms: number) => (clock += ms) };
}

describe('session store: a turn from send to answer', () => {
	it('shows the words at once, then folds the work before the answer', () => {
		const { store, tick } = makeStore();
		store.addUserMessage({ clientTurnId: 'turn_1', text: 'Plan my week' });
		expect(store.getState().rows.map((row) => row.kind)).toEqual(['user', 'work']);
		expect((store.getState().rows[1] as WorkRow).activity).toBe('Sending');

		store.adoptHandle(handle, 'queued');
		store.port.beginGeneration({ handle, executionGeneration: 0, status: 'running' });
		const rows = store.getState().rows;
		expect(rows.map((row) => row.kind)).toEqual(['user', 'work', 'assistant']);
		expect(rows[0]).toMatchObject({ kind: 'user', delivery: 'sent' });
		expect(rows[1]).toMatchObject({
			kind: 'work',
			turnRunId: handle.turnRunId,
			status: 'active'
		});
		expect(store.getState().activeTurn).toEqual(handle);

		store.port.updateTurnState({ handle, status: 'running', currentActivity: 'Thinking' });
		expect(workHeadline(store.getState().rows[1] as WorkRow)).toBe('Thinking…');

		store.port.applySemanticEvent(
			semantic('tool_call', {
				tool_call: {
					id: 'call_1',
					type: 'function',
					function: { name: 'search_onto_tasks', arguments: '{"query":"week"}' }
				}
			})
		);
		let work = store.getState().rows[1] as WorkRow;
		expect(work.steps).toEqual([
			{
				id: 'row_3',
				verb: 'Searching tasks',
				target: 'week',
				status: 'pending',
				toolCallId: 'call_1'
			}
		]);
		expect(workHeadline(work)).toBe('Searching tasks…');

		store.port.applySemanticEvent(
			semantic('tool_result', { result: { tool_call_id: 'call_1', success: true } })
		);
		store.port.appendAssistantText({ handle, executionGeneration: 0, text: 'Here is ' });
		store.port.appendAssistantText({ handle, executionGeneration: 0, text: 'your week.' });
		tick(54_000);
		store.port.finishTurn({
			handle,
			status: 'completed',
			finishedReason: 'stop',
			failureCode: null
		});

		work = store.getState().rows[1] as WorkRow;
		expect(work.status).toBe('completed');
		expect(work.steps[0]!.status).toBe('completed');
		expect(workHeadline(work)).toBe('Worked for 54s');
		expect(workAside(work, 0)).toBe('1 step');
		expect(store.getState().rows[2]).toMatchObject({
			kind: 'assistant',
			text: 'Here is your week.',
			status: 'done'
		});
		expect(store.getState().activeTurn).toBeNull();
	});

	it('drops an empty answer and names the failure when the worker never started', () => {
		const { store } = makeStore();
		store.addUserMessage({ clientTurnId: 'turn_1', text: 'hi' });
		store.port.beginGeneration({ handle, executionGeneration: 0, status: 'queued' });
		store.port.finishTurn({
			handle,
			status: 'failed',
			finishedReason: 'queue_timeout',
			failureCode: null
		});
		expect(store.getState().rows.map((row) => row.kind)).toEqual(['user', 'work']);
		expect(workHeadline(store.getState().rows[1] as WorkRow)).toBe('Hit an issue');
		expect(store.getState().error).toMatch(/start/i);
	});

	it('keeps the live preview in the bubble when the person stops the reply', () => {
		const { store } = makeStore();
		store.addUserMessage({ clientTurnId: 'turn_1', text: 'write' });
		store.port.beginGeneration({ handle, executionGeneration: 0, status: 'running' });
		store.port.appendAssistantText({ handle, executionGeneration: 0, text: 'Once upon' });
		store.port.setAssistantPreview!({ handle, executionGeneration: 0, text: ' a time' });
		store.requestStop(handle.turnRunId);
		expect(store.port.isStopRequested!(handle)).toBe(true);
		expect(workHeadline(store.getState().rows[1] as WorkRow)).toBe('Stopping…');
		store.port.freezeAssistantPreview!({ handle, executionGeneration: 0, text: ' a time' });
		store.port.finishTurn({
			handle,
			status: 'cancelled',
			finishedReason: 'user_cancelled',
			failureCode: null
		});
		expect(store.getState().rows[2]).toMatchObject({
			text: 'Once upon a time',
			status: 'stopped'
		});
		expect(workHeadline(store.getState().rows[1] as WorkRow)).toBe('Stopped');
	});

	it('a failed send keeps the words, removes the waiting row and says why', () => {
		const { store } = makeStore();
		store.addUserMessage({ clientTurnId: 'turn_1', text: 'hello' });
		store.markFailed('turn_1', 'No connection.');
		expect(store.getState().rows).toEqual([
			expect.objectContaining({ kind: 'user', delivery: 'failed', text: 'hello' })
		]);
		expect(store.getState().error).toBe('No connection.');
	});

	it('reconciliation replaces the text and a waiting agent reads as waiting', () => {
		const { store } = makeStore();
		store.port.beginGeneration({ handle, executionGeneration: 1, status: 'running' });
		store.port.replaceAssistantSnapshot({
			handle,
			executionGeneration: 1,
			text: 'Full text',
			assistantMessage: null,
			status: 'running'
		});
		store.port.applySemanticEvent(
			semantic('agent_state', { state: 'waiting_on_user', contextType: 'global' })
		);
		expect(store.getState().rows.find((row) => row.kind === 'assistant')).toMatchObject({
			text: 'Full text'
		});
		expect(workHeadline(store.getState().rows[0] as WorkRow)).toBe('Waiting on your direction');
		store.port.setConnectionLost!({ handle, lost: true });
		expect(workHeadline(store.getState().rows[0] as WorkRow)).toBe('Reconnecting…');
	});
});

describe('session store: restoring a stored chat', () => {
	const history = {
		session: { id: handle.sessionId } as ChatSessionHistoryResponse['session'],
		messages: [
			{ id: 'm1', role: 'user', content: 'Plan my week', created_at: '2026-10-30T10:00:00Z' },
			{
				id: 'm2',
				role: 'assistant',
				content: 'Here it is.',
				created_at: '2026-10-30T10:00:40Z',
				metadata: { turn_run_id: handle.turnRunId }
			},
			{ id: 'm3', role: 'user', content: 'Thanks', created_at: '2026-10-30T10:01:00Z' }
		],
		toolExecutions: [],
		turnRuns: [
			{
				id: handle.turnRunId,
				status: 'completed',
				client_turn_id: 'turn_1',
				assistant_message_id: 'm2',
				started_at: '2026-10-30T10:00:02Z',
				finished_at: '2026-10-30T10:00:39Z',
				created_at: '2026-10-30T10:00:01Z'
			},
			{
				id: 'run_2',
				status: 'running',
				client_turn_id: 'turn_2',
				assistant_message_id: null,
				started_at: '2026-10-30T10:01:05Z',
				finished_at: null,
				created_at: '2026-10-30T10:01:01Z'
			}
		],
		timelineItems: [
			{
				id: 't1',
				kind: 'tool',
				turnRunId: handle.turnRunId,
				title: 'Searching tasks',
				summary: 'week',
				status: 'completed'
			},
			{
				id: 't2',
				kind: 'step',
				turnRunId: handle.turnRunId,
				title: 'Thinking',
				status: 'completed'
			}
		],
		voiceNoteGroups: [],
		voiceNotes: [],
		truncated: false,
		historyWindow: {},
		pendingChange: null
	} as unknown as ChatSessionHistoryResponse;

	it("puts each turn's folded work right above its answer and reports running turns", () => {
		const { store } = makeStore();
		const { activeTurnRunIds } = store.restore(history);
		const rows = store.getState().rows;
		expect(rows.map((row) => `${row.kind}:${row.id}`)).toEqual([
			'user:m1',
			`work:work:${handle.turnRunId}`,
			'assistant:m2',
			'user:m3',
			'work:work:run_2'
		]);
		const work = rows[1] as WorkRow;
		expect(work.steps).toEqual([
			{
				id: 't1',
				verb: 'Searching tasks',
				target: 'week',
				status: 'completed',
				toolCallId: null
			}
		]);
		expect(workHeadline(work)).toBe('Worked for 37s');
		expect((rows[4] as WorkRow).status).toBe('active');
		expect(activeTurnRunIds).toEqual(['run_2']);
		expect(store.getState()).toMatchObject({ sessionId: handle.sessionId, loaded: true });
	});
});

describe('formatSeconds', () => {
	it('reads like the website', () => {
		expect(formatSeconds(1_400)).toBe('1s');
		expect(formatSeconds(54_000)).toBe('54s');
		expect(formatSeconds(72_000)).toBe('1m 12s');
		expect(formatSeconds(120_000)).toBe('2m');
	});
});
