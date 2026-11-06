// packages/agentic-chat-runtime/src/working-set/working-set.test.ts
import { describe, expect, it } from 'vitest';
import { buildContextFinderEntities, type ContextFinderEntity } from '../context-finder/packets';
import {
	CARRY_IDLE_TURNS,
	CARRY_MAX_CHARS,
	buildTurnWorkingSetV1,
	buildWorkingSet,
	carriedBlock,
	carriedText,
	planRehydrate,
	planTurnCarry,
	readTurnWorkingSetV1,
	renderTurnCarry,
	type CarryItem,
	type ReadTrace
} from './working-set';

const item = (over: Partial<CarryItem> = {}): CarryItem => ({
	id: 'd1',
	kind: 'document',
	title: 'Worklist',
	anchors: ['group-1'],
	headings: ['Group 1'],
	version: 'v1',
	chars: 600,
	idle: 0,
	...over
});
const read = (over: Partial<ReadTrace> = {}): ReadTrace => ({
	...item(),
	whole: false,
	docChars: 9000,
	...over
});
const entity = (id: string, version: string, kind = 'document') =>
	({
		id,
		kind,
		version,
		title: id,
		sections: [],
		fullText: ''
	}) as unknown as ContextFinderEntity;

const empty = {
	carriedIn: [],
	reads: [],
	used: new Set<string>(),
	keep: null,
	related: [],
	previousScanned: []
};

describe('working set', () => {
	it('carries what the turn used and notes the rest as scanned', () => {
		const set = buildWorkingSet({
			...empty,
			reads: [
				read(),
				read({ id: 't9', kind: 'task', title: 'Cutlass', anchors: [], headings: [] })
			],
			used: new Set(['d1'])
		});
		expect(set.carry.map((entry) => entry.id)).toEqual(['d1']);
		expect(set.scanned).toEqual([{ id: 't9', kind: 'task', title: 'Cutlass' }]);
	});

	it('fades carried items nobody used, then drops them to the note', () => {
		let carriedIn = [item()];
		for (let turn = 1; turn < CARRY_IDLE_TURNS; turn++) {
			carriedIn = buildWorkingSet({ ...empty, carriedIn }).carry;
			expect(carriedIn[0]?.idle).toBe(turn);
		}
		const faded = buildWorkingSet({ ...empty, carriedIn });
		expect(faded.carry).toEqual([]);
		expect(faded.scanned.map((entry) => entry.id)).toEqual(['d1']);
	});

	it("doesn't carry a long document read whole", () => {
		const set = buildWorkingSet({
			...empty,
			reads: [read({ anchors: [], headings: [], whole: true, chars: 9000 })],
			used: new Set(['d1'])
		});
		expect(set.carry).toEqual([]);
	});

	it('keeps carried text under the budget; the overflow becomes a note', () => {
		const big = (id: string) =>
			read({ id, chars: Math.ceil(CARRY_MAX_CHARS * 0.6), anchors: [id], headings: [id] });
		const set = buildWorkingSet({
			...empty,
			reads: [big('a'), big('b')],
			used: new Set(['a', 'b'])
		});
		expect(set.carry).toHaveLength(1);
		expect(set.scannedCount).toBe(1);
	});
});

describe('loading the carry next turn', () => {
	it('loads unchanged items, flags edited ones, and drops ids not in this project', () => {
		const byId = new Map([
			['d1', entity('d1', 'v1')],
			['d2', entity('d2', 'v3')]
		]);
		const plan = planRehydrate(
			[item(), item({ id: 'd2', version: 'v2' }), item({ id: 'forged' })],
			byId
		);
		expect(plan.load.map(({ item: entry }) => entry.id)).toEqual(['d1']);
		expect(plan.changed.map(({ item: entry }) => entry.id)).toEqual(['d2']);
		expect(plan.gone.map((entry) => entry.id)).toEqual(['forged']);
	});

	it('writes the carried block the next prompt starts with', () => {
		const block = carriedBlock({
			loaded: [{ item: item(), ref: 'd1', text: 'Ship Griffin by Monday.' }],
			changed: [],
			over: [],
			scanned: [{ ref: 't9', title: 'Cutlass' }],
			scannedCount: 3
		});
		expect(block).toContain("don't read these sections again");
		expect(block).toContain('↺ d1 · Worklist › Group 1');
		expect(block).toContain('Ship Griffin by Monday.');
		expect(block).toContain('t9 Cutlass (+2 more)');
		expect(
			carriedBlock({ loaded: [], changed: [], over: [], scanned: [], scannedCount: 0 })
		).toBe('');
	});
});

