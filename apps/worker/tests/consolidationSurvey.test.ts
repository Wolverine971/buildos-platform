// apps/worker/tests/consolidationSurvey.test.ts
import { describe, expect, it } from 'vitest';
import {
	type FoundGroup,
	type Inventory,
	type InventoryDocument,
	buildDecision,
	buildKeys,
	enforceTwinSurvivors,
	groupsUserPrompt,
	nameKeys,
	parseGroups,
	twinMap,
	verifyEvidence
} from '../src/workers/consolidation/survey';

const WAYNE = 'aaaaaaaa-0000-4000-8000-000000000001';
const BEYOND = 'aaaaaaaa-0000-4000-8000-000000000002';
const UXM = 'aaaaaaaa-0000-4000-8000-000000000003';

function doc(id: string, overrides: Partial<InventoryDocument>): InventoryDocument {
	return {
		id,
		project_id: WAYNE,
		title: 'Untitled',
		description: null,
		type_key: 'document.default',
		content: '',
		content_hash: null,
		headings: [],
		folder: null,
		has_children: false,
		created_at: '2026-01-13T00:00:00Z',
		updated_at: '2026-05-22T00:00:00Z',
		pinned: null,
		...overrides
	};
}

const D = (n: number) => `dddddddd-0000-4000-8000-${String(n).padStart(12, '0')}`;

const inventory: Inventory = {
	projects: [
		{ id: WAYNE, name: 'Wayne Strategies', description: 'Agency', parent: true },
		{
			id: BEYOND,
			name: 'Beyond Exit Planning',
			description: "Rod Chamberlin's exit-planning brand",
			parent: false
		},
		{ id: UXM, name: 'UXM Training Website', description: 'Ian Miner', parent: false }
	],
	documents: [
		doc(D(1), { title: 'START HERE - Wayne', pinned: 'start_here', content: '# START HERE' }),
		doc(D(2), {
			title: 'Rod Website - Deployment Plan',
			content:
				'# Phase 3: Deploy & Launch\n- Domains: Ionos (magnumwealthmanagement.com, beyondexitplanning.com).\n- Demo Jan 20, launch post-approval.'
		}),
		doc(D(3), {
			title: 'Rod Website - Design & Branding Plan',
			content: '# Phase 1\n- Ideal client: Business owner, $5M+ assets.'
		}),
		doc(D(4), {
			title: 'Client Intake Template',
			content: '# Client Initial Intake Template\nPurpose: capture first impressions.',
			content_hash: 'h1'
		}),
		doc(D(5), {
			title: 'Client Intake Template: Ian Miner',
			content: '# Client Initial Intake Template\nPurpose: capture first impressions.',
			content_hash: 'h1'
		}),
		doc(D(6), {
			title: 'Project Brief — Beyond Exit Planning',
			project_id: BEYOND,
			content: '# Brief'
		})
	]
};
const keys = buildKeys(inventory);
const twins = twinMap(inventory);

describe('consolidation survey: finding groups', () => {
	it('shows the model short keys, twins and pinned docs, never ids', () => {
		const prompt = groupsUserPrompt(inventory, keys);
		expect(prompt).not.toContain(WAYNE);
		expect(prompt).not.toContain(D(2));
		const parsed = JSON.parse(prompt);
		expect(parsed.twins).toEqual([['D4', 'D5']]);
		expect(parsed.documents[0]).toMatchObject({ key: 'D1', pinned: 'start_here' });
	});

	it('keeps only real keys, drops pinned docs, and puts each doc in one group', () => {
		const groups = parseGroups(
			{
				groups: [
					{
						kind: 'misfiled',
						title: 'Rod docs',
						documents: ['D2', 'D3', 'D1', 'D99'],
						belongs_in: 'P2',
						reason: 'Rod is Beyond Exit'
					},
					{ kind: 'fragments', title: 'Again', documents: ['D3', 'D2'], reason: 'dup' },
					{
						kind: 'twins',
						title: 'Intake',
						documents: ['D4', 'D5'],
						reason: 'identical'
					},
					{ kind: 'delete_everything', title: 'x', documents: ['D6'] }
				]
			},
			inventory,
			keys
		);
		expect(groups).toHaveLength(2);
		expect(groups[0]).toMatchObject({
			kind: 'misfiled',
			document_ids: [D(2), D(3)],
			belongs_in: BEYOND
		});
		expect(groups[1]!.document_ids).toEqual([D(4), D(5)]);
	});
});

