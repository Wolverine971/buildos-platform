// apps/web/src/routes/api/agent/v2/transport/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER_ID = 'd1000000-0000-4000-8000-000000000001';
const SESSION_ID = 'd2000000-0000-4000-8000-000000000001';
const DECISION_ID = 'd4000000-0000-4000-8000-000000000001';

const mocks = vi.hoisted(() => ({
	env: {
		AGENTIC_CHAT_TRANSPORT_LEASE_SECRET:
			'route-agentic-chat-transport-secret-at-least-32-bytes',
		AGENTIC_CHAT_WORKER_KILL_EPOCH: '0',
		AGENTIC_CHAT_WORKER_ROUTING_ENABLED: 'false'
	},
	createAdminSupabaseClient: vi.fn(),
	resolveExistingAgenticChatTransportDecision: vi.fn(),
	selectAgenticChatNewTransport: vi.fn()
}));

vi.mock('$env/dynamic/private', () => ({ env: mocks.env }));
vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: mocks.createAdminSupabaseClient
}));
vi.mock('$lib/services/agentic-chat-v2/transport-decision.server', async (importOriginal) => {
	const original =
		await importOriginal<
			typeof import('$lib/services/agentic-chat-v2/transport-decision.server')
		>();
	return {
		...original,
		resolveExistingAgenticChatTransportDecision:
			mocks.resolveExistingAgenticChatTransportDecision
	};
});
vi.mock('$lib/services/agentic-chat-v2/worker-transport-routing.server', async (importOriginal) => {
	const original =
		await importOriginal<
			typeof import('$lib/services/agentic-chat-v2/worker-transport-routing.server')
		>();
	return {
		...original,
		selectAgenticChatNewTransport: mocks.selectAgenticChatNewTransport
	};
});

import { AgenticChatTransportDecisionError } from '$lib/services/agentic-chat-v2/transport-decision.server';
import { AgenticChatWorkerUnavailableError } from '$lib/services/agentic-chat-v2/worker-transport-routing.server';
import { POST } from './+server';

function body(overrides: Record<string, unknown> = {}) {
	return {
		clientTurnId: 'client-turn-1',
		streamRunId: 'stream-run-1',
		sessionId: SESSION_ID,
		context: { type: 'global', entityId: null, projectId: null },
		supportedModes: ['legacy_sse', 'worker_realtime'],
		supportedContractVersions: ['legacy_internal_v1', 'agentic_chat_worker_v1'],
		priorDecisionId: null,
		...overrides
	};
}

function event(options: { userId?: string | null; body?: unknown } = {}) {
	return {
		request: new Request('http://localhost/api/agent/v2/transport', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(options.body ?? body())
		}),
		locals: {
			safeGetSession: vi.fn(async () => ({
				user: options.userId === null ? null : { id: options.userId ?? USER_ID }
			}))
		}
	};
}

