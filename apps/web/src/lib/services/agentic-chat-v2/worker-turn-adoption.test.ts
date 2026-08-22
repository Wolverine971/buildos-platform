// apps/web/src/lib/services/agentic-chat-v2/worker-turn-adoption.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
	type AgenticChatWorkerTurnDescriptorV1,
	type ChatTurnStatusV1,
	type TurnHandleV1
} from '@buildos/shared-types';
import type { AgenticChatWorkerApplicationObserver } from './worker-realtime-coordinator';
import {
	AgenticChatWorkerDiscoveryHttpError,
	AgenticChatWorkerTurnAdoption
} from './worker-turn-adoption';

const SESSION_1 = 'd2000000-0000-4000-8000-000000000001';
const SESSION_2 = 'd2000000-0000-4000-8000-000000000002';
const TURN_1 = 'd4000000-0000-4000-8000-000000000001';
const TURN_2 = 'd4000000-0000-4000-8000-000000000002';

type WorkerTurnHandle = Extract<TurnHandleV1, { executionMode: 'worker_realtime' }>;

function workerHandle(overrides: Partial<WorkerTurnHandle> = {}): WorkerTurnHandle {
	return {
		contractVersion: AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
		executionMode: 'worker_realtime',
		turnRunId: TURN_1,
		sessionId: SESSION_1,
		streamRunId: 'stream-run-1',
		clientTurnId: 'client-turn-1',
		...overrides
	};
}

function descriptor(
	overrides: Partial<AgenticChatWorkerTurnDescriptorV1> = {}
): AgenticChatWorkerTurnDescriptorV1 {
	return {
		handle: workerHandle(),
		status: 'running',
		executionGeneration: 1,
		terminalEventId: null,
		updatedAt: '2026-08-03T12:00:00.000Z',
		...overrides
	};
}

function admission(
	outcome: 'newly_admitted' | 'matching_duplicate',
	status: ChatTurnStatusV1 = outcome === 'newly_admitted' ? 'queued' : 'running',
	handle: WorkerTurnHandle = workerHandle()
): unknown {
	return {
		success: true,
		data: { outcome, handle, status }
	};
}

function discovery(turns: AgenticChatWorkerTurnDescriptorV1[]): Response {
	return Response.json({ success: true, data: { turns } });
}

function harness(fetchImpl: typeof fetch = vi.fn()) {
	const unregister = vi.fn();
	const observers = new Map<
		string,
		{
			observer: AgenticChatWorkerApplicationObserver;
			onTerminal(
				status: Extract<ChatTurnStatusV1, 'completed' | 'failed' | 'cancelled'>
			): void;
		}
	>();
	const registerTurn = vi.fn(
		(input: {
			handle: WorkerTurnHandle;
			observer: AgenticChatWorkerApplicationObserver;
			executionGeneration?: number;
			lastAppliedSequence?: number;
		}) => {
			return unregister;
		}
	);
	const adopted = vi.fn();
	const released = vi.fn();
	const errors: unknown[] = [];
	const manager = new AgenticChatWorkerTurnAdoption({
		runtime: { registerTurn },
		fetchImpl,
		createObserver: ({ handle, onTerminal }) => {
			const observer: AgenticChatWorkerApplicationObserver = {
				applyReconciliation: vi.fn(),
				applyLiveEvent: vi.fn()
			};
			observers.set(handle.turnRunId, { observer, onTerminal });
			return observer;
		},
		onAdopted: adopted,
		onReleased: released,
		onError: (error) => errors.push(error)
	});
	return { manager, registerTurn, unregister, observers, adopted, released, errors };
}

