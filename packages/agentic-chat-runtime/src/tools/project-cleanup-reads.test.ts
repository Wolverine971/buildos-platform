// packages/agentic-chat-runtime/src/tools/project-cleanup-reads.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectCleanupView } from '@buildos/shared-types';
import {
	buildProjectCleanupView,
	loadProjectCleanupView,
	type ProjectCleanupRowRecord
} from '@buildos/shared-agent-ops/project-cleanup';
import { AgenticChatToolAccessDeniedError, type AgenticChatToolAccessPortV1 } from './access-port';
import type { AgenticChatSharedReadContextV1 } from './ontology-reads';
import {
	PROJECT_CLEANUP_CHAT_BUDGET_CHARS,
	getProjectCleanup,
	projectProjectCleanupViewForChat
} from './project-cleanup-reads';
import { executeAgenticChatSharedReadToolV1 } from './shared-read-dispatch';

vi.mock('@buildos/shared-agent-ops/project-cleanup', async (importOriginal) => ({
	...(await importOriginal<typeof import('@buildos/shared-agent-ops/project-cleanup')>()),
	loadProjectCleanupView: vi.fn()
}));

const PROJECT = 'f85b6c5f-59fb-4e4c-8654-748f793d8f4b';
const POLITICAL = '5ff452d3-1111-4111-8111-111111111111';
const ROD_FOLDER = '5ff452d3-2222-4222-8222-222222222222';
const ROD_GOAL = '5ff452d3-3333-4333-8333-333333333333';
const EXPO_TASK = '5ff452d3-4444-4444-8444-444444444444';

function row(
	overrides: Partial<ProjectCleanupRowRecord> & { id: string }
): ProjectCleanupRowRecord {
	return {
		project_id: PROJECT,
		run_id: 'run-3',
		kind: 'doc_outdated',
		status: 'pending',
		risk_tier: 1,
		title: 'Project review item',
		rationale: null,
		why_now: null,
		evidence_refs: [],
		preview: null,
		operations: [],
		reversible: true,
		lineage_id: null,
		rollup: null,
		created_at: '2026-09-19T08:00:00.000Z',
		updated_at: '2026-09-28T08:00:00.000Z',
		...overrides
	};
}

/** The f85b6c5f shape: one archive, one cross-project call, a radar bundle, a drift note. */
function wayneStrategiesView(): ProjectCleanupView {
	return buildProjectCleanupView({
		projectId: PROJECT,
		synthesisAt: '2026-09-29T07:00:00.000Z',
		latestRunId: 'run-3',
		synthesis: {
			bottom_line: 'Four stale records still sit in the project.',
			recommendation: 'Archive Political Analysis, then decide where the Rod work lives.',
			groups: [
				{
					title: 'Archive unrelated documents',
					section: 'safe_cleanup',
					item_ids: ['lineage-political'],
					recommendation: 'Nothing links to it.'
				}
			],
			open_count: 4,
			closed_this_pass: [
				{
					lineage_id: 'lineage-book',
					title: 'Book Research document unrelated',
					reason: 'subject_archived',
					detail: 'Book Research was archived on 09-28.'
				}
			],
			generated_at: '2026-09-29T07:00:00.000Z',
			source: 'llm'
		},
		rows: [
			row({
				id: 'lineage-political',
				title: 'Archive Political Analysis',
				rationale: 'Unrelated to the consulting work.',
				operations: [
					{
						tool: 'archive_onto_document',
						args: { project_id: PROJECT, document_id: POLITICAL }
					}
				],
				evidence_refs: [
					{ entity_type: 'project', entity_id: PROJECT, title: 'Wayne Strategies' },
					{ entity_type: 'document', entity_id: POLITICAL, title: 'Political Analysis' }
				],
				rollup: {
					first_seen_at: '2026-09-04T08:00:00.000Z',
					last_confirmed_at: '2026-09-28T08:00:00.000Z',
					seen_run_ids: ['run-1', 'run-2', 'run-3'],
					passes_since_confirmed: 0,
					summary: 'Flagged on 09-04 and 09-19; nothing references it.'
				}
			}),
			row({
				id: 'lineage-rod',
				kind: 'doc_org',
				title: 'Rod Chamberlin documents belong to Beyond Exit Planning',
				rationale: 'The project graduated; 12 docs and a goal moved with it.',
				evidence_refs: [
					{ entity_type: 'document', entity_id: ROD_FOLDER, title: 'Rod Chamberlin' },
					{ entity_type: 'goal', entity_id: ROD_GOAL, title: 'Rod exit plan' }
				]
			}),
			row({
				id: 'radar-bundle',
				kind: 'freshness_update',
				title: 'Two records look out of date',
				preview: {
					summary: 'Freshness radar',
					review_items: [
						{
							concern_id: 'c1',
							entity_type: 'task',
							entity_id: EXPO_TASK,
							title: 'Anne Arundel Biz Expo booth',
							reason: 'The expo happened on 09-12.',
							fix_in_chat_prompt: 'Close the expo task'
						}
					]
				}
			}),
			row({
				id: 'lineage-drift',
				kind: 'drift',
				title: 'Maryland Content Authority goal drifted',
				rationale: 'It reads as a side goal now.'
			})
		]
	});
}

