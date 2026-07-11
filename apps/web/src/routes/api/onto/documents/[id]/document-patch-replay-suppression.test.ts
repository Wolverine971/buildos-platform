// apps/web/src/routes/api/onto/documents/[id]/document-patch-replay-suppression.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const queueProjectLoopBurstAsyncMock = vi.hoisted(() => vi.fn());

vi.mock('$lib/services/ontology/doc-structure.service', () => ({
	getDocTree: vi.fn(async () => ({ structure: { root: [] } })),
	findNodeById: vi.fn(() => null),
	collectDocIds: vi.fn(() => new Set()),
	removeDocumentFromTree: vi.fn(async () => null),
	updateDocNodeMetadata: vi.fn(async () => null)
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
	createOrMergeDocumentVersion: vi.fn(async () => ({ status: 'skipped' as const })),
	toDocumentSnapshot: vi.fn(() => ({}))
}));

vi.mock('$lib/server/entity-mention-notification.service', () => ({
	resolveEntityMentionUserIds: vi.fn(async () => []),
	notifyEntityMentionsAdded: vi.fn(async () => ({ notifiedUserIds: [] }))
}));

vi.mock('../../shared/error-logging', () => ({
	logOntologyApiError: vi.fn()
}));

vi.mock('$lib/server/public-page.service', () => ({
	syncLivePublicPageForDocument: vi.fn(async () => ({
		isLivePublic: false,
		synced: false,
		blocked: false,
		page: null,
		error: null,
		review: null
	}))
}));

vi.mock('$lib/server/project-loop-burst.service', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/project-loop-burst.service')>(
		'$lib/server/project-loop-burst.service'
	);
	return {
		...actual,
		queueProjectLoopBurstAsync: queueProjectLoopBurstAsyncMock
	};
});

type Fixtures = {
	documentState: Record<string, unknown>;
	project: Record<string, unknown>;
};

class QueryBuilderMock {
	private action: 'select' | 'update' | null = null;

	constructor(
		private readonly table: string,
		private readonly fixtures: Fixtures
	) {}

	select() {
		if (!this.action) this.action = 'select';
		return this;
	}

	update(payload: Record<string, unknown>) {
		this.action = 'update';
		if (this.table === 'onto_documents') {
			Object.assign(this.fixtures.documentState, payload);
		}
		return this;
	}

	eq() {
		return this;
	}

	in() {
		return this;
	}

	is() {
		return this;
	}

	async maybeSingle() {
		return this.resolve();
	}

	async single() {
		return this.resolve();
	}

	private resolve(): { data: unknown; error: unknown } {
		if (this.table === 'onto_documents') {
			return { data: { ...this.fixtures.documentState }, error: null };
		}
		if (this.table === 'onto_projects') {
			return { data: this.fixtures.project, error: null };
		}
		return { data: null, error: null };
	}
}

function createSupabaseMock(documentOverrides: Record<string, unknown> = {}) {
	const fixtures: Fixtures = {
		documentState: {
			id: 'doc-1',
			project_id: 'project-1',
			title: 'Document title',
			type_key: 'document.default',
			state_key: 'draft',
			description: 'Before description',
			content: 'Before content',
			props: {},
			...documentOverrides
		},
		project: {
			id: 'project-1',
			name: 'Project One',
			created_by: 'actor-owner'
		}
	};

	return {
		rpc: vi.fn(async (fn: string) => {
			if (fn === 'ensure_actor_for_user') {
				return { data: 'actor-current', error: null };
			}
			if (fn === 'current_actor_has_project_member_access') {
				return { data: true, error: null };
			}
			return { data: null, error: null };
		}),
		from: (table: string) => new QueryBuilderMock(table, fixtures)
	};
}

function buildLocals(supabase: ReturnType<typeof createSupabaseMock>) {
	return {
		supabase: supabase as any,
		safeGetSession: async () => ({
			user: { id: 'user-actor', name: 'DJ', email: 'dj@example.com' }
		})
	};
}

const SUPPRESS_REVIEW_CONTEXT = {
	origin: 'project_suggestion_replay',
	operation_kind: 'suggestion_apply',
	review_policy: 'suppress',
	operation_id: 'project_suggestion:suggestion-1',
	entity_count: 1
};

describe('PATCH /api/onto/documents/[id] project-loop burst replay suppression', () => {
	beforeEach(() => {
		queueProjectLoopBurstAsyncMock.mockReset();
	});

	it('suppresses the update burst when project_review_context requests replay suppression', async () => {
		const supabase = createSupabaseMock();
		const { PATCH } = await import('./+server');

		const response = await PATCH({
			params: { id: 'doc-1' },
			request: new Request('http://localhost/api/onto/documents/doc-1', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: 'Updated title',
					project_review_context: SUPPRESS_REVIEW_CONTEXT
				})
			}),
			locals: buildLocals(supabase)
		} as any);

		expect(response.status).toBe(200);
		expect(queueProjectLoopBurstAsyncMock).not.toHaveBeenCalled();
	});

	it('does not suppress ordinary updates without a review context (negative control)', async () => {
		const supabase = createSupabaseMock();
		const { PATCH } = await import('./+server');

		const response = await PATCH({
			params: { id: 'doc-1' },
			request: new Request('http://localhost/api/onto/documents/doc-1', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ title: 'Updated title' })
			}),
			locals: buildLocals(supabase)
		} as any);

		expect(response.status).toBe(200);
		expect(queueProjectLoopBurstAsyncMock).toHaveBeenCalledWith(
			expect.objectContaining({
				projectId: 'project-1',
				source: 'document_update',
				entityType: 'document',
				entityId: 'doc-1',
				action: 'updated'
			})
		);
	});

	it('suppresses the archive burst when project_review_context requests replay suppression', async () => {
		const supabase = createSupabaseMock();
		const { PATCH } = await import('./+server');

		const response = await PATCH({
			params: { id: 'doc-1' },
			request: new Request('http://localhost/api/onto/documents/doc-1', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'archive',
					project_review_context: SUPPRESS_REVIEW_CONTEXT
				})
			}),
			locals: buildLocals(supabase)
		} as any);

		expect(response.status).toBe(200);
		expect(queueProjectLoopBurstAsyncMock).not.toHaveBeenCalled();
	});

	it('suppresses the restore burst when project_review_context requests replay suppression', async () => {
		const supabase = createSupabaseMock({ state_key: 'archived' });
		const { PATCH } = await import('./+server');

		const response = await PATCH({
			params: { id: 'doc-1' },
			request: new Request('http://localhost/api/onto/documents/doc-1', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'restore',
					project_review_context: SUPPRESS_REVIEW_CONTEXT
				})
			}),
			locals: buildLocals(supabase)
		} as any);

		expect(response.status).toBe(200);
		expect(queueProjectLoopBurstAsyncMock).not.toHaveBeenCalled();
	});
});
