// apps/web/src/routes/api/onto/documents/[id]/document-patch-concurrency.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDocumentEditorRevision } from '$lib/server/document-editor-revision';

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
const EDITOR_REVISION = getDocumentEditorRevision({
	id: 'doc-1',
	project_id: 'project-1',
	title: 'Document title',
	description: 'Before description',
	content: 'Before content',
	state_key: 'draft'
});
const CLASSIFIED_METADATA = {
	type_key: 'document.context.workflow',
	props: { tags: ['testing'], _classification: { confidence: 0.72 }, agent_workspace: 'preserve' }
};

type EqFilter = { column: string; value: unknown };

type Fixtures = {
	loadedUpdatedAt: string;
	databaseUpdatedAt: string;
	updateBuilders: QueryBuilderMock[];
	documentOverrides: Record<string, unknown>;
	refreshedDocument: Record<string, unknown> | null;
	readCount: number;
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
			updated_at: this.fixtures.loadedUpdatedAt,
			...this.fixtures.documentOverrides
		};

		if (this.action !== 'update') {
			this.fixtures.readCount += 1;
			return {
				data:
					this.fixtures.readCount > 1 && this.fixtures.refreshedDocument
						? { ...document, ...this.fixtures.refreshedDocument }
						: document,
				error: null
			};
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
				...(this.fixtures.refreshedDocument ?? {}),
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
		updateBuilders: [],
		documentOverrides: {},
		refreshedDocument: null,
		readCount: 0
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

function buildPatchRequest(expectedUpdatedAt: string, fields: Record<string, unknown> = {}) {
	return new Request('http://localhost/api/onto/documents/doc-1', {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			title: 'Updated title',
			expected_updated_at: expectedUpdatedAt,
			...fields
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

	it('saves after background classification while preserving the newer type and props', async () => {
		const { fixtures, supabase } = createSupabaseMock(RACING_UPDATED_AT);
		fixtures.loadedUpdatedAt = RACING_UPDATED_AT;
		fixtures.documentOverrides = CLASSIFIED_METADATA;
		const { PATCH } = await import('./+server');
		const response = await PATCH({
			params: { id: 'doc-1' },
			locals: buildLocals(supabase),
			request: buildPatchRequest(LOADED_UPDATED_AT, {
				content: 'Autosave checkpoint A',
				expected_editor_revision: EDITOR_REVISION
			})
		} as any);
		expect(response.status).toBe(200);
		const { data } = await response.json();
		expect(data.document).toMatchObject({
			...CLASSIFIED_METADATA,
			content: 'Autosave checkpoint A',
			props: { ...CLASSIFIED_METADATA.props, body_markdown: 'Autosave checkpoint A' }
		});
		expect(data.editor_revision).toBe(getDocumentEditorRevision(data.document));
		expect(data.editor_revision).not.toBe(EDITOR_REVISION);
		expect(fixtures.updateBuilders[0]?.eqFilters).toContainEqual({
			column: 'updated_at',
			value: RACING_UPDATED_AT
		});
	});

	it('rebases once if classification wins the race during a save', async () => {
		const { fixtures, supabase } = createSupabaseMock(RACING_UPDATED_AT);
		fixtures.refreshedDocument = { ...CLASSIFIED_METADATA, updated_at: RACING_UPDATED_AT };
		const { PATCH } = await import('./+server');
		const response = await PATCH({
			params: { id: 'doc-1' },
			locals: buildLocals(supabase),
			request: buildPatchRequest(LOADED_UPDATED_AT, {
				content: 'New body',
				expected_editor_revision: EDITOR_REVISION
			})
		} as any);
		expect(response.status).toBe(200);
		expect(fixtures.updateBuilders).toHaveLength(2);
		expect(fixtures.updateBuilders[1]?.eqFilters).toContainEqual({
			column: 'updated_at',
			value: RACING_UPDATED_AT
		});
		const { data } = await response.json();
		expect(data.document.type_key).toBe(CLASSIFIED_METADATA.type_key);
		expect(data.document.props).toEqual({
			...CLASSIFIED_METADATA.props,
			body_markdown: 'New body'
		});
	});

	it('honors an editor revision even if a managed refresh preserved the row timestamp', async () => {
		const { fixtures, supabase } = createSupabaseMock(LOADED_UPDATED_AT);
		fixtures.documentOverrides = { content: 'A changed managed region' };
		const { PATCH } = await import('./+server');
		const response = await PATCH({
			params: { id: 'doc-1' },
			locals: buildLocals(supabase),
			request: buildPatchRequest(LOADED_UPDATED_AT, {
				expected_editor_revision: EDITOR_REVISION
			})
		} as any);
		expect(response.status).toBe(409);
		expect(fixtures.updateBuilders).toHaveLength(0);
	});

	it('stops after one guarded retry when the row changes again', async () => {
		const { fixtures, supabase } = createSupabaseMock('2026-08-02T15:00:02.000Z');
		fixtures.refreshedDocument = { ...CLASSIFIED_METADATA, updated_at: RACING_UPDATED_AT };
		const { PATCH } = await import('./+server');
		const response = await PATCH({
			params: { id: 'doc-1' },
			locals: buildLocals(supabase),
			request: buildPatchRequest(LOADED_UPDATED_AT, {
				expected_editor_revision: EDITOR_REVISION
			})
		} as any);
		expect(response.status).toBe(409);
		expect(fixtures.updateBuilders).toHaveLength(2);
	});

	it.each(['title', 'content', 'description', 'state_key'])(
		'rejects another editor changing %s despite an editor revision',
		async (field) => {
			const { fixtures, supabase } = createSupabaseMock(RACING_UPDATED_AT);
			fixtures.loadedUpdatedAt = RACING_UPDATED_AT;
			fixtures.documentOverrides = {
				[field]: field === 'state_key' ? 'published' : 'Other edit'
			};
			const { PATCH } = await import('./+server');
			const response = await PATCH({
				params: { id: 'doc-1' },
				locals: buildLocals(supabase),
				request: buildPatchRequest(LOADED_UPDATED_AT, {
					expected_editor_revision: EDITOR_REVISION
				})
			} as any);
			expect(response.status).toBe(409);
			expect(fixtures.updateBuilders).toHaveLength(0);
		}
	);

	it('never retries over an authored edit that wins the write-time race', async () => {
		const { fixtures, supabase } = createSupabaseMock(RACING_UPDATED_AT);
		fixtures.refreshedDocument = { content: 'Their edit', updated_at: RACING_UPDATED_AT };
		const { PATCH } = await import('./+server');
		const response = await PATCH({
			params: { id: 'doc-1' },
			locals: buildLocals(supabase),
			request: buildPatchRequest(LOADED_UPDATED_AT, {
				expected_editor_revision: EDITOR_REVISION
			})
		} as any);
		expect(response.status).toBe(409);
		expect(fixtures.updateBuilders).toHaveLength(1);
	});

	it('does not let a metadata write use the editor revision to bypass a stale timestamp', async () => {
		const { fixtures, supabase } = createSupabaseMock(RACING_UPDATED_AT);
		fixtures.loadedUpdatedAt = RACING_UPDATED_AT;
		fixtures.documentOverrides = CLASSIFIED_METADATA;
		const { PATCH } = await import('./+server');
		const response = await PATCH({
			params: { id: 'doc-1' },
			locals: buildLocals(supabase),
			request: buildPatchRequest(LOADED_UPDATED_AT, {
				type_key: 'document.default',
				expected_editor_revision: EDITOR_REVISION
			})
		} as any);
		expect(response.status).toBe(409);
		expect(fixtures.updateBuilders).toHaveLength(0);
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
