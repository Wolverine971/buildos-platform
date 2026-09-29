// apps/worker/tests/projectCleanupRollup.test.ts
//
// Tasker 112: what the checks see and propose, the roll-up call's parsing and section floor,
// goal and project one-click fixes, and subject states for closing findings.
import { describe, expect, it, vi } from 'vitest';
import {
	generateDrift,
	generateOutdatedDocs,
	type LoopContext
} from '../src/workers/project-loop/generators';
import type { SmartLLMService } from '../src/lib/services/smart-llm-service';
import {
	type CleanupSynthesisItem,
	buildHeuristicCleanupSynthesis,
	parseCleanupSynthesis
} from '../src/workers/project-loop/cleanupSynthesis';
import { allowedSections, cleanupFacts } from '../src/workers/project-loop/cleanupPass';
import { buildRecordFix } from '../src/workers/project-loop/driftFixes';
import {
	type OpenReviewRow,
	lineagesFromRows,
	loadSubjectStates
} from '../src/workers/project-loop/reviewRollupStore';

const START_HERE = 'document.context.project';
const THINKING_LOG = 'document.context.thinking_log';

function doc(id: string, title: string, extra: Partial<LoopContext['documents'][number]> = {}) {
	return {
		id,
		title,
		type_key: 'document.default',
		state_key: 'draft',
		description: null,
		updated_at: '2026-09-01T00:00:00.000Z',
		parent_id: null,
		...extra
	};
}

function makeContext(overrides: Partial<LoopContext> = {}): LoopContext {
	return {
		projectId: 'project-1',
		projectName: 'Wayne Strategies',
		projectDescription: 'Consulting practice',
		projectTypeKey: 'project.business.consulting',
		goals: [{ id: 'goal-a', name: 'Land 3 clients', description: null, state_key: 'active' }],
		docStructureSummary: '- Start here',
		documents: [
			doc('start', 'START HERE', { type_key: START_HERE }),
			doc('folder', 'Political Analysis'),
			doc('child', 'Senate notes', { parent_id: 'folder' })
		],
		moreDocuments: [
			doc('old-start', 'START HERE (old copy)', { type_key: START_HERE, content_chars: 0 }),
			doc('log-folder', 'Journal'),
			doc('log', 'Thinking log', { type_key: THINKING_LOG, parent_id: 'log-folder' }),
			doc('empty', 'Untitled', { content_chars: 0, is_public: true })
		],
		startHereDocumentId: 'start',
		tasks: [
			{
				id: 'task-1',
				title: 'Draft Tacemus deck',
				description: null,
				state_key: 'todo',
				updated_at: '2026-08-01T00:00:00.000Z'
			}
		],
		priorDecisions: [],
		tracked: [{ kind: 'doc_org', title: 'Group client notes', about: ['Client notes'] }],
		...overrides
	};
}

function makeLlm(
	response: unknown
): SmartLLMService & { getJSONResponse: ReturnType<typeof vi.fn> } {
	return {
		getJSONResponse: vi.fn().mockResolvedValue(response)
	} as unknown as SmartLLMService & { getJSONResponse: ReturnType<typeof vi.fn> };
}

const onUsage = async () => undefined;

function archiveSuggestion(tool: string, args: Record<string, unknown>, title = 'Archive it') {
	return {
		title,
		rationale: 'The project moved past it.',
		why_now: 'Seen this pass.',
		confidence: 0.8,
		evidence_refs: [],
		operations: [{ tool, args, label: 'model label is ignored' }]
	};
}

