// apps/web/src/lib/components/inbox/inbox-activity.test.ts
import { describe, expect, it } from 'vitest';
import {
	buildInboxActivity,
	type ActivityPayload,
	type ActivityRunRow,
	type ActivitySuggestionRow
} from './inbox-activity';

const WAYNE = 'f85b6c5f-59fb-4e4c-8654-748f793d8f4b';
const TBPN = '94afb975-2d9b-428f-8ca6-573c19744d0b';
const RUN = '50425238-ff90-4351-b2a7-42e5f8dc1d58';

function row(overrides: Partial<ActivitySuggestionRow>): ActivitySuggestionRow {
	return {
		id: 'row',
		project_id: WAYNE,
		project_name: 'Wayne Strategies',
		kind: 'doc_org',
		status: 'pending',
		title: 'Row',
		rationale: null,
		why_now: null,
		evidence_refs: [],
		preview: null,
		operations: [],
		result: null,
		user_feedback: null,
		rollup: null,
		created_at: '2026-11-07T05:01:06.000Z',
		decided_at: null,
		applied_at: null,
		updated_at: '2026-11-07T05:01:06.000Z',
		...overrides
	};
}

function run(overrides: Partial<ActivityRunRow>): ActivityRunRow {
	return {
		id: RUN,
		project_id: WAYNE,
		project_name: 'Wayne Strategies',
		trigger_reason: 'end_of_day',
		status: 'completed',
		suggestion_count: 2,
		cost_usd: 0.0116,
		created_at: '2026-11-07T05:00:00.000Z',
		...overrides
	};
}

const autoApplied = row({
	id: 'brand',
	status: 'applied',
	title: 'Place personal brand principles with strategy documents',
	why_now: 'It was updated recently and remains at the project root.',
	evidence_refs: [
		{ entity_type: 'document', entity_id: 'doc-brand', title: 'Personal Brand Principles' }
	],
	operations: [{ tool: 'move_document_in_tree', label: 'Move Principles under Strategy' }],
	result: {
		ok: true,
		applied_via: 'auto',
		headline: 'Move "Personal Brand Principles" under "Project Context and Strategy".',
		auto_apply: {
			run_id: RUN,
			reason: 'Tidies the document tree to fit the project; you can undo it',
			scores: { about: 0.86, wanted: 0.85, review: 0.35, safe: 0.94 }
		}
	},
	applied_at: '2026-11-07T05:01:44.000Z',
	decided_at: '2026-11-07T05:01:44.000Z'
});

const payload: ActivityPayload = {
	since: '2026-11-02T00:00:00.000Z',
	suggestions: [
		autoApplied,
		row({
			id: 'archive',
			kind: 'doc_outdated',
			title: 'Archive "Outreach week: Oct 5–11"',
			operations: [{ tool: 'archive_onto_document', label: 'Archive "Outreach week"' }],
			rollup: {
				first_seen_at: '2026-11-07T05:01:05.000Z',
				last_confirmed_at: '2026-11-08T05:01:05.000Z',
				seen_run_ids: ['a', 'b'],
				summary: 'Archive the historical outreach week plan.',
				auto_check: {
					scores: { about: 0.89, wanted: 0.79, review: 0.52, safe: 0.91 },
					bar: { minAbout: 0.85, minWanted: 0.8, minSafe: 0.9, maxReview: 0.3 },
					outcome: 'below_bar',
					at: '2026-11-08T05:01:40.000Z',
					run_id: null
				}
			},
			updated_at: '2026-11-08T05:01:05.000Z'
		}),
		row({
			id: 'dismissed',
			status: 'rejected',
			title: 'Decide how to document key decisions',
			kind: 'audit_recommendation',
			user_feedback: { reason: 'not_relevant', note: 'Not for this project' },
			decided_at: '2026-11-06T15:00:00.000Z'
		}),
		row({
			id: 'undone',
			status: 'rejected',
			title: 'Move Blog bundle',
			user_feedback: { reason: 'undone_auto_apply' },
			result: { applied_via: 'auto', undone_at: '2026-11-05T12:00:00.000Z' },
			applied_at: '2026-11-05T05:01:00.000Z'
		}),
		row({
			id: 'closed',
			project_id: TBPN,
			project_name: 'TBPN',
			status: 'superseded',
			title: 'Group process logs',
			rollup: {
				close: { reason: 'already_done', detail: '', at: '2026-11-08T05:00:30.000Z' }
			}
		})
	],
	runs: [
		run({}),
		run({
			id: 'run-tbpn',
			project_id: TBPN,
			project_name: 'TBPN',
			suggestion_count: 0,
			cost_usd: 0.0047
		}),
		run({
			id: 'older',
			created_at: '2026-11-05T05:00:00.000Z',
			suggestion_count: 5,
			cost_usd: 0.01
		})
	]
};

