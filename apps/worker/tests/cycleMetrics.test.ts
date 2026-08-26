// apps/worker/tests/cycleMetrics.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '../src/lib/supabase';
import {
	persistCycleCoordinatorMetrics,
	persistDailyBriefCycleShadowMetrics
} from '../src/workers/cycle/cycleMetrics';

vi.mock('../src/lib/supabase', () => ({
	supabase: { from: vi.fn() }
}));

const coordinatorSnapshot = {
	enabled: true,
	state: 'healthy' as const,
	healthy: true,
	lastStartedAt: '2026-08-26T12:00:00.000Z',
	lastCompletedAt: '2026-08-26T12:00:01.000Z',
	lastDurationMs: 1_000,
	consecutiveFailures: 0,
	lastError: null,
	lastSummary: {
		claimed: 1,
		admitted: 1,
		alreadyAdmitted: 0,
		skippedOverlap: 0,
		skippedMisfire: 0,
		failed: 0,
		oldestScheduledFor: '2026-08-26T12:00:00.000Z',
		maxDueLatencyMs: 0,
		averageDueLatencyMs: 0,
		errors: []
	}
};

const shadowSummary = {
	startedAt: '2026-08-26T12:00:00.000Z',
	completedAt: '2026-08-26T12:00:01.000Z',
	durationMs: 1_000,
	scanned: 20,
	comparable: 20,
	matched: 20,
	mismatched: 0,
	missingCycle: 0,
	invalid: 0,
	matchRatePct: 100,
	examples: []
};

describe('Cycle metrics isolation', () => {
	beforeEach(() => {
		vi.mocked(supabase.from).mockReset();
		vi.spyOn(console, 'warn').mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('does not reject a successful coordinator tick when the metrics transport throws', async () => {
		vi.mocked(supabase.from).mockImplementation(() => {
			throw new Error('metrics network unavailable');
		});

		await expect(persistCycleCoordinatorMetrics(coordinatorSnapshot)).resolves.toBeUndefined();
		expect(console.warn).toHaveBeenCalledWith(
			expect.stringContaining('metrics network unavailable')
		);
	});

	it('does not reject a shadow comparison when the metrics transport throws', async () => {
		vi.mocked(supabase.from).mockImplementation(() => {
			throw new Error('metrics network unavailable');
		});

		await expect(persistDailyBriefCycleShadowMetrics(shadowSummary)).resolves.toBeUndefined();
		expect(console.warn).toHaveBeenCalledWith(
			expect.stringContaining('metrics network unavailable')
		);
	});

	it('logs a returned persistence error without throwing', async () => {
		vi.mocked(supabase.from).mockReturnValue({
			upsert: vi.fn(async () => ({ data: null, error: { message: 'write rejected' } }))
		} as never);

		await expect(persistCycleCoordinatorMetrics(coordinatorSnapshot)).resolves.toBeUndefined();
		expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('write rejected'));
	});
});