describe('outdated check proposes archives', () => {
	it('sees every live document compactly, the cleanup list, and user-only decisions', async () => {
		const llm = makeLlm({ suggestions: [] });
		await generateOutdatedDocs({ llm, ctx: makeContext(), userId: 'user-1', onUsage });
		const { userPrompt } = llm.getJSONResponse.mock.calls[0][0] as { userPrompt: string };
		expect(userPrompt).toContain('Older documents (4, compact):');
		expect(userPrompt).toContain(
			'"Untitled" (type=document.default, updated=2026-09-01, EMPTY, HAS A LIVE PUBLIC PAGE)'
		);
		expect(userPrompt).toContain("Already in the project's cleanup list");
		expect(userPrompt).toContain('doc_org: "Group client notes" (about "Client notes")');
		expect(userPrompt).toContain('Decisions the user made on earlier review items');
		expect(userPrompt).toMatch(
			/NEVER ARCHIVE:\n- \[start\] "START HERE"\n- \[log\] "Thinking log"/
		);
	});

	it('writes the label and preview in code, one archive per record', async () => {
		const llm = makeLlm({
			suggestions: [
				archiveSuggestion('archive_onto_document', { document_id: 'folder' }),
				archiveSuggestion('archive_onto_document', { document_id: 'old-start' }),
				archiveSuggestion('archive_onto_task', { task_id: 'task-1' }),
				// A second proposal for the same record is dropped.
				archiveSuggestion('archive_onto_document', { document_id: 'folder' })
			]
		});
		const suggestions = await generateOutdatedDocs({
			llm,
			ctx: makeContext(),
			userId: 'user-1',
			onUsage
		});
		expect(suggestions.map((s) => s.operations[0])).toEqual([
			{
				tool: 'archive_onto_document',
				args: {
					project_id: 'project-1',
					document_id: 'folder',
					children: 'archive_children'
				},
				label: 'Archive "Political Analysis" and the 1 document under it'
			},
			{
				tool: 'archive_onto_document',
				args: {
					project_id: 'project-1',
					document_id: 'old-start',
					children: 'archive_children'
				},
				label: 'Archive "START HERE (old copy)"'
			},
			{
				tool: 'archive_onto_task',
				args: { project_id: 'project-1', task_id: 'task-1' },
				label: 'Archive task "Draft Tacemus deck"'
			}
		]);
		expect(suggestions[0]).toMatchObject({
			kind: 'doc_outdated',
			reversible: true,
			undo_operations: [],
			preview: { after: ['Also archived: "Senate notes"'] }
		});
	});

	it('never archives the live START HERE, a thinking log, or a folder holding one', async () => {
		const llm = makeLlm({
			suggestions: [
				archiveSuggestion('archive_onto_document', { document_id: 'start' }),
				archiveSuggestion('archive_onto_document', { document_id: 'log' }),
				archiveSuggestion('archive_onto_document', {
					document_id: 'log-folder',
					children: 'archive_children'
				}),
				archiveSuggestion('archive_onto_document', { document_id: 'unknown-doc' }),
				archiveSuggestion('update_onto_document', { document_id: 'folder', props: {} })
			]
		});
		const suggestions = await generateOutdatedDocs({
			llm,
			ctx: makeContext(),
			userId: 'user-1',
			onUsage
		});
		expect(suggestions).toEqual([]);
	});

	it("keeps a folder's children when asked to promote them", async () => {
		const llm = makeLlm({
			suggestions: [
				archiveSuggestion('archive_onto_document', {
					document_id: 'log-folder',
					children: 'promote_children'
				})
			]
		});
		const [suggestion] = await generateOutdatedDocs({
			llm,
			ctx: makeContext(),
			userId: 'user-1',
			onUsage
		});
		expect(suggestion?.operations[0]).toMatchObject({
			args: { children: 'promote_children' },
			label: 'Archive "Journal"'
		});
		expect(suggestion?.preview?.impact).toContain('The 1 document under it moves up a level');
	});
});