describe('consolidation survey: deciding a group', () => {
	const rod: FoundGroup = {
		kind: 'misfiled',
		title: 'Rod docs',
		document_ids: [D(2), D(3)],
		belongs_in: BEYOND,
		newer_id: null,
		reason: ''
	};
	const intake: FoundGroup = {
		kind: 'twins',
		title: 'Intake',
		document_ids: [D(4), D(5)],
		belongs_in: null,
		newer_id: null,
		reason: ''
	};

	it('decides a confident move without asking', () => {
		const decision = buildDecision({
			key: 'c1',
			group: rod,
			raw: {
				recommended: {
					label: 'Move to Beyond Exit',
					description: 'Rod lives there',
					actions: [{ move: ['D2', 'D3'], to: 'P2' }]
				},
				alternatives: [],
				confidence: 'high',
				needs_owner: false
			},
			inventory,
			keys,
			twins
		});
		expect(decision.question).toBeNull();
		expect(decision.cluster.ops).toEqual([
			{ op: 'move', document_ids: [D(2), D(3)], target_project_id: BEYOND }
		]);
	});

	it('always asks before archiving a doc that is not an exact twin, even when the model is sure', () => {
		const decision = buildDecision({
			key: 'c1',
			group: rod,
			raw: {
				recommended: {
					label: 'Archive both',
					description: 'Old plans',
					actions: [{ archive: ['D2', 'D3'], replaced_by: 'D6' }]
				},
				confidence: 'high',
				needs_owner: false,
				header: 'Old Rod plans',
				question: 'These January plans are old. Archive them?',
				evidence: [
					{ doc: 'D2', quote: 'Demo Jan 20, launch post-approval.' },
					{ doc: 'D3', quote: 'made-up words' }
				]
			},
			inventory,
			keys,
			twins
		});
		expect(decision.question).not.toBeNull();
		expect(decision.question!.options.map((option) => option.id)).toEqual(['rec', 'leave']);
		expect(decision.question!.skip_option_id).toBe('leave');
		expect(decision.question!.evidence).toEqual([
			{
				document_id: D(2),
				source: 'Rod Website - Deployment Plan',
				quote: 'Demo Jan 20, launch post-approval.'
			}
		]);
	});

	it('archives one of two exact twins without asking, but not both', () => {
		const one = buildDecision({
			key: 'c2',
			group: intake,
			raw: {
				recommended: {
					label: 'Archive the Ian copy',
					description: '',
					actions: [{ archive: ['D5'], replaced_by: 'D4' }]
				},
				confidence: 'high',
				needs_owner: false
			},
			inventory,
			keys,
			twins
		});
		expect(one.question).toBeNull();
		const both = buildDecision({
			key: 'c2',
			group: intake,
			raw: {
				recommended: {
					label: 'Archive both',
					description: '',
					actions: [{ archive: ['D4', 'D5'] }]
				},
				confidence: 'high',
				needs_owner: false
			},
			inventory,
			keys,
			twins
		});
		expect(both.question).not.toBeNull();
	});

	it('asks again when two groups would each archive one twin, leaving no copy', () => {
		const archiveOne = (key: string, doc: string, keeps: string) =>
			buildDecision({
				key,
				group: {
					...intake,
					kind: key === 'c1' ? 'versions' : 'superseded',
					document_ids: [D(4), D(5)]
				},
				raw: {
					recommended: {
						label: '',
						description: '',
						actions: [{ archive: [doc], replaced_by: keeps }]
					},
					confidence: 'high',
					needs_owner: false
				},
				inventory,
				keys,
				twins
			});
		const a = archiveOne('c1', 'D4', 'D5');
		const b = archiveOne('c2', 'D5', 'D4');
		// Each looks safe alone: its twin survives inside its own group.
		expect(a.question).toBeNull();
		expect(b.question).toBeNull();
		// An empty label from the model is named by what the option does.
		expect(a.card!.options[0]!.label).toBe('Archive 1 doc');
		const checked = enforceTwinSurvivors([a, b], twins);
		expect(checked.map((decision) => decision.question !== null)).toEqual([true, true]);
		// One group alone is still decided without asking.
		expect(enforceTwinSurvivors([a], twins)[0]!.question).toBeNull();
	});

	it('drops moves to the project a doc is already in, and pinned docs', () => {
		const decision = buildDecision({
			key: 'c3',
			group: { ...rod, document_ids: [D(2), D(6)] },
			raw: {
				recommended: {
					label: 'Move all',
					description: '',
					actions: [{ move: ['D2', 'D6', 'D1'], to: 'P2' }]
				},
				alternatives: [
					{ label: 'Same again', description: '', actions: [{ move: ['D2'], to: 'P2' }] }
				],
				confidence: 'medium'
			},
			inventory,
			keys,
			twins
		});
		expect(decision.cluster.ops).toEqual([
			{ op: 'move', document_ids: [D(2)], target_project_id: BEYOND },
			{ op: 'keep', document_ids: [D(6)] }
		]);
		// The alternative did the same thing, so it was folded away.
		expect(decision.question!.options.map((option) => option.id)).toEqual(['rec', 'leave']);
	});

	it('verifies quotes against the doc text, ignoring whitespace', () => {
		const evidence = verifyEvidence({
			raw: [{ doc: 'D3', quote: 'Ideal  client: Business owner, $5M+ assets.' }],
			group: rod,
			inventory,
			keys
		});
		expect(evidence).toHaveLength(1);
	});
});

