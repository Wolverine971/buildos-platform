// apps/worker/src/workers/workspace-suggest/workspace-suggest.test.ts
import { describe, expect, it } from 'vitest';
import {
	type ExistingSuggestion,
	type LooseInput,
	type ProjectCardInput,
	buildWorkspaceSuggestPrompt,
	checkWorkspaceSuggestAnswer,
	itemSetKey,
	planSuggestionWrites,
	workspaceInputHash
} from './workspace-suggest';

const note = (id: string, title: string, body: string | null = null): LooseInput => ({
	entity: 'document',
	id,
	kind: 'note',
	title,
	body,
	created_at: '2026-10-20T10:00:00Z'
});
const task = (id: string, title: string): LooseInput => ({
	entity: 'task',
	id,
	kind: 'task',
	title,
	body: null,
	created_at: '2026-10-21T10:00:00Z',
	due_at: '2026-11-03T00:00:00Z'
});

const loose = [
	note('d1', 'AI Taste Buds: restaurant matching', 'Match diners by taste'),
	note('d2', 'Taste Buds pricing', 'Free tier, then $4'),
	task('t1', 'Renew passport'),
	note('d3', 'Pricing thought after the Cadre call', 'Tier by number of stewards')
];
const projects: ProjectCardInput[] = [
	{
		id: 'p-buildos',
		name: 'BuildOS',
		description: 'Thinking environment',
		next_step: 'Ship workspace'
	},
	{ id: 'p-9takes', name: '9takes', description: 'Personality takes', next_step: null }
];

describe('buildWorkspaceSuggestPrompt', () => {
	it('uses short aliases, not ids, and names what the person declined', () => {
		const declined: ExistingSuggestion[] = [
			{
				id: 's1',
				kind: 'graduate',
				status: 'dismissed',
				item_key: 'x',
				target_project_id: null,
				items: [
					{ entity: 'document', id: 'd1' },
					{ entity: 'document', id: 'd3' }
				]
			},
			{
				id: 's2',
				kind: 'file',
				status: 'dismissed',
				item_key: 'task:t1',
				target_project_id: 'p-buildos',
				items: [{ entity: 'task', id: 't1' }]
			}
		];
		const { prompt, aliases } = buildWorkspaceSuggestPrompt(loose, projects, declined);
		expect(prompt).toContain('P1 · BuildOS');
		expect(prompt).toContain('N1 · note');
		expect(prompt).toContain('T1 · task');
		expect(prompt).toContain('due 2026-11-03');
		expect(prompt).not.toContain('p-buildos');
		expect(prompt).toContain('not a project: N1 + N3');
		expect(prompt).toContain('keep T1 loose');
		expect(aliases.items.get('N2')?.id).toBe('d2');
		expect(aliases.projects.get('P2')?.id).toBe('p-9takes');
	});
});

describe('checkWorkspaceSuggestAnswer', () => {
	const { aliases } = buildWorkspaceSuggestPrompt(loose, projects);

	it('keeps confident groups and filings built from known aliases', () => {
		const checked = checkWorkspaceSuggestAnswer(
			{
				groups: [
					{
						items: ['N1', 'n2'],
						name: '“AI Taste Buds”',
						type_key: 'project.technical.app',
						why: 'Both describe the same app.',
						confidence: 0.82
					}
				],
				filings: [{ item: 'N3', project: 'P1', why: 'BuildOS pricing.', confidence: 0.8 }]
			},
			aliases
		);
		expect(checked.groups).toEqual([
			{
				items: [
					{ entity: 'document', id: 'd1' },
					{ entity: 'document', id: 'd2' }
				],
				item_key: 'document:d1,document:d2',
				name: 'AI Taste Buds',
				type_key: 'project.technical.app',
				why: 'Both describe the same app.',
				confidence: 0.82
			}
		]);
		expect(checked.filings).toEqual([
			{
				item: { entity: 'document', id: 'd3' },
				item_key: 'document:d3',
				project_id: 'p-buildos',
				why: 'BuildOS pricing.',
				confidence: 0.8
			}
		]);
	});

	it('drops one-item groups, unknown ids, weak confidence, bad type keys and double use', () => {
		const checked = checkWorkspaceSuggestAnswer(
			{
				groups: [
					{ items: ['N1'], name: 'Solo', confidence: 0.9 },
					{ items: ['N1', 'N9'], name: 'Ghost item', confidence: 0.9 },
					{ items: ['N2', 'T1'], name: 'Weak', confidence: 0.4 },
					{
						items: ['N1', 'N2'],
						name: 'Real one',
						type_key: 'project.bogus',
						confidence: 0.7
					}
				],
				filings: [
					{ item: 'N1', project: 'P1', confidence: 0.9 },
					{ item: 'T1', project: 'P7', confidence: 0.9 },
					{ item: 'N3', project: 'P2', confidence: 0.5 },
					{ item: 'X1', project: 'P1', confidence: 0.9 }
				]
			},
			aliases
		);
		expect(checked.groups).toHaveLength(1);
		expect(checked.groups[0]).toMatchObject({ name: 'Real one', type_key: null });
		expect(checked.filings).toEqual([]);
		expect(checked.notes.length).toBeGreaterThan(3);
	});

	it('treats a non-object answer as nothing to suggest', () => {
		expect(checkWorkspaceSuggestAnswer('nope', aliases)).toMatchObject({
			groups: [],
			filings: []
		});
	});
});

