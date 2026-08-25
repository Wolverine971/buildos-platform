// apps/web/src/routes/api/onto/documents/[id]/full/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	resolveLinkedEntitiesGeneric: vi.fn(),
	logOntologyApiError: vi.fn()
}));

vi.mock('../../../shared/entity-linked-helpers', () => ({
	resolveLinkedEntitiesGeneric: mocks.resolveLinkedEntitiesGeneric
}));

vi.mock('../../../shared/error-logging', () => ({
	logOntologyApiError: mocks.logOntologyApiError
}));

vi.mock('$lib/server/ontology-api-error-logging', () => ({
	logOntologyApiError: mocks.logOntologyApiError
}));

import { GET } from './+server';

describe('GET /api/onto/documents/[id]/full', () => {
	beforeEach(() => {
		mocks.resolveLinkedEntitiesGeneric.mockReset().mockResolvedValue(null);
		mocks.logOntologyApiError.mockReset().mockResolvedValue(undefined);
	});

	it('resolves the actor before starting the RLS-protected document query', async () => {
		let resolveActor!: (value: { data: string; error: null }) => void;
		const actorPromise = new Promise<{ data: string; error: null }>((resolve) => {
			resolveActor = resolve;
		});
		const rpc = vi
			.fn()
			.mockImplementationOnce(() => actorPromise)
			.mockResolvedValueOnce({ data: true, error: null });
		const single = vi.fn().mockResolvedValue({
			data: {
				id: 'document-1',
				project_id: 'project-1',
				title: 'Document',
				project: { id: 'project-1' }
			},
			error: null
		});
		const query = {
			select: vi.fn(),
			eq: vi.fn(),
			is: vi.fn(),
			single
		};
		query.select.mockReturnValue(query);
		query.eq.mockReturnValue(query);
		query.is.mockReturnValue(query);
		const from = vi.fn().mockReturnValue(query);
		const locals = {
			safeGetSession: vi.fn().mockResolvedValue({
				session: { user: { id: 'user-1' } },
				user: { id: 'user-1' }
			}),
			supabase: { rpc, from }
		};

		const pendingResponse = GET({
			params: { id: 'document-1' },
			locals,
			url: new URL('http://localhost/api/onto/documents/document-1/full?include_linked=false')
		} as never);

		await Promise.resolve();
		expect(from).not.toHaveBeenCalled();

		resolveActor({ data: 'actor-1', error: null });
		const response = await pendingResponse;

		expect(response.status).toBe(200);
		expect(from).toHaveBeenCalledWith('onto_documents');
		expect(rpc).toHaveBeenNthCalledWith(2, 'current_actor_has_project_member_access', {
			p_project_id: 'project-1',
			p_required_access: 'read'
		});
		expect(await response.json()).toMatchObject({
			success: true,
			data: {
				document: {
					id: 'document-1',
					project_id: 'project-1',
					title: 'Document'
				}
			}
		});
	});
});
