// apps/web/src/lib/components/agent/context-selection-chips.test.ts
import { parseContextSelectionEventV1 } from '@buildos/shared-types';
import { describe, expect, it } from 'vitest';
import type { UIMessage } from './agent-chat.types';
import {
	chipHref,
	contextSelectionOf,
	orderedChips,
	projectHref,
	projectsLabel,
	readRecordIdsByTurn
} from './context-selection-chips';

const DOC = '50000000-0000-4000-8000-000000000005';
const TASK = '50000000-0000-4000-8000-000000000006';
const GOAL = '50000000-0000-4000-8000-000000000007';
const PROJECT = '30000000-0000-4000-8000-000000000003';

function payload(overrides: Record<string, unknown> = {}) {
	return {
		type: 'context_selection',
		version: 1,
		mode: 'chips',
		visible: true,
		injected: false,
		status: 'selected',
		failure: null,
		client_turn_id: 'client-turn-1',
		turn_run_id: 'turn-1',
		project_id: PROJECT,
		items: [
			{ kind: 'task', id: TASK, label: 'Budget', tier: 'summary', p: 0.4, sections: [] },
			{
				kind: 'document',
				id: DOC,
				label: 'Founder Call Parse',
				tier: 'full',
				p: 0.8,
				sections: ['What appears settled']
			},
			{ kind: 'goal', id: GOAL, label: 'Operational readiness', tier: 'full', p: 0.6 }
		],
		counts: { full: 2, summary: 1, checked: 28 },
		elapsed_ms: 420,
		...overrides
	};
}

describe('parseContextSelectionEventV1', () => {
	it('keeps well-formed chips and drops malformed ones', () => {
		const parsed = parseContextSelectionEventV1(
			payload({
				items: [
					...payload().items,
					{ kind: 'spaceship', id: 'x', label: 'no' },
					{ kind: 'task', id: 7, label: 'bad id' },
					'junk'
				]
			})
		)!;
		expect(parsed.items.map((item) => item.id)).toEqual([TASK, DOC, GOAL]);
		expect(parsed.items[2]).toMatchObject({ pinned: false, sections: [] });
	});

	it('rejects the wrong type, version, mode or status', () => {
		expect(parseContextSelectionEventV1(payload({ type: 'timing' }))).toBeNull();
		expect(parseContextSelectionEventV1(payload({ version: 2 }))).toBeNull();
		expect(parseContextSelectionEventV1(payload({ mode: 'loud' }))).toBeNull();
		expect(parseContextSelectionEventV1(payload({ status: 'great' }))).toBeNull();
		expect(parseContextSelectionEventV1(null)).toBeNull();
	});
});

describe('chip helpers', () => {
	it('reads only visible selections off a user message', () => {
		const message = (context_selection: unknown) =>
			({
				id: 'm',
				type: 'user',
				content: 'q',
				timestamp: new Date(),
				metadata: { context_selection }
			}) as UIMessage;
		expect(contextSelectionOf(message(payload()))?.items).toHaveLength(3);
		expect(contextSelectionOf(message(payload({ visible: false })))).toBeNull();
		expect(contextSelectionOf(message(undefined))).toBeNull();
	});

	it('orders full chips before summaries', () => {
		const parsed = parseContextSelectionEventV1(payload())!;
		expect(orderedChips(parsed).map((chip) => chip.id)).toEqual([DOC, GOAL, TASK]);
	});

	it('links tasks and documents only', () => {
		const [task, doc, goal] = parseContextSelectionEventV1(payload())!.items;
		expect(chipHref(task!, PROJECT)).toBe(`/projects/${PROJECT}/tasks/${TASK}`);
		expect(chipHref(doc!, PROJECT)).toBe(`/projects/${PROJECT}/documents/${DOC}`);
		expect(chipHref(goal!, PROJECT)).toBeNull();
		expect(chipHref(doc!, null)).toBeNull();
	});

	it('collects record ids the turn’s tools touched, from objects and JSON strings', () => {
		const messages = [
			{
				id: 'b1',
				type: 'thinking_block',
				content: '',
				timestamp: new Date(),
				metadata: { turn_run_id: 'turn-1' },
				activities: [
					{
						metadata: {
							rawArguments: JSON.stringify({ document_id: DOC.toUpperCase() })
						}
					},
					{
						metadata: {
							arguments: { filters: { task_ids: [TASK] }, note: 'not-an-id' }
						}
					}
				]
			},
			{
				id: 'b2',
				type: 'thinking_block',
				content: '',
				timestamp: new Date(),
				metadata: { turn_run_id: 'turn-2' },
				activities: [{ metadata: { arguments: { goal_id: GOAL } } }]
			}
		] as unknown as UIMessage[];
		const byTurn = readRecordIdsByTurn(messages);
		expect([...byTurn.get('turn-1')!].sort()).toEqual([DOC, TASK].sort());
		expect(byTurn.get('turn-2')!.has(GOAL)).toBe(true);
	});
});

describe('global (workspace) selections', () => {
	const OTHER = '30000000-0000-4000-8000-000000000009';
	const globalPayload = (overrides: Record<string, unknown> = {}) =>
		payload({
			project_id: null,
			workspace: { scope: 'projects', dig: true, dig_p: 0.8, checked: 46 },
			projects: [
				{ id: PROJECT, name: 'Redline Training', p: 0.94, hop2: 'ran' },
				{ id: OTHER, name: 'Tacemus', p: 0.55, hop2: 'deadline' },
				{ id: 7, name: 'bad' },
				{ id: OTHER, name: 'Tacemus', p: 0.5, hop2: 'teleported' }
			],
			items: [
				{
					kind: 'document',
					id: DOC,
					label: 'Discovery Notes',
					tier: 'full',
					p: 0.9,
					sections: [],
					project_id: OTHER
				}
			],
			...overrides
		});

	it('parses the focused projects and the workspace summary', () => {
		const parsed = parseContextSelectionEventV1(globalPayload())!;
		expect(parsed.workspace).toEqual({ scope: 'projects', dig: true, checked: 46 });
		expect(parsed.projects.map((p) => [p.name, p.hop2])).toEqual([
			['Redline Training', 'ran'],
			['Tacemus', 'deadline'],
			['Tacemus', 'skipped']
		]);
		expect(parsed.items[0]!.project_id).toBe(OTHER);
	});

	it("links a global record to its own project, not the turn's", () => {
		const parsed = parseContextSelectionEventV1(globalPayload())!;
		expect(chipHref(parsed.items[0]!, parsed.project_id)).toBe(
			`/projects/${OTHER}/documents/${DOC}`
		);
		expect(projectHref(PROJECT)).toBe(`/projects/${PROJECT}`);
	});

	it('labels portfolio selections "Across" and project selections "Looking in"', () => {
		expect(projectsLabel(parseContextSelectionEventV1(globalPayload())!)).toBe('Looking in');
		expect(
			projectsLabel(
				parseContextSelectionEventV1(
					globalPayload({ workspace: { scope: 'portfolio', dig: false, checked: 46 } })
				)!
			)
		).toBe('Across');
	});

	it('leaves project-turn selections without workspace fields', () => {
		const parsed = parseContextSelectionEventV1(payload())!;
		expect(parsed.workspace).toBeNull();
		expect(parsed.projects).toEqual([]);
		expect(parsed.items[0]!.project_id).toBeNull();
	});
});