describe('drift one-click fixes for goals and the project', () => {
	it('renames a goal with a code label and an exact undo, and drops invented goal ids', async () => {
		const llm = makeLlm({
			suggestions: [
				{
					title: 'Goal still names the old offer',
					rationale: 'The offer changed.',
					confidence: 0.8,
					evidence_refs: [
						{ entity_type: 'goal', entity_id: 'goal-a', reason: 'stale' },
						{ entity_type: 'goal', entity_id: 'goal-1', title: 'Invented', reason: 'x' }
					],
					operations: [
						{
							tool: 'update_onto_goal',
							args: { goal_id: 'goal-a', name: 'Land 3 retainers' }
						}
					]
				},
				{
					title: 'Goal the model invented',
					rationale: 'x',
					evidence_refs: [{ entity_type: 'goal', entity_id: 'goal-a', reason: 'x' }],
					operations: [
						{ tool: 'update_onto_goal', args: { goal_id: 'goal-9', name: 'Anything' } }
					]
				}
			]
		});
		const [rename, invented] = await generateDrift({
			llm,
			ctx: makeContext(),
			userId: 'user-1',
			onUsage
		});
		expect(rename.operations).toEqual([
			{
				tool: 'update_onto_goal',
				args: { project_id: 'project-1', goal_id: 'goal-a', name: 'Land 3 retainers' },
				label: 'Rename goal "Land 3 clients" to "Land 3 retainers"'
			}
		]);
		expect(rename.undo_operations).toEqual([
			{
				tool: 'update_onto_goal',
				args: { project_id: 'project-1', goal_id: 'goal-a', name: 'Land 3 clients' },
				label: 'Rename goal back to "Land 3 clients"'
			}
		]);
		expect(rename.evidence_refs).toEqual([
			expect.objectContaining({
				entity_type: 'goal',
				entity_id: 'goal-a',
				title: 'Land 3 clients'
			}),
			expect.not.objectContaining({ entity_id: 'goal-1' })
		]);
		// An unknown goal keeps the finding, informational.
		expect(invented.operations).toEqual([]);
	});
});

describe('buildRecordFix', () => {
	const goals = new Map([['g1', { id: 'g1', name: 'Launch', state_key: 'active' }]]);
	const project = { id: 'p1', description: 'Old words', type_key: 'project.business.consulting' };
	const fix = (tool: string, args: Record<string, unknown>) =>
		buildRecordFix({ projectId: 'p1', rawOperations: [{ tool, args }], goals, project });

	it('changes one thing per fix and refuses no-ops, unknown states and bad types', () => {
		expect(fix('update_onto_goal', { goal_id: 'g1', state_key: 'achieved' })).toMatchObject({
			fix: { operations: [{ label: 'Mark goal "Launch" achieved' }] }
		});
		expect(fix('update_onto_goal', { goal_id: 'g1', state_key: 'done' })).toEqual({
			rejected: 'invalid_shape'
		});
		expect(fix('update_onto_goal', { goal_id: 'g1', name: 'Launch' })).toEqual({
			rejected: 'invalid_shape'
		});
		expect(
			fix('update_onto_goal', { goal_id: 'g1', name: 'A', state_key: 'achieved' })
		).toEqual({
			rejected: 'invalid_shape'
		});
		expect(fix('update_onto_project', { type_key: 'project.business.agency' })).toMatchObject({
			fix: {
				operations: [{ args: { project_id: 'p1', type_key: 'project.business.agency' } }],
				undoOperations: [
					{ args: { project_id: 'p1', type_key: 'project.business.consulting' } }
				]
			}
		});
		expect(fix('update_onto_project', { type_key: 'business' })).toEqual({
			rejected: 'invalid_shape'
		});
		expect(fix('update_onto_project', { description: 'New words' })).toMatchObject({
			fix: { before: ['Old words'], after: ['New words'] }
		});
	});
});

function synthesisItem(overrides: Partial<CleanupSynthesisItem>): CleanupSynthesisItem {
	return {
		handle: 'i1',
		lineageId: 'lin-1',
		kind: 'doc_outdated',
		source: 'review',
		title: 'Archive old drafts',
		summary: null,
		change: 'Archive "Draft"',
		executable: true,
		fresh: false,
		firstSeenAt: '2026-09-04T00:00:00.000Z',
		seenCount: 2,
		about: [],
		cautions: [],
		allowedSections: ['safe_cleanup', 'needs_call'],
		judged: true,
		...overrides
	};
}

