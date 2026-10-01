// apps/web/src/lib/server/organize/organize-service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { organizeFixtures } from '$lib/components/organize/organize-fixtures';
import { loadOrganizeSnapshot } from './organize-snapshot';
import { previewOrApplyOrganize, undoOrganize, organizeHistory } from './organize-service';
vi.mock('./organize-snapshot', () => ({
	loadOrganizeSnapshot: vi.fn(),
	OrganizeSnapshotError: class extends Error {}
}));
const request = {
	moves: [
		{
			kind: 'document' as const,
			id: 'brief',
			project_id: 'source',
			destination_project_id: 'dest',
			parent_id: 'shared',
			position: 0
		}
	],
	project_versions: { source: '4', dest: '8' }
};
const confirmed = { ...request, batch_id: 'batch', confirmation_token: 'token' };
type Row = Record<string, unknown>;
const savedBatch = (overrides: Row = {}): Row => ({
	id: 'batch',
	user_id: 'user',
	project_ids: ['dest', 'source'],
	inverse_of: null,
	plan: { moves: request.moves, projects: [], trees: [] },
	receipt: { status: 'applied', batch_id: 'batch', replayed: false },
	created_at: 'today',
	...overrides
});
/** Admin client over an in-memory journal. Filters are applied rather than
 * ignored, so dropping `.eq('user_id', userId)` (the only cross-user barrier,
 * since the admin client bypasses RLS) makes these tests see other users' rows. */
