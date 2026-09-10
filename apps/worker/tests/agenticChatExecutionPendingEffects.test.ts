// apps/worker/tests/agenticChatExecutionPendingEffects.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AGENTIC_CHAT_EXECUTION_OBSERVATION_TIMEOUT_MS } from '../src/workers/agentic-chat/executionObservation';
import type { AgenticChatExecutionObservationInputV1 } from '../src/workers/agentic-chat/executionObservation';
import { AgenticChatExecutorEffects } from '../src/workers/agentic-chat/executorEffects';
import {
	AgenticChatPendingEffects,
	AgenticChatPendingEffectsRegistry
} from '../src/workers/agentic-chat/pendingEffects';
import {
	AGENTIC_CHAT_PROMPT_SNAPSHOT_TIMEOUT_MS,
	type AgenticChatPromptSnapshotPersistInputV1,
	createStableAgenticChatPromptSnapshotIdV1
} from '../src/workers/agentic-chat/promptSnapshot';

const TURN_RUN_ID = '30000000-0000-4000-8000-000000000003';

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

const observation: AgenticChatExecutionObservationInputV1 = {
	turnRunId: TURN_RUN_ID,
	queueJobId: '40000000-0000-4000-8000-000000000004',
	processingToken: '60000000-0000-4000-8000-000000000006',
	userId: '10000000-0000-4000-8000-000000000001',
	executionGeneration: 1,
	observationKey: 'a'.repeat(64),
	phase: 'tool',
	eventType: 'tool_execution_started',
	payload: { tool_name: 'fixture_read', provider_tool_call_id: 'call-1', sequence_index: 1 }
};

const snapshotInput = {
	turnRunId: TURN_RUN_ID,
	queueJobId: '40000000-0000-4000-8000-000000000004',
	processingToken: '60000000-0000-4000-8000-000000000006',
	userId: '10000000-0000-4000-8000-000000000001',
	executionGeneration: 1,
	promptSnapshotId: createStableAgenticChatPromptSnapshotIdV1(TURN_RUN_ID),
	prompt: {
		snapshotVersion: 'agentic_chat_worker_prompt_v1',
		modelMessages: [
			{ role: 'system', content: 'Fixture only' },
			{ role: 'user', content: 'Use the fixture' }
		],
		toolDefinitions: [],
		systemPromptSha256: 'a'.repeat(64),
		messagesSha256: 'b'.repeat(64),
		toolsSha256: 'c'.repeat(64),
		systemPromptChars: 12,
		messageChars: 27,
		approxPromptTokens: 7
	}
} as AgenticChatPromptSnapshotPersistInputV1;

describe('AgenticChatPendingEffects', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('joins every tracked effect, absorbing rejections, and forgets settled ones', async () => {
		const pending = new AgenticChatPendingEffects();
		const first = deferred<void>();
		const second = deferred<void>();
		pending.enqueue(first.promise);
		pending.enqueue(second.promise);
		expect(pending.size).toBe(2);

		first.resolve();
		second.reject(new Error('absorbed'));
		await expect(pending.drain(1_000)).resolves.toBe(true);
		expect(pending.size).toBe(0);
		await expect(pending.drain(1_000)).resolves.toBe(true);
	});

	it('returns false at the deadline while a straggler is still pending', async () => {
		vi.useFakeTimers();
		const pending = new AgenticChatPendingEffects();
		const straggler = deferred<void>();
		pending.enqueue(straggler.promise);

		const drain = pending.drain(250);
		await vi.advanceTimersByTimeAsync(249);
		let settled = false;
		void drain.then(() => {
			settled = true;
		});
		await Promise.resolve();
		expect(settled).toBe(false);
		await vi.advanceTimersByTimeAsync(1);
		await expect(drain).resolves.toBe(false);
		expect(pending.size).toBe(1);

		straggler.resolve();
		await expect(pending.drain(250)).resolves.toBe(true);
		expect(pending.size).toBe(0);
	});

	it('rejects a non-positive deadline', async () => {
		const pending = new AgenticChatPendingEffects();
		await expect(pending.drain(0)).rejects.toThrow('positive integer');
	});
});

describe('AgenticChatPendingEffectsRegistry', () => {
	it('keys sets by turn and forgets a turn once it is drained', async () => {
		const registry = new AgenticChatPendingEffectsRegistry();
		const effect = deferred<void>();
		registry.forTurn(TURN_RUN_ID).enqueue(effect.promise);
		expect(registry.forTurn(TURN_RUN_ID).size).toBe(1);
		expect(registry.size(TURN_RUN_ID)).toBe(1);
		expect(registry.size('other-turn')).toBe(0);

		effect.resolve();
		await expect(registry.drain(TURN_RUN_ID, 1_000)).resolves.toBe(true);
		expect(registry.size(TURN_RUN_ID)).toBe(0);
		await expect(registry.drain(TURN_RUN_ID, 1_000)).resolves.toBe(true);
		expect(() => registry.forTurn('')).toThrow('canonical text');
	});
});

