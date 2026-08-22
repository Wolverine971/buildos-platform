// apps/web/src/lib/services/agentic-chat-v2/worker-realtime-coordinator.test.ts
import {
	AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
	type AgentStreamEventV1,
	type TurnHandleV1
} from '@buildos/shared-types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	AgenticChatReconciliationTimeoutError,
	AgenticChatWorkerRealtimeCoordinator
} from './worker-realtime-coordinator';

const USER_ID = 'd1000000-0000-4000-8000-000000000001';
const SESSION_ID = 'd2000000-0000-4000-8000-000000000001';
const TURN_ID = 'd4000000-0000-4000-8000-000000000001';
const STREAM_ID = 'worker-stream-1';
const CLIENT_ID = 'worker-client-1';

const handle: Extract<TurnHandleV1, { executionMode: 'worker_realtime' }> = {
	contractVersion: AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
	executionMode: 'worker_realtime',
	turnRunId: TURN_ID,
	sessionId: SESSION_ID,
	streamRunId: STREAM_ID,
	clientTurnId: CLIENT_ID
};

function receipt(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		outcome: 'reconciled',
		contract_version: AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
		turn_run_id: TURN_ID,
		session_id: SESSION_ID,
		user_id: USER_ID,
		stream_run_id: STREAM_ID,
		client_turn_id: CLIENT_ID,
		execution_mode: 'worker_realtime',
		requested_execution_generation: 0,
		execution_generation: 0,
		generation_changed: false,
		status: 'queued',
		text: '',
		projection: {},
		snapshot_sequence: 0,
		durable_through_sequence: 0,
		projection_durable_sequence: 0,
		durable_events: [],
		response_watermark: 0,
		reconcile_required: false,
		assistant_message: null,
		terminal_event_id: null,
		terminalized_at: null,
		finished_reason: null,
		failure_code: null,
		updated_at: '2026-08-02T23:00:00.000Z',
		...overrides
	};
}

function apiResponse(data: unknown): Response {
	return {
		ok: true,
		status: 200,
		json: async () => ({ success: true, data })
	} as Response;
}

function applicationObserver() {
	return {
		applyLiveEvent: vi.fn<(event: AgentStreamEventV1) => void>(),
		applyReconciliation: vi.fn()
	};
}

async function flushAsync(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
}

afterEach(() => {
	vi.useRealTimers();
});

