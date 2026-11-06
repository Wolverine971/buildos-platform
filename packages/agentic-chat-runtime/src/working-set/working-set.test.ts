// packages/agentic-chat-runtime/src/working-set/working-set.test.ts
import { describe, expect, it } from 'vitest';
import type { ContextFinderEntity } from '../context-finder/packets';
import {
	CARRY_IDLE_TURNS,
	CARRY_MAX_CHARS,
	buildTurnWorkingSetV1,
	buildWorkingSet,
	carriedBlock,
	planRehydrate,
	readTurnWorkingSetV1,
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
		expect(set?.carry.find((item) => item.id === 't1')?.version).toBe('v7');
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