describe('a finished real-chat turn', () => {
	const P = 'p-wayne';
	const exec = (toolName: string, args: unknown, payload: unknown, success = true) => ({
		toolName,
		arguments: JSON.stringify(args),
		result: { tool_call_id: 'x', success, result: payload },
		success
	});

	it('carries the sections it read and the records it opened or changed, in its project', () => {
		const set = buildTurnWorkingSetV1({
			projectId: P,
			executions: [
				exec(
					'read_document_section',
					{ document_id: 'd1', anchors: ['group-1'] },
					{
						document_id: 'd1',
						project_id: P,
						title: 'Worklist',
						sections: [{ anchor: 'group-1', heading: 'Group 1', chars: 640 }],
						text: '…'
					}
				),
				exec(
					'get_onto_task_details',
					{ task_id: 't1' },
					{ task: { id: 't1', title: 'Griffin pitch', project_id: P, updated_at: 'v7' } }
				),
				exec(
					'update_onto_goal',
					{ goal_id: 'g1' },
					{ goal: { id: 'g1', name: 'Q4 plan', project_id: P } }
				),
				exec(
					'get_onto_task_details',
					{ task_id: 'other' },
					{ task: { id: 'other', title: 'Elsewhere', project_id: 'p-9takes' } }
				),
				exec('search_onto_tasks', { query: 'x' }, { tasks: [{ id: 't5', project_id: P }] }),
				exec('get_onto_task_details', { task_id: 't9' }, { error: 'boom' }, false)
			]
		});
		expect(set?.carry.map((item) => [item.id, item.kind, item.headings])).toEqual([
			['d1', 'document', ['Group 1']],
			['t1', 'task', []],
			['g1', 'goal', []]
		]);
		// Carried text reloads from the current index, so no version is kept.
		expect(set?.carry.find((item) => item.id === 't1')?.version).toBeNull();
	});

	// Shapes copied from a live turn (2026-11-06): asking for a section and one nested inside it
	// comes back as a single section; two separate sections come back as `sections[]`.
	it('reads every shape the section tool answers in', () => {
		const single = exec(
			'read_document_section',
			{ document_id: 'd1', anchors: ['revised-scan', 'freshly-inspected-leads'] },
			{
				document_id: 'd1',
				project_id: P,
				title: 'Graphics cards',
				found: true,
				anchor: 'revised-scan',
				heading: 'Revised scan',
				level: 1,
				content: '# Revised scan…',
				offset: 0,
				total_chars: 3841,
				truncated: false
			}
		);
		const several = exec(
			'read_document_section',
			{ document_id: 'd2', anchors: ['leads', 'gaps'] },
			{
				document_id: 'd2',
				project_id: P,
				title: 'Lawn edger',
				found: true,
				sections: [
					{ anchor: 'leads', heading: 'Leads', level: 2, chars: 900 },
					{ anchor: 'gaps', heading: 'Gaps', level: 2, chars: 300 }
				],
				content: '…',
				offset: 0,
				total_chars: 1202,
				truncated: false
			}
		);
		const body = exec(
			'read_document_section',
			{ document_id: 'd3' },
			{
				document_id: 'd3',
				project_id: P,
				title: 'Short note',
				found: true,
				content: 'Call the seller Friday.',
				offset: 0,
				total_chars: 23,
				truncated: false
			}
		);
		const set = buildTurnWorkingSetV1({ projectId: P, executions: [single, several, body] });
		expect(set?.carry.map((entry) => [entry.id, entry.anchors, entry.chars])).toEqual([
			['d1', ['revised-scan'], 3841],
			['d2', ['leads', 'gaps'], 1200],
			['d3', [], 23]
		]);
	});

	it('stores nothing for a turn that only searched', () => {
		expect(
			buildTurnWorkingSetV1({
				projectId: P,
				executions: [exec('search_onto_tasks', { query: 'x' }, { tasks: [] })]
			})
		).toBeNull();
	});

	it('reads back only a well-formed set for the same project', () => {
		const stored = buildTurnWorkingSetV1({
			projectId: P,
			executions: [
				exec(
					'get_onto_task_details',
					{},
					{ task: { id: 't1', title: 'Griffin', project_id: P } }
				)
			]
		});
		expect(readTurnWorkingSetV1(JSON.parse(JSON.stringify(stored)), P)?.carry[0]?.id).toBe(
			't1'
		);
		expect(readTurnWorkingSetV1(stored, 'p-other')).toBeNull();
		expect(readTurnWorkingSetV1({ version: 2 }, P)).toBeNull();
	});
});

