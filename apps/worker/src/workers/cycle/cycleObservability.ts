// apps/worker/src/workers/cycle/cycleObservability.ts
import type { CycleCoordinatorSummary } from './cycleCoordinator';

export type CycleCoordinatorHealthState =
	| 'disabled'
	| 'idle'
	| 'running'
	| 'healthy'
	| 'degraded'
	| 'stale';

export interface CycleCoordinatorHealthSnapshot {
	enabled: boolean;
	state: CycleCoordinatorHealthState;
	healthy: boolean;
	lastStartedAt: string | null;
	lastCompletedAt: string | null;
	lastDurationMs: number | null;
	consecutiveFailures: number;
	lastError: string | null;
	lastSummary: CycleCoordinatorSummary | null;
}

const DEFAULT_STALE_AFTER_MS = 3 * 60 * 1000;

export class CycleCoordinatorMonitor {
	private state: Omit<CycleCoordinatorHealthSnapshot, 'enabled' | 'healthy'> = {
		state: 'idle',
		lastStartedAt: null,
		lastCompletedAt: null,
		lastDurationMs: null,
		consecutiveFailures: 0,
		lastError: null,
		lastSummary: null
	};

	started(at: Date): void {
		this.state = {
			...this.state,
			state: 'running',
			lastStartedAt: at.toISOString()
		};
	}

	completed(startedAt: Date, completedAt: Date, summary: CycleCoordinatorSummary): void {
		const degraded = summary.failed > 0;
		this.state = {
			state: degraded ? 'degraded' : 'healthy',
			lastStartedAt: startedAt.toISOString(),
			lastCompletedAt: completedAt.toISOString(),
			lastDurationMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
			consecutiveFailures: degraded ? this.state.consecutiveFailures + 1 : 0,
			lastError: degraded
				? (summary.errors[0] ?? 'one or more trigger resolutions failed')
				: null,
			lastSummary: summary
		};
	}

	failed(startedAt: Date, completedAt: Date, error: unknown): void {
		this.state = {
			...this.state,
			state: 'degraded',
			lastStartedAt: startedAt.toISOString(),
			lastCompletedAt: completedAt.toISOString(),
			lastDurationMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
			consecutiveFailures: this.state.consecutiveFailures + 1,
			lastError: error instanceof Error ? error.message : String(error)
		};
	}

	snapshot(
		enabled: boolean,
		now: Date = new Date(),
		staleAfterMs: number = DEFAULT_STALE_AFTER_MS
	): CycleCoordinatorHealthSnapshot {
		if (!enabled) return { ...this.state, enabled: false, state: 'disabled', healthy: true };

		const lastCompletedAt = this.state.lastCompletedAt
			? new Date(this.state.lastCompletedAt).getTime()
			: null;
		const stale =
			this.state.state !== 'running' &&
			lastCompletedAt !== null &&
			now.getTime() - lastCompletedAt > staleAfterMs;
		const state = stale ? 'stale' : this.state.state;
		return {
			...this.state,
			enabled: true,
			state,
			healthy: state === 'healthy' || state === 'running'
		};
	}
}

const coordinatorMonitor = new CycleCoordinatorMonitor();

export function recordCycleCoordinatorStarted(at: Date): void {
	coordinatorMonitor.started(at);
}

export function recordCycleCoordinatorCompleted(
	startedAt: Date,
	completedAt: Date,
	summary: CycleCoordinatorSummary
): CycleCoordinatorHealthSnapshot {
	coordinatorMonitor.completed(startedAt, completedAt, summary);
	return coordinatorMonitor.snapshot(true, completedAt);
}

export function recordCycleCoordinatorFailed(
	startedAt: Date,
	completedAt: Date,
	error: unknown
): CycleCoordinatorHealthSnapshot {
	coordinatorMonitor.failed(startedAt, completedAt, error);
	return coordinatorMonitor.snapshot(true, completedAt);
}

export function getCycleCoordinatorHealthSnapshot(
	enabled: boolean,
	now: Date = new Date()
): CycleCoordinatorHealthSnapshot {
	return coordinatorMonitor.snapshot(enabled, now);
}
