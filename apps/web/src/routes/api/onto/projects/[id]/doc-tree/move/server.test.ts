// apps/web/src/routes/api/onto/projects/[id]/doc-tree/move/server.test.ts
import { beforeEach, describe, it, expect, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

const mocks = vi.hoisted(() => ({
	moveDocument: vi.fn()
}));

vi.mock('../../../../shared/error-logging', () => ({
	logOntologyApiError: vi.fn()
}));

vi.mock('$lib/services/ontology/doc-structure.service', () => ({
	moveDocument: mocks.moveDocument
}));

describe('POST /api/onto/projects/[id]/doc-tree/move', () => {
	const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
	const DOCUMENT_ID = '22222222-2222-4222-8222-222222222222';
	const PARENT_ID = '33333333-3333-4333-8333-333333333333';

	beforeEach(() => {
		mocks.moveDocument.mockReset();
	});

	it('rejects invalid new_parent_id type', async () => {
		const { POST } = await import('./+server');

		const request = new Request(
			`http://localhost/api/onto/projects/${PROJECT_ID}/doc-tree/move`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					document_id: DOCUMENT_ID,
					new_parent_id: 42,
					new_position: 0
				})
			}
		);

		const response = await POST({
			params: { id: PROJECT_ID },
			request,
			locals: {
				supabase: {} as any,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			}
		} as unknown as RequestEvent);

		expect(response.status).toBe(400);
		const payload = await response.json();
		expect(payload.success).toBe(false);
	});

	it('rejects negative new_position', async () => {
		const { POST } = await import('./+server');

		const request = new Request(
			`http://localhost/api/onto/projects/${PROJECT_ID}/doc-tree/move`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					document_id: DOCUMENT_ID,
					new_parent_id: null,
					new_position: -1
				})
			}
		);

		const response = await POST({
			params: { id: PROJECT_ID },
			request,
			locals: {
				supabase: {} as any,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			}
		} as unknown as RequestEvent);

		expect(response.status).toBe(400);
		const payload = await response.json();
		expect(payload.success).toBe(false);
	});

	it('rejects invalid project ids before reading the body', async () => {
		const { POST } = await import('./+server');

		const request = new Request(`http://localhost/api/onto/projects/project-1/doc-tree/move`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				document_id: DOCUMENT_ID,
				new_parent_id: PARENT_ID,
				new_position: 0
			})
		});

		const response = await POST({
			params: { id: 'project-1' },
			request,
			locals: {
				supabase: {} as any,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			}
		} as unknown as RequestEvent);

		expect(response.status).toBe(400);
		const payload = await response.json();
		expect(payload.error).toBe('Invalid project ID');
	});

	it('rejects invalid document ids', async () => {
		const { POST } = await import('./+server');

		const request = new Request(
			`http://localhost/api/onto/projects/${PROJECT_ID}/doc-tree/move`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					document_id: 'doc-1',
					new_parent_id: PARENT_ID,
					new_position: 0
				})
			}
		);

		const response = await POST({
			params: { id: PROJECT_ID },
			request,
			locals: {
				supabase: {} as any,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			}
		} as unknown as RequestEvent);

		expect(response.status).toBe(400);
		const payload = await response.json();
		expect(payload.error).toBe('document_id must be a valid UUID');
	});

	it.each([
		'A document cannot be moved under itself.',
		'Parent document is not linked in the document tree.',
		'Cannot move a folder into its own descendant'
	])('maps the structural validation error "%s" to a bad request', async (message) => {
		const { POST } = await import('./+server');
		mocks.moveDocument.mockRejectedValueOnce(new Error(message));
		const projectQuery: Record<string, any> = {};
		projectQuery.select = vi.fn(() => projectQuery);
		projectQuery.eq = vi.fn(() => projectQuery);
		projectQuery.is = vi.fn(() => projectQuery);
		projectQuery.single = vi.fn().mockResolvedValue({
			data: { id: PROJECT_ID },
			error: null
		});
		const documentQuery: Record<string, any> = {};
		documentQuery.select = vi.fn(() => documentQuery);
		documentQuery.eq = vi.fn(() => documentQuery);
		documentQuery.neq = vi.fn(() => documentQuery);
		documentQuery.is = vi.fn(() => documentQuery);
		documentQuery.maybeSingle = vi.fn().mockResolvedValue({
			data: { id: DOCUMENT_ID },
			error: null
		});
		const supabase = {
			rpc: vi.fn(async (name: string) => ({
				data: name === 'ensure_actor_for_user' ? 'actor-1' : true,
				error: null
			})),
			from: vi.fn((table: string) => {
				if (table === 'onto_projects') return projectQuery;
				if (table === 'onto_documents') return documentQuery;
				throw new Error(`Unexpected table query: ${table}`);
			})
		};
		const request = new Request(
			`http://localhost/api/onto/projects/${PROJECT_ID}/doc-tree/move`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					document_id: DOCUMENT_ID,
					new_parent_id: PARENT_ID,
					new_position: 0
				})
			}
		);

		const response = await POST({
			params: { id: PROJECT_ID },
			request,
			locals: {
				supabase,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			}
		} as unknown as RequestEvent);

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({ success: false, error: message });
		expect(mocks.moveDocument).toHaveBeenCalledOnce();
	});
});