describe('planSuggestionWrites', () => {
	const group = {
		items: [
			{ entity: 'document' as const, id: 'd1' },
			{ entity: 'document' as const, id: 'd2' }
		],
		item_key: 'document:d1,document:d2',
		name: 'AI Taste Buds',
		type_key: null,
		why: '',
		confidence: 0.8
	};
	const filing = {
		item: { entity: 'document' as const, id: 'd3' },
		item_key: 'document:d3',
		project_id: 'p-buildos',
		why: '',
		confidence: 0.8
	};
	const looseKeys = new Set(['document:d1', 'document:d2', 'document:d3', 'task:t1']);

	it('never repeats a group the person turned down, even a near copy', () => {
		const existing: ExistingSuggestion[] = [
			{
				id: 'old',
				kind: 'graduate',
				status: 'dismissed',
				item_key: 'document:d1,document:d2,task:t1',
				target_project_id: null,
				items: [
					{ entity: 'document', id: 'd1' },
					{ entity: 'document', id: 'd2' },
					{ entity: 'task', id: 't1' }
				]
			}
		];
		const plan = planSuggestionWrites({ groups: [group], filings: [], existing, looseKeys });
		expect(plan.groups).toEqual([]);
	});

	it('keeps open suggestions, retires ones whose items left, and skips kept items', () => {
		const existing: ExistingSuggestion[] = [
			{
				id: 'open-group',
				kind: 'graduate',
				status: 'open',
				item_key: 'document:d1,document:d2',
				target_project_id: null,
				items: group.items
			},
			{
				id: 'gone',
				kind: 'file',
				status: 'open',
				item_key: 'document:d9',
				target_project_id: 'p-9takes',
				items: [{ entity: 'document', id: 'd9' }]
			},
			{
				id: 'kept',
				kind: 'file',
				status: 'dismissed',
				item_key: 'document:d3',
				target_project_id: 'p-9takes',
				items: [{ entity: 'document', id: 'd3' }]
			}
		];
		const plan = planSuggestionWrites({
			groups: [group],
			filings: [filing],
			existing,
			looseKeys
		});
		expect(plan.groups).toEqual([]);
		expect(plan.filings).toEqual([]);
		expect(plan.staleIds).toEqual(['gone']);
	});

	it('does not file an item that sits in a group', () => {
		const plan = planSuggestionWrites({
			groups: [group],
			filings: [
				{ ...filing, item: { entity: 'document', id: 'd1' }, item_key: 'document:d1' }
			],
			existing: [],
			looseKeys
		});
		expect(plan.groups).toHaveLength(1);
		expect(plan.filings).toEqual([]);
	});
});

describe('keys and hashes', () => {
	it('item set keys ignore order and repeats', () => {
		expect(
			itemSetKey([
				{ entity: 'task', id: 'b' },
				{ entity: 'document', id: 'a' },
				{ entity: 'task', id: 'b' }
			])
		).toBe('document:a,task:b');
	});

	it('the input hash moves when a loose item or project changes', () => {
		const before = workspaceInputHash(loose, projects);
		expect(workspaceInputHash(loose, projects)).toBe(before);
		expect(workspaceInputHash([...loose, note('d4', 'New')], projects)).not.toBe(before);
		expect(workspaceInputHash(loose, projects.slice(1))).not.toBe(before);
	});
});