describe('consolidation survey: owner-facing text', () => {
	it('names documents and projects instead of the keys the model saw', () => {
		expect(
			nameKeys(
				'Archive D2 and D3 with D6 as the replacement, or move them to P2?',
				keys,
				inventory
			)
		).toBe(
			'Archive “Rod Website - Deployment Plan” and “Rod Website - Design & Branding Plan” with “Project Brief — Beyond Exit Planning” as the replacement, or move them to Beyond Exit Planning?'
		);
		// Keys we never issued, and look-alikes inside words, stay as they are.
		expect(nameKeys('D99 and PDF2 and COVID19', keys, inventory)).toBe(
			'D99 and PDF2 and COVID19'
		);
	});

	it('cuts a long header at a word, without an ellipsis', () => {
		const decision = buildDecision({
			key: 'c1',
			group: {
				kind: 'versions',
				title: 'Rod docs',
				document_ids: [D(2), D(3)],
				belongs_in: null,
				newer_id: null,
				reason: ''
			},
			raw: {
				recommended: {
					label: 'Archive D2',
					description: 'D3 covers it.',
					actions: [{ archive: ['D2'], replaced_by: 'D3' }]
				},
				confidence: 'high',
				needs_owner: true,
				header: 'Archive superseded notes now',
				question: 'Is D2 replaced by D3?'
			},
			inventory,
			keys,
			twins
		});
		expect(decision.question!.header).toBe('Archive superseded');
		expect(decision.question!.question).toBe(
			'Is “Rod Website - Deployment Plan” replaced by “Rod Website - Design & Branding Plan”?'
		);
		expect(decision.question!.options[0]!.label).toBe(
			'Archive “Rod Website - Deployment Plan”'
		);
	});
});