describe('AgenticChatWorkerTurnAdoption', () => {
	it('registers only a server-issued admission handle and treats a matching duplicate idempotently', () => {
		const h = harness();

		const admitted = h.manager.adoptAdmissionResponse(admission('newly_admitted'));
		const duplicate = h.manager.adoptAdmissionResponse(admission('matching_duplicate'));

		expect(admitted.handle).toEqual(workerHandle());
		expect(duplicate.handle).toEqual(workerHandle());
		expect(h.manager.trackedTurnCount).toBe(1);
		expect(h.registerTurn).toHaveBeenCalledOnce();
		expect(h.registerTurn).toHaveBeenCalledWith(
			expect.objectContaining({
				handle: workerHandle(),
				executionGeneration: 0,
				lastAppliedSequence: 0
			})
		);
		expect(h.adopted.mock.calls.map(([event]) => event.source)).toEqual([
			'admission',
			'matching_duplicate'
		]);
	});

	it('discovers exact owned session descriptors and prunes only that session', async () => {
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(discovery([descriptor()]))
			.mockResolvedValueOnce(
				discovery([
					descriptor({
						handle: workerHandle({
							turnRunId: TURN_2,
							streamRunId: 'stream-run-2',
							clientTurnId: 'client-turn-2'
						}),
						status: 'queued',
						executionGeneration: 0
					})
				])
			);
		const h = harness(fetchImpl);
		h.manager.adoptOwnedDescriptor(
			descriptor({
				handle: workerHandle({
					turnRunId: 'd4000000-0000-4000-8000-000000000003',
					sessionId: SESSION_2,
					streamRunId: 'stream-run-3',
					clientTurnId: 'client-turn-3'
				})
			})
		);

		await h.manager.discoverSession(SESSION_1);
		expect(
			h.manager
				.getTrackedHandles()
				.map((handle) => handle.turnRunId)
				.sort()
		).toEqual([TURN_1, 'd4000000-0000-4000-8000-000000000003']);

		await h.manager.discoverSession(SESSION_1);
		expect(
			h.manager
				.getTrackedHandles()
				.map((handle) => handle.turnRunId)
				.sort()
		).toEqual([TURN_2, 'd4000000-0000-4000-8000-000000000003']);
		expect(fetchImpl).toHaveBeenCalledWith(
			`/api/agent/v2/turns?session_id=${SESSION_1}`,
			expect.objectContaining({
				method: 'GET',
				credentials: 'same-origin',
				cache: 'no-store'
			})
		);
		expect(h.released).toHaveBeenCalledWith(
			expect.objectContaining({ reason: 'not_active', handle: workerHandle() })
		);
	});

	it('does not let a pre-admission empty discovery prune the newly admitted turn', async () => {
		let resolveResponse!: (response: Response) => void;
		const fetchImpl = vi.fn<typeof fetch>(
			() => new Promise<Response>((resolve) => (resolveResponse = resolve))
		);
		const h = harness(fetchImpl);
		const staleDiscovery = h.manager.discoverSession(SESSION_1);

		h.manager.adoptAdmissionResponse(admission('newly_admitted'));
		resolveResponse(discovery([]));

		await expect(staleDiscovery).resolves.toEqual([]);
		expect(h.registerTurn).toHaveBeenCalledOnce();
		expect(h.unregister).not.toHaveBeenCalled();
		expect(h.released).not.toHaveBeenCalled();
		expect(h.manager.trackedTurnCount).toBe(1);
	});

	it('refuses legacy, malformed, cross-session, and terminal discovery data', async () => {
		const h = harness(
			vi.fn<typeof fetch>().mockResolvedValue(
				discovery([
					descriptor({
						handle: workerHandle({ sessionId: SESSION_2 })
					})
				])
			)
		);

		expect(() =>
			h.manager.adoptAdmissionResponse({
				success: true,
				data: {
					outcome: 'newly_admitted',
					status: 'queued',
					handle: { ...workerHandle(), executionMode: 'legacy_sse' }
				}
			})
		).toThrow('Worker handle is invalid');
		expect(() =>
			h.manager.adoptOwnedDescriptor(
				descriptor({ status: 'completed', terminalEventId: null })
			)
		).toThrow('terminal identity');
		await expect(h.manager.discoverSession(SESSION_1)).rejects.toThrow(
			'escaped the requested session'
		);
		expect(h.manager.trackedTurnCount).toBe(0);
		expect(h.registerTurn).not.toHaveBeenCalled();
	});

	it('rejects an immutable handle mutation after registration', () => {
		const h = harness();
		h.manager.adoptOwnedDescriptor(descriptor());

		expect(() =>
			h.manager.adoptOwnedDescriptor(
				descriptor({ handle: workerHandle({ streamRunId: 'changed-stream-run' }) })
			)
		).toThrow('Authoritative worker handle changed after registration');
		expect(h.registerTurn).toHaveBeenCalledOnce();
		expect(h.unregister).not.toHaveBeenCalled();
	});

	it('unregisters the exact handle after terminal UI projection', async () => {
		const h = harness();
		h.manager.adoptOwnedDescriptor(descriptor());

		h.observers.get(TURN_1)!.onTerminal('completed');
		await Promise.resolve();

		expect(h.unregister).toHaveBeenCalledOnce();
		expect(h.manager.trackedTurnCount).toBe(0);
		expect(h.released).toHaveBeenCalledWith({
			handle: workerHandle(),
			reason: 'terminal',
			status: 'completed'
		});
	});

	it('does not re-adopt a terminal turn from a duplicate or stale discovery response', async () => {
		let resolveResponse!: (response: Response) => void;
		const fetchImpl = vi.fn<typeof fetch>(
			() => new Promise<Response>((resolve) => (resolveResponse = resolve))
		);
		const h = harness(fetchImpl);
		h.manager.adoptOwnedDescriptor(descriptor());
		const staleDiscovery = h.manager.discoverSession(SESSION_1);

		h.observers.get(TURN_1)!.onTerminal('completed');
		// This can happen in the same microtask when a replayed session event causes
		// discovery to race the observer's deferred unregister.
		h.manager.adoptOwnedDescriptor(descriptor());
		resolveResponse(discovery([descriptor()]));

		await staleDiscovery;
		await Promise.resolve();

		expect(h.registerTurn).toHaveBeenCalledOnce();
		expect(h.adopted).toHaveBeenCalledOnce();
		expect(h.unregister).toHaveBeenCalledOnce();
		expect(h.manager.trackedTurnCount).toBe(0);
	});

	it('fences a late discovery response after session or auth cleanup', async () => {
		let resolveResponse!: (response: Response) => void;
		const fetchImpl = vi.fn<typeof fetch>(
			() => new Promise<Response>((resolve) => (resolveResponse = resolve))
		);
		const h = harness(fetchImpl);
		const pending = h.manager.discoverSession(SESSION_1);
		h.manager.releaseSession(SESSION_1);
		resolveResponse(discovery([descriptor()]));

		await expect(pending).resolves.toEqual([]);
		expect(h.registerTurn).not.toHaveBeenCalled();

		const pendingAfterClear = h.manager.discoverSession(SESSION_1);
		h.manager.clear('auth_changed');
		resolveResponse(discovery([descriptor()]));
		await expect(pendingAfterClear).resolves.toEqual([]);
		expect(h.registerTurn).not.toHaveBeenCalled();
	});

	it('surfaces HTTP discovery failures without disturbing tracked handles', async () => {
		const h = harness(
			vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 }))
		);
		h.manager.adoptOwnedDescriptor(descriptor());

		await expect(h.manager.discoverSession(SESSION_1)).rejects.toEqual(
			new AgenticChatWorkerDiscoveryHttpError(503)
		);
		expect(h.manager.trackedTurnCount).toBe(1);
		expect(h.unregister).not.toHaveBeenCalled();
	});
});
