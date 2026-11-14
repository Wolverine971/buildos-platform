// packages/agentic-chat-client/src/agent-chat-turn-cards.test.ts
import { describe, expect, it } from 'vitest';
import type { ActivityEntry } from './agent-chat.types';
import {
	CONTEXT_SELECTION_METADATA_KEY,
	continueInProjectTarget,
	contextSelectionIsShowable,
	deriveTurnCards,
	describeLedger,
	describePulled,
	normalizeContextSelection,
	readTurnSelection,
	stepProjectId
} from './agent-chat-turn-cards';

let seq = 0;
function step(
	toolName: string,
	args: Record<string, unknown> | string = {},
	result?: Record<string, unknown>
): ActivityEntry {
	seq += 1;
	return {
		id: `step-${seq}`,
		content: toolName,
		timestamp: new Date(seq * 1000),
		activityType: 'tool_call',
		status: 'completed',
		metadata: { toolName, arguments: args, ...(result ? { result } : {}) }
	};
}

function selectionActivity(payload: Record<string, unknown>): ActivityEntry {
	seq += 1;
	return {
		id: `sel-${seq}`,
		content: 'Context picked',
		timestamp: new Date(seq * 1000),
		activityType: 'ontology_loaded',
		metadata: {
			[CONTEXT_SELECTION_METADATA_KEY]: {
				type: 'context_selection',
				version: 1,
				mode: 'on',
				visible: true,
				injected: true,
				status: 'selected',
				failure: null,
				client_turn_id: 'c1',
				turn_run_id: 't1',
				project_id: null,
				workspace: null,
				projects: [],
				items: [],
				counts: { full: 0, summary: 0, checked: 0 },
				elapsed_ms: 400,
				...payload
			}
		}
	};
}

const WAYNE = { id: 'p-wayne', name: 'Wayne Strategies' };

describe('stepProjectId', () => {
	it('reads the project from arguments, then the result', () => {
		expect(stepProjectId(step('list_onto_tasks', { project_id: 'p1' }))).toBe('p1');
		expect(stepProjectId(step('list_onto_tasks', '{"project_id":"p2"}'))).toBe('p2');
		expect(
			stepProjectId(
				step('get_onto_task_details', { task_id: 't' }, { task: { project_id: 'p3' } })
			)
		).toBe('p3');
		expect(stepProjectId(step('web_search', { query: 'x' }))).toBeNull();
	});
});

