// apps/web/src/routes/api/knowledge/connections/server.test.ts
//
// POST /api/knowledge/connections (tasker 166).
//   failure                                              trigger
//   someone signed out reads a contact book              no session
//   an unknown body key reaches the database             filters carrying extra keys
//   a database without the function breaks the page      PGRST202 from the RPC
//   a thin answer arrives without saying what's missing  a place filter over unplaced people
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('$lib/server/knowledge/knowledge.server', () => ({
	knowledgeDb: () => ({ from: vi.fn(), rpc })
}));

import { POST } from './+server';

const USER = '11111111-1111-4111-8111-111111111111';
const ORG = '44444444-4444-4444-8444-444444444444';

async function post(body: unknown, user: { id: string } | null = { id: USER }) {
	const request = new Request('https://build-os.com/api/knowledge/connections', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: typeof body === 'string' ? body : JSON.stringify(body)
	});
	const locals = { safeGetSession: async () => ({ user }), supabase: {} };
	const response = await POST({ request, locals } as any);
	return { status: response.status, body: await response.json() };
}

beforeEach(() => {
	rpc.mockReset();
	rpc.mockResolvedValue({
		data: {
			people: [],
			total: 0,
			facets: {},
			coverage: {
				people: 767,
				known: 767,
				with_company: 767,
				with_title: 760,
				with_place: 14,
				with_industry: 9,
				companies: 631,
				companies_with_place: 6,
				companies_with_industry: 5
			},
			gaps: {
				companies_without_place: [{ id: ORG, name: 'Curri', people: 52 }],
				companies_without_industry: []
			}
		},
		error: null
	});
});

describe('POST /api/knowledge/connections', () => {
	it('needs a session', async () => {
		const { status } = await post({ filters: {} }, null);
		expect(status).toBe(401);
		expect(rpc).not.toHaveBeenCalled();
	});

	it('asks as the signed-in user, passes only known filters, and says what is missing', async () => {
		const { status, body } = await post({
			filters: { scope: 'known', place: ['Maryland'], viewer: 'someone-else', sql: 'x' },
			facets: ['company', 'mood'],
			limit: 40,
			facet_limit: 10
		});
		expect(status).toBe(200);
		expect(rpc).toHaveBeenCalledWith('knowledge_connections', {
			p_filters: { scope: 'known', place: ['Maryland'] },
			p_facets: ['company'],
			p_limit: 40,
			p_offset: 0,
			p_facet_limit: 10,
			p_viewer: USER
		});
		expect(body.data.notes).toEqual([
			{
				about: 'place',
				text: "A location (their own or their employer's) is known for 14 of 767 people; the other 753 can't be placed yet.",
				research: [{ id: ORG, name: 'Curri', people: 52 }]
			}
		]);
	});

	it.each([
		['a body that is not JSON', 'not json'],
		['filters that are not an object', { filters: ['Maryland'] }],
		['facets that are not a list', { facets: 'company' }],
		['a filter id that is not a UUID', { filters: { related_to: 'sam' } }]
	])('refuses %s', async (_label, body) => {
		const { status } = await post(body);
		expect(status).toBe(400);
		expect(rpc).not.toHaveBeenCalled();
	});

	it('answers "not switched on" when the database has no such function yet', async () => {
		rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'no function' } });
		const { status, body } = await post({ filters: {} });
		expect(status).toBe(200);
		expect(body.data).toEqual({ unavailable: true });
	});
});
