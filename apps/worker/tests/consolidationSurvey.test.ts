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