describe('parseCleanupSynthesis', () => {
	const items = [
		synthesisItem({}),
		synthesisItem({ handle: 'i2', lineageId: 'lin-2', title: 'Same drafts, again' }),
		synthesisItem({
			handle: 'i3',
			lineageId: 'lin-3',
			kind: 'drift',
			executable: false,
			change: null,
			allowedSections: ['note', 'needs_call']
		}),
		synthesisItem({
			handle: 'i4',
			lineageId: 'aud-1',
			kind: 'audit_recommendation',
			source: 'audit',
			executable: false,
			allowedSections: ['needs_call', 'note'],
			judged: false
		})
	];

	it("maps handles back to lineages and holds code's floor under the model", () => {
		const result = parseCleanupSynthesis({
			generatedAt: '2026-09-29T00:00:00.000Z',
			items,
			raw: {
				attention_level: 'decision',
				bottom_line: 'Old drafts are cluttering the tree.',
				items: [
					{
						id: 'i1',
						verdict: 'still_true',
						section: 'safe_cleanup',
						summary: 'Still there.'
					},
					{
						id: 'i3',
						verdict: 'resolved',
						reason: 'START HERE now says it.',
						section: 'safe_cleanup'
					},
					// No reason: no opinion.
					{ id: 'i2', verdict: 'resolved' },
					// The audit's own item is grouped, never judged here.
					{ id: 'i4', verdict: 'resolved', reason: 'x', section: 'note' },
					{ id: 'i99', verdict: 'resolved', reason: 'unknown handle' }
				],
				merges: [{ keep: 'i1', absorb: ['i2', 'i3', 'i4'] }],
				groups: [
					{
						title: 'Archive old drafts',
						section: 'safe_cleanup',
						item_ids: ['i1', 'i2', 'i4']
					},
					{ title: 'Wrong section', section: 'note', item_ids: ['i1'] }
				]
			}
		});
		expect(result.verdicts).toEqual([
			{ lineageId: 'lin-1', verdict: 'still_true' },
			{ lineageId: 'lin-3', verdict: 'resolved', reason: 'START HERE now says it.' }
		]);
		// Only same-kind items merge.
		expect(result.merges).toEqual([{ lineageId: 'lin-2', into: 'lin-1' }]);
		expect(result.sections.get('lin-1')).toBe('safe_cleanup');
		// "safe_cleanup" is not allowed for a note; the audit item's allowed "note" stands.
		expect(result.sections.get('lin-3')).toBeUndefined();
		expect(result.sections.get('aud-1')).toBe('note');
		expect(result.synthesis.groups).toEqual([
			{
				title: 'Archive old drafts',
				section: 'safe_cleanup',
				item_ids: ['lin-1'],
				recommendation: null
			},
			{ title: 'Worth knowing', section: 'note', item_ids: ['aud-1'], recommendation: null }
		]);
		expect(result.synthesis.open_count).toBe(2);
		expect(result.attentionLevel).toBe('decision');
	});

	it('merges an audit recommendation a later audit repeated, but never resolves one', () => {
		const audit = (n: number) =>
			synthesisItem({
				handle: `a${n}`,
				lineageId: `aud-${n}`,
				kind: 'audit_recommendation',
				source: 'audit',
				executable: false,
				allowedSections: ['needs_call', 'note'],
				judged: false
			});
		const result = parseCleanupSynthesis({
			generatedAt: '2026-09-29T00:00:00.000Z',
			items: [audit(1), audit(2)],
			raw: {
				items: [{ id: 'a2', verdict: 'resolved', reason: 'Done already.' }],
				merges: [{ keep: 'a1', absorb: ['a2'] }]
			}
		});
		expect(result.merges).toEqual([{ lineageId: 'aud-2', into: 'aud-1' }]);
		expect(result.verdicts).toEqual([]);
		expect(result.synthesis.open_count).toBe(1);
	});

	it("falls back to code's sections and counts without a model", () => {
		const result = buildHeuristicCleanupSynthesis({
			generatedAt: '2026-09-29T00:00:00.000Z',
			items
		});
		expect(result.synthesis.bottom_line).toBe(
			'2 cleanup changes ready to apply; 1 item needs your call'
		);
		expect(result.verdicts).toEqual([]);
		expect(result.synthesis.groups.map((group) => group.item_ids)).toEqual([
			['lin-1', 'lin-2'],
			['aud-1'],
			['lin-3']
		]);
	});
});