describe('the next real-chat turn reloads the carry', () => {
	const P = '00000000-0000-4000-8000-000000000099';
	const DOC = '00000000-0000-4000-8000-000000000001';
	const TASK = '00000000-0000-4000-8000-000000000004';
	const entities = buildContextFinderEntities({
		project: { id: P, name: 'School launch', description: '' },
		documents: [
			{
				id: DOC,
				title: 'Questions for Mom',
				type_key: 'document.knowledge',
				content: [
					'# Questions for Mom',
					'## Funding & Operations',
					'Budget is $300K.',
					'## Team & Support',
					'Board: grandmother, pastor.'
				].join('\n')
			}
		],
		tasks: [
			{
				id: TASK,
				title: 'Call the pastor',
				state_key: 'todo',
				description: 'Ask about Sunday.'
			}
		],
		goals: [],
		plans: [],
		milestones: [],
		risks: []
	} as never);
	const funding = entities
		.find((entity) => entity.id === DOC)!
		.sections.find((section) => section.heading.startsWith('Funding'))!.anchor!;

	it('loads carried sections and records by id, titles from the index, ids it lost dropped', () => {
		const set = {
			version: 1 as const,
			project_id: P,
			carry: [
				item({
					id: DOC,
					title: 'forged title',
					anchors: [funding, 'not-a-section'],
					version: null
				}),
				item({ id: TASK, kind: 'task', anchors: [], headings: [], version: null }),
				item({ id: 'gone', version: null })
			],
			scanned: [],
			scanned_count: 0
		};
		const { plan } = planTurnCarry({ set, entities });
		expect(plan.gone.map((entry) => entry.id)).toEqual(['gone']);
		const out = renderTurnCarry({ set, plan, entities });
		expect(out.block).toContain(`↺ document ${DOC} · Questions for Mom › Funding & Operations`);
		expect(out.block).toContain('Budget is $300K.');
		expect(out.block).not.toContain('Board: grandmother');
		expect(out.block).not.toContain('forged title');
		expect(out.block).toContain(`↺ task ${TASK}`);
		expect(out.loaded.map((entry) => entry.id)).toEqual([DOC, TASK]);
		expect(out.carryIn.carry.map((entry) => entry.id)).toEqual([DOC, TASK]);
	});

	it('sends a section once when it sits inside another carried section', () => {
		const doc = entities.find((entity) => entity.id === DOC)!;
		const top = doc.sections.find((section) => section.level === 1)!.anchor!;
		const text = carriedText(item({ id: DOC, anchors: [top, funding] }), doc);
		expect(text.match(/Budget is \$300K/g)).toHaveLength(1);
	});

	it('keeps this turn’s sections when adding the carried ones would overflow', () => {
		const set = buildTurnWorkingSetV1({
			projectId: P,
			executions: [
				{
					toolName: 'read_document_section',
					arguments: '{}',
					result: {
						result: {
							document_id: DOC,
							project_id: P,
							title: 'Questions for Mom',
							found: true,
							anchor: funding,
							heading: 'Funding & Operations',
							content: '…',
							total_chars: 5000
						}
					},
					success: true
				}
			],
			carriedIn: [item({ id: DOC, anchors: ['team'], chars: 7000, version: null })]
		});
		expect(set?.carry.map((entry) => entry.anchors)).toEqual([[funding]]);
	});

	it('drops a carried document whose sections are gone instead of loading all of it', () => {
		const set = {
			version: 1 as const,
			project_id: P,
			carry: [item({ id: DOC, anchors: ['renamed-away'], version: null })],
			scanned: [],
			scanned_count: 0
		};
		const { plan, textIds } = planTurnCarry({ set, entities });
		expect(plan.load).toEqual([]);
		expect(plan.gone.map((entry) => entry.id)).toEqual([DOC]);
		expect(textIds).toEqual([]);
	});

	it('fades carried items the next turn did not touch, and keeps them while in use', () => {
		const carriedIn = [
			item({ id: TASK, kind: 'task', anchors: [], headings: [], version: null })
		];
		const untouched = buildTurnWorkingSetV1({ projectId: P, executions: [], carriedIn });
		expect(untouched?.carry[0]?.idle).toBe(1);
		const reread = buildTurnWorkingSetV1({
			projectId: P,
			executions: [
				{
					toolName: 'update_onto_task',
					arguments: '{}',
					result: {
						result: { task: { id: TASK, title: 'Call the pastor', project_id: P } }
					},
					success: true
				}
			],
			carriedIn
		});
		expect(reread?.carry[0]?.idle).toBe(0);
	});
});
