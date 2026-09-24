// packages/shared-agent-ops/src/gateway/op-execution-gateway.documents.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EXTERNAL_OP_HANDLERS, previewDocumentUpdate } from './op-execution-gateway.core';

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
	contextActorId: vi.fn(async () => 'actor-1'),
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

describe('agent gateway surgical document edits', () => {
	const contract = {
		...staleDocument,
		content:
			'Scope: 60k words.\n\n**Exclusions:** [To be defined — what NOT to cover?]\n\n## Next\n\nBody',
		props: {}
	};

	beforeEach(() => {
		vi.clearAllMocks();
		writeDocumentHeadAndVersionMock.mockImplementation(async ({ update }) => ({
			status: 'updated',
			document: { ...contract, ...update },
			versionWarning: null,
			versionError: null
		}));
	});

	it('deletes one line by exact text and returns a GitHub-style change receipt', async () => {
		const result = await EXTERNAL_OP_HANDLERS['onto.document.update'](
			buildContext(createAdmin([contract])),
			{
				document_id: contract.id,
				edits: [
					{
						old_text: '**Exclusions:** [To be defined - what NOT to cover?]',
						new_text: ''
					}
				]
			}
		);

		expect(writeDocumentHeadAndVersionMock.mock.calls[0]?.[0]).toMatchObject({
			expectedUpdatedAt: contract.updated_at,
			update: {
				content: 'Scope: 60k words.\n\n## Next\n\nBody',
				props: expect.objectContaining({
					body_markdown: 'Scope: 60k words.\n\n## Next\n\nBody'
				})
			}
		});
		expect(result).toMatchObject({
			document_change_status: 'changed',
			document_change: {
				lines_added: 0,
				lines_removed: 2,
				edits_applied: [{ edit: 'edits[0]', match: 'normalized', lines: [3] }],
				revert_patch: expect.objectContaining({ document_id: contract.id })
			}
		});
	});

	it('applies edits sent with update_strategy append instead of demanding content', async () => {
		const result = await EXTERNAL_OP_HANDLERS['onto.document.update'](
			buildContext(createAdmin([contract])),
			{
				document_id: contract.id,
				update_strategy: 'append',
				edits: [{ old_text: 'Body', new_text: 'Final body' }]
			}
		);

		expect(writeDocumentHeadAndVersionMock.mock.calls[0]?.[0].update.content).toBe(
			contract.content.replace('Body', 'Final body')
		);
		expect(result).toMatchObject({ document_change_status: 'changed' });
	});

	it('rejects unresolvable edits with actionable failures and writes nothing', async () => {
		await expect(
			EXTERNAL_OP_HANDLERS['onto.document.update'](buildContext(createAdmin([contract])), {
				document_id: contract.id,
				edits: [{ old_text: '**Exclusions:** none', new_text: '' }]
			})
		).rejects.toMatchObject({
			code: 'VALIDATION_ERROR',
			message: expect.stringContaining('Did you mean line 3?'),
			details: { edit_failures: [expect.objectContaining({ code: 'ANCHOR_NOT_FOUND' })] }
		});
		expect(writeDocumentHeadAndVersionMock).not.toHaveBeenCalled();
	});

	it('refuses content and edits in the same call', async () => {
		await expect(
			EXTERNAL_OP_HANDLERS['onto.document.update'](buildContext(createAdmin([contract])), {
				document_id: contract.id,
				content: 'Whole body',
				edits: [{ old_text: 'Body', new_text: 'Text' }]
			})
		).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
	});

	it('refuses a replace that would drop most of a long document unless allowed', async () => {
		const long = { ...contract, content: `# Outline\n\n${'Chapter card line.\n'.repeat(120)}` };
		await expect(
			EXTERNAL_OP_HANDLERS['onto.document.update'](buildContext(createAdmin([long])), {
				document_id: long.id,
				update_strategy: 'replace',
				content: '# Outline\n\nPhase 1 only.'
			})
		).rejects.toMatchObject({
			code: 'VALIDATION_ERROR',
			message: expect.stringContaining('allow_large_deletion')
		});
		expect(writeDocumentHeadAndVersionMock).not.toHaveBeenCalled();

		await EXTERNAL_OP_HANDLERS['onto.document.update'](buildContext(createAdmin([long])), {
			document_id: long.id,
			update_strategy: 'replace',
			content: '# Outline\n\nPhase 1 only.',
			allow_large_deletion: true
		});
		expect(writeDocumentHeadAndVersionMock).toHaveBeenCalledTimes(1);
	});

	it('re-anchors edits on the fresh head after a concurrent human edit', async () => {
		const fresh = {
			...contract,
			content: `Human intro.\n\n${contract.content}`,
			updated_at: '2026-08-26T12:05:00.000Z'
		};
		writeDocumentHeadAndVersionMock.mockReset();
		writeDocumentHeadAndVersionMock
			.mockResolvedValueOnce({ status: 'conflict' })
			.mockImplementationOnce(async ({ update }) => ({
				status: 'updated',
				document: { ...fresh, ...update },
				versionWarning: null,
				versionError: null
			}));

		const result = await EXTERNAL_OP_HANDLERS['onto.document.update'](
			buildContext(createAdmin([contract, fresh])),
			{ document_id: contract.id, edits: [{ old_text: 'Body', new_text: 'Final body' }] }
		);

		expect(writeDocumentHeadAndVersionMock.mock.calls[1]?.[0]).toMatchObject({
			expectedUpdatedAt: fresh.updated_at,
			update: { content: fresh.content.replace('Body', 'Final body') }
		});
		expect(result).toMatchObject({ document_change: { lines_added: 1, lines_removed: 1 } });
	});

	it('fails closed when the edited text changed underneath the agent', async () => {
		const fresh = {
			...contract,
			content: 'Rewritten by a human.',
			updated_at: '2026-08-26T12:05:00.000Z'
		};
		writeDocumentHeadAndVersionMock.mockReset();
		writeDocumentHeadAndVersionMock.mockResolvedValueOnce({ status: 'conflict' });

		await expect(
			EXTERNAL_OP_HANDLERS['onto.document.update'](
				buildContext(createAdmin([contract, fresh])),
				{
					document_id: contract.id,
					edits: [{ old_text: 'Body', new_text: 'Final body' }]
				}
			)
		).rejects.toMatchObject({
			code: 'CONFLICT',
			details: { edit_failures: [expect.objectContaining({ code: 'ANCHOR_NOT_FOUND' })] }
		});
		expect(writeDocumentHeadAndVersionMock).toHaveBeenCalledTimes(1);
	});
});

