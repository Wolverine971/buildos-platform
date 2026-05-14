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

vi.mock('$lib/services/ontology/ontology-projects.service', () => ({
	ensureActorId: vi.fn().mockResolvedValue('actor-1')
}));

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';

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
		return Promise.resolve({ data: { id: PROJECT_ID }, error: null });
	}
	maybeSingle() {
		return Promise.resolve({ data: { id: PROJECT_ID }, error: null });
	}
}

function createSupabaseMock(options: { hasMemberAccess?: boolean } = {}) {
	return {
		rpc: vi.fn(async (fn: string) => {
			if (fn === 'current_actor_has_project_member_access') {
				return { data: options.hasMemberAccess ?? true, error: null };
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
			unlinked: [],
			archived: []
		});
	});

	it('defaults include_content to true when param missing', async () => {
		const { GET } = await import('./+server');
		const supabase = createSupabaseMock();

		const requestEvent = {
			params: { id: PROJECT_ID },
			url: new URL(`http://localhost/api/onto/projects/${PROJECT_ID}/doc-tree`),
			locals: {
				supabase,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			}
		} as unknown as RequestEvent;

		await GET(requestEvent);

		expect(getDocTreeMock).toHaveBeenCalledWith(supabase, PROJECT_ID, {
			includeContent: true,
			includeDocuments: true
		});
	});

	it('passes include_content=false when param set', async () => {
		const { GET } = await import('./+server');
		const supabase = createSupabaseMock();

		const requestEvent = {
			params: { id: PROJECT_ID },
			url: new URL(
				`http://localhost/api/onto/projects/${PROJECT_ID}/doc-tree?include_content=0`
			),
			locals: {
				supabase,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			}
		} as unknown as RequestEvent;

		await GET(requestEvent);

		expect(getDocTreeMock).toHaveBeenCalledWith(supabase, PROJECT_ID, {
			includeContent: false,
			includeDocuments: true
		});
	});

	it('rejects anonymous public reads before loading documents', async () => {
		const { GET } = await import('./+server');
		const supabase = createSupabaseMock();

		const response = await GET({
			params: { id: PROJECT_ID },
			url: new URL(`http://localhost/api/onto/projects/${PROJECT_ID}/doc-tree`),
			locals: {
				supabase,
				safeGetSession: vi.fn().mockResolvedValue({ user: null })
			}
		} as unknown as RequestEvent);

		expect(response.status).toBe(401);
		expect(getDocTreeMock).not.toHaveBeenCalled();
	});

	it('rejects authenticated public-only readers before loading documents', async () => {
		const { GET } = await import('./+server');
		const supabase = createSupabaseMock({ hasMemberAccess: false });

		const response = await GET({
			params: { id: PROJECT_ID },
			url: new URL(`http://localhost/api/onto/projects/${PROJECT_ID}/doc-tree`),
			locals: {
				supabase,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			}
		} as unknown as RequestEvent);

		expect(response.status).toBe(403);
		expect(supabase.rpc).toHaveBeenCalledWith('current_actor_has_project_member_access', {
			p_project_id: PROJECT_ID,
			p_required_access: 'read'
		});
		expect(getDocTreeMock).not.toHaveBeenCalled();
	});
});

describe('PATCH /api/onto/projects/[id]/doc-tree', () => {
	it('rejects invalid node shape before querying', async () => {
		const { PATCH } = await import('./+server');

		const request = new Request(`http://localhost/api/onto/projects/${PROJECT_ID}/doc-tree`, {
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
			params: { id: PROJECT_ID },
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
