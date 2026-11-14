// apps/mobile/tests/chat-turn-view.test.ts
import type { ContextSelectionEventV1 } from '@buildos/shared-types';
import { describe, expect, it } from 'vitest';

import { createSessionStore, type WorkRow, type WorkStep } from '@/lib/chat/session-store';
import { buildTurnView, continueTarget } from '@/lib/chat/turn-view';

const NOW = new Date('2026-11-13T12:00:00Z');

function step(id: string, source: Partial<NonNullable<WorkStep['source']>> = {}): WorkStep {
	return {
		id,
		verb: `Step ${id}`,
		target: null,
		status: 'completed',
		toolCallId: id,
		source: {
			arguments: null,
			result: null,
			affectedEntities: null,
			durationMs: null,
			sourceQuote: null,
			...source
		}
	};
}

function work(steps: WorkStep[], selection: ContextSelectionEventV1 | null = null): WorkRow {
	return {
		kind: 'work',
		id: 'w1',
		turnRunId: 'run1',
		clientTurnId: null,
		startedAt: 0,
		endedAt: 1000,
		status: 'completed',
		waiting: false,
		activity: null,
		steps,
		stopRequested: false,
		connectionLost: false,
		selection
	};
}

function selection(over: Partial<ContextSelectionEventV1> = {}): ContextSelectionEventV1 {
	return {
		type: 'context_selection',
		version: 1,
		mode: 'on',
		visible: true,
		injected: true,
		status: 'selected',
		failure: null,
		client_turn_id: 'c1',
		turn_run_id: 'run1',
		project_id: null,
		workspace: { scope: 'projects', dig: false, checked: 12 },
		projects: [{ id: 'pW', name: 'Wayne Strategies', p: 0.9, hop2: 'ran' }],
		items: [
			{
				kind: 'document',
				id: 'd1',
				label: 'Q4 plan',
				tier: 'full',
				p: 0.9,
				pinned: false,
				sections: [],
				project_id: 'pW'
			},
			{
				kind: 'task',
				id: 't1',
				label: 'Send invoice',
				tier: 'summary',
				p: 0.6,
				pinned: false,
				sections: [],
				project_id: 'pW'
			}
		],
		counts: { full: 1, summary: 1, checked: 12 },
		elapsed_ms: 40,
		...over
	};
}

describe('turn view', () => {
	it('stays a plain list for an ordinary one-project turn', () => {
		const view = buildTurnView(work([step('a'), step('b')]), { id: 'p1', name: 'Launch' }, NOW);
		expect(view.grouped).toBe(false);
		expect(view.cards.flatMap((card) => card.steps.map((entry) => entry.step.id))).toEqual([
			'a',
			'b'
		]);
		expect(view.receipt).toBeNull();
	});

	it('shows what the finder pulled in and which projects it checked', () => {
		const view = buildTurnView(
			work([step('a', { arguments: { project_id: 'pW' } })], selection()),
			null,
			NOW
		);
		expect(view.grouped).toBe(true);
		expect(view.picked).toBe('Checked 12 projects, picked 1');
		expect(view.cards[0]).toMatchObject({
			name: 'Wayne Strategies',
			pulled: { label: 'Pulled in 2', detail: 'Q4 plan, Send invoice' }
		});
	});

	it('reads an edit as an Updated badge with before → after, and counts it in the receipt', () => {
		const view = buildTurnView(
			work([
				step('a', {
					affectedEntities: [
						{ kind: 'task', id: 't1', title: 'Send invoice', operation: 'updated' }
					],
					result: {
						field_changes: [{ field: 'state_key', before: 'todo', after: 'done' }]
					}
				}),
				step('b', { result: { task: { id: 't2', title: 'Other' } } })
			]),
			{ id: 'p1', name: 'Launch' },
			NOW
		);
		const details = view.cards[0]!.steps[0]!.details;
		expect(details.action).toBe('updated');
		expect(details.changes).toEqual([
			{ field: 'state_key', label: 'Status', before: 'Todo', after: 'Done' }
		]);
		expect(view.receipt).toBe('1 updated · 1 read');
	});

	it('offers "Continue in X" only for a finished turn sure of one project', () => {
		expect(continueTarget(work([step('a')], selection()))).toEqual({
			id: 'pW',
			name: 'Wayne Strategies'
		});
		const unsure = selection({
			projects: [{ id: 'pW', name: 'Wayne Strategies', p: 0.4, hop2: 'ran' }]
		});
		expect(continueTarget(work([step('a')], unsure))).toBeNull();
		expect(continueTarget({ ...work([step('a')], selection()), status: 'active' })).toBeNull();
		expect(continueTarget(work([step('a')]))).toBeNull();
	});
});

describe('session store: context selection', () => {
	it('keeps the finder receipt on the turn it belongs to', () => {
		const store = createSessionStore({ now: () => 0 });
		const handle = {
			executionMode: 'worker_realtime',
			sessionId: 's1',
			turnRunId: 'run1',
			streamRunId: 'st1',
			clientTurnId: 'c1'
		} as Parameters<typeof store.port.beginGeneration>[0]['handle'];
		store.port.beginGeneration({ handle, status: 'running' } as Parameters<
			typeof store.port.beginGeneration
		>[0]);
		store.port.applySemanticEvent({ ...selection(), turn_run_id: 'run1' } as never);
		const row = store.getState().rows.find((candidate) => candidate.kind === 'work') as WorkRow;
		expect(row.selection?.projects[0]?.name).toBe('Wayne Strategies');
	});
});

describe('step words', () => {
	it('reads finished steps in the past tense and lets a badge carry the verb', async () => {
		const { doneVerb, verbObject } = await import('@/lib/chat/tool-lines');
		expect(doneVerb('Reading document details')).toBe('Read document details');
		expect(doneVerb('Searching the web')).toBe('Searched the web');
		expect(doneVerb('Thinking it over')).toBe('Thinking it over');
		expect(verbObject('Updating task')).toBe('task');
		expect(verbObject('Updated task: Beta email')).toBe('task: Beta email');
		expect(verbObject('Note saved')).toBeNull();
	});
});