describe('agent gateway document update preview', () => {
	const doc = {
		...staleDocument,
		content: 'Scope: 60k words.\n\n**Exclusions:** TBD\n\n## Next\n\nBody',
		props: {}
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns the exact diff an edit would make without writing', async () => {
		const preview = await previewDocumentUpdate(buildContext(createAdmin([doc])), {
			document_id: doc.id,
			edits: [{ old_text: '**Exclusions:** TBD', new_text: '' }]
		});

		expect(writeDocumentHeadAndVersionMock).not.toHaveBeenCalled();
		expect(preview).toMatchObject({
			document_id: doc.id,
			title: 'Plan',
			document_change: { lines_added: 0, lines_removed: 2 },
			edits_applied: [{ edit: 'edits[0]', match: 'exact', lines: [3] }]
		});
		expect(preview.document_change).not.toHaveProperty('revert_patch');
	});

	it('fails the same way the write would', async () => {
		await expect(
			previewDocumentUpdate(buildContext(createAdmin([doc])), {
				document_id: doc.id,
				edits: [{ old_text: '**Exclusions:** none', new_text: '' }]
			})
		).rejects.toMatchObject({
			code: 'VALIDATION_ERROR',
			message: expect.stringContaining('Did you mean line 3?')
		});
	});

	it('reports no body change for a metadata-only update', async () => {
		const preview = await previewDocumentUpdate(buildContext(createAdmin([doc])), {
			document_id: doc.id,
			title: 'Renamed'
		});
		expect(preview.document_change).toBeNull();
		expect(preview.next_content).toBeNull();
	});

	it('previews a later batch call against the body the earlier calls leave', async () => {
		const afterFirstCall = doc.content.replace('Body', 'Body\n\nNew paragraph.');
		const args = {
			document_id: doc.id,
			edits: [{ old_text: 'New paragraph.', new_text: 'Newer paragraph.' }]
		};

		const preview = await previewDocumentUpdate(buildContext(createAdmin([doc])), args, {
			base_content: afterFirstCall
		});

		expect(writeDocumentHeadAndVersionMock).not.toHaveBeenCalled();
		expect(preview.document_change).toMatchObject({ lines_added: 1, lines_removed: 1 });
		expect(preview.next_content).toBe(
			afterFirstCall.replace('New paragraph.', 'Newer paragraph.')
		);
		// Against the stored body alone, the same call cannot apply.
		await expect(
			previewDocumentUpdate(buildContext(createAdmin([doc])), args)
		).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
	});
});
