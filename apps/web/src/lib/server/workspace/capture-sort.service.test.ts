// apps/web/src/lib/server/workspace/capture-sort.service.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getJSONResponse: vi.fn(),
	captureLooseItem: vi.fn(),
	moveItems: vi.fn(),
	undoMoveBatch: vi.fn()
}));

vi.mock('@buildos/shared-agent-ops', () => ({
	resolveUserCivilTimezone: vi.fn(async () => 'America/New_York')
}));
vi.mock('@buildos/shared-agent-ops/ontology/ontology-projects.service', () => ({
	ensureWorkspaceProjectId: vi.fn(async () => 'ws')
}));
vi.mock('$lib/services/ontology/ontology-projects.service', () => ({
	fetchProjectSummaries: vi.fn(async () => [
		{
			id: 'p-buildos',
			name: 'BuildOS',
			description: null,
			kind: 'project',
			access_level: 'admin',
			state_key: 'active',
			updated_at: '2026-10-23T00:00:00Z'
		},
		{
			id: 'p-readonly',
			name: 'Shared',
			description: null,
			kind: 'project',
			access_level: 'read',
			state_key: 'active',
			updated_at: '2026-10-23T00:00:00Z'
		}
	])
}));
vi.mock('$lib/services/smart-llm-service', () => ({
	SmartLLMService: class {
		getJSONResponse = mocks.getJSONResponse;
	}
}));
vi.mock('./workspace.service', () => ({
	captureLooseItem: mocks.captureLooseItem,
	moveItems: mocks.moveItems,
	undoMoveBatch: mocks.undoMoveBatch,
	toLooseDoc: (row: { id: string; title: string }) => ({
		id: row.id,
		entity: 'document',
		title: row.title
	}),
	toLooseTask: (row: { id: string; title: string }) => ({
		id: row.id,
		entity: 'task',
		title: row.title
	}),
	WorkspaceError: class extends Error {
		constructor(
			message: string,
			readonly status = 400
		) {
			super(message);
		}
	}
}));

import { sortCapturedNote, undoCaptureSort } from './capture-sort.service';

/** A query builder that answers every chain with one result. */
function chain(result: unknown) {
	const builder: Record<string, unknown> = {};
	const self = new Proxy(builder, {
		get(_target, prop) {
			if (prop === 'then') return (resolve: (value: unknown) => void) => resolve(result);
			if (prop === 'maybeSingle' || prop === 'single') return () => Promise.resolve(result);
			return () => self;
		}
	});
	return self;
}

const freshNote = {
	id: 'doc-1',
	project_id: 'ws',
	title: 'finished the deck, call the bank monday',
	type_key: 'document.note',
	content: 'finished the deck, call the bank monday',
	description: null,
	props: { captured_via: 'workspace' },
	created_at: new Date().toISOString(),
	updated_at: new Date().toISOString(),
	deleted_at: null
};

function makeSession(
	doc: Omit<typeof freshNote, 'props'> & { props: Record<string, unknown> } = freshNote,
	options: { claimLost?: boolean } = {}
) {
	/** Every props write after the claim (the claim itself is in `claims`). */
	const updates: unknown[] = [];
	const claims: unknown[] = [];
	const session = {
		from: vi.fn((table: string) => {
			if (table === 'onto_documents')
				return {
					select: () => chain({ data: doc, error: null }),
					update: (value: unknown) => {
						const props = (value as { props?: { sorted?: unknown } }).props;
						if (props?.sorted === 'sorting') {
							claims.push(value);
							return chain({
								data: options.claimLost ? [] : [{ id: doc.id }],
								error: null
							});
						}
						updates.push(value);
						return chain({ error: null });
					}
				};
			if (table === 'onto_tasks')
				return chain({
					data: [
						{
							id: 't-deck',
							title: 'Finish the investor deck',
							project_id: 'p-buildos',
							state_key: 'in_progress',
							due_at: null
						}
					],
					error: null
				});
			throw new Error(`unexpected table ${table}`);
		})
	};
	return { session, updates, claims };
}
const admin = { from: () => chain({ count: 0, error: null }) };