describe('AgenticChatWorkerRealtimeCoordinator', () => {
	it('calls the exact authenticated cursor endpoint and applies its private envelope', async () => {
		const fetchImpl = vi.fn(async () => apiResponse(receipt()));
		const observer = applicationObserver();
		const coordinator = new AgenticChatWorkerRealtimeCoordinator({
			fetchImpl: fetchImpl as typeof fetch,
			random: () => 0.5
		});
		coordinator.start();
		const unregister = coordinator.registerTurn({ handle, observer });
		await vi.waitFor(() => expect(observer.applyReconciliation).toHaveBeenCalledOnce());

		expect(fetchImpl).toHaveBeenCalledWith(
			`/api/agent/v2/turns/${TURN_ID}/reconcile?generation=0&after=0&reason=initial`,
			expect.objectContaining({
				method: 'GET',
				credentials: 'same-origin',
				cache: 'no-store',
				signal: expect.any(AbortSignal)
			})
		);
		expect(coordinator.inbox.getSnapshot(TURN_ID)).toMatchObject({
			buffering: false,
			reconciliationRequested: false,
			executionGeneration: 0,
			lastAppliedSequence: 0
		});
		unregister();
		coordinator.stop();
	});

	it('coalesces concurrent reasons behind one in-flight request', async () => {
		let resolveFetch!: (response: Response) => void;
		const fetchImpl = vi.fn(() => new Promise<Response>((resolve) => (resolveFetch = resolve)));
		const coordinator = new AgenticChatWorkerRealtimeCoordinator({
			fetchImpl: fetchImpl as typeof fetch
		});
		coordinator.start();
		coordinator.registerTurn({ handle, observer: applicationObserver() });
		await flushAsync();

		coordinator.requestAll('watchdog');
		coordinator.inbox.notifyChannelUnavailable();
		coordinator.inbox.notifyChannelReconnected();
		expect(fetchImpl).toHaveBeenCalledOnce();

		resolveFetch(apiResponse(receipt()));
		await flushAsync();
		expect(fetchImpl).toHaveBeenCalledOnce();
		coordinator.stop();
	});

	it('keeps triggers queued during reconciliation behind the changed-state cadence', async () => {
		vi.useFakeTimers();
		const fetchImpl = vi.fn(async () => apiResponse(receipt()));
		let coordinator!: AgenticChatWorkerRealtimeCoordinator;
		const observer = applicationObserver();
		observer.applyReconciliation.mockImplementation(() => {
			coordinator.requestAll('watchdog');
			coordinator.inbox.notifyChannelUnavailable();
		});
		coordinator = new AgenticChatWorkerRealtimeCoordinator({
			fetchImpl: fetchImpl as typeof fetch,
			changedWatchdogMs: 2_000,
			random: () => 0.5
		});
		coordinator.start();
		coordinator.registerTurn({ handle, observer });
		await flushAsync();

		expect(fetchImpl).toHaveBeenCalledOnce();
		await vi.advanceTimersByTimeAsync(1_999);
		expect(fetchImpl).toHaveBeenCalledOnce();
		await vi.advanceTimersByTimeAsync(1);
		await flushAsync();
		expect(fetchImpl).toHaveBeenCalledTimes(2);
		coordinator.stop();
	});

	it('releases the inbox latch and retries failed requests on one bounded timer', async () => {
		vi.useFakeTimers();
		const errors: unknown[] = [];
		const fetchImpl = vi
			.fn()
			.mockRejectedValueOnce(new TypeError('offline'))
			.mockResolvedValueOnce(apiResponse(receipt()));
		const observer = applicationObserver();
		const coordinator = new AgenticChatWorkerRealtimeCoordinator({
			fetchImpl: fetchImpl as typeof fetch,
			retryMs: 5_000,
			onError: (error) => errors.push(error)
		});
		coordinator.start();
		coordinator.registerTurn({ handle, observer });
		await flushAsync();

		expect(errors).toHaveLength(1);
		expect(coordinator.inbox.getSnapshot(TURN_ID)).toMatchObject({
			buffering: true,
			reconciliationRequested: false
		});
		coordinator.requestAll('watchdog');
		coordinator.inbox.notifyChannelUnavailable();
		expect(fetchImpl).toHaveBeenCalledOnce();
		await vi.advanceTimersByTimeAsync(4_999);
		expect(fetchImpl).toHaveBeenCalledOnce();
		await vi.advanceTimersByTimeAsync(1);
		await flushAsync();
		expect(fetchImpl).toHaveBeenCalledTimes(2);
		expect(observer.applyReconciliation).toHaveBeenCalledOnce();
		coordinator.stop();
	});

	it('times out a stuck reconciliation request, then retries to terminal truth', async () => {
		vi.useFakeTimers();
		const errors: unknown[] = [];
		const terminalReceipt = receipt({
			requested_execution_generation: 0,
			execution_generation: 1,
			generation_changed: true,
			status: 'completed',
			snapshot_sequence: 1,
			durable_through_sequence: 1,
			projection_durable_sequence: 1,
			response_watermark: 1,
			assistant_message: {
				id: 'd6000000-0000-4000-8000-000000000003',
				role: 'assistant',
				content: 'recovered after a stuck request',
				metadata: { turn_run_id: TURN_ID, execution_generation: 1 },
				prompt_tokens: null,
				completion_tokens: null,
				total_tokens: null,
				created_at: '2026-08-02T23:00:02.000Z'
			},
			terminal_event_id: `${TURN_ID}:1:1`,
			terminalized_at: '2026-08-02T23:00:02.000Z',
			updated_at: '2026-08-02T23:00:02.000Z'
		});
		const fetchImpl = vi
			.fn()
			.mockImplementationOnce((_input: RequestInfo | URL, init?: RequestInit) => {
				return new Promise<Response>((_resolve, reject) => {
					(init?.signal as AbortSignal | undefined)?.addEventListener(
						'abort',
						() => reject(new DOMException('Aborted', 'AbortError')),
						{ once: true }
					);
				});
			})
			.mockResolvedValueOnce(apiResponse(terminalReceipt));
		const observer = applicationObserver();
		const coordinator = new AgenticChatWorkerRealtimeCoordinator({
			fetchImpl: fetchImpl as typeof fetch,
			requestTimeoutMs: 100,
			retryMs: 50,
			onError: (error) => errors.push(error)
		});
		coordinator.start();
		coordinator.registerTurn({ handle, observer });
		await flushAsync();

		expect(fetchImpl).toHaveBeenCalledOnce();
		await vi.advanceTimersByTimeAsync(100);
		await flushAsync();
		expect(errors[0]).toBeInstanceOf(AgenticChatReconciliationTimeoutError);
		expect(coordinator.inbox.getSnapshot(TURN_ID)).toMatchObject({
			buffering: true,
			reconciliationRequested: false
		});

		await vi.advanceTimersByTimeAsync(50);
		await flushAsync();
		expect(fetchImpl).toHaveBeenCalledTimes(2);
		expect(observer.applyReconciliation).toHaveBeenLastCalledWith(
			expect.objectContaining({ status: 'completed' })
		);

		await vi.advanceTimersByTimeAsync(30_000);
		expect(fetchImpl).toHaveBeenCalledTimes(2);
		coordinator.stop();
	});

	it('backs off an invalid receipt instead of immediately retrying a protocol failure', async () => {
		vi.useFakeTimers();
		const errors: unknown[] = [];
		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(apiResponse({ outcome: 'reconciled' }))
			.mockResolvedValueOnce(apiResponse(receipt()));
		const observer = applicationObserver();
		const coordinator = new AgenticChatWorkerRealtimeCoordinator({
			fetchImpl: fetchImpl as typeof fetch,
			retryMs: 5_000,
			onError: (error) => errors.push(error)
		});
		coordinator.start();
		coordinator.registerTurn({ handle, observer });
		await flushAsync();

		expect(fetchImpl).toHaveBeenCalledOnce();
		expect(errors).toHaveLength(1);
		expect(coordinator.inbox.getSnapshot(TURN_ID)).toMatchObject({
			buffering: true,
			reconciliationRequested: false
		});
		coordinator.requestAll('watchdog');
		coordinator.inbox.notifyChannelReconnected();
		expect(fetchImpl).toHaveBeenCalledOnce();
		await vi.advanceTimersByTimeAsync(4_999);
		expect(fetchImpl).toHaveBeenCalledOnce();
		await vi.advanceTimersByTimeAsync(1);
		await flushAsync();
		expect(fetchImpl).toHaveBeenCalledTimes(2);
		expect(observer.applyReconciliation).toHaveBeenCalledOnce();
		coordinator.stop();
	});

	it('uses the two-second jitter watchdog and five-second unchanged backoff', async () => {
		vi.useFakeTimers();
		const currentReceipt = receipt({
			requested_execution_generation: 1,
			execution_generation: 1,
			status: 'running',
			snapshot_sequence: 2,
			durable_through_sequence: 2,
			projection_durable_sequence: 2,
			response_watermark: 2
		});
		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(
				apiResponse(
					receipt({
						...currentReceipt,
						requested_execution_generation: 0,
						generation_changed: true
					})
				)
			)
			.mockResolvedValue(apiResponse(currentReceipt));
		const coordinator = new AgenticChatWorkerRealtimeCoordinator({
			fetchImpl: fetchImpl as typeof fetch,
			changedWatchdogMs: 2_000,
			unchangedWatchdogMs: 5_000,
			random: () => 0.5
		});
		coordinator.start();
		coordinator.registerTurn({ handle, observer: applicationObserver() });
		await flushAsync();
		expect(fetchImpl).toHaveBeenCalledOnce();

		await vi.advanceTimersByTimeAsync(1_999);
		expect(fetchImpl).toHaveBeenCalledOnce();
		await vi.advanceTimersByTimeAsync(1);
		await flushAsync();
		expect(fetchImpl).toHaveBeenCalledTimes(2);
		expect(fetchImpl.mock.calls[1]?.[0]).toBe(
			`/api/agent/v2/turns/${TURN_ID}/reconcile?generation=1&after=2&reason=watchdog`
		);

		await vi.advanceTimersByTimeAsync(4_999);
		expect(fetchImpl).toHaveBeenCalledTimes(2);
		await vi.advanceTimersByTimeAsync(1);
		await flushAsync();
		expect(fetchImpl).toHaveBeenCalledTimes(3);
		coordinator.stop();
	});

	it('keeps polling through a persistent Realtime outage and converges to terminal truth', async () => {
		vi.useFakeTimers();
		const runningReceipt = receipt({
			requested_execution_generation: 0,
			execution_generation: 1,
			generation_changed: true,
			status: 'running',
			snapshot_sequence: 1,
			durable_through_sequence: 1,
			projection_durable_sequence: 1,
			response_watermark: 1
		});
		const terminalReceipt = receipt({
			...runningReceipt,
			requested_execution_generation: 1,
			generation_changed: false,
			status: 'completed',
			assistant_message: {
				id: 'd6000000-0000-4000-8000-000000000002',
				role: 'assistant',
				content: 'durable completion',
				metadata: { turn_run_id: TURN_ID, execution_generation: 1 },
				prompt_tokens: null,
				completion_tokens: null,
				total_tokens: null,
				created_at: '2026-08-02T23:00:02.000Z'
			},
			terminal_event_id: `${TURN_ID}:1:1`,
			terminalized_at: '2026-08-02T23:00:02.000Z',
			updated_at: '2026-08-02T23:00:02.000Z'
		});
		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(apiResponse(runningReceipt))
			.mockResolvedValueOnce(
				apiResponse({
					...runningReceipt,
					requested_execution_generation: 1,
					generation_changed: false
				})
			)
			.mockResolvedValueOnce(apiResponse(terminalReceipt));
		const observer = applicationObserver();
		const coordinator = new AgenticChatWorkerRealtimeCoordinator({
			fetchImpl: fetchImpl as typeof fetch,
			changedWatchdogMs: 2_000,
			unchangedWatchdogMs: 5_000,
			random: () => 0.5
		});
		coordinator.start();
		coordinator.registerTurn({ handle, observer });
		await flushAsync();

		// Channel loss requests immediate durable truth. The channel never recovers
		// in this fixture, so the unchanged watchdog must continue from there.
		coordinator.inbox.notifyChannelUnavailable();
		await flushAsync();
		expect(fetchImpl).toHaveBeenCalledTimes(2);
		expect(fetchImpl.mock.calls[1]?.[0]).toContain('reason=channel_unavailable');

		await vi.advanceTimersByTimeAsync(4_999);
		expect(fetchImpl).toHaveBeenCalledTimes(2);
		await vi.advanceTimersByTimeAsync(1);
		await flushAsync();

		expect(fetchImpl).toHaveBeenCalledTimes(3);
		expect(fetchImpl.mock.calls[2]?.[0]).toContain('reason=watchdog');
		expect(observer.applyReconciliation).toHaveBeenLastCalledWith(
			expect.objectContaining({ status: 'completed', text: '' })
		);

		await vi.advanceTimersByTimeAsync(30_000);
		expect(fetchImpl).toHaveBeenCalledTimes(3);
		coordinator.stop();
	});

	it('stops polling when durable truth is terminal', async () => {
		vi.useFakeTimers();
		const fetchImpl = vi.fn(async () =>
			apiResponse(
				receipt({
					execution_generation: 1,
					requested_execution_generation: 0,
					generation_changed: true,
					status: 'completed',
					snapshot_sequence: 1,
					durable_through_sequence: 1,
					projection_durable_sequence: 1,
					response_watermark: 1,
					assistant_message: {
						id: 'd6000000-0000-4000-8000-000000000001',
						role: 'assistant',
						content: 'done',
						metadata: { turn_run_id: TURN_ID, execution_generation: 1 },
						prompt_tokens: null,
						completion_tokens: null,
						total_tokens: null,
						created_at: '2026-08-02T23:00:00.000Z'
					},
					terminal_event_id: `${TURN_ID}:1:1`,
					terminalized_at: '2026-08-02T23:00:01.000Z'
				})
			)
		);
		const coordinator = new AgenticChatWorkerRealtimeCoordinator({
			fetchImpl: fetchImpl as typeof fetch
		});
		coordinator.start();
		coordinator.registerTurn({ handle, observer: applicationObserver() });
		await flushAsync();

		await vi.advanceTimersByTimeAsync(30_000);
		expect(fetchImpl).toHaveBeenCalledOnce();
		coordinator.stop();
	});

	it('aborts and ignores a late response after stop', async () => {
		let resolveFetch!: (response: Response) => void;
		let requestSignal: AbortSignal | null = null;
		const fetchImpl = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
			requestSignal = init?.signal as AbortSignal;
			return new Promise<Response>((resolve) => (resolveFetch = resolve));
		});
		const observer = applicationObserver();
		const coordinator = new AgenticChatWorkerRealtimeCoordinator({
			fetchImpl: fetchImpl as typeof fetch
		});
		coordinator.start();
		coordinator.registerTurn({ handle, observer });
		await flushAsync();

		coordinator.stop();
		expect(requestSignal?.aborted).toBe(true);
		resolveFetch(apiResponse(receipt()));
		await flushAsync();
		expect(observer.applyReconciliation).not.toHaveBeenCalled();
	});

	it('can restart without waiting for a fetch implementation that ignores abort', async () => {
		const signals: AbortSignal[] = [];
		const fetchImpl = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
			signals.push(init?.signal as AbortSignal);
			return new Promise<Response>(() => undefined);
		});
		const coordinator = new AgenticChatWorkerRealtimeCoordinator({
			fetchImpl: fetchImpl as typeof fetch
		});
		coordinator.start();
		coordinator.registerTurn({ handle, observer: applicationObserver() });
		await flushAsync();

		coordinator.stop();
		expect(signals[0]?.aborted).toBe(true);
		coordinator.start();
		await flushAsync();
		expect(fetchImpl).toHaveBeenCalledTimes(2);
		coordinator.stop();
		expect(signals[1]?.aborted).toBe(true);
	});

	it('clears registered turns and leaves stale unregister callbacks harmless', () => {
		const coordinator = new AgenticChatWorkerRealtimeCoordinator();
		const unregister = coordinator.registerTurn({ handle, observer: applicationObserver() });
		expect(coordinator.trackedTurnCount).toBe(1);

		coordinator.clearTurns();
		expect(coordinator.trackedTurnCount).toBe(0);
		expect(coordinator.inbox.getSnapshot(TURN_ID)).toBeNull();
		expect(() => unregister()).not.toThrow();
	});
});