describe('consolidation survey: misfiled tasks', () => {
	const T = (n: number) => `eeeeeeee-0000-4000-8000-${String(n).padStart(12, '0')}`;
	const withTasks: Inventory = {
		...inventory,
		tasks: [
			{
				id: T(1),
				project_id: WAYNE,
				title: 'Initiate payment collection for Rod Chamberlin project',
				description: null,
				state: 'todo'
			},
			{
				id: T(2),
				project_id: WAYNE,
				title: 'Post weekly update',
				description: null,
				state: 'todo'
			}
		]
	};
	const taskKeys = buildKeys(withTasks);

	it('puts tasks only in misfiled groups', () => {
		const groups = parseGroups(
			{
				groups: [
					{
						kind: 'misfiled',
						title: 'Rod work',
						documents: ['D2'],
						tasks: ['T1'],
						belongs_in: 'P2'
					},
					{ kind: 'versions', title: 'Updates', documents: ['D4', 'D5'], tasks: ['T2'] },
					{ kind: 'misfiled', title: 'Only a task', tasks: ['T2'], belongs_in: 'P2' }
				]
			},
			withTasks,
			taskKeys
		);
		expect(
			groups.map((group) => [group.title, group.document_ids.length, group.task_ids ?? []])
		).toEqual([
			['Rod work', 1, [T(1)]],
			['Updates', 2, []],
			['Only a task', 0, [T(2)]]
		]);
		expect(groupsUserPrompt(withTasks, taskKeys)).toContain('"key":"T1"');
	});

	it('moves docs and tasks together, and leaving them covers the tasks', () => {
		const decision = buildDecision({
			key: 'c1',
			group: {
				kind: 'misfiled',
				title: 'Rod work',
				document_ids: [D(2)],
				task_ids: [T(1)],
				belongs_in: BEYOND,
				newer_id: null,
				reason: ''
			},
			raw: {
				recommended: {
					label: 'Move to Beyond Exit',
					description: '',
					actions: [{ move: ['D2', 'T1'], to: 'P2' }]
				},
				confidence: 'medium',
				needs_owner: true,
				question: 'Move T1 and D2 to P2?'
			},
			inventory: withTasks,
			keys: taskKeys,
			twins
		});
		expect(decision.cluster.ops).toEqual([
			{ op: 'move', document_ids: [D(2)], target_project_id: BEYOND },
			{ op: 'move_tasks', task_ids: [T(1)], target_project_id: BEYOND }
		]);
		const leave = decision.question!.options.find((option) => option.id === 'leave')!;
		expect(leave.ops).toEqual([{ op: 'keep', document_ids: [D(2)], task_ids: [T(1)] }]);
		expect(decision.question!.question).toBe(
			'Move “Initiate payment collection for Rod Chamberlin project” and “Rod Website - Deployment Plan” to Beyond Exit Planning?'
		);
		expect(decision.cluster.task_ids).toEqual([T(1)]);
	});
});

