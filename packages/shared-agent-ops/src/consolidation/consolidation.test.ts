// packages/shared-agent-ops/src/consolidation/consolidation.test.ts
import { describe, expect, it } from 'vitest';
import {
	answeredOps,
	describeOps,
	orderedOptions,
	parseConsolidationOp,
	parseConsolidationQuestion,
	planOps,
	questionEdits,
	type ConsolidationPlan,
	type ConsolidationQuestion
} from './consolidation';

const RUN = '11111111-1111-4111-8111-111111111111';
const Q = '22222222-2222-4222-8222-222222222222';
const IAN = '33333333-3333-4333-8333-333333333333';
const TEMPLATE = '44444444-4444-4444-8444-444444444444';
const UXM = '55555555-5555-4555-8555-555555555555';

function row(overrides: Record<string, unknown> = {}) {
	return {
		id: Q,
		run_id: RUN,
		piece: 'cluster:c2',
		header: 'Intake twin',
		question: 'The two intake templates are identical. What should happen to the Ian copy?',
		evidence: [
			{
				document_id: IAN,
				source: 'Client Intake Template: Ian Miner',
				quote: 'Client Initial Intake Template'
			}
		],
		options: [
			{
				id: 'keep',
				label: 'Keep both',
				description: 'Nothing changes.',
				ops: [{ op: 'keep', document_ids: [IAN, TEMPLATE] }]
			},
			{
				id: 'archive',
				label: 'Archive the Ian copy',
				description: 'Restorable.',
				ops: [{ op: 'archive', document_ids: [IAN], replaced_by_id: TEMPLATE }]
			},
			{
				id: 'move',
				label: 'Move it to UXM',
				description: '',
				ops: [{ op: 'move', document_ids: [IAN], target_project_id: UXM }]
			}
		],
		recommended_option_id: 'archive',
		skip_option_id: 'keep',
		priority: 3,
		status: 'open',
		answer: null,
		draft: null,
		answered_at: null,
		created_at: '2026-10-03T15:00:00Z',
		...overrides
	};
}

describe('consolidation questions', () => {
	it('parses a valid card and puts the recommended option first', () => {
		const question = parseConsolidationQuestion(row());
		expect(question).not.toBeNull();
		expect(orderedOptions(question!).map((option) => option.id)).toEqual([
			'archive',
			'keep',
			'move'
		]);
	});

	it('refuses a skip option that changes anything', () => {
		expect(parseConsolidationQuestion(row({ skip_option_id: 'archive' }))).toBeNull();
	});

	it('refuses fewer than 2 or more than 4 options, and unknown operations', () => {
		const one = row().options.slice(0, 1);
		expect(
			parseConsolidationQuestion(row({ options: one, skip_option_id: 'keep' }))
		).toBeNull();
		const five = [
			...row().options,
			...row().options.map((option) => ({ ...option, id: `${option.id}2` }))
		].slice(0, 5);
		expect(parseConsolidationQuestion(row({ options: five }))).toBeNull();
		const bad = row().options.map((option) =>
			option.id === 'move'
				? { ...option, ops: [{ op: 'delete', document_ids: [IAN] }] }
				: option
		);
		expect(parseConsolidationQuestion(row({ options: bad }))).toBeNull();
	});

	it('refuses a recommended option that is not on the card', () => {
		expect(parseConsolidationQuestion(row({ recommended_option_id: 'nope' }))).toBeNull();
	});

	it('resolves answers to operations; a custom instruction waits for the worker', () => {
		const picked = parseConsolidationQuestion(
			row({ status: 'answered', answer: { via: 'option', option_id: 'move' } })
		)!;
		expect(answeredOps(picked)).toEqual([
			{ op: 'move', document_ids: [IAN], target_project_id: UXM }
		]);
		const typed = parseConsolidationQuestion(
			row({
				status: 'answered',
				answer: {
					via: 'text',
					text: 'move it to UXM but rename it',
					reading: {
						option_id: null,
						instruction: 'Move to UXM and rename to Ian intake',
						readback: 'Move it to UXM and rename it.'
					}
				}
			})
		)!;
		expect(answeredOps(typed)).toBeNull();
	});

	it('describes operations in plain words', () => {
		const names = {
			project: () => 'UXM Training Website',
			document: () => 'Client Intake Template'
		};
		expect(describeOps(row().options[1].ops as never, names)).toBe(
			'Archives 1 doc, pointing to “Client Intake Template”.'
		);
		expect(describeOps(row().options[0].ops as never, names)).toBe('No change.');
	});
});