function reviewRow(overrides: Partial<OpenReviewRow>): OpenReviewRow {
	return {
		id: 'row-1',
		run_id: 'run-1',
		kind: 'doc_outdated',
		title: 'Archive "Draft"',
		rationale: null,
		why_now: null,
		evidence_refs: [],
		operations: [
			{
				tool: 'archive_onto_document',
				args: { project_id: 'p', document_id: 'd1', children: 'archive_children' }
			}
		],
		preview: null,
		reversible: true,
		lineage_id: null,
		rollup: null,
		created_at: '2026-09-04T00:00:00.000Z',
		updated_at: '2026-09-04T00:00:00.000Z',
		...overrides
	};
}

describe('section floor for roll-up items', () => {
	it('allows "Ready to apply" only for a verified, caution-free safe change', () => {
		const row = reviewRow({});
		const [item] = lineagesFromRows([row]);
		const verified = new Map([
			['row-1', { headline: 'Archive', cautions: [], verified: true }]
		]);
		expect(allowedSections(cleanupFacts(item, [row], verified))).toEqual([
			'safe_cleanup',
			'needs_call'
		]);
		const unverified = new Map([['row-1', { headline: null, cautions: [], verified: false }]]);
		expect(allowedSections(cleanupFacts(item, [row], unverified))).toEqual(['needs_call']);
		const publicPage = new Map([
			['row-1', { headline: 'Archive', cautions: ['Has a live public page'], verified: true }]
		]);
		expect(allowedSections(cleanupFacts(item, [row], publicPage))[0]).toBe('needs_call');

		const rename = reviewRow({
			id: 'row-2',
			kind: 'drift',
			operations: [
				{ tool: 'update_onto_goal', args: { project_id: 'p', goal_id: 'g', name: 'New' } }
			]
		});
		const [renameItem] = lineagesFromRows([rename]);
		expect(
			allowedSections(
				cleanupFacts(
					renameItem,
					[rename],
					new Map([['row-2', { headline: 'Rename', cautions: [], verified: true }]])
				)
			)
		).toEqual(['needs_call']);

		const note = reviewRow({ id: 'row-3', kind: 'drift', operations: [] });
		const [noteItem] = lineagesFromRows([note]);
		expect(allowedSections(cleanupFacts(noteItem, [note], new Map()))).toEqual([
			'note',
			'needs_call'
		]);
	});
});

describe('loadSubjectStates', () => {
	const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
	it('counts both archive forms, records the project no longer has as gone, and never queries invented ids', async () => {
		const tables: Record<string, Array<Record<string, unknown>>> = {
			onto_documents: [
				{
					id: id(1),
					project_id: 'p',
					state_key: 'archived',
					archived_at: null,
					deleted_at: null
				},
				{
					id: id(2),
					project_id: 'p',
					state_key: 'draft',
					archived_at: null,
					deleted_at: null
				},
				{
					id: id(3),
					project_id: 'other',
					state_key: 'draft',
					archived_at: null,
					deleted_at: null
				}
			],
			onto_tasks: [
				{
					id: id(5),
					project_id: 'p',
					state_key: 'todo',
					archived_at: '2026-09-20',
					deleted_at: '2026-09-20'
				},
				{
					id: id(6),
					project_id: 'p',
					state_key: 'todo',
					archived_at: null,
					deleted_at: '2026-09-20'
				}
			]
		};
		const queried: string[] = [];
		const db = {
			from: (table: string) => ({
				select: () => ({
					in: async (_field: string, ids: string[]) => {
						queried.push(...ids);
						return {
							data: (tables[table] ?? []).filter((row) =>
								ids.includes(String(row.id))
							),
							error: null
						};
					}
				})
			})
		};
		const states = await loadSubjectStates(db, 'p', [
			`document:${id(1)}`,
			`document:${id(2)}`,
			`document:${id(3)}`,
			`document:${id(4)}`,
			`task:${id(5)}`,
			`task:${id(6)}`,
			// A pre-112 row cites a goal id the model invented; Postgres would reject it as a uuid.
			'goal:goal-1',
			'project:p'
		]);
		expect(queried).not.toContain('goal-1');
		expect(Object.fromEntries(states)).toEqual({
			[`document:${id(1)}`]: { archived: true },
			[`document:${id(3)}`]: { deleted: true },
			[`document:${id(4)}`]: { deleted: true },
			[`task:${id(5)}`]: { archived: true },
			[`task:${id(6)}`]: { deleted: true }
		});
	});
});