function routeFetch(failures: string[] = []) {
	return vi.fn(async (url: string, init?: RequestInit) => {
		const key = `${init?.method} ${url}`;
		if (failures.includes(key)) return Response.json({ error: 'nope' }, { status: 500 });
		if (url === '/api/onto/tasks/create')
			return Response.json({ data: { task: { id: 'new-task', title: 'Call the bank' } } });
		if (url === '/api/onto/documents/create')
			return Response.json({ data: { document: { id: 'new-doc', title: 'Note' } } });
		return Response.json({ data: {} });
	});
}

const base = { userId: 'user-1', actorId: 'actor-1', documentId: 'doc-1' };

describe('sortCapturedNote', () => {
	beforeEach(() => vi.clearAllMocks());

	it('turns a jot into a Workspace task plus a done project task, then removes the note', async () => {
		mocks.getJSONResponse.mockResolvedValue({
			items: [
				{
					kind: 'task',
					title: 'Call the bank',
					due: '2026-10-26',
					project: null,
					confidence: 0.9
				}
			],
			updates: [{ task: 'T1', action: 'complete', confidence: 0.95 }]
		});
		const { session } = makeSession();
		const fetch = routeFetch();
		const result = await sortCapturedNote({
			...base,
			session: session as never,
			admin: admin as never,
			fetch: fetch as never
		});

		expect(fetch.mock.calls.map(([url, init]) => `${init?.method} ${url}`)).toEqual([
			'POST /api/onto/tasks/create',
			'PATCH /api/onto/tasks/t-deck',
			'DELETE /api/onto/documents/doc-1'
		]);
		expect(JSON.parse(String(fetch.mock.calls[0]![1]?.body))).toMatchObject({
			project_id: 'ws',
			title: 'Call the bank',
			due_at: '2026-10-26'
		});
		expect(JSON.parse(String(fetch.mock.calls[1]![1]?.body))).toEqual({ state_key: 'done' });
		expect(result.outcome).toBe('sorted');
		expect(result.lines).toEqual([
			'Task: Call the bank · due Oct 26',
			'Done in BuildOS: Finish the investor deck'
		]);
		expect(result.removed_ids).toEqual(['doc-1']);
		expect(result.added.map((item) => item.id)).toEqual(['new-task']);
		expect(result.receipt).toEqual({
			document_id: 'doc-1',
			move_batch: null,
			created: [{ entity: 'task', id: 'new-task' }],
			updates: [
				{
					task_id: 't-deck',
					action: 'complete',
					before: { state_key: 'in_progress', due_at: null }
				}
			],
			removed_note: { text: freshNote.content }
		});
		// Read-only projects are never offered to the model.
		const prompt = mocks.getJSONResponse.mock.calls[0]![0].userPrompt as string;
		expect(prompt).toContain('BuildOS');
		expect(prompt).not.toContain('Shared');
	});

	it('keeps the original note when part of the sort fails', async () => {
		mocks.getJSONResponse.mockResolvedValue({
			items: [{ kind: 'task', title: 'Call the bank', confidence: 0.9 }],
			updates: [{ task: 'T1', action: 'complete', confidence: 0.95 }]
		});
		const { session, updates } = makeSession();
		const fetch = routeFetch(['PATCH /api/onto/tasks/t-deck']);
		const result = await sortCapturedNote({
			...base,
			session: session as never,
			admin: admin as never,
			fetch: fetch as never
		});
		expect(result.outcome).toBe('partial');
		expect(result.removed_ids).toEqual([]);
		expect(fetch.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);
		expect(updates).toEqual([
			{ props: expect.objectContaining({ sorted: 'partial', captured_via: 'workspace' }) }
		]);
	});

	it('leaves a plain note alone and marks it sorted', async () => {
		mocks.getJSONResponse.mockResolvedValue({
			items: [{ kind: 'note', title: 'An idea', project: null, confidence: 0.9 }],
			updates: []
		});
		const { session, updates } = makeSession();
		const fetch = routeFetch();
		const result = await sortCapturedNote({
			...base,
			session: session as never,
			admin: admin as never,
			fetch: fetch as never
		});
		expect(result).toMatchObject({ outcome: 'kept', lines: [], receipt: null });
		expect(fetch).not.toHaveBeenCalled();
		expect(updates).toHaveLength(1);
	});

	it('claims the note before the model call, and a retry that loses the claim does nothing', async () => {
		mocks.getJSONResponse.mockResolvedValue({
			items: [{ kind: 'note', title: 'An idea', project: null, confidence: 0.9 }],
			updates: []
		});
		const first = makeSession();
		await sortCapturedNote({
			...base,
			session: first.session as never,
			admin: admin as never,
			fetch: routeFetch() as never
		});
		expect(first.claims).toEqual([
			{ props: expect.objectContaining({ sorted: 'sorting', captured_via: 'workspace' }) }
		]);

		mocks.getJSONResponse.mockClear();
		const retry = makeSession(freshNote, { claimLost: true });
		const fetch = routeFetch();
		const result = await sortCapturedNote({
			...base,
			session: retry.session as never,
			admin: admin as never,
			fetch: fetch as never
		});
		expect(result.outcome).toBe('skipped');
		expect(mocks.getJSONResponse).not.toHaveBeenCalled();
		expect(fetch).not.toHaveBeenCalled();
		expect(retry.updates).toEqual([]);
	});

	it('never sorts an old or already-sorted note, and makes no model call', async () => {
		const old = { ...freshNote, created_at: '2026-10-01T00:00:00Z' };
		const sorted = { ...freshNote, props: { sorted: 'kept' } };
		for (const doc of [old, sorted]) {
			const { session } = makeSession(doc);
			const result = await sortCapturedNote({
				...base,
				session: session as never,
				admin: admin as never,
				fetch: routeFetch() as never
			});
			expect(result.outcome).toBe('skipped');
		}
		expect(mocks.getJSONResponse).not.toHaveBeenCalled();
	});

	it('keeps the note when the model call fails', async () => {
		mocks.getJSONResponse.mockRejectedValue(new Error('timeout'));
		const { session } = makeSession();
		const fetch = routeFetch();
		const result = await sortCapturedNote({
			...base,
			session: session as never,
			admin: admin as never,
			fetch: fetch as never
		});
		expect(result.outcome).toBe('kept');
		expect(fetch).not.toHaveBeenCalled();
	});
});