describe('AgenticChatExecutorEffects detached effects', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('starts a tool observation without awaiting it and joins it at the fence', async () => {
		const registry = new AgenticChatPendingEffectsRegistry();
		const observe = deferred<void>();
		const observePort = vi.fn(
			(_input: AgenticChatExecutionObservationInputV1, _signal: AbortSignal) =>
				observe.promise
		);
		const errors: unknown[] = [];
		const effects = new AgenticChatExecutorEffects({
			executionObservations: { observe: observePort },
			pendingEffects: registry,
			onExecutionObservationError: (error) => errors.push(error)
		});

		const returned = effects.observeToolExecution(observation, new AbortController().signal);
		expect(returned).toBeUndefined();
		expect(observePort).toHaveBeenCalledOnce();
		expect(observePort.mock.calls[0]?.[1]).toBeInstanceOf(AbortSignal);
		expect(registry.size(TURN_RUN_ID)).toBe(1);

		observe.reject(new Error('observation rpc failed'));
		await effects.drainPendingEffects(TURN_RUN_ID);
		expect(errors.map((error) => (error as Error).message)).toEqual(['observation rpc failed']);
		expect(registry.size(TURN_RUN_ID)).toBe(0);
	});

	it('cancels a hung observation at its own deadline and reports it', async () => {
		vi.useFakeTimers();
		const registry = new AgenticChatPendingEffectsRegistry();
		const observePort = vi.fn(
			(_input: AgenticChatExecutionObservationInputV1, signal: AbortSignal) =>
				new Promise<void>((_resolve, reject) => {
					signal.addEventListener('abort', () => reject(signal.reason), { once: true });
				})
		);
		const errors: unknown[] = [];
		const effects = new AgenticChatExecutorEffects({
			executionObservations: { observe: observePort },
			pendingEffects: registry,
			onExecutionObservationError: (error) => errors.push(error)
		});
		effects.observeToolExecution(observation, new AbortController().signal);
		const signal = observePort.mock.calls[0]?.[1];
		expect(signal?.aborted).toBe(false);

		await vi.advanceTimersByTimeAsync(AGENTIC_CHAT_EXECUTION_OBSERVATION_TIMEOUT_MS);
		expect(signal?.aborted).toBe(true);
		await expect(registry.drain(TURN_RUN_ID, 1_000)).resolves.toBe(true);
		expect(errors.map((error) => (error as Error).message)).toEqual([
			'Agentic Chat tool execution observation timed out'
		]);
	});

	it('reports, never throws, when detached effects miss the fence deadline', async () => {
		vi.useFakeTimers();
		const registry = new AgenticChatPendingEffectsRegistry();
		registry.forTurn(TURN_RUN_ID).enqueue(new Promise<void>(() => undefined));
		const errors: unknown[] = [];
		const effects = new AgenticChatExecutorEffects({
			pendingEffects: registry,
			onExecutionObservationError: (error) => errors.push(error)
		});

		const drain = effects.drainPendingEffects(TURN_RUN_ID);
		await vi.advanceTimersByTimeAsync(AGENTIC_CHAT_EXECUTION_OBSERVATION_TIMEOUT_MS);
		await expect(drain).resolves.toBeUndefined();
		expect(errors.map((error) => (error as Error).message)).toEqual([
			'Agentic Chat detached effects were still pending at the terminal fence'
		]);
		expect(registry.size(TURN_RUN_ID)).toBe(0);
	});

	it('bounds the detached prompt snapshot with a deadline signal the adapter can cancel on', async () => {
		vi.useFakeTimers();
		const registry = new AgenticChatPendingEffectsRegistry();
		const persist = vi.fn(
			(_input: AgenticChatPromptSnapshotPersistInputV1, signal?: AbortSignal) =>
				new Promise<never>((_resolve, reject) => {
					signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
				})
		);
		const errors: unknown[] = [];
		const effects = new AgenticChatExecutorEffects({
			promptSnapshots: { persist },
			pendingEffects: registry,
			onPromptSnapshotError: (error) => errors.push(error)
		});

		effects.persistPromptSnapshot(snapshotInput, new AbortController().signal);
		expect(persist).toHaveBeenCalledOnce();
		const signal = persist.mock.calls[0]?.[1];
		expect(signal).toBeInstanceOf(AbortSignal);
		expect(signal?.aborted).toBe(false);

		await vi.advanceTimersByTimeAsync(AGENTIC_CHAT_PROMPT_SNAPSHOT_TIMEOUT_MS);
		expect(signal?.aborted).toBe(true);
		await expect(registry.drain(TURN_RUN_ID, 1_000)).resolves.toBe(true);
		expect(errors.map((error) => (error as Error).message)).toEqual([
			'Agentic Chat prompt snapshot persistence timed out'
		]);
	});
});
