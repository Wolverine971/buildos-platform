// apps/worker/tests/cycleObservability.test.ts
import { describe, expect, it } from 'vitest';
import { CycleCoordinatorMonitor } from '../src/workers/cycle/cycleObservability';
import type { CycleCoordinatorSummary } from '../src/workers/cycle/cycleCoordinator';

function summary(overrides: Partial<CycleCoordinatorSummary> = {}): CycleCoordinatorSummary {
	return {
		claimed: 1,
		admitted: 1,
		alreadyAdmitted: 0,
		skippedOverlap: 0,
		skippedMisfire: 0,
		failed: 0,
		oldestScheduledFor: '2026-08-25T13:00:00.000Z',
		maxDueLatencyMs: 5_000,
		averageDueLatencyMs: 5_000,
		errors: [],
		...overrides
	};
}

describe('CycleCoordinatorMonitor', () => {
	it('reports disabled as healthy without pretending a tick ran', () => {
		const monitor = new CycleCoordinatorMonitor();

		expect(monitor.snapshot(false, new Date('2026-08-25T13:00:00Z'))).toMatchObject({
			enabled: false,
			state: 'disabled',
			healthy: true,
			lastCompletedAt: null
		});
	});

	it('records tick duration and becomes stale after three missed minute ticks', () => {
		const monitor = new CycleCoordinatorMonitor();
		const startedAt = new Date('2026-08-25T13:00:00Z');
		const completedAt = new Date('2026-08-25T13:00:02Z');

		monitor.started(startedAt);
		monitor.completed(startedAt, completedAt, summary());

		expect(monitor.snapshot(true, completedAt)).toMatchObject({
			state: 'healthy',
			healthy: true,
			lastDurationMs: 2_000,
			consecutiveFailures: 0
		});
		expect(monitor.snapshot(true, new Date('2026-08-25T13:03:03Z'))).toMatchObject({
			state: 'stale',
			healthy: false
		});
	});

	it('degrades on partial or top-level failures and resets after recovery', () => {
		const monitor = new CycleCoordinatorMonitor();
		const first = new Date('2026-08-25T13:00:00Z');
		const second = new Date('2026-08-25T13:01:00Z');

		monitor.completed(
			first,
			new Date(first.getTime() + 500),
			summary({ failed: 1, errors: ['x'] })
		);
		expect(monitor.snapshot(true, first)).toMatchObject({
			state: 'degraded',
			consecutiveFailures: 1,
			lastError: 'x'
		});

		monitor.failed(second, new Date(second.getTime() + 250), new Error('database unavailable'));
		expect(monitor.snapshot(true, second)).toMatchObject({
			state: 'degraded',
			consecutiveFailures: 2,
			lastError: 'database unavailable'
		});

		monitor.completed(second, new Date(second.getTime() + 1_000), summary());
		expect(monitor.snapshot(true, second)).toMatchObject({
			state: 'healthy',
			consecutiveFailures: 0,
			lastError: null
		});
	});
});
