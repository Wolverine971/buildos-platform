// apps/web/src/routes/api/onto/documents/[id]/server.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const removeDocumentFromTreeMock = vi.fn();
const archiveDocumentInTreeMock = vi.fn();
const restoreDocumentInTreeMock = vi.fn();
const deleteDocumentInTreeMock = vi.fn();
const getDocTreeMock = vi.fn();
const findNodeByIdMock = vi.fn();
const collectDocIdsMock = vi.fn();
const updateDocNodeMetadataMock = vi.fn();
const logOntologyApiErrorMock = vi.fn();

vi.mock('$lib/services/ontology/doc-structure.service', () => ({
	archiveDocumentInTree: archiveDocumentInTreeMock,
	restoreDocumentInTree: restoreDocumentInTreeMock,
	deleteDocumentInTree: deleteDocumentInTreeMock,
	getDocTree: getDocTreeMock,
	findNodeById: findNodeByIdMock,
	collectDocIds: collectDocIdsMock,
	removeDocumentFromTree: removeDocumentFromTreeMock,
	updateDocNodeMetadata: updateDocNodeMetadataMock
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

vi.mock('$lib/server/project-loop-burst.service', () => ({
	readProjectLoopReviewContext: vi.fn(() => null),
	shouldSkipProjectLoopBurst: vi.fn(() => true),
	queueProjectLoopBurstAsync: vi.fn()
}));

vi.mock('../../shared/error-logging', () => ({
	logOntologyApiError: logOntologyApiErrorMock
}));

class QueryBuilderMock {
	private action: 'select' | 'update' | null = null;

	constructor(
		private readonly table: string,
		private readonly documentState = 'draft'
	) {}

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
					state_key: this.documentState,
					updated_at: '2026-08-03T12:00:00Z'
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

function createSupabaseMock(documentState = 'draft') {
	return {
		rpc: vi.fn(async (fn: string) => {
			if (fn === 'ensure_actor_for_user') {
				return { data: 'actor-1', error: null };
			}
			if (fn === 'current_actor_has_project_member_access') {
				return { data: true, error: null };
			}
			return { data: null, error: null };
		}),
		from: (table: string) => new QueryBuilderMock(table, documentState)
	};
}

describe('PATCH /api/onto/documents/[id]', () => {
	beforeEach(() => {
		archiveDocumentInTreeMock.mockReset();
		archiveDocumentInTreeMock.mockResolvedValue({
			document: {
				id: 'doc-1',
				project_id: 'project-1',
				title: 'Doc',
				type_key: 'document.default',
				state_key: 'archived',
				updated_at: '2026-08-03T12:00:01Z'
			},
			structure: { version: 2, root: [] },
			archivedDocumentIds: ['doc-1'],
			archiveMode: 'archive_children'
		});
		restoreDocumentInTreeMock.mockReset();
		restoreDocumentInTreeMock.mockResolvedValue({
			document: {
				id: 'doc-1',
				project_id: 'project-1',
				title: 'Doc',
				type_key: 'document.default',
				state_key: 'draft',
				updated_at: '2026-08-03T12:00:01Z'
			},
			structure: { version: 1, root: [] }
		});
	});

	it('delegates archive state and tree changes to the atomic command', async () => {
		const { PATCH } = await import('./+server');
		const supabase = createSupabaseMock();
		const request = new Request('http://localhost/api/onto/documents/doc-1', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ state_key: 'archived' })
		});

		const response = await PATCH({
			params: { id: 'doc-1' },
			request,
			url: new URL('http://localhost/api/onto/documents/doc-1'),
			locals: {
				supabase: supabase as any,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			}
		} as any);

		expect(response.status).toBe(200);
		expect(archiveDocumentInTreeMock).toHaveBeenCalledWith(
			supabase,
			'project-1',
			'doc-1',
			{
				mode: 'archive_children',
				expectedUpdatedAt: '2026-08-03T12:00:00Z'
			},
			'actor-1'
		);
		expect(await response.json()).toMatchObject({
			data: {
				document: { id: 'doc-1', state_key: 'archived' },
				structure: { version: 2, root: [] },
				archived_document_ids: ['doc-1'],
				archive_mode: 'archive_children'
			}
		});
	});

	it('returns the existing conflict contract when the archive loses a row race', async () => {
		archiveDocumentInTreeMock.mockRejectedValueOnce(
			new Error('Document version conflict: the document changed before archive')
		);
		const { PATCH } = await import('./+server');
		const request = new Request('http://localhost/api/onto/documents/doc-1', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ state_key: 'archived' })
		});

		const response = await PATCH({
			params: { id: 'doc-1' },
			request,
			url: new URL('http://localhost/api/onto/documents/doc-1'),
			locals: {
				supabase: createSupabaseMock() as any,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			}
		} as any);

		expect(response.status).toBe(409);
	});

	it('routes the agent-compatible state-only restore through the atomic command', async () => {
		const { PATCH } = await import('./+server');
		const supabase = createSupabaseMock('archived');
		const request = new Request('http://localhost/api/onto/documents/doc-1', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ state_key: 'draft' })
		});

		const response = await PATCH({
			params: { id: 'doc-1' },
			request,
			url: new URL('http://localhost/api/onto/documents/doc-1'),
			locals: {
				supabase: supabase as any,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			}
		} as any);

		expect(response.status).toBe(200);
		expect(restoreDocumentInTreeMock).toHaveBeenCalledWith(
			supabase,
			'project-1',
			'doc-1',
			{
				restoreStateKey: 'draft',
				expectedUpdatedAt: '2026-08-03T12:00:00Z'
			},
			'actor-1'
		);
	});
});

