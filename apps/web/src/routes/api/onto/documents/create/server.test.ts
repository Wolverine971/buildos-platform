// apps/web/src/routes/api/onto/documents/create/server.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const addDocumentToTreeMock = vi.fn();
const autoOrganizeConnectionsMock = vi.fn();
const assertEntityRefsInProjectMock = vi.fn();
const createOrMergeDocumentVersionMock = vi.fn();

vi.mock('$lib/services/ontology/doc-structure.service', () => ({
	addDocumentToTree: addDocumentToTreeMock
}));

vi.mock('$lib/services/ontology/auto-organizer.service', () => ({
	AutoOrganizeError: class AutoOrganizeError extends Error {
		status = 400;
	},
	autoOrganizeConnections: autoOrganizeConnectionsMock,
	assertEntityRefsInProject: assertEntityRefsInProjectMock,
	toParentRefs: vi.fn(() => [])
}));

vi.mock('$lib/services/ontology/versioning.service', () => ({
	createOrMergeDocumentVersion: createOrMergeDocumentVersionMock,
	toDocumentSnapshot: vi.fn(() => ({}))
}));

vi.mock('$lib/services/async-activity-logger', () => ({
	logCreateAsync: vi.fn(),
	getChangeSourceFromRequest: vi.fn(() => 'ui'),
	getChatSessionIdFromRequest: vi.fn(() => null)
}));

vi.mock('$lib/server/ontology-classification.service', () => ({
	classifyOntologyEntity: vi.fn()
}));

vi.mock('../../shared/error-logging', () => ({
	logOntologyApiError: vi.fn()
}));

class QueryBuilderMock {
	private action: 'select' | 'insert' | null = null;
	private insertPayload: any = null;

	constructor(
		private readonly table: string,
		private readonly fixtures: {
			project?: any;
		}
	) {}

	select() {
		if (!this.action) {
			this.action = 'select';
		}
		return this;
	}

	insert(payload: any) {
		this.action = 'insert';
		this.insertPayload = payload;
		return this;
	}

	eq() {
		return this;
	}

	is() {
		return this;
	}

	maybeSingle() {
		if (this.table === 'onto_projects' && this.action === 'select') {
			return Promise.resolve({ data: this.fixtures.project ?? null, error: null });
		}
		return Promise.resolve({ data: null, error: null });
	}

	single() {
		if (this.table === 'onto_documents' && this.action === 'insert') {
			return Promise.resolve({
				data: {
					id: 'doc-1',
					project_id: this.insertPayload.project_id,
					title: this.insertPayload.title,
					type_key: this.insertPayload.type_key,
					state_key: this.insertPayload.state_key,
					content: this.insertPayload.content ?? null,
					description: this.insertPayload.description ?? null,
					props: this.insertPayload.props ?? null,
					created_by: this.insertPayload.created_by,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				},
				error: null
			});
		}
		return Promise.resolve({ data: null, error: null });
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
		from: (table: string) =>
			new QueryBuilderMock(table, { project: { id: 'project-1' } })
	};
}

describe('POST /api/onto/documents/create', () => {
	beforeEach(() => {
		addDocumentToTreeMock.mockReset();
		autoOrganizeConnectionsMock.mockReset();
		assertEntityRefsInProjectMock.mockReset();
		createOrMergeDocumentVersionMock.mockResolvedValue({ status: 'skipped' });
		addDocumentToTreeMock.mockResolvedValue({ version: 1, root: [] });
	});

	it('adds new documents to the tree with parent/position', async () => {
		const { POST } = await import('./+server');

		const request = new Request('http://localhost/api/onto/documents/create', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				project_id: 'project-1',
				title: 'Tree Doc',
				parent_id: 'parent-123',
				position: 2
			})
		});

		const response = await POST({
			request,
			locals: {
				supabase: createSupabaseMock() as any,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			}
		} as any);

		expect(response.status).toBe(200);
		expect(addDocumentToTreeMock).toHaveBeenCalledWith(
			expect.anything(),
			'project-1',
			'doc-1',
			{ parentId: 'parent-123', position: 2 },
			'actor-1'
		);
	});
});
