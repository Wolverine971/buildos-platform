// apps/web/src/routes/api/onto/documents/[id]/document-patch-mentions.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const resolveEntityMentionUserIdsMock = vi.fn();
const notifyEntityMentionsAddedMock = vi.fn();
const createOrMergeDocumentVersionMock = vi.fn(async () => ({ status: 'skipped' as const }));
const toDocumentSnapshotMock = vi.fn(() => ({}));

vi.mock('$lib/services/ontology/doc-structure.service', () => ({
	removeDocumentFromTree: vi.fn(),
	updateDocNodeMetadata: vi.fn()
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
	createOrMergeDocumentVersion: createOrMergeDocumentVersionMock,
	toDocumentSnapshot: toDocumentSnapshotMock
}));

vi.mock('$lib/server/entity-mention-notification.service', () => ({
	resolveEntityMentionUserIds: resolveEntityMentionUserIdsMock,
	notifyEntityMentionsAdded: notifyEntityMentionsAddedMock
}));

vi.mock('../../shared/error-logging', () => ({
	logOntologyApiError: vi.fn()
}));

class QueryBuilderMock {
	private action: 'select' | 'update' | null = null;
	private updatePayload: Record<string, unknown> | null = null;
	private readonly existingDocument = {
		id: 'doc-1',
		project_id: 'project-1',
		title: 'Document title',
		type_key: 'document.default',
		state_key: 'draft',
		description: 'Before description',
		content: 'Before content',
		props: {}
	};

	constructor(private readonly table: string) {}

	select() {
		if (!this.action) this.action = 'select';
		return this;
	}

	update(payload: Record<string, unknown>) {
		this.action = 'update';
		this.updatePayload = payload;
		return this;
	}

	eq() {
		return this;
	}

	is() {
		return this;
	}

	async maybeSingle() {
		if (this.table === 'onto_documents' && this.action === 'select') {
			return { data: this.existingDocument, error: null };
		}

		if (this.table === 'onto_projects' && this.action === 'select') {
			return {
				data: {
					id: 'project-1',
					name: 'Project One',
					created_by: 'actor-owner'
				},
				error: null
			};
		}

		return { data: null, error: null };
	}

	async single() {
		if (this.table === 'onto_documents' && this.action === 'update') {
			return {
				data: {
					...this.existingDocument,
					...this.updatePayload
				},
				error: null
			};
		}

		return { data: null, error: null };
	}
}

function createSupabaseMock() {
	return {
		rpc: vi.fn(async (fn: string) => {
			if (fn === 'ensure_actor_for_user') {
				return { data: 'actor-current', error: null };
			}
			if (fn === 'current_actor_has_project_access') {
				return { data: true, error: null };
			}
			return { data: null, error: null };
		}),
		from: (table: string) => new QueryBuilderMock(table)
	};
}

describe('PATCH /api/onto/documents/[id] mention notifications', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resolveEntityMentionUserIdsMock.mockResolvedValue(['user-mentioned']);
		notifyEntityMentionsAddedMock.mockResolvedValue({ notifiedUserIds: ['user-mentioned'] });
	});

	it('notifies only newly added mentions during document edits', async () => {
		const { PATCH } = await import('./+server');
		const response = await PATCH({
			params: { id: 'doc-1' },
			request: new Request('http://localhost/api/onto/documents/doc-1', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					description: 'Updated [[user:user-mentioned|Jo]]'
				})
			}),
			locals: {
				supabase: createSupabaseMock() as any,
				safeGetSession: async () => ({
					user: { id: 'user-actor', name: 'DJ', email: 'dj@example.com' }
				})
			}
		} as any);

		expect(response.status).toBe(200);
		expect(resolveEntityMentionUserIdsMock).toHaveBeenCalledWith(
			expect.objectContaining({
				projectId: 'project-1',
				projectOwnerActorId: 'actor-owner',
				actorUserId: 'user-actor',
				nextTextValues: [
					'Document title',
					'Updated [[user:user-mentioned|Jo]]',
					'Before content'
				],
				previousTextValues: ['Document title', 'Before description', 'Before content']
			})
		);
		expect(notifyEntityMentionsAddedMock).toHaveBeenCalledWith(
			expect.objectContaining({
				projectId: 'project-1',
				projectName: 'Project One',
				entityType: 'document',
				entityId: 'doc-1',
				entityTitle: 'Document title',
				actorUserId: 'user-actor',
				mentionedUserIds: ['user-mentioned']
			})
		);
	});

	it('passes forceCreateVersion when force_version is requested', async () => {
		const { PATCH } = await import('./+server');
		const response = await PATCH({
			params: { id: 'doc-1' },
			request: new Request('http://localhost/api/onto/documents/doc-1', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: 'Document title',
					force_version: true
				})
			}),
			locals: {
				supabase: createSupabaseMock() as any,
				safeGetSession: async () => ({
					user: { id: 'user-actor', name: 'DJ', email: 'dj@example.com' }
				})
			}
		} as any);

		expect(response.status).toBe(200);
		expect(createOrMergeDocumentVersionMock).toHaveBeenCalledWith(
			expect.objectContaining({
				documentId: 'doc-1',
				actorId: 'actor-current',
				forceCreateVersion: true
			})
		);
	});
});
