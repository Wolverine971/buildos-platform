// apps/web/src/lib/server/workspace/workspace.service.cards.test.ts
// Tasker 152: Workspace cards read summaries and headings, not bodies; the agent's confident
// filings are carried out with an undoable batch, and stale or unsure ones are left alone.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	extractOutline,
	hashDocumentContent
} from '@buildos/shared-agent-ops/utils/document-outline';

const mocks = vi.hoisted(() => ({
	previewOrApplyOrganize: vi.fn(),
	loadOrganizeSnapshot: vi.fn()
}));

vi.mock('@buildos/shared-agent-ops/ontology/ontology-projects.service', () => ({
	ensureWorkspaceProjectId: vi.fn(async () => 'ws')
}));
vi.mock('$lib/services/ontology/instantiation.service', () => ({ instantiateProject: vi.fn() }));
vi.mock('$lib/services/ontology/doc-structure.service', () => ({
	addDocumentToTree: vi.fn(),
	findNodeById: vi.fn((tree: { id: string }[], id: string) => tree.find((n) => n.id === id))
}));
vi.mock('$lib/services/ontology/versioning.service', () => ({
	createOrMergeDocumentVersion: vi.fn(),
	toDocumentSnapshot: vi.fn()
}));
vi.mock('$lib/services/ontology/auto-organizer.service', () => ({
	prepareRelationshipMutationPlan: vi.fn()
}));
vi.mock('$lib/services/async-activity-logger', () => ({ logCreateAsync: vi.fn() }));
vi.mock('$lib/components/organize/organize-plan', () => ({
	visibleDocumentTree: vi.fn((project: { tree: { id: string }[] }) => project.tree)
}));
vi.mock('$lib/components/organize/organize-api', () => ({ blockerMessage: vi.fn() }));
vi.mock('$lib/server/organize/organize-snapshot', () => ({
	loadOrganizeSnapshot: mocks.loadOrganizeSnapshot
}));
vi.mock('$lib/server/organize/organize-service', () => ({
	OrganizeError: class extends Error {},
	previewOrApplyOrganize: mocks.previewOrApplyOrganize,
	undoOrganize: vi.fn()
}));

import { autoFileConfident, loadWorkspaceHome, toLooseDoc } from './workspace.service';

const LONG = `## Pricing\n${'Per-seat pricing at $12 with a free tier. '.repeat(10)}\n## Rollout\nQ1.`;
const HASH = hashDocumentContent(LONG);

function docRow(over: Record<string, unknown> = {}) {
	return {
		id: 'd1',
		title: 'Pricing idea',
		type_key: 'document.note',
		description: null,
		digest: {
			summary: 'Per-seat pricing at $12, free tier, rolling out in Q1.',
			content_hash: HASH
		},
		outline: extractOutline(LONG),
		content_hash: HASH,
		created_at: '2026-11-05T00:00:00Z',
		updated_at: '2026-11-05T00:00:00Z',
		...over
	};
}

describe('Workspace cards', () => {
	it('shows the AI summary and headings, never a cut of the body', () => {
		const item = toLooseDoc(docRow());
		expect(item.excerpt).toBe('Per-seat pricing at $12, free tier, rolling out in Q1.');
		expect(item.topics).toEqual(['Pricing', 'Rollout']);
	});

	it("prefers the person's description; a short note is its own text", () => {
		expect(toLooseDoc(docRow({ description: 'Mine.' })).excerpt).toBe('Mine.');
		const note = 'Call Sam about the venue deposit';
		expect(
			toLooseDoc(
				docRow({
					digest: null,
					outline: extractOutline(note),
					content_hash: hashDocumentContent(note),
					content: note,
					title: 'Venue'
				})
			).excerpt
		).toBe(note);
	});

	it('loads the list without bodies and reads text only for cards with no line', async () => {
		const selects: string[] = [];
		const textIds: unknown[] = [];
		const rows = [
			docRow(),
			docRow({ id: 'd2', title: 'Venue', digest: null, outline: null, content_hash: 'h2' })
		];
		const session = {
			from(table: string) {
				let columns = '';
				let ids: unknown = null;
				const builder: Record<string, unknown> = {};
				for (const m of ['eq', 'is', 'neq', 'order', 'limit']) builder[m] = () => builder;
				builder.select = (c: string) => (
					(columns = c),
					selects.push(`${table}:${c}`),
					builder
				);
				builder.in = (_c: string, v: unknown) => ((ids = v), textIds.push(v), builder);
				builder.maybeSingle = () =>
					Promise.resolve({ data: { doc_structure: null }, error: null });
				builder.then = (ok: (v: unknown) => unknown) => {
					let data: unknown[] = [];
					if (table === 'onto_documents')
						data = ids
							? [{ id: 'd2', content: 'Call Sam about the venue deposit' }]
							: rows;
					return Promise.resolve({ data, error: null, count: data.length }).then(ok);
				};
				void columns;
				return builder;
			}
		};
		const home = await loadWorkspaceHome(session as never, 'ws');
		const listing = selects.find((s) => s.startsWith('onto_documents:id, title'))!;
		expect(listing).not.toMatch(/\bcontent\b(?!_hash)/);
		expect(textIds).toEqual([['d2']]);
		const byId = new Map(home.items.map((item) => [item.id, item]));
		expect(byId.get('d1')!.excerpt).toContain('Per-seat pricing');
		expect(byId.get('d2')!.excerpt).toBe('Call Sam about the venue deposit');
	});
});

