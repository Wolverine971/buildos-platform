// apps/worker/tests/agentRunStrandedSweep.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	agentRunStrandedSweepEnabled,
	runAgentRunStrandedSweep
} from '../src/workers/agent-run/agentRunStrandedSweep';
import type {
	StrandedChildRow,
	StrandedParentRow,
	StrandedRunRow,
	StrandedSweepStore
} from '../src/workers/agent-run/agentRunStrandedSweep';

const NOW = new Date('2026-07-20T12:00:00.000Z');
const ROOT_ID = '10000000-0000-4000-8000-000000000001';
const USER_ID = '90000000-0000-4000-8000-000000000001';
const PARENT_ID = '10000000-0000-4000-8000-000000000009';
const CHILD_IDS = ['20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002'];
const GRACE_MS = 600_000; // 2 × default stalledTimeout

function minutesAgo(mins: number): string {
	return new Date(NOW.getTime() - mins * 60_000).toISOString();
}

function candidate(overrides: Partial<StrandedRunRow> = {}): StrandedRunRow {
	return {
		id: ROOT_ID,
		user_id: USER_ID,
		status: 'running',
		run_template: 'agent',
		depth: 0,
		parent_run_id: null,
		started_at: minutesAgo(20),
		updated_at: minutesAgo(15),
		budgets: { max_cost_usd: 0.5, wall_clock_ms: 600_000 },
		orchestration_state: {},
		trigger: 'chat',
		context_type: 'global',
		project_id: null,
		scope_mode: 'read_only',
		effort: 'standard',
		allowed_ops: null,
		review_required: false,
		...overrides
	};
}

function deepRoot(
	stage: 'planning' | 'dispatching' | 'researching' | 'synthesis_queued' | 'synthesizing',
	overrides: Partial<StrandedRunRow> = {}
): StrandedRunRow {
	return candidate({
		run_template: 'deep_research',
		depth: 0,
		scope_mode: 'read_only',
		effort: 'deep',
		orchestration_state: {
			version: 1,
			stage,
			child_run_ids: [...CHILD_IDS]
		},
		budgets: {
			max_cost_usd: 0.5,
			max_tool_calls: 10,
			max_tokens: 60_000,
			wall_clock_ms: 600_000
		},
		...overrides
	});
}

function child(id: string, status: StrandedChildRow['status']): StrandedChildRow {
	return { id, status };
}

function makeStore(overrides: Partial<StrandedSweepStore> = {}): {
	store: StrandedSweepStore;
	mocks: {
		[K in keyof StrandedSweepStore]: ReturnType<typeof vi.fn>;
	};
} {
	const mocks = {
		listStrandedCandidates: vi.fn(async () => [] as StrandedRunRow[]),
		listActiveDedupKeys: vi.fn(async () => [] as string[]),
		loadParent: vi.fn(async () => null as StrandedParentRow | null),
		loadChildren: vi.fn(async () => [] as StrandedChildRow[]),
		enqueueContinuation: vi.fn(async () => ({}) as { errorMessage?: string }),
		wakeSynthesis: vi.fn(async () => ({ jobId: 'agent-run-job-1' })),
		finalizeRun: vi.fn(async () => true),
		ensureCancelSignal: vi.fn(async () => undefined)
	};
	// Overrides replace the base spies in place so `mocks` and `store` are the same
	// object — assertions on `mocks.<method>` observe the override that ran.
	Object.assign(mocks, overrides);
	const store = mocks as unknown as StrandedSweepStore;
	return { store, mocks: mocks as never };
}

describe('agentRunStrandedSweepEnabled', () => {
	it('defaults ON and only an explicit false disables it', () => {
		const original = process.env.AGENT_RUN_STRANDED_SWEEP_ENABLED;
		try {
			delete process.env.AGENT_RUN_STRANDED_SWEEP_ENABLED;
			expect(agentRunStrandedSweepEnabled()).toBe(true);
			process.env.AGENT_RUN_STRANDED_SWEEP_ENABLED = 'true';
			expect(agentRunStrandedSweepEnabled()).toBe(true);
			process.env.AGENT_RUN_STRANDED_SWEEP_ENABLED = 'false';
			expect(agentRunStrandedSweepEnabled()).toBe(false);
		} finally {
			if (original === undefined) delete process.env.AGENT_RUN_STRANDED_SWEEP_ENABLED;
			else process.env.AGENT_RUN_STRANDED_SWEEP_ENABLED = original;
		}
	});
});

