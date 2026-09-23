// apps/web/src/routes/api/onto/projects/[id]/doc-tree/images/server.test.ts
import { describe, it, expect, vi } from 'vitest';
import type { RequestEvent } from './$types';

vi.mock('../../../../shared/error-logging', () => ({
	logOntologyApiError: vi.fn()
}));

vi.mock('$lib/services/ontology/ontology-projects.service', () => ({
	ensureActorId: vi.fn().mockResolvedValue('actor-1')
}));

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';

type QueryResult = { data: unknown; error: unknown };

/** Chainable query stub that records filters and resolves to a fixed result. */
function queryStub(result: QueryResult, filters: Array<[string, unknown]>) {
	const query: Record<string, unknown> = {
		select: () => query,
		eq: (column: string, value: unknown) => {
			filters.push([column, value]);
			return query;
		},
		is: (column: string, value: unknown) => {
			filters.push([column, value]);
			return query;
		},
		order: () => query,
		limit: () => query,
		single: () => Promise.resolve({ data: { id: PROJECT_ID }, error: null }),
		maybeSingle: () => Promise.resolve({ data: { id: PROJECT_ID }, error: null }),
		then: (resolve: (value: QueryResult) => unknown) => Promise.resolve(result).then(resolve)
	};
	return query;
}

function createSupabaseMock(options: {
	hasMemberAccess?: boolean;
	images?: QueryResult;
	links?: QueryResult;
}) {
	const assetFilters: Array<[string, unknown]> = [];
	const linkFilters: Array<[string, unknown]> = [];
	const supabase = {
		rpc: vi.fn(async (fn: string) => {
			if (fn === 'current_actor_has_project_member_access') {
				return { data: options.hasMemberAccess ?? true, error: null };
			}
			return { data: null, error: null };
		}),
		from: vi.fn((table: string) => {
			if (table === 'onto_assets') {
				return queryStub(options.images ?? { data: [], error: null }, assetFilters);
			}
			if (table === 'onto_asset_links') {
				return queryStub(options.links ?? { data: [], error: null }, linkFilters);
			}
			return queryStub({ data: null, error: null }, []);
		})
	};
	return { supabase, assetFilters, linkFilters };
}

function event(supabase: unknown, user: { id: string } | null = { id: 'user-1' }) {
	return {
		params: { id: PROJECT_ID },
		url: new URL(`http://localhost/api/onto/projects/${PROJECT_ID}/doc-tree/images`),
		locals: {
			supabase,
			safeGetSession: vi.fn().mockResolvedValue({ user })
		}
	} as unknown as RequestEvent;
}

describe('GET /api/onto/projects/[id]/doc-tree/images', () => {
	it('returns live project images and one link per image/document pair', async () => {
		const { GET } = await import('./+server');
		const { supabase, assetFilters, linkFilters } = createSupabaseMock({
			images: {
				data: [
					{ id: 'logo', caption: 'Redline logo', created_at: '2026-09-22T00:00:00Z' },
					{ id: 'shot', caption: null, created_at: '2026-09-21T00:00:00Z' }
				],
				error: null
			},
			links: {
				data: [
					{ asset_id: 'logo', entity_id: 'doc-1' },
					// Same pair under a second role (e.g. inline) collapses to one row.
					{ asset_id: 'logo', entity_id: 'doc-1' },
					// Link to an image that is deleted/not returned is dropped.
					{ asset_id: 'deleted-image', entity_id: 'doc-1' }
				],
				error: null
			}
		});

		const response = await GET(event(supabase));
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.data.images.map((image: { id: string }) => image.id)).toEqual([
			'logo',
			'shot'
		]);
		expect(payload.data.links).toEqual([{ asset_id: 'logo', document_id: 'doc-1' }]);
		expect(assetFilters).toEqual(
			expect.arrayContaining([
				['project_id', PROJECT_ID],
				['kind', 'image'],
				['deleted_at', null]
			])
		);
		expect(linkFilters).toEqual(
			expect.arrayContaining([
				['project_id', PROJECT_ID],
				['entity_kind', 'document']
			])
		);
	});

	it('rejects anonymous readers before querying images', async () => {
		const { GET } = await import('./+server');
		const { supabase } = createSupabaseMock({});

		const response = await GET(event(supabase, null));

		expect(response.status).toBe(401);
		expect(supabase.from).not.toHaveBeenCalledWith('onto_assets');
	});

	it('rejects non-members', async () => {
		const { GET } = await import('./+server');
		const { supabase } = createSupabaseMock({ hasMemberAccess: false });

		const response = await GET(event(supabase));

		expect(response.status).toBeGreaterThanOrEqual(403);
		expect(supabase.from).not.toHaveBeenCalledWith('onto_assets');
	});
});