describe('undoCaptureSort', () => {
	beforeEach(() => vi.clearAllMocks());

	it('removes what was created, restores the task, and brings the note back', async () => {
		mocks.captureLooseItem.mockResolvedValue({
			workspaceId: 'ws',
			item: { id: 'restored', entity: 'document', title: 'finished the deck' }
		});
		const { session, updates } = makeSession();
		const fetch = routeFetch();
		const result = await undoCaptureSort({
			session: session as never,
			admin: admin as never,
			userId: 'user-1',
			actorId: 'actor-1',
			fetch: fetch as never,
			receipt: {
				document_id: 'doc-1',
				move_batch: null,
				created: [{ entity: 'task', id: 'new-task' }],
				updates: [
					{
						task_id: 't-deck',
						action: 'complete',
						before: { state_key: 'in_progress', due_at: null }
					}
				],
				removed_note: { text: 'finished the deck' }
			}
		});
		expect(fetch.mock.calls.map(([url, init]) => `${init?.method} ${url}`)).toEqual([
			'DELETE /api/onto/tasks/new-task',
			'PATCH /api/onto/tasks/t-deck'
		]);
		expect(JSON.parse(String(fetch.mock.calls[1]![1]?.body))).toEqual({
			state_key: 'in_progress'
		});
		expect(mocks.captureLooseItem).toHaveBeenCalledWith(
			expect.objectContaining({
				capture: { kind: 'note', text: 'finished the deck', source: 'undo' }
			})
		);
		expect(result).toEqual({
			restored: { id: 'restored', entity: 'document', title: 'finished the deck' },
			removed_ids: ['new-task'],
			failed: 0
		});
		// The restored note is never sorted again.
		expect(updates.at(-1)).toEqual({ props: expect.objectContaining({ sorted: 'undone' }) });
	});

	it('moves a filed note back home', async () => {
		mocks.undoMoveBatch.mockResolvedValue(true);
		const { session } = makeSession();
		const result = await undoCaptureSort({
			session: session as never,
			admin: admin as never,
			userId: 'user-1',
			actorId: 'actor-1',
			fetch: routeFetch() as never,
			receipt: {
				document_id: 'doc-1',
				move_batch: '00000000-0000-4000-8000-000000000001',
				created: [],
				updates: [],
				removed_note: null
			}
		});
		expect(mocks.undoMoveBatch).toHaveBeenCalledWith(
			expect.objectContaining({ batchId: '00000000-0000-4000-8000-000000000001' })
		);
		expect(result.restored?.id).toBe('doc-1');
	});
});
