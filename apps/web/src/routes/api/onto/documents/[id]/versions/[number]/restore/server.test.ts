// apps/web/src/routes/api/onto/documents/[id]/versions/[number]/restore/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

const mocks = vi.hoisted(() => ({ access: vi.fn(), log: vi.fn(), activity: vi.fn() }));
vi.mock('$lib/server/ontology-api-access', () => ({ requireProjectEntityAccess: mocks.access }));
vi.mock('../../../../../shared/error-logging', () => ({ logOntologyApiError: mocks.log }));
vi.mock('$lib/services/async-activity-logger', () => ({
	logUpdateAsync: mocks.activity,
	getChangeSourceFromRequest: () => 'ui',
	getChatSessionIdFromRequest: () => null
}));
import { POST } from './+server';

const loadedAt = '2026-09-07T12:00:00.000Z';
const head = {
	id: 'doc-1',
	project_id: 'project-1',
	title: 'Current',
	content: 'Current edits',
	description: '',
	state_key: 'draft',
	type_key: 'document.default',
	updated_at: loadedAt,
	props: { agent_workspace: { source: 'current' }, custom: 'keep' }
};
const snapshot = {
	title: 'Earlier',
	content: 'Earlier content',
	description: '',
	state_key: 'draft',
	type_key: 'document.default',
	project_id: 'project-1',
	props: { agent_workspace: { source: 'old' } }
};

function fixture(
	options: { race?: boolean; failVersion?: boolean; collision?: boolean; snapshot?: unknown } = {}
) {
	const headFilters: Record<string, unknown> = {};
	const inserted: Array<{ number: number; props: Record<string, unknown> }> = [];
	let committed: Record<string, unknown> | null = null;
	let collided = false;
	const supabase = {
		from(table: string) {
			let action = 'select';
			let payload: Record<string, unknown> = {};
			const filters: Record<string, unknown> = {};
			const query = {
				select: () => query,
				order: () => query,
				limit: () => query,
				is: (key: string, value: unknown) => {
					filters[key] = value;
					return query;
				},
				eq: (key: string, value: unknown) => {
					filters[key] = value;
					return query;
				},
				update: (value: Record<string, unknown>) => {
					action = 'update';
					payload = value;
					return query;
				},
				insert: (value: Record<string, unknown>) => {
					action = 'insert';
					payload = value;
					return query;
				},
				maybeSingle: async () => ({
					data: filters.number
						? {
								id: 'v1',
								number: 1,
								props: {
									snapshot: options.snapshot ?? snapshot,
									snapshot_hash: 'reviewed-hash'
								}
							}
						: {
								id: 'v5',
								number: collided ? 6 : 5,
								created_by: 'actor-1',
								created_at: new Date().toISOString(),
								props: {}
							},
					error: null
				}),
				single: async () => {
					if (table === 'onto_documents' && action === 'update') {
						Object.assign(headFilters, filters);
						if (options.race || filters.updated_at !== loadedAt)
							return { data: null, error: { code: 'PGRST116' } };
						committed = { ...head, ...payload };
						return { data: committed, error: null };
					}
					if (table === 'onto_document_versions' && action === 'insert') {
						if (options.failVersion)
							return {
								data: null,
								error: { code: 'XX000', message: 'history unavailable' }
							};
						if (options.collision && !collided) {
							collided = true;
							return { data: null, error: { code: '23505' } };
						}
						inserted.push(payload as (typeof inserted)[number]);
						return {
							data: { id: `v${payload.number}`, number: payload.number },
							error: null
						};
					}
					throw new Error(`Unexpected ${table} ${action}`);
				},
				then: (resolve: (result: { error: null }) => unknown) =>
					Promise.resolve({ error: null }).then(resolve)
			};
			return query;
		}
	};
	const run = (
		body: Record<string, unknown> = {
			expected_updated_at: loadedAt,
			expected_snapshot_hash: 'reviewed-hash'
		},
		number = '1'
	) =>
		POST({
			params: { id: 'doc-1', number },
			request: new Request('http://localhost/api/onto/documents/doc-1/versions/1/restore', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			}),
			locals: { supabase, safeGetSession: async () => ({ user: { id: 'user-1' } }) }
		} as never);
	return {
		run,
		headFilters,
		inserted,
		get committed() {
			return committed;
		}
	};
}

