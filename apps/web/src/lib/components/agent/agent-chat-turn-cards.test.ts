// apps/web/src/lib/components/agent/agent-chat-turn-cards.test.ts
import { describe, expect, it } from 'vitest';
import type { ActivityEntry } from './agent-chat.types';
import {
	CONTEXT_SELECTION_METADATA_KEY,
	continueInProjectTarget,
	deriveTurnCards,
	describePulled,
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
		expect(picked).toEqual({ checked: 12, picked: 2 });
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