describe('deriveTurnCards', () => {
	it('gives a project chat one card with every step, including ones that name no project', () => {
		const activities = [
			selectionActivity({
				project_id: WAYNE.id,
				items: [
					{ kind: 'document', id: 'd1', label: 'Worklist', tier: 'full', sections: [] },
					{ kind: 'task', id: 't1', label: 'Griffin', tier: 'summary', sections: [] },
					{ kind: 'goal', id: 'g1', label: 'Q4 plan', tier: 'full', sections: [] },
					{ kind: 'task', id: 't2', label: 'Cutlass', tier: 'summary', sections: [] }
				],
				counts: { full: 2, summary: 2, checked: 9 }
			}),
			step('search_onto_tasks', { query: 'Cutlass', project_id: WAYNE.id }),
			step('web_search', { query: 'Cutlass pricing' }),
			step('list_calendar_events', { timeMin: 'x' })
		];
		const { cards, picked } = deriveTurnCards({ activities, sessionProject: WAYNE });
		expect(picked).toBeNull();
		expect(cards).toHaveLength(1);
		expect(cards[0]!.name).toBe('Wayne Strategies');
		expect(cards[0]!.stepIds).toHaveLength(3);
		expect(cards[0]!.pulled).toEqual({
			count: 4,
			checked: 9,
			labels: ['Worklist', 'Q4 plan', 'Griffin']
		});
		expect(describePulled(cards[0]!.pulled!)).toEqual({
			label: 'Pulled in 4 of 9',
			detail: 'Worklist, Q4 plan, Griffin +1 more'
		});
	});

	it('splits a global turn by project, seeded from the finder picks, across-project steps last', () => {
		const activities = [
			selectionActivity({
				workspace: { scope: 'projects', dig: true, checked: 12 },
				projects: [
					{ id: 'p-9t', name: '9takes', p: 0.9, hop2: 'ran' },
					{ id: WAYNE.id, name: WAYNE.name, p: 0.8, hop2: 'ran' }
				],
				items: [
					{
						kind: 'document',
						id: 'd9',
						label: 'Wings guide',
						tier: 'full',
						sections: [],
						project_id: 'p-9t'
					}
				]
			}),
			step('update_onto_task', { task_id: 'g', project_id: WAYNE.id }),
			step('search_all_projects', { query: 'Speed Insights' }),
			step('get_onto_document_details', { document_id: 'd9' }, { project_id: 'p-9t' })
		];
		const { cards, picked } = deriveTurnCards({ activities, sessionProject: null });
		expect(picked).toEqual({ checked: 12, picked: 2, names: ['9takes', 'Wayne Strategies'] });
		expect(cards.map((card) => card.name)).toEqual([
			'9takes',
			'Wayne Strategies',
			'Across projects'
		]);
		expect(cards[0]!.pulled?.labels).toEqual(['Wings guide']);
		expect(cards[0]!.stepIds).toHaveLength(1);
		expect(cards[2]!.stepIds).toHaveLength(1);
	});

	it('folds no-project steps into the only project card in a global chat', () => {
		const activities = [
			step('web_search', { query: 'x' }),
			step('update_onto_task', { project_id: 'p1' }, { task: { project_id: 'p1' } })
		];
		const { cards } = deriveTurnCards({ activities, sessionProject: null });
		expect(cards).toHaveLength(1);
		expect(cards[0]!.stepIds).toEqual([activities[0]!.id, activities[1]!.id]);
		expect(cards[0]!.name).toBe('Another project');
	});

	it('names projects from the results it already has', () => {
		const activities = [
			step(
				'search_all_projects',
				{ query: 'x' },
				{ results: [{ id: 't', project_id: 'p7', project_name: 'Cadre' }] }
			),
			step('get_onto_task_details', { task_id: 't' }, { task: { project_id: 'p7' } }),
			step('list_onto_goals', { project_id: 'p8' })
		];
		const { cards } = deriveTurnCards({ activities, sessionProject: null });
		expect(cards.map((card) => card.name)).toEqual([
			'Cadre',
			'Another project',
			'Across projects'
		]);
	});

	it('ignores a selection that was not put in front of the model, and keeps empty cards out', () => {
		const activities = [
			selectionActivity({
				injected: false,
				project_id: WAYNE.id,
				items: [{ kind: 'task', id: 't', label: 'Griffin', tier: 'full', sections: [] }]
			})
		];
		expect(deriveTurnCards({ activities, sessionProject: WAYNE }).cards).toEqual([]);
	});
});

describe('continueInProjectTarget', () => {
	const global = (projects: Array<{ id: string; name: string; p: number | null }>) =>
		selectionActivity({
			workspace: { scope: 'projects', dig: false, checked: 8 },
			projects: projects.map((project) => ({ ...project, hop2: 'ran' }))
		});

	it('offers the one project a global turn was confidently about', () => {
		expect(continueInProjectTarget([global([{ ...WAYNE, p: 0.86 }])])).toEqual(WAYNE);
	});

	it('stays quiet for several projects, low confidence, or a project chat', () => {
		expect(
			continueInProjectTarget([
				global([
					{ ...WAYNE, p: 0.9 },
					{ id: 'p2', name: '9takes', p: 0.8 }
				])
			])
		).toBeNull();
		expect(continueInProjectTarget([global([{ ...WAYNE, p: 0.5 }])])).toBeNull();
		expect(continueInProjectTarget([selectionActivity({ project_id: WAYNE.id })])).toBeNull();
		expect(continueInProjectTarget([])).toBeNull();
	});
});

describe('carried from last turn', () => {
	it('shows carried items apart from what the finder pulled in this turn', () => {
		const activities = [
			selectionActivity({
				project_id: WAYNE.id,
				items: [
					{
						kind: 'document',
						id: 'd1',
						label: 'Worklist',
						tier: 'full',
						sections: ['Group 1'],
						carried: true
					},
					{ kind: 'task', id: 't1', label: 'Griffin', tier: 'full', sections: [] }
				],
				counts: { full: 2, summary: 0, checked: 7 }
			})
		];
		const [card] = deriveTurnCards({ activities, sessionProject: WAYNE }).cards;
		expect(card?.carried).toEqual(['Worklist › Group 1']);
		expect(card?.pulled).toEqual({ count: 1, checked: 7, labels: ['Griffin'] });
	});
});