describe('runAgentRunStrandedSweep', () => {
	const run = (store: StrandedSweepStore) =>
		runAgentRunStrandedSweep({ store, now: () => NOW, graceMs: GRACE_MS });

	it('wakes synthesis for a researching root whose children have all settled', async () => {
		const { store, mocks } = makeStore({
			listStrandedCandidates: vi.fn(async () => [deepRoot('researching')]),
			loadChildren: vi.fn(async () => [
				child(CHILD_IDS[0], 'completed'),
				child(CHILD_IDS[1], 'partial')
			])
		});

		const summary = await run(store);

		expect(mocks.wakeSynthesis).toHaveBeenCalledWith(ROOT_ID);
		expect(summary.synthesisWoken).toBe(1);
		expect(mocks.enqueueContinuation).not.toHaveBeenCalled();
		expect(mocks.finalizeRun).not.toHaveBeenCalled();
		expect(summary.errors).toBe(0);
	});

	it('does not wake synthesis while a researching root still has a non-terminal child', async () => {
		const { store, mocks } = makeStore({
			listStrandedCandidates: vi.fn(async () => [deepRoot('researching')]),
			loadChildren: vi.fn(async () => [
				child(CHILD_IDS[0], 'completed'),
				child(CHILD_IDS[1], 'running')
			])
		});

		const summary = await run(store);

		expect(mocks.wakeSynthesis).not.toHaveBeenCalled();
		expect(summary.synthesisWoken).toBe(0);
		expect(summary.finalizedFailed).toBe(0);
	});

	it('does not count a synthesis wake the DB guard declined (jobId null)', async () => {
		const { store, mocks } = makeStore({
			listStrandedCandidates: vi.fn(async () => [deepRoot('researching')]),
			loadChildren: vi.fn(async () => [
				child(CHILD_IDS[0], 'completed'),
				child(CHILD_IDS[1], 'completed')
			]),
			wakeSynthesis: vi.fn(async () => ({ jobId: null }))
		});

		const summary = await run(store);

		expect(mocks.wakeSynthesis).toHaveBeenCalledOnce();
		expect(summary.synthesisWoken).toBe(0);
		expect(summary.errors).toBe(0);
	});

	it('re-enqueues a jobless within-deadline queued run with its original dedup key', async () => {
		const queued = candidate({
			status: 'queued',
			started_at: null,
			updated_at: minutesAgo(15)
		});
		const { store, mocks } = makeStore({
			listStrandedCandidates: vi.fn(async () => [queued])
		});

		const summary = await run(store);

		expect(mocks.enqueueContinuation).toHaveBeenCalledOnce();
		const [userId, metadata, dedupKey] = mocks.enqueueContinuation.mock.calls[0];
		expect(userId).toBe(USER_ID);
		expect(dedupKey).toBe(`agent-run:${ROOT_ID}`);
		expect(metadata).toMatchObject({ run_id: ROOT_ID, run_template: 'agent', depth: 0 });
		expect(metadata).not.toHaveProperty('continuation_from');
		expect(summary.requeuedContinuations).toBe(1);
		expect(summary.finalizedFailed).toBe(0);
	});

	it('re-enqueues a jobless queued run exactly once across two overlapping sweeps (live-job guard)', async () => {
		// Simulate add_queue_job dedup: an enqueued key becomes "live" and the next
		// live-job check sees it, so the second sweep skips the same run.
		const activeKeys = new Set<string>();
		const queued = candidate({ status: 'queued', started_at: null });
		const store: StrandedSweepStore = {
			...makeStore().store,
			listStrandedCandidates: vi.fn(async () => [queued]),
			listActiveDedupKeys: vi.fn(async (_userId, keys) =>
				keys.filter((k) => activeKeys.has(k))
			),
			enqueueContinuation: vi.fn(async (_userId, _metadata, dedupKey) => {
				activeKeys.add(dedupKey);
				return {};
			})
		};

		const first = await runAgentRunStrandedSweep({ store, now: () => NOW, graceMs: GRACE_MS });
		const second = await runAgentRunStrandedSweep({ store, now: () => NOW, graceMs: GRACE_MS });

		expect(first.requeuedContinuations).toBe(1);
		expect(second.requeuedContinuations).toBe(0);
		expect(store.enqueueContinuation as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
	});

	it('does NOT touch a run that still has a live queue job', async () => {
		const { store, mocks } = makeStore({
			listStrandedCandidates: vi.fn(async () => [
				candidate({ status: 'queued', started_at: null })
			]),
			listActiveDedupKeys: vi.fn(async () => [`agent-run:${ROOT_ID}`])
		});

		const summary = await run(store);

		expect(mocks.enqueueContinuation).not.toHaveBeenCalled();
		expect(mocks.finalizeRun).not.toHaveBeenCalled();
		expect(mocks.wakeSynthesis).not.toHaveBeenCalled();
		expect(summary).toMatchObject({
			scanned: 1,
			requeuedContinuations: 0,
			finalizedFailed: 0,
			errors: 0
		});
	});

	it('cancels a non-terminal child whose parent went terminal past grace', async () => {
		const strandedChild = candidate({
			id: CHILD_IDS[0],
			status: 'running',
			parent_run_id: PARENT_ID,
			depth: 1,
			run_template: 'agent'
		});
		const { store, mocks } = makeStore({
			listStrandedCandidates: vi.fn(async () => [strandedChild]),
			loadParent: vi.fn(async () => ({ status: 'failed', completed_at: minutesAgo(15) }))
		});

		const summary = await run(store);

		expect(mocks.ensureCancelSignal).toHaveBeenCalledWith(CHILD_IDS[0]);
		expect(mocks.finalizeRun).toHaveBeenCalledWith(
			expect.objectContaining({ runId: CHILD_IDS[0], status: 'cancelled' })
		);
		expect(summary.childrenCancelled).toBe(1);
		// A terminal parent short-circuits before the live-job / re-enqueue path.
		expect(mocks.listActiveDedupKeys).not.toHaveBeenCalled();
		expect(mocks.enqueueContinuation).not.toHaveBeenCalled();
	});

	it('signals but does not yet force-cancel a child whose parent only just went terminal', async () => {
		const strandedChild = candidate({
			id: CHILD_IDS[0],
			status: 'running',
			parent_run_id: PARENT_ID,
			depth: 1
		});
		const { store, mocks } = makeStore({
			listStrandedCandidates: vi.fn(async () => [strandedChild]),
			loadParent: vi.fn(async () => ({ status: 'completed', completed_at: minutesAgo(2) }))
		});

		const summary = await run(store);

		expect(mocks.ensureCancelSignal).toHaveBeenCalledWith(CHILD_IDS[0]);
		expect(mocks.finalizeRun).not.toHaveBeenCalled();
		expect(summary.childrenCancelled).toBe(0);
	});

	it('leaves user-parked paused / needs_input / proposal_ready runs alone', async () => {
		const { store, mocks } = makeStore({
			listStrandedCandidates: vi.fn(async () => [
				candidate({ id: CHILD_IDS[0], status: 'paused' }),
				candidate({ id: CHILD_IDS[1], status: 'needs_input' }),
				candidate({ id: PARENT_ID, status: 'proposal_ready' })
			])
		});

		const summary = await run(store);

		expect(mocks.enqueueContinuation).not.toHaveBeenCalled();
		expect(mocks.finalizeRun).not.toHaveBeenCalled();
		expect(summary).toMatchObject({ scanned: 3, requeuedContinuations: 0, finalizedFailed: 0 });
	});

	it('re-enqueues a jobless dispatching deep root within deadline (retryable stage)', async () => {
		const root = deepRoot('dispatching', { started_at: minutesAgo(5) });
		const { store, mocks } = makeStore({
			listStrandedCandidates: vi.fn(async () => [root])
		});

		const summary = await run(store);

		expect(mocks.enqueueContinuation).toHaveBeenCalledOnce();
		const [, metadata, dedupKey] = mocks.enqueueContinuation.mock.calls[0];
		expect(dedupKey).toBe(`agent-run:${ROOT_ID}`);
		expect(metadata).toMatchObject({ run_template: 'deep_research', effort: 'deep', depth: 0 });
		expect(summary.requeuedContinuations).toBe(1);
	});

	it('re-enqueues a jobless synthesizing deep root within deadline as a synthesis continuation', async () => {
		const root = deepRoot('synthesizing', { started_at: minutesAgo(5) });
		const { store, mocks } = makeStore({
			listStrandedCandidates: vi.fn(async () => [root])
		});

		const summary = await run(store);

		const [, metadata, dedupKey] = mocks.enqueueContinuation.mock.calls[0];
		expect(dedupKey).toBe(`agent-run:${ROOT_ID}:synthesis`);
		expect(metadata).toMatchObject({
			continuation_from: 'children',
			run_template: 'deep_research'
		});
		expect(summary.requeuedContinuations).toBe(1);
	});

	it('finalizes a past-deadline dispatching deep root as failed', async () => {
		const root = deepRoot('dispatching', {
			started_at: minutesAgo(30),
			budgets: { max_cost_usd: 0.5, wall_clock_ms: 600_000 }
		});
		const { store, mocks } = makeStore({
			listStrandedCandidates: vi.fn(async () => [root])
		});

		const summary = await run(store);

		expect(mocks.enqueueContinuation).not.toHaveBeenCalled();
		expect(mocks.finalizeRun).toHaveBeenCalledWith(
			expect.objectContaining({ runId: ROOT_ID, status: 'failed' })
		);
		expect(summary.finalizedFailed).toBe(1);
	});

	it('finalizes a past-deadline synthesizing deep root as partial', async () => {
		const root = deepRoot('synthesizing', { started_at: minutesAgo(30) });
		const { store, mocks } = makeStore({
			listStrandedCandidates: vi.fn(async () => [root])
		});

		const summary = await run(store);

		expect(mocks.finalizeRun).toHaveBeenCalledWith(
			expect.objectContaining({ runId: ROOT_ID, status: 'partial' })
		);
		expect(summary.finalizedPartial).toBe(1);
	});

	it('finalizes a stranded running ordinary run as failed rather than re-enqueueing', async () => {
		const running = candidate({ status: 'running', started_at: minutesAgo(20) });
		const { store, mocks } = makeStore({
			listStrandedCandidates: vi.fn(async () => [running])
		});

		const summary = await run(store);

		expect(mocks.enqueueContinuation).not.toHaveBeenCalled();
		expect(mocks.finalizeRun).toHaveBeenCalledWith(
			expect.objectContaining({ runId: ROOT_ID, status: 'failed' })
		);
		expect(summary.finalizedFailed).toBe(1);
	});

	it('isolates per-candidate failures and keeps scanning', async () => {
		const { store, mocks } = makeStore({
			listStrandedCandidates: vi.fn(async () => [
				candidate({ id: CHILD_IDS[0], status: 'queued', started_at: null }),
				candidate({ id: CHILD_IDS[1], status: 'queued', started_at: null })
			]),
			enqueueContinuation: vi
				.fn()
				.mockRejectedValueOnce(new Error('boom'))
				.mockResolvedValueOnce({})
		});

		const summary = await run(store);

		expect(summary.scanned).toBe(2);
		expect(summary.errors).toBe(1);
		expect(summary.requeuedContinuations).toBe(1);
		expect(mocks.enqueueContinuation).toHaveBeenCalledTimes(2);
	});
});