describe('buildInboxActivity', () => {
	const activity = buildInboxActivity(payload);

	it('leads with the bottom line', () => {
		expect(activity.bluf).toEqual([
			'In the last 7 days: 1 change made for you, you answered 2, 1 closed on their own.',
			'1 suggestion waiting on you across 1 project.'
		]);
		expect(activity.counts).toMatchObject({ happened: 4, suggested: 1, reviews: 3 });
		expect(activity.counts.costUsd).toBeCloseTo(0.0263);
	});

	it('sums the newest night of reviews, not older ones', () => {
		expect(activity.lastReview).toEqual({
			at: '2026-11-07T05:00:00.000Z',
			projects: 2,
			suggested: 2,
			appliedForYou: 1
		});
	});

	it('groups what happened by project with a one-line count', () => {
		expect(activity.happened.map((project) => [project.name, project.bluf])).toEqual([
			['TBPN', '1 closed on their own'],
			['Wayne Strategies', '1 applied for you · 2 you answered']
		]);
	});

	it('reads state from status and result fields', () => {
		const states = activity.happened
			.flatMap((project) => project.entries)
			.map((entry) => [entry.id, entry.state]);
		expect(states).toEqual([
			['closed', 'closed'],
			['brand', 'applied_for_you'],
			['dismissed', 'you_dismissed'],
			['undone', 'undone']
		]);
	});

	it('opens an applied item into its records, change, scores and steps', () => {
		const brand = activity.happened[1]?.entries[0];
		expect(brand).toMatchObject({
			headline: 'Move "Personal Brand Principles" under "Project Context and Strategy".',
			stateLabel: 'Applied for you',
			changes: [{ text: 'Move Principles under Strategy', href: null, rows: [] }]
		});
		expect(brand?.records[0]?.href).toContain('doc-brand');
		expect(brand?.check?.rows).toHaveLength(4);
		expect(brand?.steps.map((step) => step.key)).toEqual(['seen', 'auto']);
	});

	it('shows a waiting item with why it asked first', () => {
		const archive = activity.suggested[0]?.entries[0];
		expect(archive).toMatchObject({ state: 'waiting', stateLabel: 'Waiting on you' });
		expect(archive?.summary).toBe('Archive the historical outreach week plan.');
		expect(archive?.steps.map((step) => step.key)).toEqual(['seen', 'confirmed', 'check']);
		expect(archive?.steps[1]?.detail).toBe('Seen in 2 reviews');
		expect(archive?.steps[2]?.detail).toMatch(/^Asked first:/);
	});

	it('keeps your note and the close reason on the last step', () => {
		const entries = activity.happened.flatMap((project) => project.entries);
		expect(entries.find((entry) => entry.id === 'dismissed')?.steps.at(-1)).toMatchObject({
			label: 'You said not needed',
			detail: 'Not for this project'
		});
		expect(entries.find((entry) => entry.id === 'closed')?.steps.at(-1)?.detail).toBe(
			'It was already done'
		);
		expect(entries.find((entry) => entry.id === 'undone')?.steps.map((s) => s.key)).toEqual([
			'seen',
			'auto',
			'undone'
		]);
	});

	it('shows the rows of one finding as one waiting item with all their changes', () => {
		const merged = buildInboxActivity({
			since: '',
			runs: [],
			suggestions: [
				row({
					id: 'stub-1',
					lineage_id: 'stubs',
					operations: [{ tool: 'archive_onto_document', label: 'Archive "Stub 1"' }]
				}),
				row({
					id: 'stub-2',
					lineage_id: 'stubs',
					operations: [{ tool: 'archive_onto_document', label: 'Archive "Stub 2"' }],
					updated_at: '2026-11-08T05:01:06.000Z'
				})
			]
		});
		expect(merged.counts.suggested).toBe(1);
		const lead = merged.suggested[0]?.entries[0];
		expect(lead?.id).toBe('stub-2');
		expect(lead?.changes.map((change) => change.text)).toEqual([
			'Archive "Stub 2"',
			'Archive "Stub 1"'
		]);
	});

	it('shows an applied change from its receipt, with a link and before → after', () => {
		const applied = buildInboxActivity({
			since: '',
			runs: [],
			suggestions: [
				row({
					id: 'mine',
					status: 'applied',
					operations: [{ tool: 'update_onto_task', label: 'Update the task' }],
					result: {
						ok: true,
						receipt: [
							{
								action_label: 'Update task',
								target: 'Send proposal',
								entity: { kind: 'task', id: 'task-1' },
								changes: [{ label: 'Due', before: 'Nov 5', value: 'Nov 13' }]
							}
						]
					},
					applied_at: '2026-11-12T15:00:00.000Z'
				})
			]
		});
		const [change] = applied.happened[0]?.entries[0]?.changes ?? [];
		expect(change).toMatchObject({
			text: 'Update task · Send proposal',
			rows: [{ label: 'Due', before: 'Nov 5', after: 'Nov 13' }]
		});
		expect(change?.href).toContain('task-1');
	});

	it('lists email cards: waiting ones as suggestions, answered ones as what happened', () => {
		const email = {
			project_id: WAYNE,
			project_name: 'Wayne Strategies',
			action: 'update_task' as const,
			task_id: 'task-1',
			title: 'Move "Send proposal" to Nov 13',
			why: 'They asked for it by end of next week.',
			proposal: { due_date: '2026-11-13' },
			subject: 'Re: proposal timing',
			from: 'Sam Ortiz <sam@example.com>',
			created_at: '2026-11-09T10:30:00.000Z',
			decided_at: null
		};
		const activity = buildInboxActivity({
			since: '',
			runs: [],
			suggestions: [],
			emails: [
				{ ...email, id: 'e1', status: 'pending' },
				{ ...email, id: 'e2', status: 'dismissed', decided_at: '2026-11-10T12:00:00.000Z' },
				{ ...email, id: 'e3', status: 'running' }
			]
		});
		expect(activity.counts).toMatchObject({ suggested: 1, happened: 1 });
		const waiting = activity.suggested[0]?.entries[0];
		expect(waiting).toMatchObject({ source: 'From your email', stateLabel: 'Waiting on you' });
		expect(waiting?.changes[0]?.rows).toEqual([
			{ label: 'Due', before: null, after: 'Nov 13' }
		]);
		expect(waiting?.steps[0]?.detail).toBe('Sam Ortiz: “Re: proposal timing”');
		expect(activity.happened[0]?.entries[0]?.stateLabel).toBe('You said not now');
		expect(activity.bluf[0]).toBe('In the last 7 days: you answered 1.');
	});

	it('lists overdue tasks you settled and projects you paused, from the latest log row', () => {
		const log = {
			project_id: WAYNE,
			project_name: 'Wayne Strategies',
			entity_type: 'task' as const,
			action: 'updated',
			created_at: '2026-11-08T03:55:00.000Z'
		};
		const due = '2026-11-07T04:59:59+00:00';
		const activity = buildInboxActivity({
			since: '',
			runs: [],
			suggestions: [],
			logs: [
				{
					...log,
					id: 'l1',
					entity_id: 'lawn',
					before: { title: 'Mow lawn', state_key: 'todo', due_at: due },
					after: { title: 'Mow lawn', state_key: 'done', due_at: due }
				},
				{
					...log,
					id: 'l2',
					entity_id: 'call',
					before: { title: 'Call Dauntless Dogs', state_key: 'todo', due_at: due },
					after: { state_key: 'todo', due_at: '2026-11-14T04:59:59+00:00' }
				},
				// Not overdue when it was finished: an ordinary edit, not a check-in.
				{
					...log,
					id: 'l3',
					entity_id: 'early',
					before: {
						title: 'Early',
						state_key: 'todo',
						due_at: '2026-11-20T04:59:59+00:00'
					},
					after: { state_key: 'done' }
				},
				// Marked done, then put back: the latest row settles nothing.
				{
					...log,
					id: 'l5',
					entity_id: 'undo',
					created_at: '2026-11-08T04:00:00.000Z',
					before: { title: 'Undo me', state_key: 'done', due_at: due },
					after: { state_key: 'todo', due_at: due }
				},
				{
					...log,
					id: 'l4',
					entity_id: 'undo',
					before: { title: 'Undo me', state_key: 'todo', due_at: due },
					after: { state_key: 'done', due_at: due }
				},
				{
					...log,
					id: 'l6',
					entity_type: 'project' as const,
					entity_id: WAYNE,
					before: { state_key: 'active' },
					after: { state_key: 'paused' }
				}
			]
		});
		const entries = activity.happened[0]?.entries ?? [];
		expect(entries.map((entry) => [entry.headline, entry.stateLabel]).sort()).toEqual([
			['Call Dauntless Dogs', 'You moved it'],
			['Mow lawn', 'You marked it done'],
			['Wayne Strategies', 'You paused the project']
		]);
		const lawn = entries.find((entry) => entry.headline === 'Mow lawn');
		expect(lawn?.changes[0]).toMatchObject({
			text: 'Task',
			rows: [{ label: 'Status', before: 'To do', after: 'Done' }]
		});
		expect(lawn?.changes[0]?.href).toContain('lawn');
		expect(activity.happened[0]?.bluf).toBe('3 you answered');
	});

	it('says so when nothing happened', () => {
		const empty = buildInboxActivity({ since: '', suggestions: [], runs: [] });
		expect(empty.bluf).toEqual([
			'Nothing changed in the last 7 days.',
			'Nothing is waiting on you.'
		]);
		expect(empty.lastReview).toBeNull();
	});
});
