// apps/web/src/routes/api/agent/v2/turns/[id]/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const TURN_ID = 'd3000000-0000-4000-8000-000000000001';
const USER_ID = 'd1000000-0000-4000-8000-000000000001';

const mocks = vi.hoisted(() => ({
	createAdminSupabaseClient: vi.fn(),
	getOwnedAgenticChatWorkerTurn: vi.fn()
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: mocks.createAdminSupabaseClient
}));
vi.mock('$lib/services/agentic-chat-v2/worker-turn-gateway.server', () => ({
	getOwnedAgenticChatWorkerTurn: mocks.getOwnedAgenticChatWorkerTurn
}));

import { GET } from './+server';

function event(options: { userId?: string | null; turnId?: string } = {}) {
	return {
		params: { id: options.turnId ?? TURN_ID },
		locals: {
			safeGetSession: vi.fn(async () => ({
				user: options.userId === null ? null : { id: options.userId ?? USER_ID }
			}))
		}
	};
}

describe('GET /api/agent/v2/turns/[id]', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.createAdminSupabaseClient.mockReturnValue({ from: vi.fn() });
		mocks.getOwnedAgenticChatWorkerTurn.mockResolvedValue({ status: 'running' });
	});

	it('authenticates and validates identity before creating a service client', async () => {
		expect((await GET(event({ userId: null }) as never)).status).toBe(401);
		expect((await GET(event({ turnId: 'bad' }) as never)).status).toBe(400);
		expect(mocks.createAdminSupabaseClient).not.toHaveBeenCalled();
	});

	it('derives ownership from auth and returns a private descriptor', async () => {
		const response = await GET(event() as never);
		const body = await response.json();
		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		expect(response.headers.get('vary')).toBe('Authorization');
		expect(body.data).toEqual({ status: 'running' });
		expect(mocks.getOwnedAgenticChatWorkerTurn).toHaveBeenCalledWith({
			client: expect.any(Object),
			userId: USER_ID,
			turnRunId: TURN_ID
		});
	});

	it('shares one not-found boundary and hides internal failures', async () => {
		mocks.getOwnedAgenticChatWorkerTurn.mockResolvedValueOnce(null);
		expect((await GET(event() as never)).status).toBe(404);

		mocks.getOwnedAgenticChatWorkerTurn.mockRejectedValueOnce(
			new Error('private database detail')
		);
		const response = await GET(event() as never);
		const body = await response.json();
		expect(response.status).toBe(503);
		expect(JSON.stringify(body)).not.toContain('private database detail');
	});
});
