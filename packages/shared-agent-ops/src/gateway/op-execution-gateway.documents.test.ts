// packages/shared-agent-ops/src/gateway/op-execution-gateway.documents.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { writeDocumentHeadAndVersionMock, logUpdateAsyncMock, project } = vi.hoisted(() => ({
	writeDocumentHeadAndVersionMock: vi.fn(),
	logUpdateAsyncMock: vi.fn(async () => undefined),
	project: {
		id: '10000000-0000-4000-8000-000000000001',
		name: 'Project One',
		owner_actor_id: 'owner-1'
	}
}));

vi.mock('../ontology/document-write.service', () => ({
	DOCUMENT_VERSION_WRITE_WARNING:
		'Your change was saved, but this edit could not be added to version history.',
	writeDocumentHeadAndVersion: writeDocumentHeadAndVersionMock
}));

vi.mock('../ontology/versioning.service', () => ({
	createOrMergeDocumentVersion: vi.fn(),
	toDocumentSnapshot: vi.fn((document: Record<string, unknown>) => ({
		title: document.title ?? null,
		content: document.content ?? null,
		description: document.description ?? null,
		props: document.props ?? {},
		state_key: document.state_key ?? null,
		type_key: document.type_key ?? null,
		project_id: document.project_id ?? null
	}))
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
	logUpdateAsync: logUpdateAsyncMock
}));

vi.mock('../ontology/doc-structure.service', () => ({
	updateDocNodeMetadata: vi.fn(async () => undefined)
}));

vi.mock('./op-execution-gateway.serializers', () => ({
	serializeExternalEntity: vi.fn((_kind: string, entity: Record<string, unknown>) => entity),
	serializeDocumentTree: vi.fn(),
	serializeProjectGraphData: vi.fn()
}));

const staleDocument = {
	id: '20000000-0000-4000-8000-000000000002',
	project_id: project.id,
	title: 'Plan',
	description: null,
	content: 'Old head',
	props: { body_markdown: 'Old head' },
	state_key: 'draft',
	type_key: 'document.default',
	archived_at: null,
	updated_at: '2026-08-26T12:00:00.000Z'
};

const freshDocument = {
	...staleDocument,
	content: 'Human edit',
	props: { body_markdown: 'Human edit' },
	updated_at: '2026-08-26T12:01:00.000Z'
};

function createAdmin(reads: Record<string, unknown>[]) {
	let readIndex = 0;
	const builder = {
		select() {
			return this;
		},
		eq() {
			return this;
		},
		in() {
			return this;
		},
		is() {
			return this;
		},
		async maybeSingle() {
			const data = reads[Math.min(readIndex, reads.length - 1)] ?? null;
			readIndex += 1;
			return { data, error: null };
		}
	};

	return {
		from: vi.fn(() => builder)
	} as any;
}

function buildContext(admin: any) {
	return {
		admin,
		userId: 'user-1',
		callerId: 'caller-1',
		scope: { mode: 'read_write', project_ids: [project.id] }
	} as any;
}

describe('agent gateway document concurrency', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('re-reads and re-derives append content once after a CAS conflict', async () => {
		writeDocumentHeadAndVersionMock
			.mockResolvedValueOnce({ status: 'conflict' })
			.mockResolvedValueOnce({
				status: 'updated',
				document: { ...freshDocument, content: 'Human edit\n\nAgent note' },
				versionWarning: null,
				versionError: null
			});
		const { EXTERNAL_OP_HANDLERS } = await import('./op-execution-gateway.core');

		const result = await EXTERNAL_OP_HANDLERS['onto.document.update'](
			buildContext(createAdmin([staleDocument, freshDocument])),
			{
				document_id: staleDocument.id,
				update_strategy: 'append',
				content: 'Agent note'
			}
		);

		expect(writeDocumentHeadAndVersionMock).toHaveBeenCalledTimes(2);
		expect(writeDocumentHeadAndVersionMock.mock.calls[0]?.[0]).toMatchObject({
			expectedUpdatedAt: staleDocument.updated_at,
			update: { content: 'Old head\n\nAgent note' }
		});
		expect(writeDocumentHeadAndVersionMock.mock.calls[1]?.[0]).toMatchObject({
			expectedUpdatedAt: freshDocument.updated_at,
			update: {
				content: 'Human edit\n\nAgent note',
				props: expect.objectContaining({ body_markdown: 'Human edit\n\nAgent note' })
			}
		});
		expect(result.version_warning).toBeNull();
	});

	it('does not auto-retry a replace that conflicts', async () => {
		writeDocumentHeadAndVersionMock.mockResolvedValue({ status: 'conflict' });
		const { EXTERNAL_OP_HANDLERS } = await import('./op-execution-gateway.core');

		await expect(
			EXTERNAL_OP_HANDLERS['onto.document.update'](
				buildContext(createAdmin([staleDocument])),
				{
					document_id: staleDocument.id,
					update_strategy: 'replace',
					content: 'Agent replacement'
				}
			)
		).rejects.toMatchObject({ code: 'CONFLICT' });

		expect(writeDocumentHeadAndVersionMock).toHaveBeenCalledTimes(1);
	});

	it('does not auto-retry metadata bundled with an append', async () => {
		writeDocumentHeadAndVersionMock.mockResolvedValue({ status: 'conflict' });
		const { EXTERNAL_OP_HANDLERS } = await import('./op-execution-gateway.core');

		await expect(
			EXTERNAL_OP_HANDLERS['onto.document.update'](
				buildContext(createAdmin([staleDocument])),
				{
					document_id: staleDocument.id,
					update_strategy: 'append',
					content: 'Agent note',
					title: 'Agent title'
				}
			)
		).rejects.toMatchObject({ code: 'CONFLICT' });

		expect(writeDocumentHeadAndVersionMock).toHaveBeenCalledTimes(1);
	});
});
