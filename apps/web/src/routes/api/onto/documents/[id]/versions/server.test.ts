// apps/web/src/routes/api/onto/documents/[id]/versions/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	requireProjectEntityAccess: vi.fn(),
	logOntologyApiError: vi.fn()
}));

vi.mock('$lib/server/ontology-api-access', () => ({
	requireProjectEntityAccess: mocks.requireProjectEntityAccess
}));

vi.mock('../../../shared/error-logging', () => ({
	logOntologyApiError: mocks.logOntologyApiError
}));

import { GET } from './+server';

type QueryResult = { data: unknown[]; error: null; count: number };

function createVersionQuery(result: QueryResult = { data: [], error: null, count: 0 }) {
	const query = {
		select: vi.fn(),
		eq: vi.fn(),
		order: vi.fn(),
		lt: vi.fn(),
		gte: vi.fn(),
		lte: vi.fn(),
		limit: vi.fn(),
		then: <TResult1 = QueryResult, TResult2 = never>(
			onFulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
			onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
		) => Promise.resolve(result).then(onFulfilled, onRejected)
	};

	query.select.mockReturnValue(query);
	query.eq.mockReturnValue(query);
	query.order.mockReturnValue(query);
	query.lt.mockReturnValue(query);
	query.gte.mockReturnValue(query);
	query.lte.mockReturnValue(query);
	query.limit.mockReturnValue(query);
	return query;
}

function createEvent(userIdFilter: string, actorId: string | null) {
	const versionQuery = createVersionQuery();
	const actorQuery = {
		select: vi.fn(),
		eq: vi.fn(),
		maybeSingle: vi.fn().mockResolvedValue({
			data: actorId ? { id: actorId } : null,
			error: null
		})
	};
	actorQuery.select.mockReturnValue(actorQuery);
	actorQuery.eq.mockReturnValue(actorQuery);

	const from = vi.fn((table: string) => {
		if (table === 'onto_document_versions') return versionQuery;
		if (table === 'onto_actors') return actorQuery;
		throw new Error(`Unexpected table: ${table}`);
	});
	const rpc = vi.fn();
	const locals = {
		safeGetSession: vi.fn().mockResolvedValue({
			session: { user: { id: 'user-1' } },
			user: { id: 'user-1' }
		}),
		supabase: { from, rpc }
	};

	return {
		event: {
			params: { id: 'document-1' },
			url: new URL(
				`http://localhost/api/onto/documents/document-1/versions?user_id=${userIdFilter}`
			),
			locals
		},
		actorQuery,
		from,
		rpc,
		versionQuery
	};
}

describe('GET /api/onto/documents/[id]/versions actor filter', () => {
	beforeEach(() => {
		mocks.requireProjectEntityAccess.mockReset().mockResolvedValue({
			ok: true,
			actorId: 'actor-1',
			entity: { id: 'document-1', project_id: 'project-1' },
			projectId: 'project-1'
		});
		mocks.logOntologyApiError.mockReset().mockResolvedValue(undefined);
	});

	it('uses a read-only visible actor lookup instead of provisioning the filtered user', async () => {
		const filteredUserId = '25181727-0000-4000-8000-000000000020';
		const { event, actorQuery, rpc, versionQuery } = createEvent(filteredUserId, 'actor-2');

		const response = await GET(event as never);

		expect(response.status).toBe(200);
		expect(actorQuery.eq).toHaveBeenCalledWith('user_id', filteredUserId);
		expect(versionQuery.eq).toHaveBeenCalledWith('created_by', 'actor-2');
		expect(rpc).not.toHaveBeenCalled();
	});

	it('keeps an invalid or invisible user filter restrictive', async () => {
		const { event, from, versionQuery } = createEvent('not-a-uuid', null);

		const response = await GET(event as never);

		expect(response.status).toBe(200);
		expect(from).not.toHaveBeenCalledWith('onto_actors');
		expect(versionQuery.eq).toHaveBeenCalledWith(
			'created_by',
			'00000000-0000-0000-0000-000000000000'
		);
		expect(await response.json()).toMatchObject({
			success: true,
			data: { versions: [], total: 0, hasMore: false, nextCursor: null }
		});
	});

	it('returns no versions when a valid filtered user has no visible project actor', async () => {
		const filteredUserId = '25181727-0000-4000-8000-000000000021';
		const { event, actorQuery, versionQuery } = createEvent(filteredUserId, null);

		const response = await GET(event as never);

		expect(response.status).toBe(200);
		expect(actorQuery.eq).toHaveBeenCalledWith('user_id', filteredUserId);
		expect(versionQuery.eq).toHaveBeenCalledWith(
			'created_by',
			'00000000-0000-0000-0000-000000000000'
		);
	});

	it('logs and returns a database error when the actor filter lookup fails', async () => {
		const actorError = { message: 'actor lookup failed', code: 'XX000' };
		const filteredUserId = '25181727-0000-4000-8000-000000000022';
		const { event, actorQuery, versionQuery } = createEvent(filteredUserId, null);
		actorQuery.maybeSingle.mockResolvedValueOnce({ data: null, error: actorError } as never);

		const response = await GET(event as never);

		expect(response.status).toBe(500);
		expect(versionQuery.eq).not.toHaveBeenCalledWith('created_by', expect.anything());
		expect(mocks.logOntologyApiError).toHaveBeenCalledWith(
			expect.objectContaining({
				error: actorError,
				operation: 'versions_actor_filter',
				tableName: 'onto_actors'
			})
		);
	});
});