describe('autoFileConfident', () => {
	beforeEach(() => {
		mocks.loadOrganizeSnapshot.mockImplementation(async (_s: unknown, id: string) => ({
			project: {
				id,
				can_write: true,
				tasks: [],
				tree: id === 'ws' ? [{ id: 'd1' }, { id: 'd3' }] : [],
				structure: { version: 1 }
			}
		}));
		mocks.previewOrApplyOrganize.mockReset();
		mocks.previewOrApplyOrganize.mockImplementation(async ({ apply }: { apply: boolean }) =>
			apply ? {} : { confirmation_token: 'tok', impact: [] }
		);
	});

	function clients(suggestions: Record<string, unknown>[], loose: string[]) {
		const updates: Record<string, unknown>[] = [];
		const admin = {
			from() {
				const filters: Record<string, unknown> = {};
				let update: Record<string, unknown> | null = null;
				const builder: Record<string, unknown> = {};
				for (const m of ['select', 'gte', 'order', 'limit']) builder[m] = () => builder;
				builder.eq = (c: string, v: unknown) => ((filters[c] = v), builder);
				builder.update = (v: Record<string, unknown>) => ((update = v), builder);
				builder.maybeSingle = () =>
					Promise.resolve({
						data: suggestions.find((s) => s.id === filters.id) ?? null,
						error: null
					});
				builder.then = (ok: (v: unknown) => unknown) => {
					if (update) updates.push({ id: filters.id, ...update });
					return Promise.resolve({ data: update ? null : suggestions, error: null }).then(
						ok
					);
				};
				return builder;
			}
		};
		const session = {
			from() {
				let ids: string[] = [];
				const builder: Record<string, unknown> = {};
				for (const m of ['select', 'eq', 'is']) builder[m] = () => builder;
				builder.in = (_c: string, v: string[]) => ((ids = v), builder);
				builder.then = (ok: (v: unknown) => unknown) =>
					Promise.resolve({
						data: ids
							.filter((id) => loose.includes(id))
							.map((id) => ({ id, title: `T ${id}` })),
						error: null
					}).then(ok);
				return builder;
			}
		};
		return { admin, session, updates };
	}

	const suggestion = (over: Record<string, unknown>) => ({
		id: 's1',
		kind: 'file',
		status: 'open',
		target_project_id: 'p9',
		confidence: 0.9,
		reason: 'Pricing belongs to the SaaS project.',
		items: [{ entity: 'document', id: 'd1' }],
		result: null,
		created_at: '2026-11-05T00:00:00Z',
		...over
	});

	it('files a confident note as one undoable batch and records it as automatic', async () => {
		const { admin, session, updates } = clients([suggestion({})], ['d1']);
		const filed = await autoFileConfident({
			session: session as never,
			admin: admin as never,
			userId: 'u1',
			workspaceId: 'ws'
		});
		expect(filed).toEqual([
			expect.objectContaining({ suggestion_id: 's1', project_id: 'p9', item_ids: ['d1'] })
		]);
		expect(mocks.previewOrApplyOrganize).toHaveBeenCalledTimes(2);
		expect(updates[0]).toMatchObject({
			id: 's1',
			status: 'accepted',
			result: { accepted: { project_id: 'p9', auto: true } }
		});
	});

	it('leaves tasks and items that already left the Workspace alone', async () => {
		const { admin, session } = clients(
			[
				suggestion({ id: 's2', items: [{ entity: 'task', id: 't1' }] }),
				suggestion({ id: 's3', items: [{ entity: 'document', id: 'gone' }] })
			],
			['d1']
		);
		const filed = await autoFileConfident({
			session: session as never,
			admin: admin as never,
			userId: 'u1',
			workspaceId: 'ws'
		});
		expect(filed).toEqual([]);
		expect(mocks.previewOrApplyOrganize).not.toHaveBeenCalled();
	});
});
