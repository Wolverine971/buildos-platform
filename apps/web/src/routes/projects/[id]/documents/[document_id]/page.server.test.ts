// apps/web/src/routes/projects/[id]/documents/[document_id]/page.server.test.ts
import { describe, expect, it, vi } from 'vitest';

import { load } from './+page.server';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const DOCUMENT_ID = '22222222-2222-4222-8222-222222222222';

function jsonResponse(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

describe('document focus page load', () => {
	it('turns an RLS-hidden project into a helpful forbidden state for a signed-in nonmember', async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const path = String(input);
			if (path === `/api/onto/projects/${PROJECT_ID}`) {
				return jsonResponse({ error: 'Project not found' }, 404);
			}
			return jsonResponse({ error: 'Access denied' }, 403);
		});
		const rpc = vi.fn().mockResolvedValue({ data: 'forbidden', error: null });

		await expect(
			load({
				params: { id: PROJECT_ID, document_id: DOCUMENT_ID },
				fetch: fetchMock,
				locals: { supabase: { rpc } },
				url: new URL(`https://buildos.test/projects/${PROJECT_ID}/documents/${DOCUMENT_ID}`)
			} as any)
		).rejects.toMatchObject({
			status: 403,
			body: { message: 'You do not have access to this project.' }
		});

		expect(rpc).toHaveBeenCalledWith('get_project_route_access_state', {
			p_project_id: PROJECT_ID
		});
	});

	it('loads the exact requested document when the user has project access', async () => {
		const document = { id: DOCUMENT_ID, project_id: PROJECT_ID, title: 'Pinged document' };
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const path = String(input);
			if (path === `/api/onto/projects/${PROJECT_ID}`) {
				return jsonResponse({
					data: { project: { id: PROJECT_ID, name: 'Project' }, documents: [document] }
				});
			}
			if (path === `/api/onto/documents/${DOCUMENT_ID}/full`) {
				return jsonResponse({ data: { document, linkedEntities: {} } });
			}
			return jsonResponse({ data: { events: [], linkedEntities: {} } });
		});

		const result = await load({
			params: { id: PROJECT_ID, document_id: DOCUMENT_ID },
			fetch: fetchMock,
			locals: { supabase: { rpc: vi.fn() } },
			url: new URL(`https://buildos.test/projects/${PROJECT_ID}/documents/${DOCUMENT_ID}`)
		} as any);

		expect(result.document).toEqual(document);
		expect(fetchMock).toHaveBeenCalledWith(`/api/onto/documents/${DOCUMENT_ID}/full`);
	});
});
