// apps/web/src/routes/api/onto/tasks/[id]/documents/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createOrMergeDocumentVersionMock, logOntologyApiErrorMock } = vi.hoisted(() => ({
	createOrMergeDocumentVersionMock: vi.fn(),
	logOntologyApiErrorMock: vi.fn(async () => undefined)
}));

vi.mock('$lib/services/ontology/versioning.service', () => ({
	createOrMergeDocumentVersion: createOrMergeDocumentVersionMock,
	toDocumentSnapshot: vi.fn(() => ({}))
}));

vi.mock('../../task-document-helpers', () => ({
	TASK_DOCUMENT_REL: 'task_has_document',
	ensureTaskAccess: vi.fn(async () => ({
		task: { id: 'task-1', title: 'Task One' },
		project: { id: 'project-1' },
		actorId: 'actor-1'
	}))
}));

vi.mock('../../../shared/error-logging', () => ({
	logOntologyApiError: logOntologyApiErrorMock
}));

vi.mock('@buildos/agentic-chat-runtime/tools', () => ({
	AgenticChatTaskDocumentsQueryError: class AgenticChatTaskDocumentsQueryError extends Error {},
	loadTaskDocumentLinks: vi.fn()
}));

function createSupabaseMock() {
	const document = {
		id: 'document-1',
		project_id: 'project-1',
		title: 'Task One Document',
		type_key: 'document.task.scratch',
		state_key: 'draft',
		content: 'Body',
		description: null,
		props: { body_markdown: 'Body' },
		created_by: 'actor-1'
	};

	return {
		from: vi.fn((table: string) => {
			if (table === 'onto_documents') {
				return {
					insert: vi.fn(() => ({
						select: vi.fn(() => ({
							single: vi.fn(async () => ({ data: document, error: null }))
						}))
					}))
				};
			}
			if (table === 'onto_edges') {
				return {
					insert: vi.fn(async () => ({ error: null }))
				};
			}
			throw new Error(`Unexpected table: ${table}`);
		})
	};
}

describe('POST /api/onto/tasks/[id]/documents', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns a visible warning when the document commits but initial versioning fails', async () => {
		const versionError = new Error('version insert failed');
		createOrMergeDocumentVersionMock.mockRejectedValue(versionError);
		const { POST } = await import('./+server');

		const response = await POST({
			params: { id: 'task-1' },
			request: new Request('http://localhost/api/onto/tasks/task-1/documents', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ content: 'Body' })
			}),
			locals: {
				supabase: createSupabaseMock() as any,
				safeGetSession: async () => ({ user: { id: 'user-1' } })
			}
		} as any);

		expect(response.status).toBe(200);
		const payload = await response.json();
		expect(payload.data.versionWarning).toBe(
			'The document was created, but its first version could not be recorded in history.'
		);
		expect(logOntologyApiErrorMock).toHaveBeenCalledWith(
			expect.objectContaining({
				error: versionError,
				operation: 'task_document_version_create',
				metadata: { nonFatal: false, surfacedToClient: true }
			})
		);
	});
});
