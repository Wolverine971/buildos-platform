// apps/web/src/routes/api/onto/projects/[id]/doc-tree/move/server.test.ts
import { describe, it, expect, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

vi.mock('../../../../shared/error-logging', () => ({
	logOntologyApiError: vi.fn()
}));

describe('POST /api/onto/projects/[id]/doc-tree/move', () => {
	it('rejects invalid new_parent_id type', async () => {
		const { POST } = await import('./+server');

		const request = new Request('http://localhost/api/onto/projects/project-1/doc-tree/move', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				document_id: 'doc-1',
				new_parent_id: 42,
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
		expect(payload.success).toBe(false);
	});

	it('rejects negative new_position', async () => {
		const { POST } = await import('./+server');

		const request = new Request('http://localhost/api/onto/projects/project-1/doc-tree/move', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				document_id: 'doc-1',
				new_parent_id: null,
				new_position: -1
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
		expect(payload.success).toBe(false);
	});
});
