// apps/web/src/routes/api/onto/projects/[id]/card/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { loadOrganizeSnapshotMock } = vi.hoisted(() => ({ loadOrganizeSnapshotMock: vi.fn() }));

vi.mock('$lib/server/organize/organize-snapshot', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/server/organize/organize-snapshot')>();
	return { ...actual, loadOrganizeSnapshot: loadOrganizeSnapshotMock };
});

import { OrganizeSnapshotError } from '$lib/server/organize/organize-snapshot';
import { GET } from './+server';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';

function goalsQuery(result: { data: unknown; error: unknown }) {
	const calls: Record<string, unknown[]> = {};
	const query: Record<string, unknown> = {};
	for (const name of ['select', 'eq', 'is', 'order']) {
		query[name] = vi.fn((...args: unknown[]) => {
			calls[name] = [...(calls[name] ?? []), args];
			return query;
		});
	}
	query.limit = vi.fn(async () => result);
	return { query, calls };
}

function request(supabase: unknown, id = PROJECT_ID, user: unknown = { id: 'user-1' }) {
	return GET({
		params: { id },
		locals: { supabase, safeGetSession: vi.fn().mockResolvedValue({ user }) }
	} as any) as Promise<Response>;
}

describe('GET /api/onto/projects/[id]/card', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		loadOrganizeSnapshotMock.mockResolvedValue({
			project: { id: PROJECT_ID, name: 'Wayne Strategies', documents: [], tasks: [] },
			related_projects: [{ id: 'child', name: 'Redline' }]
		});
	});

	it('returns the snapshot project and live goals in one response', async () => {
		const goals = goalsQuery({
			data: [
				{ id: 'g1', name: 'Book three clients', state_key: 'active', target_date: null }
			],
			error: null
		});
		const supabase = { from: vi.fn(() => goals.query) };

		const response = await request(supabase);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.data).toEqual({
			project: { id: PROJECT_ID, name: 'Wayne Strategies', documents: [], tasks: [] },
			goals: [
				{ id: 'g1', name: 'Book three clients', state_key: 'active', target_date: null }
			]
		});
		expect(loadOrganizeSnapshotMock).toHaveBeenCalledWith(supabase, PROJECT_ID);
		expect(supabase.from).toHaveBeenCalledWith('onto_goals');
		expect(goals.calls.is).toEqual([
			['deleted_at', null],
			['archived_at', null]
		]);
	});

	it('passes the snapshot access errors through', async () => {
		loadOrganizeSnapshotMock.mockRejectedValue(
			new OrganizeSnapshotError('You do not have access to this project.', 403)
		);
		const supabase = { from: vi.fn(() => goalsQuery({ data: [], error: null }).query) };

		const response = await request(supabase);

		expect(response.status).toBe(403);
		expect((await response.json()).error).toBe('You do not have access to this project.');
	});

	it('rejects a bad id and an anonymous caller before any read', async () => {
		const supabase = { from: vi.fn() };
		expect((await request(supabase, 'not-a-uuid')).status).toBe(400);
		expect((await request(supabase, PROJECT_ID, null)).status).toBe(401);
		expect(loadOrganizeSnapshotMock).not.toHaveBeenCalled();
		expect(supabase.from).not.toHaveBeenCalled();
	});
});