describe('consolidation survey: task groups (DJ picks, 2026-10-04)', () => {
	const T = (n: number) => `ffffffff-0000-4000-8000-${String(n).padStart(12, '0')}`;
	const [HANNIBAL, JULIAN, NOMTASTIC] = [11, 12, 13].map(
		(n) => `aaaaaaaa-0000-4000-8000-0000000000${n}`
	) as [string, string, string];
	const SCRIPT = D(20);
	const task = (n: number, title: string, project_id = WAYNE) => ({
		id: T(n),
		project_id,
		title,
		description: null,
		state: 'todo',
		due_at: null,
		created_at: '2026-09-01T00:00:00Z'
	});
	const taskInventory: Inventory = {
		projects: [
			{ id: WAYNE, name: 'Wayne Strategies', description: 'Agency', parent: true },
			{ id: HANNIBAL, name: 'Hannibal Is Hungry', description: null, parent: false },
			{ id: JULIAN, name: 'Julian Dorey', description: null, parent: false },
			{ id: NOMTASTIC, name: 'Nomtastic Kim', description: null, parent: false }
		],
		documents: [
			doc(SCRIPT, {
				title: 'Launch video script',
				created_at: '2026-09-19T00:00:00Z',
				content:
					'# 90-second launch video\n\n**HOOK:** You have 40 tabs open and none of them are the work.\n\nCUT TO: the brain dump.'
			})
		],
		tasks: [
			task(1, 'Twitter brand kit: icon + 3 templates + rollout note'),
			task(2, 'Create Twitter visual brand guidelines for BuildOS'),
			task(3, 'Define color palette and typography for Twitter posts'),
			task(4, 'Create User Guide Suite (ADHD/TPM/Writers/Devs)'),
			task(5, 'Create detailed BuildOS guide for people with ADHD'),
			task(6, 'Decide hackathon format and set date'),
			task(7, 'Define the hackathon scenario / challenge prompt'),
			task(8, 'Build hackathon landing page + signup flow'),
			task(9, 'Recruit pilot test group for hackathon'),
			task(10, 'Finalize and send Hannibal outreach', HANNIBAL),
			task(11, 'Finalize and send JDP team outreach', JULIAN),
			task(12, 'Finalize and send Nomtastic Kim outreach', NOMTASTIC),
			task(13, 'Script 90-second launch video targeting overwhelmed solo founders'),
			task(14, 'Compile mood board for Tacemus brand imagery', HANNIBAL)
		]
	};
	const taskKeys = buildKeys(taskInventory);
	const group = (
		kind: FoundGroup['kind'],
		tasks: number[],
		extra: Partial<FoundGroup> = {}
	): FoundGroup => ({
		kind,
		title: 'Tasks',
		document_ids: [],
		task_ids: tasks.map(T),
		belongs_in: null,
		newer_id: null,
		reason: '',
		...extra
	});
	const decide = (found: FoundGroup, raw: unknown) =>
		buildDecision({
			key: 'c1',
			group: found,
			raw,
			inventory: taskInventory,
			keys: taskKeys,
			twins: new Map()
		});
	const sure = { confidence: 'high', needs_owner: false };

	it('finds task-only groups in order, with each task in one group', () => {
		const groups = parseGroups(
			{
				groups: [
					{ kind: 'duplicate_tasks', title: 'Twitter kit', tasks: ['T1', 'T2', 'T3'] },
					{ kind: 'task_sequence', title: 'Hackathon', tasks: ['T6', 'T7', 'T8', 'T9'] },
					{ kind: 'finished_tasks', title: 'Script', tasks: ['T13'], documents: ['D1'] },
					// T2 is taken: one task left, too few for duplicates.
					{ kind: 'duplicate_tasks', title: 'Again', tasks: ['T2', 'T14'] },
					{ kind: 'sibling_tasks', title: 'Outreach', tasks: ['T10', 'T11', 'T12'] }
				]
			},
			taskInventory,
			taskKeys
		);
		expect(groups.map((found) => [found.kind, found.task_ids])).toEqual([
			['duplicate_tasks', [T(1), T(2), T(3)]],
			['task_sequence', [T(6), T(7), T(8), T(9)]],
			['finished_tasks', [T(13)]],
			['sibling_tasks', [T(10), T(11), T(12)]]
		]);
		expect(groups[2]).toMatchObject({ document_ids: [], evidence_id: SCRIPT });
		expect(groupsUserPrompt(taskInventory, taskKeys)).not.toContain(T(1));
	});

	it('always asks before merging duplicates, and names tasks instead of keys', () => {
		const decision = decide(group('duplicate_tasks', [1, 2, 3]), {
			...sure,
			recommended: {
				label: 'Merge into T1',
				description: 'T2 and T3 repeat it.',
				actions: [{ merge_tasks: ['T2', 'T3'], into: 'T1' }]
			},
			header: 'Twitter tasks',
			question: 'Merge T2 and T3 into T1?'
		});
		expect(decision.cluster.ops).toEqual([
			{ op: 'merge_tasks', task_ids: [T(2), T(3)], keep_id: T(1) }
		]);
		expect(decision.question).not.toBeNull();
		expect(decision.question!.question).not.toMatch(/\bT\d+\b/);
		expect(decision.question!.options[0]!.label).toBe(
			'Merge into “Twitter brand kit: icon + 3 templates + rollout note”'
		);
		const leave = decision.question!.options.find((option) => option.id === 'leave')!;
		expect(leave.ops).toEqual([{ op: 'keep', document_ids: [], task_ids: [T(1), T(2), T(3)] }]);
	});

	it('gathers a task and its pieces in a plan without asking', () => {
		const decision = decide(group('task_parts', [4, 5]), {
			...sure,
			recommended: {
				label: 'Gather them in a plan',
				description: '',
				actions: [{ plan: ['T4', 'T5'], name: 'User Guide Suite', in_order: false }]
			}
		});
		expect(decision.question).toBeNull();
		expect(decision.cluster.ops).toEqual([
			{
				op: 'plan_tasks',
				task_ids: [T(4), T(5)],
				project_id: WAYNE,
				name: 'User Guide Suite',
				sequence: false
			}
		]);
	});

	it('keeps a sequence in its order, each step waiting on the last', () => {
		const decision = decide(group('task_sequence', [6, 7, 8, 9]), {
			...sure,
			recommended: {
				label: 'Put them in order',
				description: '',
				actions: [{ plan: ['T6', 'T7', 'T8', 'T9'], name: 'Hackathon', in_order: true }]
			}
		});
		expect(decision.cluster.ops[0]).toMatchObject({
			op: 'plan_tasks',
			task_ids: [T(6), T(7), T(8), T(9)],
			sequence: true
		});
	});

	it('rolls siblings up into one task in the parent project', () => {
		const decision = decide(group('sibling_tasks', [10, 11, 12]), {
			...sure,
			recommended: {
				label: 'Add one outreach task',
				description: '',
				actions: [{ rollup: ['T10', 'T11', 'T12'], title: 'Send creator outreach (3)' }]
			}
		});
		expect(decision.question).toBeNull();
		expect(decision.cluster.ops).toEqual([
			{
				op: 'rollup_tasks',
				task_ids: [T(10), T(11), T(12)],
				project_id: WAYNE,
				title: 'Send creator outreach (3)'
			}
		]);
	});

	it('refuses a plan whose tasks sit in different projects', () => {
		const decision = decide(group('task_parts', [6, 14]), {
			...sure,
			recommended: {
				label: 'Gather them',
				description: '',
				actions: [{ plan: ['T6', 'T14'], name: 'Mixed' }]
			}
		});
		expect(decision.cluster.ops).toEqual([
			{ op: 'keep', document_ids: [], task_ids: [T(6), T(14)] }
		]);
		expect(decision.question).toBeNull();
	});

	it('marks a task done only on a quote found in the doc, and always asks', () => {
		const finished = group('finished_tasks', [13], { evidence_id: SCRIPT });
		const done = decide(finished, {
			...sure,
			recommended: {
				label: 'Mark it done',
				description: 'The script is written.',
				actions: [
					{
						done: ['T13'],
						evidence: 'D1',
						quote: 'HOOK: You have 40 tabs open and none of them are the work.',
						note: 'The script exists as a doc from September 19.'
					}
				]
			}
		});
		expect(done.cluster.ops).toEqual([
			{
				op: 'close_tasks',
				task_ids: [T(13)],
				how: 'done',
				evidence_document_id: SCRIPT,
				note: 'The script exists as a doc from September 19.'
			}
		]);
		expect(done.question).not.toBeNull();
		expect(done.question!.evidence).toEqual([
			{
				document_id: SCRIPT,
				source: 'Launch video script',
				quote: 'HOOK: You have 40 tabs open and none of them are the work.'
			}
		]);

		const unproven = decide(finished, {
			...sure,
			recommended: {
				label: 'Mark it done',
				description: '',
				actions: [{ done: ['T13'], evidence: 'D1', quote: 'The video shipped on Sep 30.' }]
			},
			alternatives: [
				{
					label: 'Archive it',
					description: '',
					actions: [{ archive_tasks: ['T13'], note: 'The launch plan changed.' }]
				}
			]
		});
		const everyOp = unproven.question!.options.flatMap((option) => option.ops);
		expect(everyOp.some((op) => op.op === 'close_tasks' && op.how === 'done')).toBe(false);
		// The alternative stands in, and is asked, not decided.
		expect(unproven.cluster.ops[0]).toMatchObject({ op: 'close_tasks', how: 'archived' });
		expect(unproven.question!.recommended_option_id).toBe('alt1');
	});
});
