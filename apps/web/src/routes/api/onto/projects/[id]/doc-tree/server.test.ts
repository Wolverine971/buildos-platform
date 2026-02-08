// apps/web/src/routes/api/onto/projects/[id]/doc-tree/server.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

const getDocTreeMock = vi.fn();

vi.mock('$lib/services/ontology/doc-structure.service', () => ({
	getDocTree: getDocTreeMock,
	updateDocStructure: vi.fn(),
	collectDocIds: vi.fn(() => new Set())
}));

vi.mock('../../../shared/error-logging', () => ({
	logOntologyApiError: vi.fn()
}));

class ProjectQueryMock {
	select() {
		return this;
	}
	eq() {
		return this;
	}
	is() {
		return this;
	}
	single() {
		return Promise.resolve({ data: { id: 'project-1' }, error: null });
	}
}

function createSupabaseMock() {
	return {
		rpc: vi.fn(async (fn: string) => {
			if (fn === 'ensure_actor_for_user') {
				return { data: 'actor-1', error: null };
			}
			if (fn === 'current_actor_has_project_access') {
				return { data: true, error: null };
			}
			return { data: null, error: null };
		}),
		from: vi.fn((table: string) => {
			if (table === 'onto_projects') {
				return new ProjectQueryMock();
			}
			return {};
		})
	};
}

describe('GET /api/onto/projects/[id]/doc-tree', () => {
	beforeEach(() => {
		getDocTreeMock.mockReset();
		getDocTreeMock.mockResolvedValue({
			structure: { version: 1, root: [] },
			documents: {},
			unlinked: []
		});
	});

	it('defaults include_content to true when param missing', async () => {
		const { GET } = await import('./+server');
		const supabase = createSupabaseMock();

		const requestEvent = {
			params: { id: 'project-1' },
			url: new URL('http://localhost/api/onto/projects/project-1/doc-tree'),
			locals: {
				supabase,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			}
		} as unknown as RequestEvent;

		await GET(requestEvent);

		expect(getDocTreeMock).toHaveBeenCalledWith(supabase, 'project-1', {
			includeContent: true,
			includeDocuments: true
		});
	});

	it('passes include_content=false when param set', async () => {
		const { GET } = await import('./+server');
		const supabase = createSupabaseMock();

		const requestEvent = {
			params: { id: 'project-1' },
			url: new URL('http://localhost/api/onto/projects/project-1/doc-tree?include_content=0'),
			locals: {
				supabase,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			}
		} as unknown as RequestEvent;

		await GET(requestEvent);

		expect(getDocTreeMock).toHaveBeenCalledWith(supabase, 'project-1', {
			includeContent: false,
			includeDocuments: true
		});
	});
});

describe('PATCH /api/onto/projects/[id]/doc-tree', () => {
	it('rejects invalid node shape before querying', async () => {
		const { PATCH } = await import('./+server');

		const request = new Request('http://localhost/api/onto/projects/project-1/doc-tree', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				structure: {
					version: 1,
					root: [{ id: 'doc-1', order: -1 }]
				}
			})
		});

		const response = await PATCH({
			params: { id: 'project-1' },
			request,
			locals: {
				supabase: createSupabaseMock() as any,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			}
		} as unknown as RequestEvent);

		expect(response.status).toBe(400);
		const payload = await response.json();
		expect(payload.success).toBe(false);
	});
});
