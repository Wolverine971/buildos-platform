// packages/shared-agent-ops/src/gateway/op-execution-gateway.start-here-guard.test.ts
//
// Start Here substitution guard (incident 2026-09-03): a chat-authored
// "contractor note" typed `document.context.project` took over the project
// page's Start Here slot because get_project_full picks the newest
// context-typed document. The gateway document-create op must refuse that type
// and name the document the model should update instead.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EXTERNAL_OP_HANDLERS } from './op-execution-gateway.core';

const { project } = vi.hoisted(() => ({
	project: {
		id: '10000000-0000-4000-8000-000000000001',
		name: 'Cedar House',
		owner_actor_id: 'owner-1'
	}
}));

vi.mock('../ontology/document-write.service', () => ({
	DOCUMENT_VERSION_WRITE_WARNING: 'version warning',
	writeDocumentHeadAndVersion: vi.fn()
}));

vi.mock('../ontology/versioning.service', () => ({
	createOrMergeDocumentVersion: vi.fn(async () => ({ status: 'created', versionNumber: 1 })),
	toDocumentSnapshot: vi.fn(() => ({}))
}));

vi.mock('../ontology/ontology-projects.service', () => ({
	ensureActorId: vi.fn(async () => 'actor-1')
}));

vi.mock('./op-execution-gateway.access', () => ({
	loadVisibleProjects: vi.fn(async () => ({
		projects: [project],
		projectMap: new Map([[project.id, project]])
	})),
	assertVisibleEntityProject: vi.fn(() => project),
	assertProjectWriteAccess: vi.fn(),
	assertAccessibleProject: vi.fn(() => project),
	getProjectIdsForVisibleContext: vi.fn(),
	getProjectIdsOrThrow: vi.fn(),
	withProjectName: vi.fn()
}));

vi.mock('../ops/entity-mention-notification.service', () => ({
	resolveEntityMentionUserIds: vi.fn(async () => []),
	notifyEntityMentionsAdded: vi.fn(async () => undefined)
}));

vi.mock('../ops/async-activity-logger', () => ({
	logCreateAsync: vi.fn(async () => undefined),
	logUpdateAsync: vi.fn(async () => undefined)
}));

vi.mock('../ontology/doc-structure.service', () => ({
	addDocumentToTree: vi.fn(async () => ({ version: 1, root: [] })),
	getDocTree: vi.fn(),
	getNodePath: vi.fn(),
	moveDocument: vi.fn(),
	updateDocNodeMetadata: vi.fn(async () => undefined)
}));

vi.mock('./op-execution-gateway.serializers', () => ({
	serializeExternalEntity: vi.fn((_kind: string, entity: Record<string, unknown>) => entity),
	serializeDocumentTree: vi.fn(),
	serializeProjectGraphData: vi.fn()
}));

const existingStartHere = {
	id: '20000000-0000-4000-8000-000000000009',
	title: 'START HERE - Cedar House',
	content: '# START HERE - Cedar House\n\nThe real one.',
	props: { origin: 'start_here_template' },
	created_at: '2026-08-01T00:00:00.000Z',
	// Frozen by the managed-refresh recency guard, so recency alone loses.
	updated_at: '2026-08-02T00:00:00.000Z'
};

function createAdmin(contextDocuments: Record<string, unknown>[]) {
	const inserts: Record<string, unknown>[] = [];

	const from = vi.fn(() => {
		let insertPayload: Record<string, unknown> | null = null;
		const builder: Record<string, unknown> = {};
		Object.assign(builder, {
			select: () => builder,
			eq: () => builder,
			is: () => builder,
			order: () => builder,
			limit: async () => ({ data: contextDocuments, error: null }),
			insert: (payload: Record<string, unknown>) => {
				insertPayload = payload;
				inserts.push(payload);
				return builder;
			},
			single: async () => ({
				data: {
					id: '30000000-0000-4000-8000-000000000001',
					project_id: project.id,
					archived_at: null,
					created_at: '2026-09-03T00:00:00.000Z',
					updated_at: '2026-09-03T00:00:00.000Z',
					...(insertPayload ?? {})
				},
				error: null
			})
		});
		return builder;
	});

	return { admin: { from } as never, inserts };
}

function buildContext(admin: unknown) {
	return {
		admin,
		userId: 'user-1',
		callerId: 'caller-1',
		scope: { mode: 'read_write', project_ids: [project.id] }
	} as never;
}

describe('gateway document create — Start Here reserved type guard', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('refuses document.context.project and names the existing Start Here document', async () => {
		const { admin, inserts } = createAdmin([existingStartHere]);

		await expect(
			EXTERNAL_OP_HANDLERS['onto.document.create'](buildContext(admin), {
				project_id: project.id,
				title: 'Contractor note',
				type_key: 'document.context.project',
				content: 'Called the contractor.'
			})
		).rejects.toMatchObject({
			code: 'VALIDATION_ERROR',
			details: {
				reserved_type_key: 'document.context.project',
				start_here_document_id: existingStartHere.id,
				start_here_document_title: existingStartHere.title
			}
		});

		expect(inserts).toEqual([]);
	});

	it('prefers the explicitly marked Start Here over a newer context-typed note', async () => {
		const newerImposter = {
			id: '20000000-0000-4000-8000-000000000010',
			title: 'Contractor note',
			content: 'Called the contractor.',
			props: {},
			created_at: '2026-09-02T00:00:00.000Z',
			updated_at: '2026-09-02T00:00:00.000Z'
		};
		const { admin } = createAdmin([newerImposter, existingStartHere]);

		await expect(
			EXTERNAL_OP_HANDLERS['onto.document.create'](buildContext(admin), {
				project_id: project.id,
				title: 'Another note',
				type_key: 'document.context.project'
			})
		).rejects.toMatchObject({
			details: { start_here_document_id: existingStartHere.id }
		});
	});

	it('still refuses when the project has no Start Here document yet', async () => {
		const { admin, inserts } = createAdmin([]);

		await expect(
			EXTERNAL_OP_HANDLERS['onto.document.create'](buildContext(admin), {
				project_id: project.id,
				title: 'Contractor note',
				type_key: 'document.context.project'
			})
		).rejects.toMatchObject({
			code: 'VALIDATION_ERROR',
			details: { reserved_type_key: 'document.context.project' }
		});

		expect(inserts).toEqual([]);
	});

	it('leaves every other document type untouched', async () => {
		const { admin, inserts } = createAdmin([existingStartHere]);

		const result = (await EXTERNAL_OP_HANDLERS['onto.document.create'](buildContext(admin), {
			project_id: project.id,
			title: 'Contractor note',
			type_key: 'document.knowledge.research',
			content: 'Called the contractor.'
		})) as { document: Record<string, unknown> };

		expect(inserts).toHaveLength(1);
		expect(result.document.type_key).toBe('document.knowledge.research');
	});
});
