// apps/web/src/lib/server/workspace/capture-sort-core.test.ts
import { describe, expect, it } from 'vitest';
import {
	SORT_TASKS_PER_PROJECT,
	buildCaptureSortPrompt,
	buildSortContext,
	checkCaptureSortAnswer,
	civilToday,
	planCaptureSort
} from './capture-sort-core';

const context = buildSortContext({
	workspaceId: 'ws',
	projects: [
		{ id: 'p-buildos', name: 'BuildOS', description: 'Thinking environment' },
		{ id: 'p-9takes', name: '9takes', description: null }
	],
	tasks: [
		{
			id: 't-deck',
			title: 'Finish the investor deck',
			project_id: 'p-buildos',
			state_key: 'in_progress',
			due_at: '2026-10-25T03:59:59Z'
		},
		{ id: 't-done', title: 'Old', project_id: 'p-buildos', state_key: 'done', due_at: null },
		{
			id: 't-passport',
			title: 'Renew passport',
			project_id: 'ws',
			state_key: 'todo',
			due_at: null
		},
		{
			id: 't-elsewhere',
			title: 'Not shown',
			project_id: 'p-other',
			state_key: 'todo',
			due_at: null
		}
	],
	today: '2026-10-23',
	weekday: 'Friday',
	timezone: 'America/New_York'
});

describe('buildSortContext + prompt', () => {
	it('aliases projects and open tasks, and leaves out done tasks and unknown projects', () => {
		expect(context.projects.map((p) => p.alias)).toEqual(['P1', 'P2']);
		expect(context.tasks.map((t) => [t.alias, t.id])).toEqual([
			['T1', 't-deck'],
			['T2', 't-passport']
		]);
		const prompt = buildCaptureSortPrompt('finished the deck', context);
		expect(prompt).toContain('Today is Friday 2026-10-23 (America/New_York).');
		expect(prompt).toContain('P1 · BuildOS — Thinking environment');
		expect(prompt).toContain('T1 · P1 · Finish the investor deck · due 2026-10-25');
		expect(prompt).toContain('T2 · Workspace · Renew passport');
		expect(prompt).not.toContain('p-buildos');
		expect(prompt).toContain('"""\nfinished the deck\n"""');
	});

	it('caps open tasks per project', () => {
		const many = buildSortContext({
			workspaceId: 'ws',
			projects: [{ id: 'p', name: 'P', description: null }],
			tasks: Array.from({ length: 20 }, (_, index) => ({
				id: `t${index}`,
				title: `Task ${index}`,
				project_id: 'p',
				state_key: 'todo',
				due_at: null
			})),
			today: '2026-10-23',
			weekday: 'Friday',
			timezone: 'UTC'
		});
		expect(many.tasks).toHaveLength(SORT_TASKS_PER_PROJECT);
	});
});

describe('checkCaptureSortAnswer', () => {
	it('keeps confident items and updates built from known aliases', () => {
		const checked = checkCaptureSortAnswer(
			{
				items: [
					{
						kind: 'task',
						title: 'Call the bank about the wire',
						details: '',
						due: '2026-10-26',
						project: null,
						confidence: 0.9
					},
					{
						kind: 'note',
						title: 'Pricing idea',
						details: 'Tier by stewards',
						due: null,
						project: 'p1',
						confidence: 0.85
					}
				],
				updates: [{ task: 'T1', action: 'complete', due: null, confidence: 0.92 }]
			},
			context
		);
		expect(checked.items).toEqual([
			{
				kind: 'task',
				title: 'Call the bank about the wire',
				details: '',
				due: '2026-10-26',
				projectId: null
			},
			{
				kind: 'note',
				title: 'Pricing idea',
				details: 'Tier by stewards',
				due: null,
				projectId: 'p-buildos'
			}
		]);
		expect(checked.updates).toEqual([
			{
				taskId: 't-deck',
				title: 'Finish the investor deck',
				projectId: 'p-buildos',
				action: 'complete',
				due: null,
				before: { state_key: 'in_progress', due_at: '2026-10-25T03:59:59Z' }
			}
		]);
	});

	it('keeps weak or unknown project picks in the Workspace and drops shaky updates', () => {
		const checked = checkCaptureSortAnswer(
			{
				items: [
					{ kind: 'task', title: 'Maybe for 9takes', project: 'P2', confidence: 0.5 },
					{ kind: 'note', title: 'Ghost project', project: 'P9', confidence: 0.95 },
					{ kind: 'task', title: 'Bad date', due: '2026-02-30', confidence: 0.9 },
					{ kind: 'reminder', title: 'Unknown kind becomes a note', confidence: 0.9 },
					{ kind: 'task', title: '   ', confidence: 0.9 }
				],
				updates: [
					{ task: 'T1', action: 'complete', confidence: 0.6 },
					{ task: 'T7', action: 'complete', confidence: 0.99 },
					{ task: 'T2', action: 'reschedule', due: null, confidence: 0.99 },
					{ task: 'T2', action: 'archive', confidence: 0.99 }
				]
			},
			context
		);
		expect(
			checked.items.map((item) => [item.title, item.kind, item.projectId, item.due])
		).toEqual([
			['Maybe for 9takes', 'task', null, null],
			['Ghost project', 'note', null, null],
			['Bad date', 'task', null, null],
			['Unknown kind becomes a note', 'note', null, null]
		]);
		expect(checked.updates).toEqual([]);
		expect(checked.notes.length).toBeGreaterThan(4);
	});

	it('treats a non-object answer as nothing found', () => {
		expect(checkCaptureSortAnswer('nope', context)).toMatchObject({ items: [], updates: [] });
	});
});

describe('planCaptureSort', () => {
	const note = { kind: 'note' as const, title: 'n', details: '', due: null, projectId: null };
	const task = { ...note, kind: 'task' as const };

	it('keeps a plain note as it is, and when nothing usable came back', () => {
		expect(planCaptureSort({ items: [note], updates: [], notes: [] })).toEqual({
			kind: 'keep'
		});
		expect(planCaptureSort({ items: [], updates: [], notes: [] })).toEqual({ kind: 'keep' });
	});

	it('moves a note that clearly belongs to a project', () => {
		expect(
			planCaptureSort({ items: [{ ...note, projectId: 'p1' }], updates: [], notes: [] })
		).toEqual({ kind: 'move', projectId: 'p1' });
	});

	it('replaces the note when it became tasks, several items, or updates', () => {
		expect(planCaptureSort({ items: [task], updates: [], notes: [] }).kind).toBe('replace');
		expect(planCaptureSort({ items: [note, note], updates: [], notes: [] }).kind).toBe(
			'replace'
		);
		const update = {
			taskId: 't',
			title: 't',
			projectId: 'p',
			action: 'complete' as const,
			due: null,
			before: { state_key: 'todo', due_at: null }
		};
		expect(planCaptureSort({ items: [], updates: [update], notes: [] })).toEqual({
			kind: 'replace',
			items: [],
			updates: [update]
		});
	});
});

describe('civilToday', () => {
	it('uses the person’s timezone for the date line', () => {
		const lateFridayUtc = new Date('2026-10-24T02:30:00Z');
		expect(civilToday(lateFridayUtc, 'America/New_York')).toEqual({
			today: '2026-10-23',
			weekday: 'Friday'
		});
		expect(civilToday(lateFridayUtc, 'UTC')).toEqual({
			today: '2026-10-24',
			weekday: 'Saturday'
		});
	});
});
