// apps/web/src/routes/api/knowledge/import/server.test.ts
import { describe, expect, it, vi } from 'vitest';
import { parseContactFile } from '@buildos/shared-agent-ops/knowledge';

vi.mock('$lib/supabase/admin', () => ({ createAdminSupabaseClient: vi.fn() }));
vi.mock('$lib/server/knowledge/knowledge.server', () => ({
	knowledgeErrorResponse: vi.fn(),
	knowledgeStoreFor: vi.fn(),
	knowledgeDb: vi.fn()
}));

import { knowledgeDb } from '$lib/server/knowledge/knowledge.server';
import { POST } from './+server';

const CSV = `First Name,Last Name,URL,Email Address,Company,Position,Connected On
Maya,Chen,https://www.linkedin.com/in/maya-chen,,Palantir,Deployment Strategist,03 Feb 2025
Sam,Rivera,https://www.linkedin.com/in/sam-rivera,sam@palantir.example,Palantir,Engineer,16 Nov 2026
`;

async function gzip(value: unknown): Promise<Blob> {
	const json = new Blob([JSON.stringify(value)]);
	return new Response(json.stream().pipeThrough(new CompressionStream('gzip'))).blob();
}

async function post(form: FormData) {
	const request = new Request('https://build-os.com/api/knowledge/import', {
		method: 'POST',
		body: form
	});
	const locals = { safeGetSession: async () => ({ user: { id: 'u1' } }) };
	const response = await POST({ request, locals } as any);
	return { status: response.status, body: await response.json() };
}

describe('POST /api/knowledge/import', () => {
	it('reads contacts the browser parsed and gzipped', async () => {
		const form = new FormData();
		form.set('contacts', await gzip(parseContactFile('Connections.csv', CSV)), 'c.json.gz');
		form.set('file_name', 'Connections.csv');
		form.set('preview', '1');
		const { status, body } = await post(form);
		expect(status).toBe(200);
		expect(body.data).toMatchObject({
			preview: true,
			format_label: 'LinkedIn connections',
			contacts: 2,
			with_email: 1,
			with_company: 2
		});
	});

	it('passes normalized LinkedIn rows to the caller-scoped database and returns its receipt', async () => {
		const rpc = vi.fn().mockResolvedValue({
			data: {
				people_created: 1,
				people_matched: 1,
				possible_duplicates: 1,
				org_ids: ['o1'],
				facts_added: 7,
				facts_existing: 2
			},
			error: null
		});
		const history = {
			insert: vi.fn().mockReturnThis(),
			select: vi.fn().mockReturnThis(),
			single: vi.fn().mockResolvedValue({ data: { id: 'run-1' } }),
			update: vi.fn().mockReturnThis(),
			eq: vi.fn().mockResolvedValue({ error: null })
		};
		vi.mocked(knowledgeDb)
			.mockReturnValueOnce({ rpc, from: vi.fn() })
			.mockReturnValueOnce({ from: () => history, rpc: vi.fn() });
		const form = new FormData();
		form.set('file', new File([CSV], 'Connections.csv'));
		const { status, body } = await post(form);
		expect(status).toBe(200);
		expect(rpc).toHaveBeenCalledWith('knowledge_import_linkedin', {
			p_file_name: 'Connections.csv',
			p_run_id: 'run-1',
			p_rows: [
				{
					name: 'Maya Chen',
					given_name: 'Maya',
					linkedin_key: 'in/maya-chen',
					profile_url: 'https://linkedin.com/in/maya-chen',
					email: null,
					company: 'Palantir',
					title: 'Deployment Strategist',
					connected_on: '2025-02-03'
				},
				{
					name: 'Sam Rivera',
					given_name: 'Sam',
					linkedin_key: 'in/sam-rivera',
					profile_url: 'https://linkedin.com/in/sam-rivera',
					email: 'sam@palantir.example',
					company: 'Palantir',
					title: 'Engineer',
					connected_on: '2026-11-16'
				}
			]
		});
		expect(body.data).toMatchObject({
			contacts: 2,
			people_created: 1,
			people_matched: 1,
			possible_duplicates: 1,
			orgs: 1,
			org_ids: ['o1'],
			facts_added: 7,
			facts_existing: 2
		});
	});

	it('refuses a contacts upload that is not gzipped contact JSON', async () => {
		const form = new FormData();
		form.set('contacts', new Blob(['not gzip']), 'c.json.gz');
		form.set('preview', '1');
		const { status } = await post(form);
		expect(status).toBe(400);
	});
});
