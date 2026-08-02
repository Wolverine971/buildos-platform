// apps/web/src/routes/api/onto/documents/[id]/document-patch-concurrency.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const logOntologyApiErrorMock = vi.fn();

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
	logOntologyApiError: logOntologyApiErrorMock
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

vi.mock('$lib/server/project-loop-burst.service', () => ({
	readProjectLoopReviewContext: vi.fn(() => null),
	queueProjectLoopBurstAsync: vi.fn(),
	shouldSkipProjectLoopBurst: vi.fn(() => true)
}));

const LOADED_UPDATED_AT = '2026-08-02T15:00:00.000Z';
const RACING_UPDATED_AT = '2026-08-02T15:00:01.000Z';

type EqFilter = { column: string; value: unknown };

type Fixtures = {
	loadedUpdatedAt: string;
	databaseUpdatedAt: string;
	updateBuilders: QueryBuilderMock[];
};

class QueryBuilderMock {
	private action: 'select' | 'update' | null = null;
	private updatePayload: Record<string, unknown> = {};
	readonly eqFilters: EqFilter[] = [];

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
		this.updatePayload = payload;
		this.fixtures.updateBuilders.push(this);
		return this;
	}

	eq(column: string, value: unknown) {
		this.eqFilters.push({ column, value });
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

	private resolve(): { data: Record<string, unknown> | null; error: null } {
		if (this.table === 'onto_projects') {
			return {
				data: { id: 'project-1', name: 'Project One', created_by: 'actor-owner' },
				error: null
			};
		}

		if (this.table !== 'onto_documents') {
			return { data: null, error: null };
		}

		const document = {
			id: 'doc-1',
			project_id: 'project-1',
			title: 'Document title',
			type_key: 'document.default',
			state_key: 'draft',
			description: 'Before description',
			content: 'Before content',
			props: {},
			updated_at: this.fixtures.loadedUpdatedAt
		};

		if (this.action !== 'update') {
			return { data: document, error: null };
		}

		const expectedUpdatedAt = this.eqFilters.find(
			(filter) => filter.column === 'updated_at'
		)?.value;

		if (
			typeof expectedUpdatedAt === 'string' &&
			expectedUpdatedAt !== this.fixtures.databaseUpdatedAt
		) {
			return { data: null, error: null };
		}

		return {
			data: {
				...document,
				...this.updatePayload,
				updated_at: this.updatePayload.updated_at ?? this.fixtures.databaseUpdatedAt
			},
			error: null
		};
	}
}

function createSupabaseMock(databaseUpdatedAt: string) {
	const fixtures: Fixtures = {
		loadedUpdatedAt: LOADED_UPDATED_AT,
		databaseUpdatedAt,
		updateBuilders: []
	};

	return {
		fixtures,
		supabase: {
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
		}
	};
}

function buildPatchRequest(expectedUpdatedAt: string) {
	return new Request('http://localhost/api/onto/documents/doc-1', {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			title: 'Updated title',
			expected_updated_at: expectedUpdatedAt
		})
	});
}

function buildLocals(supabase: ReturnType<typeof createSupabaseMock>['supabase']) {
	return {
		supabase: supabase as any,
		safeGetSession: async () => ({
			user: { id: 'user-actor', name: 'DJ', email: 'dj@example.com' }
		})
	};
}

describe('PATCH /api/onto/documents/[id] optimistic concurrency', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns a conflict when the row changes after the access read but before the update', async () => {
		const { fixtures, supabase } = createSupabaseMock(RACING_UPDATED_AT);
		const { PATCH } = await import('./+server');

		const response = await PATCH({
			params: { id: 'doc-1' },
			request: buildPatchRequest(LOADED_UPDATED_AT),
			locals: buildLocals(supabase)
		} as any);

		expect(response.status).toBe(409);
		expect(fixtures.updateBuilders).toHaveLength(1);
		expect(fixtures.updateBuilders[0]?.eqFilters).toContainEqual({
			column: 'updated_at',
			value: LOADED_UPDATED_AT
		});
		expect(logOntologyApiErrorMock).not.toHaveBeenCalled();
	});

	it('updates successfully when the write-time version still matches', async () => {
		const { fixtures, supabase } = createSupabaseMock(LOADED_UPDATED_AT);
		const { PATCH } = await import('./+server');

		const response = await PATCH({
			params: { id: 'doc-1' },
			request: buildPatchRequest(LOADED_UPDATED_AT),
			locals: buildLocals(supabase)
		} as any);

		expect(response.status).toBe(200);
		expect(fixtures.updateBuilders).toHaveLength(1);
		expect(fixtures.updateBuilders[0]?.eqFilters).toContainEqual({
			column: 'updated_at',
			value: LOADED_UPDATED_AT
		});
	});

	it('rejects an already stale version before attempting an update', async () => {
		const { fixtures, supabase } = createSupabaseMock(LOADED_UPDATED_AT);
		const { PATCH } = await import('./+server');

		const response = await PATCH({
			params: { id: 'doc-1' },
			request: buildPatchRequest('2026-08-02T14:59:59.000Z'),
			locals: buildLocals(supabase)
		} as any);

		expect(response.status).toBe(409);
		expect(fixtures.updateBuilders).toHaveLength(0);
	});
});
