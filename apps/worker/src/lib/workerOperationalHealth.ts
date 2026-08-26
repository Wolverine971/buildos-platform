// apps/worker/src/lib/workerOperationalHealth.ts
import { monitorEventLoopDelay } from 'node:perf_hooks';
import type { GeneralWorkerRuntimeLifecycleHealth } from './generalWorkerRuntimeLifecycle';
import type { AgenticChatBootstrapHealth } from '../workers/agentic-chat/bootstrap';

export type WorkerEventLoopLagSnapshot = {
	meanMs: number;
	p99Ms: number;
	maxMs: number;
};

export type WorkerOperationalHealthChecks = {
	lastSuccessfulClaimAt: string | null;
	claims: {
		generalLastSuccessfulAt: string | null;
	};
	database: {
		connected: boolean;
		consecutiveClaimFailures: number;
	};
	eventLoopLag: WorkerEventLoopLagSnapshot;
};

export type AgenticChatOperationalHealthChecks = {
	lastSuccessfulClaimAt: string | null;
	claims: {
		agenticChatLastSuccessfulAt: string | null;
	};
	database: {
		connected: boolean;
		consecutiveClaimFailures: number;
	};
	realtime: {
		healthy: boolean;
		status: 'unavailable' | 'idle' | 'connected' | 'degraded' | 'closed';
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
	health: GeneralWorkerRuntimeLifecycleHealth,
	eventLoopLag: WorkerEventLoopLagSnapshot
): WorkerOperationalHealthChecks {
	const generalLastSuccessfulAt = health.queue.lastSuccessfulClaimAt;
	return {
		lastSuccessfulClaimAt: generalLastSuccessfulAt,
		claims: { generalLastSuccessfulAt },
		database: {
			connected: health.queue.healthy,
			consecutiveClaimFailures: health.queue.consecutiveClaimFailures
		},
		eventLoopLag
	};
}

/**
 * Chat-only health projection for the physically isolated service. Keeping a
 * separate builder prevents the dedicated process from manufacturing a fake
 * general-queue health signal just to reuse the combined worker projection.
 */
export function buildAgenticChatOperationalHealthChecks(
	health: AgenticChatBootstrapHealth,
	eventLoopLag: WorkerEventLoopLagSnapshot
): AgenticChatOperationalHealthChecks {
	const runtime = health.runtime;
	const lastSuccessfulClaimAt = runtime?.queue.lastSuccessfulClaimAt ?? null;
	const realtime = runtime?.realtime ?? {
		healthy: false,
		status: 'unavailable' as const,
		activeChannels: 0,
		lastTransitionAt: null,
		consecutiveFailures: 0
	};

	return {
		lastSuccessfulClaimAt,
		claims: { agenticChatLastSuccessfulAt: lastSuccessfulClaimAt },
		database: {
			connected: health.enabled && runtime?.queue.healthy === true,
			consecutiveClaimFailures: runtime?.queue.consecutiveClaimFailures ?? 0
		},
		realtime,
		activeTurns: runtime?.activeTurns ?? 0,
		eventLoopLag
	};
}

function nanosecondsToMilliseconds(value: number): number {
	if (!Number.isFinite(value) || value < 0) return 0;
	return Math.round((value / 1_000_000) * 1_000) / 1_000;
}