describe('planOps', () => {
	const plan: ConsolidationPlan = {
		version: 1,
		documents: {},
		projects: {},
		clusters: [
			{
				key: 'c1',
				kind: 'misfiled',
				title: 'LA notes',
				document_ids: [IAN],
				reason: '',
				ops: [{ op: 'move', document_ids: [IAN], target_project_id: UXM }],
				question_id: null,
				vetoed: false
			},
			{
				key: 'c2',
				kind: 'twins',
				title: 'Intake',
				document_ids: [IAN, TEMPLATE],
				reason: '',
				ops: [],
				question_id: Q,
				vetoed: false
			},
			{
				key: 'c3',
				kind: 'versions',
				title: 'Vetoed',
				document_ids: [TEMPLATE],
				reason: '',
				ops: [{ op: 'archive', document_ids: [TEMPLATE], replaced_by_id: null }],
				question_id: null,
				vetoed: true
			}
		]
	};

	it('holds back only the clusters whose question is open', () => {
		const open = parseConsolidationQuestion(row()) as ConsolidationQuestion;
		const result = planOps(plan, [open]);
		expect(result.waiting).toEqual(['c2']);
		expect(result.ready).toEqual([{ op: 'move', document_ids: [IAN], target_project_id: UXM }]);
	});

	it('uses the answer once given, and the keep-only skip adds nothing', () => {
		const skipped = parseConsolidationQuestion(
			row({ status: 'skipped', answer: { via: 'skip', option_id: 'keep' } })
		) as ConsolidationQuestion;
		expect(planOps(plan, [skipped])).toEqual({
			ready: [{ op: 'move', document_ids: [IAN], target_project_id: UXM }],
			waiting: []
		});
	});
});

describe('merges', () => {
	const merge = {
		op: 'merge' as const,
		document_ids: [IAN, TEMPLATE],
		target_project_id: UXM,
		title: 'Client intake'
	};
	const plan: ConsolidationPlan = {
		version: 1,
		documents: {},
		projects: {},
		clusters: [
			{
				key: 'c4',
				kind: 'fragments',
				title: 'Intake notes',
				document_ids: [IAN, TEMPLATE],
				reason: '',
				ops: [merge],
				question_id: null,
				vetoed: false
			}
		]
	};

	it('parses a merge of two or more docs, and describes it', () => {
		expect(parseConsolidationOp(merge)).toEqual(merge);
		expect(parseConsolidationOp({ ...merge, document_ids: [IAN] })).toBeNull();
		expect(parseConsolidationOp({ ...merge, title: '' })).toBeNull();
		expect(
			describeOps([merge], { project: () => 'UXM Training Website', document: () => '' })
		).toBe(
			'Merges 2 docs into “Client intake” in UXM Training Website, archiving the originals.'
		);
	});

	it('waits until the merged draft is written', () => {
		expect(planOps(plan, [])).toEqual({ ready: [], waiting: ['c4'] });
		expect(planOps(plan, [], new Map([['c4', 'writing']])).waiting).toEqual(['c4']);
		expect(planOps(plan, [], new Map([['c4', 'ready']]))).toEqual({
			ready: [merge],
			waiting: []
		});
	});

	it('reads fact edits on merge question options, and never applies an unsafe default', () => {
		const card = parseConsolidationQuestion(
			row({
				piece: 'merge:c4:1',
				options: [
					{
						id: 'o1',
						label: 'Go with the template',
						description: '',
						ops: [{ op: 'keep', document_ids: [IAN, TEMPLATE] }],
						edits: [
							{
								fact_id: 'F2',
								fate: 'superseded',
								with: 'F1',
								reason: 'Owner',
								section: null
							}
						]
					},
					{
						id: 'later',
						label: 'Decide later',
						description: '',
						ops: [{ op: 'keep', document_ids: [IAN, TEMPLATE] }],
						edits: []
					}
				],
				recommended_option_id: 'o1',
				skip_option_id: 'later'
			})
		)!;
		expect(card.options[0]!.edits).toHaveLength(1);
		// Recommended, but it replaces a fact: an unanswered card leaves facts alone.
		expect(questionEdits(card)).toEqual([]);
		expect(
			questionEdits({
				...card,
				status: 'answered',
				answer: { via: 'option', option_id: 'o1' }
			})
		).toHaveLength(1);
	});
});

