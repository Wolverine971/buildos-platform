// apps/web/src/routes/projects/[id]/documents/[document_id]/page.server.test.ts
import { describe, expect, it, vi } from 'vitest';

import { load } from './+page.server';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const DOCUMENT_ID = '22222222-2222-4222-8222-222222222222';
const CARD_PATH = `/api/onto/projects/${PROJECT_ID}/card`;
const DOCUMENT_PATH = `/api/onto/documents/${DOCUMENT_ID}/full?include_linked=false`;

async function loadDocumentPage(event: Parameters<typeof load>[0]) {
	const result = await load(event);
	if (!result) throw new Error('Expected document page data');
	return result;
}

function jsonResponse(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

function card(overrides: Record<string, unknown> = {}) {
	return {
		data: {
			project: {
				id: PROJECT_ID,
				name: 'Project',
				can_write: true,
				documents: [],
				tasks: [],
				...overrides
			},
			goals: []
		}
	};
}

function event(fetchMock: unknown, rpc = vi.fn(), search = '') {
	return {
		params: { id: PROJECT_ID, document_id: DOCUMENT_ID },
		fetch: fetchMock,
		locals: { supabase: { rpc } },
		url: new URL(
			`https://buildos.test/projects/${PROJECT_ID}/documents/${DOCUMENT_ID}${search}`
		)
	} as any;
}

describe('document page load', () => {
	it('turns an RLS-hidden project into a helpful forbidden state for a signed-in nonmember', async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
			String(input) === CARD_PATH
				? jsonResponse({ error: 'Project not found.' }, 404)
				: jsonResponse({ error: 'Access denied' }, 403)
		);
		const rpc = vi.fn().mockResolvedValue({ data: 'forbidden', error: null });

		await expect(load(event(fetchMock, rpc))).rejects.toMatchObject({
			status: 403,
			body: { message: 'You do not have access to this project.' }
		});
		expect(rpc).toHaveBeenCalledWith('get_project_route_access_state', {
			p_project_id: PROJECT_ID
		});
	});

	it('loads the exact requested document, the project list and write access in two reads', async () => {
		const document = { id: DOCUMENT_ID, project_id: PROJECT_ID, title: 'Pinged document' };
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const path = String(input);
			if (path === CARD_PATH) return jsonResponse(card({ documents: [document] }));
			if (path === DOCUMENT_PATH) {
				return jsonResponse({ data: { document, editor_revision: 'rev-1' } });
			}
			return jsonResponse({ error: 'Unexpected read' }, 500);
		});

		const result = await loadDocumentPage(event(fetchMock));

		expect(result.item).toEqual({ kind: 'document', id: DOCUMENT_ID });
		expect(result.itemTitle).toBe('Pinged document');
		expect(result.projectName).toBe('Project');
		expect(result.canWrite).toBe(true);
		expect(result.card?.project.documents).toEqual([document]);
		// The reader opens with this read instead of making its own.
		expect(result.seed).toEqual({ document, editor_revision: 'rev-1' });
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('still opens a document when the project list cannot be read (archived project)', async () => {
		const document = { id: DOCUMENT_ID, project_id: PROJECT_ID, title: 'Old notes' };
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const path = String(input);
			if (path === CARD_PATH) {
				return jsonResponse({ error: 'Archived projects cannot be organized.' }, 409);
			}
			if (path === DOCUMENT_PATH) return jsonResponse({ data: { document } });
			if (path === `/api/onto/projects/${PROJECT_ID}`) {
				return jsonResponse({ data: { project: { id: PROJECT_ID, name: 'Archived' } } });
			}
			return jsonResponse({ error: 'Unexpected read' }, 500);
		});

		const result = await loadDocumentPage(event(fetchMock));

		expect(result.card).toBeNull();
		expect(result.projectName).toBe('Archived');
		expect(result.canWrite).toBe(false);
	});
});

it('redirects a moved document even when the former project is inaccessible', async () => {
	const destination = '33333333-3333-4333-8333-333333333333';
	const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
		String(input).includes('/documents/')
			? jsonResponse({ data: { document: { id: DOCUMENT_ID, project_id: destination } } })
			: jsonResponse({ error: 'Not found' }, 404)
	);
	await expect(load(event(fetchMock, vi.fn(), '?view=full'))).rejects.toMatchObject({
		status: 307,
		location: `/projects/${destination}/documents/${DOCUMENT_ID}?view=full`
	});
});
