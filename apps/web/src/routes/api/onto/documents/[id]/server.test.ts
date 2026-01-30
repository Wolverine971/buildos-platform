// apps/web/src/routes/api/onto/documents/[id]/server.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const removeDocumentFromTreeMock = vi.fn();

vi.mock('$lib/services/ontology/doc-structure.service', () => ({
	removeDocumentFromTree: removeDocumentFromTreeMock
}));

vi.mock('$lib/services/async-activity-logger', () => ({
	logUpdateAsync: vi.fn(),
	logDeleteAsync: vi.fn(),
	getChangeSourceFromRequest: vi.fn(() => 'ui'),
	getChatSessionIdFromRequest: vi.fn(() => null)
}));

vi.mock('$lib/services/ontology/auto-organizer.service', () => ({
	AutoOrganizeError: class AutoOrganizeError extends Error {
		status = 400;
	},
	autoOrganizeConnections: vi.fn(),
	assertEntityRefsInProject: vi.fn(),
	toParentRefs: vi.fn(() => [])
}));

vi.mock('$lib/services/ontology/versioning.service', () => ({
	createOrMergeDocumentVersion: vi.fn(),
	toDocumentSnapshot: vi.fn(() => ({}))
}));

vi.mock('../../shared/error-logging', () => ({
	logOntologyApiError: vi.fn()
}));

class QueryBuilderMock {
	private action: 'select' | 'update' | null = null;

	constructor(private readonly table: string) {}

	select() {
		this.action = 'select';
		return this;
	}

	update() {
		this.action = 'update';
		return this;
	}

	eq() {
		return this;
	}

	is() {
		return this;
	}

	maybeSingle() {
		if (this.table === 'onto_documents' && this.action === 'select') {
			return Promise.resolve({
				data: {
					id: 'doc-1',
					project_id: 'project-1',
					title: 'Doc',
					type_key: 'document.default',
					state_key: 'draft'
				},
				error: null
			});
		}
		if (this.table === 'onto_projects' && this.action === 'select') {
			return Promise.resolve({ data: { id: 'project-1' }, error: null });
		}
		return Promise.resolve({ data: null, error: null });
	}

	then<TResult1 = any, TResult2 = never>(
		onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
		onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
	) {
		if (this.table === 'onto_documents' && this.action === 'update') {
			return Promise.resolve({ data: null, error: null }).then(onfulfilled, onrejected);
		}
		return Promise.resolve({ data: null, error: null }).then(onfulfilled, onrejected);
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
		from: (table: string) => new QueryBuilderMock(table)
	};
}

describe('DELETE /api/onto/documents/[id]', () => {
	beforeEach(() => {
		removeDocumentFromTreeMock.mockReset();
		removeDocumentFromTreeMock.mockResolvedValue({ version: 1, root: [] });
	});

	it('passes promote mode from request body', async () => {
		const { DELETE } = await import('./+server');

		const request = new Request('http://localhost/api/onto/documents/doc-1', {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ mode: 'promote' })
		});

		const response = await DELETE({
			params: { id: 'doc-1' },
			request,
			url: new URL('http://localhost/api/onto/documents/doc-1'),
			locals: {
				supabase: createSupabaseMock() as any,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			}
		} as any);

		expect(response.status).toBe(200);
		expect(removeDocumentFromTreeMock).toHaveBeenCalledWith(
			expect.anything(),
			'project-1',
			'doc-1',
			{ mode: 'promote' },
			'actor-1'
		);
	});
});