describe('task moves', () => {
	const TASK = '66666666-6666-4666-8666-666666666666';
	it('parses a task move and a keep that covers tasks, and describes them', () => {
		const move = { op: 'move_tasks', task_ids: [TASK], target_project_id: UXM };
		expect(parseConsolidationOp(move)).toEqual(move);
		expect(
			parseConsolidationOp({ op: 'move_tasks', task_ids: [], target_project_id: UXM })
		).toBeNull();
		expect(parseConsolidationOp({ op: 'keep', document_ids: [], task_ids: [TASK] })).toEqual({
			op: 'keep',
			document_ids: [],
			task_ids: [TASK]
		});
		expect(parseConsolidationOp({ op: 'keep', document_ids: [] })).toBeNull();
		expect(
			describeOps([move as never], {
				project: () => 'Beyond Exit Planning',
				document: () => ''
			})
		).toBe('Moves 1 task to Beyond Exit Planning.');
	});

	it('counts length in characters, so an emoji at the limit still parses', () => {
		const label = `${'a'.repeat(78)}🧭`;
		expect(Array.from(label)).toHaveLength(79);
		expect(label.length).toBe(80);
		const card = parseConsolidationQuestion({
			...row(),
			options: row().options.map((option, index) =>
				index === 0 ? { ...option, label: `${label}b` } : option
			)
		});
		expect(card?.options[0]?.label).toBe(`${label}b`);
	});

	it('takes no edits from a withdrawn card or an unanswered recommendation that folds a fact in', () => {
		const merge = (overrides: Record<string, unknown>) =>
			parseConsolidationQuestion({
				...row(),
				piece: 'merge:c3:1',
				options: [
					{
						id: 'o1',
						label: 'Same note',
						description: '',
						ops: [{ op: 'keep', document_ids: [IAN] }],
						edits: [{ fact_id: 'F2', fate: 'merged', with: 'F1' }]
					},
					{
						id: 'later',
						label: 'Decide later',
						description: '',
						ops: [{ op: 'keep', document_ids: [IAN] }],
						edits: []
					}
				],
				recommended_option_id: 'o1',
				skip_option_id: 'later',
				...overrides
			})!;
		expect(questionEdits(merge({}))).toEqual([]);
		expect(
			questionEdits(
				merge({ status: 'withdrawn', answer: { via: 'option', option_id: 'o1' } })
			)
		).toEqual([]);
		expect(
			questionEdits(merge({ status: 'answered', answer: { via: 'option', option_id: 'o1' } }))
		).toHaveLength(1);
	});

	it('counts the sub-docs a moved folder carries along, once', () => {
		const [FOLDER, CHILD, GRANDCHILD, OTHER] = ['f', 'c', 'g', 'o'];
		const inside = (docId: string) =>
			docId === FOLDER ? [CHILD, GRANDCHILD] : docId === CHILD ? [GRANDCHILD] : [];
		const names = { project: () => 'Beyond Exit Planning', document: () => '', inside };
		const move = (document_ids: string[]) => ({
			op: 'move' as const,
			document_ids,
			target_project_id: UXM
		});
		expect(describeOps([move([FOLDER])], names)).toBe(
			'Moves 1 doc and the 2 inside it to Beyond Exit Planning.'
		);
		// A listed child is not counted again.
		expect(describeOps([move([FOLDER, CHILD, OTHER])], names)).toBe(
			'Moves 3 docs and the 1 inside them to Beyond Exit Planning.'
		);
		expect(describeOps([move([OTHER])], names)).toBe('Moves 1 doc to Beyond Exit Planning.');
	});
});