function context(
	overrides: Partial<AgenticChatToolAccessPortV1> = {}
): AgenticChatSharedReadContextV1 & { access: AgenticChatToolAccessPortV1 } {
	return {
		client: { marker: 'service-role' } as never,
		userId: 'user-1',
		timezone: null,
		access: {
			getActorId: vi.fn(async () => 'actor-1'),
			resolveProjectSummaries: vi.fn(async () => []),
			assertProjectAccess: vi.fn(async () => undefined),
			assertEntityAccess: vi.fn(async () => undefined),
			...overrides
		}
	};
}

describe('projectProjectCleanupViewForChat', () => {
	it('keeps every item, grouped by section, with its records and the card handoff', () => {
		const payload = projectProjectCleanupViewForChat(wayneStrategiesView());

		expect(payload.counts).toEqual({ total: 4, safe_cleanup: 1, needs_call: 2, note: 1 });
		expect(payload.groups.map((group) => [group.section, group.title])).toEqual([
			['safe_cleanup', 'Archive unrelated documents'],
			['needs_call', 'Needs your call'],
			['note', 'Worth knowing']
		]);
		const [ready, calls, notes] = payload.groups;
		expect(ready!.recommendation).toBe('Nothing links to it.');
		expect(ready!.items).toEqual([
			{
				id: 'lineage-political',
				source: 'review',
				title: 'Archive Political Analysis',
				summary: 'Flagged on 09-04 and 09-19; nothing references it.',
				executable: true,
				seen_count: 3,
				first_seen_at: '2026-09-04T08:00:00.000Z',
				// The project itself is not evidence the model needs to read.
				records: [{ type: 'document', id: POLITICAL, title: 'Political Analysis' }]
			}
		]);
		expect(calls!.items.map((item) => [item.id, item.source, item.executable])).toEqual([
			['lineage-rod', 'review', false],
			['radar-bundle', 'radar', false]
		]);
		// Radar concerns become records with their reason.
		expect(calls!.items[1]!.records).toEqual([
			{
				type: 'task',
				id: EXPO_TASK,
				title: 'Anne Arundel Biz Expo booth',
				reason: 'The expo happened on 09-12.'
			}
		]);
		expect(notes!.items.map((item) => item.id)).toEqual(['lineage-drift']);
		expect(payload.recently_closed).toEqual([
			{
				title: 'Book Research document unrelated',
				reason: 'subject_archived',
				detail: 'Book Research was archived on 09-28.'
			}
		]);
		expect(payload.synthesized_at).toBe('2026-09-29T07:00:00.000Z');
		expect(payload.omitted_items).toBeUndefined();
		expect(payload.message).toContain('4 open cleanup items');
		expect(payload.message).toContain('AI Inbox "Project cleanup" card');
		expect(payload.message).toContain('Do not re-propose');
	});

	it('carries verified headlines when the view was verified', () => {
		const view = wayneStrategiesView();
		const political = view.items.find((item) => item.id === 'lineage-political')!;
		political.rows[0]!.verified_headline = 'Archive "Political Analysis"';

		const payload = projectProjectCleanupViewForChat(view);
		expect(payload.groups[0]!.items[0]!.verified).toEqual(['Archive "Political Analysis"']);
		expect(payload.groups[1]!.items[0]!.verified).toBeUndefined();
	});

	it('fits a large set under budget, trading detail before dropping items', () => {
		const long = 'x'.repeat(400);
		const rows = Array.from({ length: 60 }, (_, index) =>
			row({
				id: `lineage-${String(index).padStart(2, '0')}`,
				kind: index < 10 ? 'doc_outdated' : index < 50 ? 'doc_org' : 'drift',
				title: `Finding ${index} ${long}`,
				rationale: long,
				operations:
					index < 10
						? [
								{
									tool: 'archive_onto_document',
									args: { project_id: PROJECT, document_id: POLITICAL }
								}
							]
						: [],
				evidence_refs: Array.from({ length: 6 }, (_, ref) => ({
					entity_type: 'document' as const,
					entity_id: `${POLITICAL.slice(0, -2)}${String(ref).padStart(2, '0')}`,
					title: `Evidence ${ref} ${long}`
				}))
			})
		);
		const view = buildProjectCleanupView({ projectId: PROJECT, rows });

		const payload = projectProjectCleanupViewForChat(view);
		expect(JSON.stringify(payload).length).toBeLessThanOrEqual(
			PROJECT_CLEANUP_CHAT_BUDGET_CHARS
		);
		const shown = payload.groups.flatMap((group) => group.items);
		expect(payload.omitted_items).toBe(60 - shown.length);
		expect(payload.message).toContain(`${60 - shown.length} lower-priority items are left out`);
		expect(payload.counts.total).toBe(60);
		// Ready changes survive first; notes are the first to go.
		expect(shown[0]!.id).toBe('lineage-00');
		expect(payload.groups.map((group) => group.section)).toEqual([
			'safe_cleanup',
			'needs_call'
		]);
		for (const item of shown) {
			expect(item.title.length).toBeLessThanOrEqual(90);
			expect(item.summary).toBeUndefined();
			expect(item.records).toHaveLength(1);
		}

		// A mid-sized set keeps every item at a richer level.
		const mid = projectProjectCleanupViewForChat(
			buildProjectCleanupView({ projectId: PROJECT, rows: rows.slice(0, 8) })
		);
		expect(mid.omitted_items).toBeUndefined();
		expect(mid.groups.flatMap((group) => group.items)).toHaveLength(8);
		expect(JSON.stringify(mid).length).toBeLessThanOrEqual(PROJECT_CLEANUP_CHAT_BUDGET_CHARS);
	});

	it('keeps summaries and records for a realistic 12-item set', () => {
		const rows = Array.from({ length: 12 }, (_, index) =>
			row({
				id: `lineage-${String(index).padStart(2, '0')}`,
				kind: index < 4 ? 'doc_outdated' : index < 9 ? 'doc_org' : 'drift',
				title: `Archive the outdated Anne Arundel outreach brief number ${index}`,
				rationale:
					'The event passed on 09-12 and nothing links to the brief; it was flagged in two passes and still sits in the root folder.',
				operations:
					index < 4
						? [
								{
									tool: 'archive_onto_document',
									args: { project_id: PROJECT, document_id: POLITICAL }
								}
							]
						: [],
				evidence_refs: Array.from({ length: 3 }, (_, ref) => ({
					entity_type: 'document' as const,
					entity_id: `${POLITICAL.slice(0, -2)}${String(ref).padStart(2, '0')}`,
					title: `Biz Expo campaign brief ${ref}`
				}))
			})
		);
		const payload = projectProjectCleanupViewForChat(
			buildProjectCleanupView({ projectId: PROJECT, rows })
		);
		const shown = payload.groups.flatMap((group) => group.items);

		expect(shown).toHaveLength(12);
		expect(payload.omitted_items).toBeUndefined();
		for (const item of shown) {
			expect(item.summary).toContain('The event passed on 09-12');
			expect(item.records).toHaveLength(3);
		}
		expect(JSON.stringify(payload).length).toBeLessThanOrEqual(
			PROJECT_CLEANUP_CHAT_BUDGET_CHARS
		);
	});

	it('says plainly when there is nothing open', () => {
		const payload = projectProjectCleanupViewForChat(
			buildProjectCleanupView({ projectId: PROJECT, rows: [] })
		);
		expect(payload.groups).toEqual([]);
		expect(payload.counts.total).toBe(0);
		expect(payload.message).toContain('No Project cleanup set exists for this project yet');
	});
});