describe('POST /api/agent/v2/transport', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.env.AGENTIC_CHAT_TRANSPORT_LEASE_SECRET =
			'route-agentic-chat-transport-secret-at-least-32-bytes';
		mocks.env.AGENTIC_CHAT_WORKER_KILL_EPOCH = '0';
		mocks.env.AGENTIC_CHAT_WORKER_ROUTING_ENABLED = 'false';
		mocks.createAdminSupabaseClient.mockReturnValue({ from: vi.fn() });
		mocks.resolveExistingAgenticChatTransportDecision.mockResolvedValue(null);
		mocks.selectAgenticChatNewTransport.mockResolvedValue({
			mode: 'legacy_sse',
			contractVersion: 'legacy_internal_v1'
		});
	});

	it('requires authentication before parsing or creating a service client', async () => {
		const response = await POST(event({ userId: null }) as never);
		expect(response.status).toBe(401);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		expect(mocks.createAdminSupabaseClient).not.toHaveBeenCalled();
	});

	it('rejects malformed and capability-duplicate bodies', async () => {
		for (const invalid of [
			body({ clientTurnId: ' padded ' }),
			body({ sessionId: 'not-a-uuid' }),
			body({ supportedModes: ['legacy_sse', 'legacy_sse'] }),
			body({ extra: true })
		]) {
			expect((await POST(event({ body: invalid }) as never)).status).toBe(422);
		}
		expect(mocks.resolveExistingAgenticChatTransportDecision).not.toHaveBeenCalled();
	});

	it('issues a private policy-selected lease for a genuinely new decision', async () => {
		const response = await POST(event() as never);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		expect(response.headers.get('vary')).toBe('Authorization');
		expect(payload.data).toMatchObject({
			mode: 'legacy_sse',
			contractVersion: 'legacy_internal_v1'
		});
		expect(payload.data.decisionId).toMatch(/^[0-9a-f-]{36}$/);
		expect(payload.data.token).toMatch(/^actl1\./);
		expect(mocks.resolveExistingAgenticChatTransportDecision).toHaveBeenCalledWith({
			client: expect.any(Object),
			userId: USER_ID,
			request: body()
		});
		expect(mocks.selectAgenticChatNewTransport).toHaveBeenCalledWith({
			supportedModes: body().supportedModes,
			supportedContractVersions: body().supportedContractVersions,
			environment: mocks.env
		});
	});

	it('can issue a new worker lease only when server routing policy selects it', async () => {
		mocks.selectAgenticChatNewTransport.mockResolvedValueOnce({
			mode: 'worker_realtime',
			contractVersion: 'agentic_chat_worker_v1'
		});
		const response = await POST(event() as never);
		const payload = await response.json();
		expect(response.status).toBe(200);
		expect(payload.data).toMatchObject({
			mode: 'worker_realtime',
			contractVersion: 'agentic_chat_worker_v1'
		});
	});

	it('returns retryable worker-unavailable without issuing a legacy lease', async () => {
		mocks.selectAgenticChatNewTransport.mockRejectedValueOnce(
			new AgenticChatWorkerUnavailableError('queue_pressure', 2)
		);
		const response = await POST(event() as never);
		const payload = await response.json();

		expect(response.status).toBe(503);
		expect(response.headers.get('retry-after')).toBe('2');
		expect(payload.code).toBe('WORKER_UNAVAILABLE');
		expect(payload).not.toHaveProperty('data.mode');
	});

	it('treats an unproven prior decision id only as a lookup hint', async () => {
		const response = await POST(
			event({ body: body({ priorDecisionId: DECISION_ID }) }) as never
		);
		const payload = await response.json();
		expect(response.status).toBe(200);
		expect(payload.data.decisionId).not.toBe(DECISION_ID);
		expect(payload.data.decisionId).toMatch(/^[0-9a-f-]{36}$/);
	});

	it('cannot be client-forced into a new worker lease', async () => {
		const response = await POST(
			event({
				body: body({
					supportedModes: ['worker_realtime'],
					supportedContractVersions: ['agentic_chat_worker_v1']
				})
			}) as never
		);
		const payload = await response.json();
		expect(response.status).toBe(409);
		expect(payload.code).toBe('TRANSPORT_INCOMPATIBLE');
	});

	it('reissues an existing turn only in its persisted immutable mode', async () => {
		mocks.resolveExistingAgenticChatTransportDecision.mockResolvedValueOnce({
			turnRunId: 'd3000000-0000-4000-8000-000000000001',
			sessionId: SESSION_ID,
			mode: 'worker_realtime',
			contractVersion: 'agentic_chat_worker_v1',
			decisionId: DECISION_ID
		});
		const response = await POST(event() as never);
		const payload = await response.json();
		expect(payload.data).toMatchObject({
			mode: 'worker_realtime',
			contractVersion: 'agentic_chat_worker_v1',
			decisionId: DECISION_ID
		});
		expect(mocks.selectAgenticChatNewTransport).not.toHaveBeenCalled();
	});

	it('maps binding conflicts distinctly and keeps internal failures private', async () => {
		mocks.resolveExistingAgenticChatTransportDecision.mockRejectedValueOnce(
			new AgenticChatTransportDecisionError('binding_mismatch', 'private mismatch detail')
		);
		let response = await POST(event() as never);
		let payload = await response.json();
		expect(response.status).toBe(409);
		expect(payload.code).toBe('TRANSPORT_CONFLICT');
		expect(JSON.stringify(payload)).not.toContain('private mismatch detail');

		mocks.env.AGENTIC_CHAT_TRANSPORT_LEASE_SECRET = 'short';
		response = await POST(event() as never);
		payload = await response.json();
		expect(response.status).toBe(503);
		expect(response.headers.get('retry-after')).toBeNull();
		expect(payload.code).toBe('TRANSPORT_UNAVAILABLE');
		expect(JSON.stringify(payload)).not.toContain('too short');
	});

	it('keeps legacy reachable when routing is off and the decision lookup fails', async () => {
		mocks.resolveExistingAgenticChatTransportDecision.mockRejectedValueOnce(
			new Error('temporary database outage')
		);
		const response = await POST(event() as never);
		const payload = await response.json();

		expect(response.status).toBe(503);
		expect(payload.code).toBe('TRANSPORT_UNAVAILABLE');
		expect(payload.message).not.toContain('database outage');
	});

	it('keeps worker-selected failures strict when routing is enabled', async () => {
		mocks.env.AGENTIC_CHAT_WORKER_ROUTING_ENABLED = 'true';
		mocks.resolveExistingAgenticChatTransportDecision.mockRejectedValueOnce(
			new Error('temporary database outage')
		);
		const response = await POST(event() as never);
		expect((await response.json()).code).toBe('WORKER_UNAVAILABLE');
	});
});
