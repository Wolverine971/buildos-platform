// apps/worker/tests/scheduler.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

const schedulerMocks = vi.hoisted(() => ({
	cleanupStaleJobs: vi.fn(),
	supabaseFrom: vi.fn(),
	supabaseRpc: vi.fn(),
	runAgentRunCostReconciliation: vi.fn(),
	agentRunCostReconciliationEnabled: vi.fn(() => false)
}));

// Mock the imports
vi.mock('../src/lib/supabase', () => ({
	supabase: {
		from: schedulerMocks.supabaseFrom,
		rpc: schedulerMocks.supabaseRpc
	}
}));

vi.mock('../src/lib/utils/queueCleanup', () => ({
	cleanupStaleJobs: schedulerMocks.cleanupStaleJobs
}));

vi.mock('../src/workers/agent-run/agentRunCostReconciler', () => ({
	runAgentRunCostReconciliation: schedulerMocks.runAgentRunCostReconciliation,
	agentRunCostReconciliationEnabled: schedulerMocks.agentRunCostReconciliationEnabled
}));

vi.mock('../src/lib/queue', () => ({
	queue: {
		add: vi.fn(),
		cancelBriefJobsForDate: vi.fn()
	}
}));

// calculateNextRunTime / validateUserPreference are covered in
// scheduler.comprehensive.test.ts.
import {
	calculateNextOperativeRunTime,
	runQueueRetentionCleanup,
	runScheduledAgentRunCostReconciliation
} from '../src/scheduler';
import { PRIVACY_RETENTION_TASKS } from '../src/scheduler/privacyRetention';

describe('Scheduler', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		schedulerMocks.cleanupStaleJobs.mockResolvedValue({
			staleCancelled: 0,
			oldFailedCancelled: 0,
			completedDeleted: 0,
			errors: []
		});
		schedulerMocks.supabaseRpc.mockResolvedValue({ data: 2, error: null });
		schedulerMocks.runAgentRunCostReconciliation.mockResolvedValue({
			claimed: 0,
			settled: 0,
			retryScheduled: 0,
			needsOperator: 0,
			leaseConflicts: 0,
			errors: 0
		});
	});

	describe('calculateNextOperativeRunTime', () => {
		it('schedules a daily Operative in the configured timezone', () => {
			const nextRun = calculateNextOperativeRunTime(
				{
					schedule_frequency: 'daily',
					schedule_time_of_day: '09:30:00',
					schedule_day_of_week: null,
					schedule_timezone: 'America/New_York'
				},
				new Date('2024-01-15T13:00:00Z')
			);

			expect(nextRun).toEqual(new Date('2024-01-15T14:30:00Z'));
		});

		it('rolls a weekly Operative to the next requested weekday after the time passes', () => {
			const nextRun = calculateNextOperativeRunTime(
				{
					schedule_frequency: 'weekly',
					schedule_time_of_day: '09:00:00',
					schedule_day_of_week: 1,
					schedule_timezone: 'UTC'
				},
				new Date('2024-01-15T10:00:00Z')
			);

			expect(nextRun).toEqual(new Date('2024-01-22T09:00:00Z'));
		});
	});

	describe('runQueueRetentionCleanup', () => {
		// Each drained store makes exactly one call when its first batch is empty.
		const taskCount = PRIVACY_RETENTION_TASKS.length;

		beforeEach(() => {
			// An empty summary is a drained batch.
			schedulerMocks.supabaseRpc.mockResolvedValue({ data: {}, error: null });
		});

		it('runs queue cleanup, then drains the existing chat cleanups before the privacy stores', async () => {
			await runQueueRetentionCleanup();

			expect(schedulerMocks.cleanupStaleJobs).toHaveBeenCalledOnce();
			const calledNames = schedulerMocks.supabaseRpc.mock.calls.map(([name]) => name);
			expect(calledNames.slice(0, 5)).toEqual([
				'cleanup_agentic_chat_worker_artifacts',
				'cleanup_agentic_chat_prompt_artifacts',
				'cleanup_agentic_chat_sensitive_transcripts',
				'cleanup_expired_agent_call_bootstrap_links',
				'cleanup_agentic_chat_workflow_dispatches_v1'
			]);
			expect(schedulerMocks.supabaseRpc).toHaveBeenCalledWith(
				'cleanup_agentic_chat_worker_artifacts',
				{ p_batch_size: 500 }
			);
			expect(schedulerMocks.supabaseRpc).toHaveBeenCalledWith(
				'cleanup_privacy_chat_turn_effects',
				{ p_batch_size: 500 }
			);
			expect(schedulerMocks.supabaseRpc).toHaveBeenCalledWith(
				'list_privacy_chat_temp_orphans',
				{ p_limit: 500 }
			);
			expect(schedulerMocks.supabaseRpc).toHaveBeenCalledWith(
				'claim_privacy_expired_brief_audio',
				{ p_limit: 500 }
			);
			expect(calledNames).toHaveLength(taskCount);
		});

		it('keeps later stores running when one cleanup function is unavailable', async () => {
			schedulerMocks.supabaseRpc.mockImplementation(async (fn: string) => {
				if (fn === 'cleanup_agentic_chat_worker_artifacts') {
					return { data: null, error: { code: 'PGRST202' } };
				}
				return { data: {}, error: null };
			});

			await runQueueRetentionCleanup();

			expect(schedulerMocks.supabaseRpc.mock.calls).toHaveLength(taskCount);
			expect(schedulerMocks.supabaseRpc).toHaveBeenCalledWith(
				'cleanup_agentic_chat_prompt_artifacts',
				{ p_batch_size: 500 }
			);
		});

		it('drains full prompt-retention batches until one deletes nothing', async () => {
			let promptBatch = 0;
			schedulerMocks.supabaseRpc.mockImplementation(async (fn: string) => {
				if (fn !== 'cleanup_agentic_chat_prompt_artifacts') {
					return { data: {}, error: null };
				}
				promptBatch += 1;
				return {
					data: {
						prompt_snapshots_deleted: promptBatch < 3 ? 1000 : 0,
						prepared_prompts_deleted: promptBatch === 3 ? 7 : 0,
						rendered_dumps_cleared: 0,
						batch_size: 500
					},
					error: null
				};
			});

			await runQueueRetentionCleanup();

			expect(
				schedulerMocks.supabaseRpc.mock.calls.filter(
					([name]) => name === 'cleanup_agentic_chat_prompt_artifacts'
				)
			).toHaveLength(4);
		});
	});

	describe('runScheduledAgentRunCostReconciliation', () => {
		it('coalesces overlapping scheduler ticks in one process', async () => {
			let finish!: () => void;
			schedulerMocks.runAgentRunCostReconciliation.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						finish = () =>
							resolve({
								claimed: 1,
								settled: 1,
								retryScheduled: 0,
								needsOperator: 0,
								leaseConflicts: 0,
								errors: 0
							});
					})
			);

			const first = runScheduledAgentRunCostReconciliation();
			const overlapping = await runScheduledAgentRunCostReconciliation();
			expect(overlapping).toBe(false);
			expect(schedulerMocks.runAgentRunCostReconciliation).toHaveBeenCalledOnce();

			finish();
			await expect(first).resolves.toBe(true);
		});
	});
});
