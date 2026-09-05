// apps/web/src/routes/api/onto/documents/create/server.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const addDocumentToTreeMock = vi.fn();
const autoOrganizeConnectionsMock = vi.fn();
const assertEntityRefsInProjectMock = vi.fn();
const createOrMergeDocumentVersionMock = vi.fn();
const getChangeSourceFromRequestMock = vi.fn(() => 'ui');

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
	getChangeSourceFromRequest: getChangeSourceFromRequestMock,
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
			contextDocuments?: any[];
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

	order() {
		return this;
	}

	limit() {
		return Promise.resolve({ data: this.fixtures.contextDocuments ?? [], error: null });
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

function createSupabaseMock(contextDocuments: any[] = []) {
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
		from: (table: string) =>
			new QueryBuilderMock(table, {
				project: { id: 'project-1' },
				contextDocuments
			})
	};
}

describe('POST /api/onto/documents/create', () => {
	beforeEach(() => {
		addDocumentToTreeMock.mockReset();
		autoOrganizeConnectionsMock.mockReset();
		assertEntityRefsInProjectMock.mockReset();
		createOrMergeDocumentVersionMock.mockResolvedValue({ status: 'skipped' });
		addDocumentToTreeMock.mockResolvedValue({ version: 1, root: [] });
		getChangeSourceFromRequestMock.mockReturnValue('ui');
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
			expect.objectContaining({ parentId: 'parent-123', position: 2 }),
			'actor-1'
		);
	});

	it('persists the requested type_key when it matches the document taxonomy', async () => {
		const { POST } = await import('./+server');

		const request = new Request('http://localhost/api/onto/documents/create', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				project_id: 'project-1',
				title: 'Magic System Research Notes',
				type_key: 'document.knowledge.research'
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
		const payload = (await response.json()) as Record<string, any>;
		expect(payload?.data?.document?.type_key).toBe('document.knowledge.research');
	});

	it('falls back to document.default when no type_key is supplied', async () => {
		const { POST } = await import('./+server');

		const request = new Request('http://localhost/api/onto/documents/create', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				project_id: 'project-1',
				title: 'Untyped Doc'
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
		const payload = (await response.json()) as Record<string, any>;
		expect(payload?.data?.document?.type_key).toBe('document.default');
	});

	it('falls back to document.default when type_key is malformed, without rejecting the write', async () => {
		const { POST } = await import('./+server');

		const request = new Request('http://localhost/api/onto/documents/create', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				project_id: 'project-1',
				title: 'Malformed Type Doc',
				type_key: 'Task.default'
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
		const payload = (await response.json()) as Record<string, any>;
		expect(payload?.data?.document?.type_key).toBe('document.default');
	});

	// Start Here substitution guard (incident 2026-09-03): the chat created a
	// "contractor note" typed document.context.project and the project page's
	// Start Here silently became that note.
	describe('document.context.project reserved-type guard', () => {
		const startHereDocument = {
			id: 'doc-start-here',
			title: 'START HERE - Cedar House',
			content: '# START HERE - Cedar House',
			props: { origin: 'start_here_template' },
			created_at: '2026-08-01T00:00:00.000Z',
			updated_at: '2026-08-02T00:00:00.000Z'
		};

		function contextDocumentRequest(title = 'Contractor note') {
			return new Request('http://localhost/api/onto/documents/create', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					project_id: 'project-1',
					title,
					type_key: 'document.context.project'
				})
			});
		}

		it('refuses a chat-authored context document and names the existing Start Here', async () => {
			getChangeSourceFromRequestMock.mockReturnValue('chat');
			const { POST } = await import('./+server');

			const response = await POST({
				request: contextDocumentRequest(),
				locals: {
					supabase: createSupabaseMock([startHereDocument]) as any,
					safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
				}
			} as any);

			expect(response.status).toBe(400);
			const payload = (await response.json()) as Record<string, any>;
			expect(payload?.errors?.[0] ?? payload?.error ?? payload?.message).toContain(
				'doc-start-here'
			);
			expect(JSON.stringify(payload)).toContain('START HERE - Cedar House');
		});

		it('prefers the explicitly marked Start Here over a newer context-typed note', async () => {
			getChangeSourceFromRequestMock.mockReturnValue('agent_call');
			const { POST } = await import('./+server');

			const response = await POST({
				request: contextDocumentRequest(),
				locals: {
					supabase: createSupabaseMock([
						{
							id: 'doc-imposter',
							title: 'Contractor note',
							content: 'Called the contractor.',
							props: {},
							created_at: '2026-09-02T00:00:00.000Z',
							updated_at: '2026-09-02T00:00:00.000Z'
						},
						startHereDocument
					]) as any,
					safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
				}
			} as any);

			expect(response.status).toBe(400);
			expect(JSON.stringify(await response.json())).toContain('doc-start-here');
		});

		it('still refuses when the project has no Start Here document yet', async () => {
			getChangeSourceFromRequestMock.mockReturnValue('chat');
			const { POST } = await import('./+server');

			const response = await POST({
				request: contextDocumentRequest(),
				locals: {
					supabase: createSupabaseMock([]) as any,
					safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
				}
			} as any);

			expect(response.status).toBe(400);
			expect(JSON.stringify(await response.json())).toContain('document.default');
		});

		it('leaves non-agent callers (create modal, forms) able to create the context document', async () => {
			getChangeSourceFromRequestMock.mockReturnValue('api');
			const { POST } = await import('./+server');

			const response = await POST({
				request: contextDocumentRequest('Project context'),
				locals: {
					supabase: createSupabaseMock([startHereDocument]) as any,
					safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
				}
			} as any);

			expect(response.status).toBe(200);
			const payload = (await response.json()) as Record<string, any>;
			expect(payload?.data?.document?.type_key).toBe('document.context.project');
		});
	});
});
