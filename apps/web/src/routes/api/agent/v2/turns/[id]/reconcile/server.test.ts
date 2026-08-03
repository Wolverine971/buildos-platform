// apps/web/src/routes/api/agent/v2/turns/[id]/reconcile/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const TURN_ID = 'd4000000-0000-4000-8000-000000000001';
const USER_ID = 'd1000000-0000-4000-8000-000000000001';

const mocks = vi.hoisted(() => ({
	createAdminSupabaseClient: vi.fn(),
	reconcileAgenticChatTurn: vi.fn()
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: mocks.createAdminSupabaseClient
}));
vi.mock('$lib/services/agentic-chat-v2/reconciliation.server', async (importOriginal) => {
	const original =
		await importOriginal<
			typeof import('$lib/services/agentic-chat-v2/reconciliation.server')
		>();
	return {
		...original,
		reconcileAgenticChatTurn: mocks.reconcileAgenticChatTurn
	};
});

import { AgenticChatReconciliationRpcError } from '$lib/services/agentic-chat-v2/reconciliation.server';
import { GET } from './+server';

function requestEvent(
	options: {
		user?: { id: string } | null;
		turnId?: string;
		query?: string;
	} = {}
) {
	return {
		params: { id: options.turnId ?? TURN_ID },
		url: new URL(
			`http://localhost/api/agent/v2/turns/${TURN_ID}/reconcile${options.query ?? ''}`
		),
		locals: {
			safeGetSession: vi.fn(async () => ({
				user: options.user === undefined ? { id: USER_ID } : options.user
			}))
		}
	};
}

describe('GET /api/agent/v2/turns/[id]/reconcile', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.createAdminSupabaseClient.mockReturnValue({ rpc: vi.fn() });
		mocks.reconcileAgenticChatTurn.mockResolvedValue({
			outcome: 'reconciled',
			turn_run_id: TURN_ID
		});
	});

	it('requires authentication before creating a service client', async () => {
		const response = await GET(requestEvent({ user: null }) as never);

		expect(response.status).toBe(401);
		expect(mocks.createAdminSupabaseClient).not.toHaveBeenCalled();
	});

	it('rejects malformed and ambiguous cursors before calling the RPC', async () => {
		for (const event of [
			requestEvent({ turnId: 'not-a-uuid' }),
			requestEvent({ query: '?after=1' }),
			requestEvent({ query: '?generation=-1' }),
			requestEvent({ query: '?generation=1&generation=2' }),
			requestEvent({ query: '?generation=1&after=1&after=2' })
		]) {
			const response = await GET(event as never);
			expect(response.status).toBe(400);
		}
		expect(mocks.reconcileAgenticChatTurn).not.toHaveBeenCalled();
	});

	it('derives ownership from auth and returns a private no-store snapshot', async () => {
		const response = await GET(requestEvent({ query: '?generation=2&after=3' }) as never);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		expect(response.headers.get('vary')).toBe('Authorization');
		expect(body.data.outcome).toBe('reconciled');
		expect(mocks.reconcileAgenticChatTurn).toHaveBeenCalledWith({
			client: expect.any(Object),
			turnRunId: TURN_ID,
			userId: USER_ID,
			requestedExecutionGeneration: 2,
			afterDurableSequence: 3
		});
	});

	it('does not distinguish an absent turn from a foreign-owned turn', async () => {
		mocks.reconcileAgenticChatTurn.mockResolvedValueOnce({
			outcome: 'not_found',
			turn_run_id: TURN_ID
		});

		const response = await GET(requestEvent() as never);
		expect(response.status).toBe(404);
	});

	it('rejects legacy transport and keeps database failures private', async () => {
		mocks.reconcileAgenticChatTurn.mockResolvedValueOnce({
			outcome: 'not_worker_turn',
			turn_run_id: TURN_ID,
			execution_mode: 'legacy_sse',
			status: 'running'
		});
		expect((await GET(requestEvent() as never)).status).toBe(409);

		mocks.reconcileAgenticChatTurn.mockRejectedValueOnce(
			new AgenticChatReconciliationRpcError('P0001', 'internal corruption detail')
		);
		const response = await GET(requestEvent() as never);
		const body = await response.json();
		expect(response.status).toBe(503);
		expect(JSON.stringify(body)).not.toContain('internal corruption detail');
	});

	it('maps a durable cursor-ahead rejection to a retryable client conflict', async () => {
		mocks.reconcileAgenticChatTurn.mockRejectedValueOnce(
			new AgenticChatReconciliationRpcError('P0001', 'agentic_chat_reconcile_cursor_ahead')
		);

		const response = await GET(requestEvent({ query: '?generation=2&after=9' }) as never);
		expect(response.status).toBe(409);
	});
});
