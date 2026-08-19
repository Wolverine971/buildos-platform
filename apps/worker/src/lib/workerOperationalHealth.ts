// apps/worker/src/lib/workerOperationalHealth.ts
import { monitorEventLoopDelay } from 'node:perf_hooks';
import type { WorkerRuntimeLifecycleHealth } from './workerRuntimeLifecycle';

export type WorkerEventLoopLagSnapshot = {
	meanMs: number;
	p99Ms: number;
	maxMs: number;
};

export type WorkerOperationalHealthChecks = {
	lastSuccessfulClaimAt: string | null;
	claims: {
		generalLastSuccessfulAt: string | null;
		agenticChatLastSuccessfulAt: string | null;
	};
	database: {
		connected: boolean;
		consecutiveClaimFailures: number;
	};
	realtime: {
		healthy: boolean;
		status: 'disabled' | 'unavailable' | 'idle' | 'connected' | 'degraded' | 'closed';
		activeChannels: number;
		lastTransitionAt: string | null;
		consecutiveFailures: number;
	};
	activeTurns: number;
	eventLoopLag: WorkerEventLoopLagSnapshot;
};

export class WorkerEventLoopLagMonitor {
	private readonly histogram = monitorEventLoopDelay({ resolution: 20 });

	constructor() {
		this.histogram.enable();
	}

	getSnapshot(): WorkerEventLoopLagSnapshot {
		return {
			meanMs: nanosecondsToMilliseconds(this.histogram.mean),
			p99Ms: nanosecondsToMilliseconds(this.histogram.percentile(99)),
			maxMs: nanosecondsToMilliseconds(this.histogram.max)
		};
	}

	stop(): void {
		this.histogram.disable();
	}
}

export function buildWorkerOperationalHealthChecks(
	health: WorkerRuntimeLifecycleHealth,
	eventLoopLag: WorkerEventLoopLagSnapshot
): WorkerOperationalHealthChecks {
	const generalLastSuccessfulAt = health.queue.lastSuccessfulClaimAt;
	const runtime = health.agenticChat.runtime;
	const agenticChatLastSuccessfulAt = runtime?.queue.lastSuccessfulClaimAt ?? null;
	const lastSuccessfulClaimAt = latestTimestamp(
		generalLastSuccessfulAt,
		agenticChatLastSuccessfulAt
	);
	const chatDatabaseConnected = !health.agenticChat.enabled || runtime?.queue.healthy === true;
	const realtime = runtime?.realtime ?? {
		healthy: !health.agenticChat.enabled,
		status: health.agenticChat.enabled ? ('unavailable' as const) : ('disabled' as const),
		activeChannels: 0,
		lastTransitionAt: null,
		consecutiveFailures: 0
	};

	return {
		lastSuccessfulClaimAt,
		claims: { generalLastSuccessfulAt, agenticChatLastSuccessfulAt },
		database: {
			connected: health.queue.healthy && chatDatabaseConnected,
			consecutiveClaimFailures:
				health.queue.consecutiveClaimFailures +
				(runtime?.queue.consecutiveClaimFailures ?? 0)
		},
		realtime,
		activeTurns: runtime?.activeTurns ?? 0,
		eventLoopLag
	};
}

function latestTimestamp(left: string | null, right: string | null): string | null {
	if (!left) return right;
	if (!right) return left;
	return Date.parse(left) >= Date.parse(right) ? left : right;
}

function nanosecondsToMilliseconds(value: number): number {
	if (!Number.isFinite(value) || value < 0) return 0;
	return Math.round((value / 1_000_000) * 1_000) / 1_000;
}
