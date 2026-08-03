// apps/web/src/routes/api/agent/v2/turns/[id]/cancel/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const TURN_ID = 'd3000000-0000-4000-8000-000000000001';
const USER_ID = 'd1000000-0000-4000-8000-000000000001';

const mocks = vi.hoisted(() => ({
	createAdminSupabaseClient: vi.fn(),
	requestOwnedAgenticChatWorkerTurnCancellation: vi.fn()
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: mocks.createAdminSupabaseClient
}));
vi.mock('$lib/services/agentic-chat-v2/worker-turn-gateway.server', async (importOriginal) => {
	const original =
		await importOriginal<
			typeof import('$lib/services/agentic-chat-v2/worker-turn-gateway.server')
		>();
	return {
		...original,
		requestOwnedAgenticChatWorkerTurnCancellation:
			mocks.requestOwnedAgenticChatWorkerTurnCancellation
	};
});

import { AgenticChatWorkerTurnGatewayError } from '$lib/services/agentic-chat-v2/worker-turn-gateway.server';
import { POST } from './+server';

function event(options: { userId?: string | null; turnId?: string; body?: unknown } = {}) {
	return {
		request: new Request(`http://localhost/api/agent/v2/turns/${TURN_ID}/cancel`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(options.body ?? { reason: 'user_cancelled' })
		}),
		params: { id: options.turnId ?? TURN_ID },
		locals: {
			safeGetSession: vi.fn(async () => ({
				user: options.userId === null ? null : { id: options.userId ?? USER_ID }
			}))
		}
	};
}

describe('POST /api/agent/v2/turns/[id]/cancel', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.createAdminSupabaseClient.mockReturnValue({ rpc: vi.fn() });
		mocks.requestOwnedAgenticChatWorkerTurnCancellation.mockResolvedValue({
			outcome: 'cancel_requested'
		});
	});

	it('authenticates and validates turn identity before creating a service client', async () => {
		expect((await POST(event({ userId: null }) as never)).status).toBe(401);
		expect((await POST(event({ turnId: 'bad' }) as never)).status).toBe(400);
		expect(mocks.createAdminSupabaseClient).not.toHaveBeenCalled();
	});

	it('allows only strict browser cancellation reasons', async () => {
		for (const body of [
			{ reason: 'timeout' },
			{ reason: 'user_cancelled', source: 'operator' },
			{}
		]) {
			expect((await POST(event({ body }) as never)).status).toBe(422);
		}
		expect(mocks.requestOwnedAgenticChatWorkerTurnCancellation).not.toHaveBeenCalled();
	});

	it('derives user and source server-side and returns a private receipt', async () => {
		const response = await POST(event({ body: { reason: 'superseded' } }) as never);
		const body = await response.json();
		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		expect(response.headers.get('vary')).toBe('Authorization');
		expect(body.data).toEqual({ outcome: 'cancel_requested' });
		expect(mocks.requestOwnedAgenticChatWorkerTurnCancellation).toHaveBeenCalledWith({
			client: expect.any(Object),
			userId: USER_ID,
			turnRunId: TURN_ID,
			reason: 'superseded'
		});
	});

	it('hides ownership and internal error detail', async () => {
		mocks.requestOwnedAgenticChatWorkerTurnCancellation.mockRejectedValueOnce(
			new AgenticChatWorkerTurnGatewayError('not_found', 'foreign-owned private detail')
		);
		expect((await POST(event() as never)).status).toBe(404);

		mocks.requestOwnedAgenticChatWorkerTurnCancellation.mockRejectedValueOnce(
			new AgenticChatWorkerTurnGatewayError('database_error', 'private database detail')
		);
		const response = await POST(event() as never);
		const body = await response.json();
		expect(response.status).toBe(503);
		expect(JSON.stringify(body)).not.toContain('private database detail');
	});
});