function admin(rows: Row[] = []) {
	const filters: [string, string, unknown][] = [];
	const from = vi.fn(() => {
		let result = [...rows];
		const query: any = {};
		for (const method of ['select', 'order', 'limit']) query[method] = vi.fn(() => query);
		query.eq = vi.fn((column: string, value: unknown) => {
			filters.push(['eq', column, value]);
			result = result.filter((row) => row[column] === value);
			return query;
		});
		query.contains = vi.fn((column: string, value: unknown[]) => {
			filters.push(['contains', column, value]);
			result = result.filter((row) =>
				value.every((item) => (row[column] as unknown[]).includes(item))
			);
			return query;
		});
		query.maybeSingle = vi.fn(async () =>
			result.length > 1
				? { data: null, error: { message: 'multiple rows' } }
				: { data: result[0] ?? null, error: null }
		);
		query.then = (resolve: any, reject: any) =>
			Promise.resolve({ data: result, error: null }).then(resolve, reject);
		return query;
	});
	const rpc = vi.fn(async () => ({
		data: { confirmation_token: 'token', impact: [] },
		error: null
	}));
	return { from, rpc, rows, filters } as any;
}
/** Session client whose only job here is the per-project write check. */
function session(canWrite: (id: string) => boolean = () => true) {
	return {
		rpc: vi.fn(async (_name: string, args: { p_project_id: string }) => ({
			data: canWrite(args.p_project_id),
			error: null
		}))
	} as any;
}
beforeEach(() => {
	vi.resetAllMocks();
	vi.mocked(loadOrganizeSnapshot).mockImplementation(async (_client, id) => ({
		project: organizeFixtures().find((p) => p.id === id)!,
		related_projects: []
	}));
});
describe('Organize service', () => {
	it('compiles from write-checked snapshots and calls only the preview RPC', async () => {
		const privileged = admin();
		const user = session();
		await previewOrApplyOrganize({
			session: user,
			admin: privileged,
			userId: 'user',
			request,
			apply: false
		});
		expect(user.rpc).toHaveBeenCalledWith('current_actor_has_project_member_access', {
			p_project_id: 'source',
			p_required_access: 'write'
		});
		expect(loadOrganizeSnapshot).toHaveBeenCalledWith(user, 'source', { writeChecked: true });
		expect(privileged.rpc).toHaveBeenCalledOnce();
		expect(privileged.rpc).toHaveBeenCalledWith(
			'onto_organize_preview',
			expect.objectContaining({
				p_user_id: 'user',
				p_plan: expect.objectContaining({ moves: request.moves })
			})
		);
	});
	it('checks edit access to every project before loading any contents', async () => {
		const privileged = admin();
		await expect(
			previewOrApplyOrganize({
				session: session((id) => id !== 'dest'),
				admin: privileged,
				userId: 'user',
				request,
				apply: false
			})
		).rejects.toMatchObject({ status: 403 });
		expect(loadOrganizeSnapshot).not.toHaveBeenCalled();
		expect(privileged.rpc).not.toHaveBeenCalled();
	});
	it('caps distinct projects before any access check', async () => {
		const user = session();
		const moves = Array.from({ length: 11 }, (_, i) => ({
			...request.moves[0]!,
			project_id: `p${2 * i}`,
			destination_project_id: `p${2 * i + 1}`
		}));
		await expect(
			previewOrApplyOrganize({
				session: user,
				admin: admin(),
				userId: 'user',
				request: { ...request, moves },
				apply: false
			})
		).rejects.toMatchObject({ status: 400 });
		expect(user.rpc).not.toHaveBeenCalled();
		expect(loadOrganizeSnapshot).not.toHaveBeenCalled();
	});
	it('rejects stale project versions before the privileged RPC', async () => {
		const privileged = admin();
		await expect(
			previewOrApplyOrganize({
				session: session(),
				admin: privileged,
				userId: 'user',
				request: { ...request, project_versions: {} },
				apply: false
			})
		).rejects.toThrow('project changed');
		expect(privileged.rpc).not.toHaveBeenCalled();
	});
	it('returns planner rejections but hides planner defects', async () => {
		await expect(
			previewOrApplyOrganize({
				session: session(),
				admin: admin(),
				userId: 'user',
				request: { ...request, moves: [{ ...request.moves[0]!, id: 'start' }] },
				apply: false
			})
		).rejects.toMatchObject({ status: 400, message: expect.stringContaining('START HERE') });

		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.mocked(loadOrganizeSnapshot).mockImplementation(async (_client, id) => ({
			project: {
				...organizeFixtures().find((p) => p.id === id)!,
				documents: undefined as never
			},
			related_projects: []
		}));
		const failure = await previewOrApplyOrganize({
			session: session(),
			admin: admin(),
			userId: 'user',
			request,
			apply: false
		}).catch((error) => error);
		expect(failure).toMatchObject({ status: 400 });
		expect(failure.message).toBe(
			'These moves could not be planned. Refresh the projects and preview again.'
		);
		expect(log).toHaveBeenCalled();
		log.mockRestore();
	});
	it('passes the exact confirmation token and idempotency key on apply', async () => {
		const privileged = admin();
		await previewOrApplyOrganize({
			session: session(),
			admin: privileged,
			userId: 'user',
			request: confirmed,
			apply: true
		});
		expect(privileged.rpc).toHaveBeenCalledWith(
			'onto_organize_apply_atomic',
			expect.objectContaining({ p_batch_id: 'batch', p_confirmation_token: 'token' })
		);
	});
	it('returns a saved batch receipt before any snapshot, version or access work', async () => {
		const privileged = admin([savedBatch()]);
		const user = session(() => false);
		const result = await previewOrApplyOrganize({
			session: user,
			admin: privileged,
			userId: 'user',
			// Versions moved on and access was lost after the batch saved.
			request: { ...confirmed, project_versions: {} },
			apply: true
		});
		expect(result).toEqual({ status: 'applied', batch_id: 'batch', replayed: true });
		expect(user.rpc).not.toHaveBeenCalled();
		expect(loadOrganizeSnapshot).not.toHaveBeenCalled();
		expect(privileged.rpc).not.toHaveBeenCalled();
		expect(privileged.filters).toContainEqual(['eq', 'user_id', 'user']);
	});
	it("never replays another user's batch", async () => {
		const privileged = admin([
			savedBatch({ user_id: 'other', receipt: { status: 'applied', secret: true } })
		]);
		const result = await previewOrApplyOrganize({
			session: session(),
			admin: privileged,
			userId: 'user',
			request: confirmed,
			apply: true
		});
		expect(result).not.toHaveProperty('secret');
		// SQL then rejects the reused id with organize_idempotency_conflict.
		expect(privileged.rpc).toHaveBeenCalledWith(
			'onto_organize_apply_atomic',
			expect.objectContaining({ p_user_id: 'user', p_batch_id: 'batch' })
		);
	});
	it('rejects a batch id reused for a different request', async () => {
		const privileged = admin([
			savedBatch({ plan: { moves: [{ ...request.moves[0], position: 1 }] } })
		]);
		await expect(
			previewOrApplyOrganize({
				session: session(),
				admin: privileged,
				userId: 'user',
				request: confirmed,
				apply: true
			})
		).rejects.toMatchObject({ status: 409, message: expect.stringContaining('already used') });
		expect(privileged.rpc).not.toHaveBeenCalled();
	});
	it('returns the saved receipt when a concurrent retry commits first', async () => {
		const privileged = admin();
		privileged.rpc.mockImplementation(async () => {
			privileged.rows.push(savedBatch());
			return { data: null, error: { message: 'organize_stale_preview', code: 'P0001' } };
		});
		await expect(
			previewOrApplyOrganize({
				session: session(),
				admin: privileged,
				userId: 'user',
				request: confirmed,
				apply: true
			})
		).resolves.toEqual({ status: 'applied', batch_id: 'batch', replayed: true });
	});
	it('keeps the rejection when the batch did not save', async () => {
		const privileged = admin();
		privileged.rpc.mockResolvedValue({
			data: null,
			error: { message: 'organize_stale_preview', code: 'P0001' }
		});
		await expect(
			previewOrApplyOrganize({
				session: session(),
				admin: privileged,
				userId: 'user',
				request: confirmed,
				apply: true
			})
		).rejects.toMatchObject({ status: 409, message: expect.stringContaining('Preview again') });
		// Checked before the write and again after it failed.
		expect(privileged.from).toHaveBeenCalledTimes(2);
	});
	it('turns a database stale-token failure into a conflict', async () => {
		const privileged = admin();
		privileged.rpc.mockResolvedValue({
			data: null,
			error: { message: 'organize_stale_preview', code: 'P0001' }
		});
		await expect(
			previewOrApplyOrganize({
				session: session(),
				admin: privileged,
				userId: 'user',
				request,
				apply: false
			})
		).rejects.toMatchObject({ status: 409 });
	});
	it("does not undo another user's batch", async () => {
		const privileged = admin([savedBatch({ id: 'theirs', user_id: 'other' })]);
		await expect(
			undoOrganize({
				session: session(),
				admin: privileged,
				userId: 'user',
				sourceBatchId: 'theirs'
			})
		).rejects.toMatchObject({ status: 404 });
		expect(privileged.filters).toContainEqual(['eq', 'user_id', 'user']);
		expect(loadOrganizeSnapshot).not.toHaveBeenCalled();
	});
	it('reports a concurrent undo as saved rather than nothing to undo', async () => {
		const source = savedBatch({
			id: 'source-batch',
			manifest: [
				{
					kind: 'task',
					id: 'task',
					before: { project_id: 'source', parent_id: null, position: 0 },
					after: { project_id: 'dest', parent_id: null, position: 0 },
					subtree: null
				}
			]
		});
		const privileged = admin([source]);
		const undoReceipt = { status: 'applied', batch_id: 'undo', inverse_of: 'source-batch' };
		// The first request commits while this retry is loading the projects.
		const user = session(() => {
			if (!privileged.rows.some((row: Row) => row.id === 'undo'))
				privileged.rows.push(
					savedBatch({ id: 'undo', inverse_of: 'source-batch', receipt: undoReceipt })
				);
			return true;
		});
		await expect(
			undoOrganize({
				session: user,
				admin: privileged,
				userId: 'user',
				sourceBatchId: 'source-batch',
				batchId: 'undo',
				confirmationToken: 'token'
			})
		).resolves.toEqual({ ...undoReceipt, replayed: true });
		expect(privileged.rpc).not.toHaveBeenCalled();
	});
	it("lists only this user's batches whose projects are still editable", async () => {
		const privileged = admin([
			savedBatch({ id: 'mine' }),
			savedBatch({ id: 'lost', project_ids: ['source', 'gone'] }),
			savedBatch({ id: 'theirs', user_id: 'other', project_ids: ['source'] })
		]);
		const user = session((id) => id !== 'gone');
		const history = await organizeHistory(user, privileged, 'user', 'source');
		expect(history.map((batch) => batch.id)).toEqual(['mine']);
		expect(history[0]).not.toHaveProperty('user_id');
		expect(privileged.filters).toContainEqual(['eq', 'user_id', 'user']);
		// One write check per distinct project.
		expect(user.rpc).toHaveBeenCalledTimes(3);
	});
	it('names moved items the viewer can read now, in one query per table', async () => {
		const step = (kind: string, id: string, children: unknown[] = []) => ({
			kind,
			id,
			before: { project_id: 'source', parent_id: null, position: 0 },
			after: { project_id: 'dest', parent_id: null, position: 0 },
			subtree: kind === 'document' ? { id, children } : null
		});
		const privileged = admin([
			savedBatch({
				id: 'docs',
				manifest: [
					step('document', 'research', [{ id: 'notes', children: [] }]),
					step('document', 'secret'),
					step('task', 'call'),
					step('document', 'research', [{ id: 'notes', children: [] }]),
					step('document', 'fourth')
				]
			}),
			savedBatch({ id: 'old', manifest: undefined })
		]);
		const user = session();
		const tables: Record<string, Row[]> = {
			// RLS already left out "secret": the viewer can't read it any more.
			onto_documents: [
				{ id: 'research', title: 'Research', deleted_at: null },
				{ id: 'fourth', title: 'Fourth', deleted_at: null }
			],
			onto_tasks: [{ id: 'call', title: 'Call Redline', deleted_at: null }]
		};
		const reads: { table: string; ids: unknown[] }[] = [];
		user.from = vi.fn((table: string) => {
			let rows = [...(tables[table] ?? [])];
			const query: any = {
				select: vi.fn(() => query),
				in: vi.fn((_column: string, ids: unknown[]) => {
					reads.push({ table, ids });
					rows = rows.filter((row) => ids.includes(row.id));
					return query;
				}),
				is: vi.fn(() => query),
				then: (resolve: any, reject: any) =>
					Promise.resolve({ data: rows, error: null }).then(resolve, reject)
			};
			return query;
		});
		const history = await organizeHistory(user, privileged, 'user', 'source');
		const docs = history.find((batch) => batch.id === 'docs')!;
		expect(docs.moved).toEqual([
			{ kind: 'document', title: 'Research', child_count: 1 },
			{ kind: 'task', title: 'Call Redline', child_count: 0 }
		]);
		expect(docs.moved_count).toBe(4);
		expect(history.find((batch) => batch.id === 'old')).toMatchObject({
			moved: [],
			moved_count: 0
		});
		// Only the first few items per batch are looked up, through the session client.
		expect(reads).toEqual([
			{ table: 'onto_documents', ids: ['research', 'secret'] },
			{ table: 'onto_tasks', ids: ['call'] }
		]);
	});
	it('keeps history when item titles cannot be read', async () => {
		const privileged = admin([
			savedBatch({
				manifest: [
					{
						kind: 'task',
						id: 'call',
						before: { project_id: 'source', parent_id: null, position: 0 },
						after: { project_id: 'dest', parent_id: null, position: 0 },
						subtree: null
					}
				]
			})
		]);
		const user = session();
		user.from = vi.fn(() => {
			throw new Error('connection reset');
		});
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const [batch] = await organizeHistory(user, privileged, 'user', 'source');
		expect(batch).toMatchObject({ id: 'batch', moved: [], moved_count: 1 });
	});
	it('refuses history without edit access to the project', async () => {
		const privileged = admin([savedBatch()]);
		await expect(
			organizeHistory(
				session(() => false),
				privileged,
				'user',
				'source'
			)
		).rejects.toMatchObject({ status: 403 });
		expect(privileged.from).not.toHaveBeenCalled();
	});
});
