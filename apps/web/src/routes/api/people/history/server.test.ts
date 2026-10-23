// apps/web/src/routes/api/people/history/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from './$types';

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: () => ({ rpc: rpcMock })
}));

import { GET } from './+server';

beforeEach(() => {
	rpcMock.mockReset();
});

function createEvent(query = '', user: unknown = { id: 'user-1' }): RequestEvent {
	return {
		url: new URL(`http://localhost/api/people/history${query}`),
		locals: {
			supabase: { rpc: vi.fn() },
			safeGetSession: vi.fn().mockResolvedValue({ user })
		}
	} as unknown as RequestEvent;
}

describe('GET /api/people/history', () => {
	it('requires a session and never reads without one', async () => {
		expect((await GET(createEvent('', null))).status).toBe(401);
		expect(rpcMock).not.toHaveBeenCalled();
	});

	it('rejects a bad query before reading', async () => {
		expect((await GET(createEvent('?limit=0'))).status).toBe(400);
		expect((await GET(createEvent('?project_id=nope'))).status).toBe(400);
		expect(rpcMock).not.toHaveBeenCalled();
	});

	it('reads for the session user only and returns sentences', async () => {
		rpcMock.mockResolvedValue({
			data: {
				events: [
					{
						id: 'e1',
						occurred_at: '2026-04-29T12:00:00Z',
						project_id: 'p1',
						project_name: 'Cadre',
						kind: 'agents_changed',
						via: null,
						by_actor_id: 'a-dj',
						by_name: 'DJ Wayne',
						by_is_you: true,
						subject_actor_id: 'a-ian',
						subject_name: 'Ian Miner',
						subject_is_you: false,
						subject_label: null,
						before: { agent_access: 'write' },
						after: { agent_access: 'read' }
					}
				],
				next_before: '2026-04-29T12:00:00Z',
				next_before_id: 'e1'
			},
			error: null
		});

		const response = await GET(
			createEvent(
				'?limit=1&before=2026-10-01T00:00:00Z&before_id=05087b15-f725-4e83-860b-10e14e736e67'
			)
		);
		expect(response.status).toBe(200);
		expect(rpcMock).toHaveBeenCalledWith('list_project_access_events', {
			p_user_id: 'user-1',
			p_limit: 1,
			p_before: '2026-10-01T00:00:00Z',
			p_before_id: '05087b15-f725-4e83-860b-10e14e736e67'
		});
		const payload = await response.json();
		expect(payload.data).toEqual({
			events: [
				{
					id: 'e1',
					occurred_at: '2026-04-29T12:00:00Z',
					project_id: 'p1',
					project_name: 'Cadre',
					kind: 'agents_changed',
					text: 'You set Ian Miner’s agents to Read on Cadre.',
					by_you: true
				}
			],
			next_before: '2026-04-29T12:00:00Z',
			next_before_id: 'e1'
		});
	});

	it('maps RPC errors', async () => {
		rpcMock.mockResolvedValue({
			data: null,
			error: { code: '22023', message: 'p_user_id is required' }
		});
		expect((await GET(createEvent())).status).toBe(400);
	});
});