describe('DELETE /api/onto/documents/[id]', () => {
	beforeEach(() => {
		deleteDocumentInTreeMock.mockReset();
		deleteDocumentInTreeMock.mockResolvedValue({
			structure: { version: 2, root: [] },
			permanent: false
		});
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
		expect(deleteDocumentInTreeMock).toHaveBeenCalledWith(
			expect.anything(),
			'project-1',
			'doc-1',
			{
				mode: 'promote',
				permanent: false,
				expectedUpdatedAt: '2026-08-03T12:00:00Z'
			},
			'actor-1'
		);
	});

	it('forces cascade mode for the agent-compatible permanent archived delete', async () => {
		deleteDocumentInTreeMock.mockResolvedValueOnce({
			structure: { version: 1, root: [] },
			permanent: true
		});
		const { DELETE } = await import('./+server');
		const supabase = createSupabaseMock('archived');

		const response = await DELETE({
			params: { id: 'doc-1' },
			request: new Request('http://localhost/api/onto/documents/doc-1', {
				method: 'DELETE'
			}),
			url: new URL('http://localhost/api/onto/documents/doc-1'),
			locals: {
				supabase: supabase as any,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			}
		} as any);

		expect(response.status).toBe(200);
		expect(deleteDocumentInTreeMock).toHaveBeenCalledWith(
			supabase,
			'project-1',
			'doc-1',
			{
				mode: 'cascade',
				permanent: true,
				expectedUpdatedAt: '2026-08-03T12:00:00Z'
			},
			'actor-1'
		);
		expect(await response.json()).toMatchObject({
			data: {
				deleted: true,
				permanent: true,
				structure_error: null
			}
		});
	});

	it('returns conflict when the document changes before the atomic delete', async () => {
		deleteDocumentInTreeMock.mockRejectedValueOnce(
			new Error('Document version conflict: the document changed before delete')
		);
		const { DELETE } = await import('./+server');

		const response = await DELETE({
			params: { id: 'doc-1' },
			request: new Request('http://localhost/api/onto/documents/doc-1', {
				method: 'DELETE'
			}),
			url: new URL('http://localhost/api/onto/documents/doc-1'),
			locals: {
				supabase: createSupabaseMock() as any,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			}
		} as any);

		expect(response.status).toBe(409);
	});
});
