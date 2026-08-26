// apps/worker/tests/cycleSchedulerAdversarial.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CycleCoordinatorSummary } from '../src/workers/cycle/cycleCoordinator';

const mocks = vi.hoisted(() => ({
	runDueCycleCoordinator: vi.fn(),
	recordStarted: vi.fn(),
	recordCompleted: vi.fn(),
	recordFailed: vi.fn(),
	persistMetrics: vi.fn(),
	supabaseFrom: vi.fn(),
	supabaseRpc: vi.fn(),
	queueAdd: vi.fn(),
	cancelBriefJobsForDate: vi.fn(),
	cleanupStaleJobs: vi.fn(),
	runAgentRunCostReconciliation: vi.fn(),
	agentRunCostReconciliationEnabled: vi.fn(() => false)
}));

vi.mock('../src/workers/cycle/cycleCoordinator', () => ({
	runDueCycleCoordinator: mocks.runDueCycleCoordinator
}));

vi.mock('../src/workers/cycle/cycleObservability', () => ({
	recordCycleCoordinatorStarted: mocks.recordStarted,
	recordCycleCoordinatorCompleted: mocks.recordCompleted,
	recordCycleCoordinatorFailed: mocks.recordFailed
}));

vi.mock('../src/workers/cycle/cycleMetrics', () => ({
	persistCycleCoordinatorMetrics: mocks.persistMetrics,
	persistDailyBriefCycleShadowMetrics: vi.fn()
}));

vi.mock('../src/lib/supabase', () => ({
	supabase: {
		from: mocks.supabaseFrom,
		rpc: mocks.supabaseRpc
	}
}));

vi.mock('../src/lib/queue', () => ({
	queue: {
		add: mocks.queueAdd,
		cancelBriefJobsForDate: mocks.cancelBriefJobsForDate
	}
}));

vi.mock('../src/lib/utils/queueCleanup', () => ({
	cleanupStaleJobs: mocks.cleanupStaleJobs
}));

vi.mock('../src/workers/agent-run/agentRunCostReconciler', () => ({
	runAgentRunCostReconciliation: mocks.runAgentRunCostReconciliation,
	agentRunCostReconciliationEnabled: mocks.agentRunCostReconciliationEnabled
}));

import { runScheduledCycleCoordinator } from '../src/scheduler';

const EMPTY_SUMMARY: CycleCoordinatorSummary = {
	claimed: 0,
	admitted: 0,
	alreadyAdmitted: 0,
	skippedOverlap: 0,
	skippedMisfire: 0,
	failed: 0,
	oldestScheduledFor: null,
	maxDueLatencyMs: 0,
	averageDueLatencyMs: 0,
	errors: []
};

describe('scheduled Cycle coordinator adversarial concurrency', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.runDueCycleCoordinator.mockResolvedValue(EMPTY_SUMMARY);
		mocks.recordCompleted.mockReturnValue({ lastDurationMs: 5 });
		mocks.recordFailed.mockReturnValue({ lastDurationMs: 5 });
		mocks.persistMetrics.mockResolvedValue(undefined);
	});

	it('coalesces overlapping scheduler ticks in one process', async () => {
		let releaseFirst!: (summary: CycleCoordinatorSummary) => void;
		const firstRun = new Promise<CycleCoordinatorSummary>((resolve) => {
			releaseFirst = resolve;
		});
		mocks.runDueCycleCoordinator.mockReturnValueOnce(firstRun);

		const firstTick = runScheduledCycleCoordinator();
		expect(mocks.runDueCycleCoordinator).toHaveBeenCalledTimes(1);

		await expect(runScheduledCycleCoordinator()).resolves.toBe(false);
		expect(mocks.runDueCycleCoordinator).toHaveBeenCalledTimes(1);

		releaseFirst(EMPTY_SUMMARY);
		await expect(firstTick).resolves.toBe(true);

		await expect(runScheduledCycleCoordinator()).resolves.toBe(true);
		expect(mocks.runDueCycleCoordinator).toHaveBeenCalledTimes(2);
	});

	it('clears the in-process guard after a coordinator failure so a later tick can recover', async () => {
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		mocks.runDueCycleCoordinator.mockRejectedValueOnce(new Error('database unavailable'));

		await expect(runScheduledCycleCoordinator()).resolves.toBe(true);
		expect(mocks.recordFailed).toHaveBeenCalledWith(
			expect.any(Date),
			expect.any(Date),
			expect.objectContaining({ message: 'database unavailable' })
		);

		await expect(runScheduledCycleCoordinator()).resolves.toBe(true);
		expect(mocks.runDueCycleCoordinator).toHaveBeenCalledTimes(2);
		expect(mocks.recordCompleted).toHaveBeenCalledTimes(1);
		errorSpy.mockRestore();
	});
});