describe('getProjectCleanup', () => {
	const load = vi.mocked(loadProjectCleanupView);

	beforeEach(() => {
		load.mockReset();
		load.mockResolvedValue(wayneStrategiesView());
	});

	it('checks project read access, then loads the unverified view', async () => {
		const ctx = context();
		const payload = await getProjectCleanup(ctx, { project_id: PROJECT });

		expect(ctx.access.assertProjectAccess).toHaveBeenCalledWith(PROJECT, 'read');
		expect(load).toHaveBeenCalledWith(ctx.client, PROJECT, { verify: false });
		expect(payload.counts.total).toBe(4);
	});

	it('never loads a project the actor cannot read', async () => {
		const ctx = context({
			assertProjectAccess: vi.fn(async () => {
				throw new AgenticChatToolAccessDeniedError();
			})
		});
		await expect(getProjectCleanup(ctx, { project_id: PROJECT })).rejects.toThrow(
			'Project not found or access denied'
		);
		expect(load).not.toHaveBeenCalled();
	});

	it('rejects a missing or malformed project id before any read', async () => {
		const ctx = context();
		await expect(getProjectCleanup(ctx, { project_id: '' })).rejects.toThrow(
			'project_id is required'
		);
		await expect(getProjectCleanup(ctx, { project_id: 'f85b6c5f' })).rejects.toThrow(
			'Invalid project_id'
		);
		expect(ctx.access.assertProjectAccess).not.toHaveBeenCalled();
		expect(load).not.toHaveBeenCalled();
	});

	it('is dispatched through the shared read registry', async () => {
		const payload = await executeAgenticChatSharedReadToolV1({
			toolName: 'get_project_cleanup',
			context: context(),
			arguments: { project_id: PROJECT }
		});
		expect(payload.groups.map((group) => group.section)).toEqual([
			'safe_cleanup',
			'needs_call',
			'note'
		]);
	});
});
