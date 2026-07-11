// apps/web/src/routes/api/onto/projects/[id]/doc-tree/move/doc-tree-move-replay-suppression.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const queueProjectLoopBurstAsyncMock = vi.hoisted(() => vi.fn());
const moveDocumentMock = vi.hoisted(() => vi.fn());

vi.mock('$lib/services/ontology/doc-structure.service', () => ({
	moveDocument: moveDocumentMock
}));

vi.mock('../../../../shared/error-logging', () => ({
	logOntologyApiError: vi.fn()
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

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const DOCUMENT_ID = '22222222-2222-4222-8222-222222222222';
const PARENT_ID = '33333333-3333-4333-8333-333333333333';

function createSupabaseMock() {
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
		from: (table: string) => {
			if (table === 'onto_projects') {
				return {
					select: () => ({
						eq: () => ({
							is: () => ({
								single: async () => ({ data: { id: PROJECT_ID }, error: null })
							})
						})
					})
				};
			}
			if (table === 'onto_documents') {
				return {
					select: () => ({
						eq: () => ({
							eq: () => ({
								neq: () => ({
									is: () => ({
										maybeSingle: async () => ({
											data: { id: DOCUMENT_ID },
											error: null
										})
									})
								})
							})
						})
					})
				};
			}
			throw new Error(`Unexpected table: ${table}`);
		}
	};
}

function buildLocals(supabase: ReturnType<typeof createSupabaseMock>) {
	return {
		supabase: supabase as any,
		safeGetSession: async () => ({ user: { id: 'user-1' } })
	};
}

const SUPPRESS_REVIEW_CONTEXT = {
	origin: 'project_suggestion_replay',
	operation_kind: 'suggestion_apply',
	review_policy: 'suppress',
	operation_id: 'project_suggestion:suggestion-1',
	entity_count: 1
};

describe('POST /api/onto/projects/[id]/doc-tree/move project-loop burst replay suppression', () => {
	beforeEach(() => {
		queueProjectLoopBurstAsyncMock.mockReset();
		moveDocumentMock.mockReset();
		moveDocumentMock.mockResolvedValue({ version: 1, root: [] });
	});

	it('suppresses the burst when project_review_context requests replay suppression', async () => {
		const { POST } = await import('./+server');
		const supabase = createSupabaseMock();

		const response = await POST({
			params: { id: PROJECT_ID },
			request: new Request(`http://localhost/api/onto/projects/${PROJECT_ID}/doc-tree/move`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					document_id: DOCUMENT_ID,
					new_parent_id: PARENT_ID,
					new_position: 0,
					project_review_context: SUPPRESS_REVIEW_CONTEXT
				})
			}),
			locals: buildLocals(supabase)
		} as any);

		expect(response.status).toBe(200);
		expect(queueProjectLoopBurstAsyncMock).not.toHaveBeenCalled();
	});

	it('does not suppress the burst without a review context (negative control)', async () => {
		const { POST } = await import('./+server');
		const supabase = createSupabaseMock();

		const response = await POST({
			params: { id: PROJECT_ID },
			request: new Request(`http://localhost/api/onto/projects/${PROJECT_ID}/doc-tree/move`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					document_id: DOCUMENT_ID,
					new_parent_id: PARENT_ID,
					new_position: 0
				})
			}),
			locals: buildLocals(supabase)
		} as any);

		expect(response.status).toBe(200);
		expect(queueProjectLoopBurstAsyncMock).toHaveBeenCalledWith(
			expect.objectContaining({
				projectId: PROJECT_ID,
				source: 'doc_tree_move',
				entityType: 'document',
				entityId: DOCUMENT_ID,
				action: 'updated'
			})
		);
	});
});