describe('the turn ledger', () => {
	const RADAR = { id: 'p-radar', name: 'Radar' };
	const doc = (id: string, label: string, extra: Record<string, unknown> = {}) => ({
		kind: 'document',
		id,
		label,
		tier: 'full',
		sections: [],
		...extra
	});
	const sectionRead = (id: string, title: string, headings: string[]) =>
		step(
			'read_document_section',
			{ document_id: id },
			{
				document_id: id,
				project_id: RADAR.id,
				title,
				content: 'text',
				sections: headings.map((heading) => ({ heading }))
			}
		);

	it('never calls a summary read: handed, opened and changed are separate states', () => {
		const activities = [
			selectionActivity({
				project_id: RADAR.id,
				items: [
					doc('d10', 'Radar Nov 10', { given: 'card', sections: ['New', 'Updates'] }),
					doc('d9', 'Radar Nov 9', { given: 'card' }),
					doc('d3', 'Radar Nov 3', { tier: 'summary', given: 'line' }),
					{
						kind: 'task',
						id: 't1',
						label: 'Review leads',
						tier: 'full',
						sections: [],
						given: 'text'
					}
				],
				counts: { full: 3, summary: 1, checked: 24 }
			}),
			sectionRead('d10', 'Radar Nov 10', ['New', 'Updates']),
			step(
				'list_onto_documents',
				{ project_id: RADAR.id },
				{ documents: [{ id: 'd9', title: 'Radar Nov 9' }] }
			),
			{
				...step('update_onto_task', { task_id: 't1', project_id: RADAR.id }),
				metadata: {
					toolName: 'update_onto_task',
					arguments: { task_id: 't1', project_id: RADAR.id },
					affectedEntities: [
						{
							kind: 'task',
							id: 't1',
							title: 'Review leads',
							projectId: RADAR.id,
							operation: 'updated'
						}
					]
				}
			}
		];
		const [card] = deriveTurnCards({ activities, sessionProject: RADAR }).cards;
		const ledger = card!.ledger!;
		const state = Object.fromEntries(ledger.records.map((record) => [record.id, record.state]));
		expect(state).toEqual({ d10: 'opened', d9: 'handed', d3: 'handed', t1: 'changed' });
		// The listed doc was named, not opened.
		expect(ledger.records.find((record) => record.id === 'd9')!.note).toBe(
			'Summary and headings only — not opened'
		);
		expect(ledger.records.find((record) => record.id === 'd3')!.note).toBe(
			'One-line summary only — not opened'
		);
		expect(ledger.records.find((record) => record.id === 'd10')!.note).toBe(
			'Opened: New, Updates'
		);
		expect(ledger).toMatchObject({ checked: 24, inView: 4, opened: 2, changed: 1 });
		const view = describeLedger(ledger);
		expect(view.label).toBe('Looked through 24 · 4 in view · 2 opened · 1 changed');
		expect(view.label).not.toMatch(/pulled|read/i);
		expect(view.groups.map((group) => [group.title, group.records.length])).toEqual([
			['Changed', 1],
			['Opened', 1],
			['Summary and headings only', 1],
			['One-line summary only', 1]
		]);
	});

	it('reads an older event with no `given`: documents are cards, records and carried text are given', () => {
		const activities = [
			selectionActivity({
				project_id: RADAR.id,
				items: [
					doc('d1', 'Worklist', { sections: ['Group 1'] }),
					doc('d2', 'Carried doc', { carried: true, sections: ['Leads'] }),
					{ kind: 'task', id: 't1', label: 'Griffin', tier: 'full', sections: [] },
					{ kind: 'task', id: 't2', label: 'Cutlass', tier: 'summary', sections: [] }
				],
				counts: { full: 3, summary: 1, checked: 9 }
			})
		];
		const ledger = deriveTurnCards({ activities, sessionProject: RADAR }).cards[0]!.ledger!;
		expect(
			Object.fromEntries(ledger.records.map((record) => [record.id, record.group]))
		).toEqual({
			d1: 'card',
			d2: 'given',
			t1: 'given',
			t2: 'line'
		});
		expect(ledger.records.find((record) => record.id === 'd1')!.note).toBe(
			'Summary and headings only — not opened. Flagged: Group 1'
		);
		expect(ledger.records.find((record) => record.id === 'd2')!.note).toBe(
			'Carried from last turn, text in view: Leads'
		);
		expect(describeLedger(ledger).label).toBe('Looked through 9 · 4 in view · 2 opened');
	});

	it('a held or undone change moves nothing; a failed read opens nothing', () => {
		const write = (id: string, extra: Record<string, unknown> = {}): ActivityEntry => ({
			...step('update_onto_document', { document_id: 'd1', project_id: RADAR.id }),
			id,
			metadata: {
				toolName: 'update_onto_document',
				arguments: { document_id: 'd1', project_id: RADAR.id },
				affectedEntities: [
					{
						kind: 'document',
						id: 'd1',
						title: 'Menu',
						projectId: RADAR.id,
						operation: 'updated'
					}
				],
				...extra
			}
		});
		const held = deriveTurnCards({
			activities: [write('w-held', { requiresUserAction: true })],
			sessionProject: RADAR
		}).cards[0]!;
		expect(held.ledger).toBeNull();
		const undone = deriveTurnCards({
			activities: [write('w-undone')],
			sessionProject: RADAR,
			settled: { 'w-undone': { state: 'undone', label: 'Undone' } }
		}).cards[0]!;
		expect(undone.ledger).toBeNull();
		const saved = deriveTurnCards({ activities: [write('w-saved')], sessionProject: RADAR })
			.cards[0]!;
		expect(saved.ledger!.records[0]).toMatchObject({ state: 'changed', note: 'Updated' });
		const failed = deriveTurnCards({
			activities: [{ ...sectionRead('d1', 'Menu', ['A']), status: 'failed' as const }],
			sessionProject: RADAR
		}).cards[0]!;
		expect(failed.ledger).toBeNull();
	});

	it('says what the model got without a chip, and when context could not be checked', () => {
		const broad = deriveTurnCards({
			activities: [
				selectionActivity({
					project_id: RADAR.id,
					scope: 'broad',
					snapshot: { chars: 4200 },
					notes: { changed: 2, not_loaded: 1 }
				})
			],
			sessionProject: RADAR
		});
		expect(broad.contextLines).toEqual([
			'Also given: a snapshot of the whole project',
			'Also told: 2 records changed since last turn',
			'Also told: 1 earlier record was not reloaded'
		]);
		const unavailable = deriveTurnCards({
			activities: [
				selectionActivity({
					project_id: RADAR.id,
					injected: false,
					status: 'unavailable',
					failure: 'deadline'
				})
			],
			sessionProject: RADAR
		});
		expect(unavailable.contextLines).toEqual([
			"Couldn't check project context this turn (it took too long)"
		]);
		const empty = deriveTurnCards({
			activities: [
				selectionActivity({
					project_id: RADAR.id,
					injected: false,
					status: 'empty',
					counts: { full: 0, summary: 0, checked: 24 }
				})
			],
			sessionProject: RADAR
		});
		expect(empty.contextLines).toEqual(['Looked through 24 records · nothing relevant found']);
	});

	it('keeps the honest-ledger fields when a payload is normalized for storage', () => {
		const raw = selectionActivity({
			project_id: RADAR.id,
			items: [doc('d1', 'Worklist', { given: 'card', partial: true })],
			scope: 'broad',
			snapshot: { chars: 10 },
			notes: { changed: 1, not_loaded: 0 },
			injection: { chars: 900, sha256: 'abc' }
		}).metadata![CONTEXT_SELECTION_METADATA_KEY];
		const stored = normalizeContextSelection(raw)!;
		expect(stored.items[0]).toMatchObject({ id: 'd1', given: 'card', partial: true });
		expect(stored).toMatchObject({
			scope: 'broad',
			snapshot: { chars: 10 },
			notes: { changed: 1, not_loaded: 0 },
			injection: { chars: 900, sha256: 'abc' }
		});
		expect(normalizeContextSelection({ type: 'nope' })).toBeNull();
		expect(contextSelectionIsShowable(stored)).toBe(true);
		expect(
			contextSelectionIsShowable(
				readTurnSelection([selectionActivity({ injected: false, visible: false })])
			)
		).toBe(false);
	});
});