describe('guarded document version restore', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.access.mockResolvedValue({ ok: true, entity: head, actorId: 'actor-1' });
		mocks.log.mockResolvedValue(undefined);
	});

	it('uses the guarded head writer and retries a contended restore version number', async () => {
		const f = fixture({ collision: true });
		const response = await f.run();
		expect(response.status).toBe(200);
		expect(f.headFilters).toMatchObject({
			id: 'doc-1',
			project_id: 'project-1',
			updated_at: loadedAt,
			deleted_at: null
		});
		expect(f.committed).toMatchObject({
			content: 'Earlier content',
			props: { agent_workspace: head.props.agent_workspace, custom: 'keep' }
		});
		expect(f.inserted).toHaveLength(1);
		expect(f.inserted[0]).toMatchObject({
			number: 7,
			props: { restore_of_version: 1, restored_by_user_id: 'user-1', is_merged: false }
		});
		const props = f.inserted[0]!.props;
		expect(props.snapshot_hash).toBe(
			createHash('sha256').update(JSON.stringify(props.snapshot)).digest('hex')
		);
		expect(await response.json()).toMatchObject({
			data: { newVersion: { number: 7 }, version_warning: null }
		});
	});

	it.each([false, true])(
		'rejects a stale head or a write-time race (race=%s) without creating history',
		async (race) => {
			const f = fixture({ race });
			const response = await f.run({
				expected_updated_at: race ? loadedAt : '2026-09-07T11:00:00.000Z'
			});
			expect(response.status).toBe(409);
			expect(f.committed).toBeNull();
			expect(f.inserted).toHaveLength(0);
			expect(mocks.activity).not.toHaveBeenCalled();
		}
	);

	it('returns the committed restore with a visible warning when history fails', async () => {
		const f = fixture({ failVersion: true });
		const response = await f.run();
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			data: {
				document: { content: 'Earlier content' },
				newVersion: null,
				version_warning: expect.stringContaining('could not be added')
			}
		});
		expect(mocks.log).toHaveBeenCalledWith(
			expect.objectContaining({
				operation: 'version_restore_create',
				metadata: { nonFatal: true }
			})
		);
	});

	it('rejects a version that changed after review and a stale legacy history precondition', async () => {
		const f = fixture();
		expect(
			(await f.run({ expected_updated_at: loadedAt, expected_snapshot_hash: 'old-hash' }))
				.status
		).toBe(409);
		expect((await f.run({ expected_version: 4 })).status).toBe(409);
		expect(f.committed).toBeNull();
	});

	it('guards legacy restores with the head timestamp loaded during access checking', async () => {
		const f = fixture();
		expect((await f.run({ expected_version: 5 })).status).toBe(200);
		expect(f.headFilters.updated_at).toBe(loadedAt);
	});

	it('requires admin access before reading or writing version data', async () => {
		mocks.access.mockResolvedValueOnce({
			ok: false,
			response: new Response(null, { status: 403 })
		});
		const f = fixture();
		expect((await f.run()).status).toBe(403);
		expect(mocks.access).toHaveBeenCalledWith(
			expect.objectContaining({ requiredAccess: 'admin' })
		);
		expect(f.committed).toBeNull();
	});

	it('rejects malformed preconditions, snapshots, and archive-state transitions', async () => {
		expect((await fixture().run({ expected_updated_at: 'bad date' })).status).toBe(400);
		expect((await fixture().run({ expected_version: '5' })).status).toBe(400);
		expect((await fixture().run({}, '1oops')).status).toBe(400);
		expect((await fixture({ snapshot: {} }).run()).status).toBe(400);
		expect(
			(await fixture({ snapshot: { ...snapshot, state_key: 'archived' } }).run()).status
		).toBe(400);
	});
});
