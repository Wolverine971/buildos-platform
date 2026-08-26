// apps/worker/tests/workerOperationalHealth.test.ts
import { describe, expect, it } from 'vitest';
import { buildWorkerOperationalHealthChecks } from '../src/lib/workerOperationalHealth';
import type { GeneralWorkerRuntimeLifecycleHealth } from '../src/lib/generalWorkerRuntimeLifecycle';

const GENERAL_CLAIM = '2026-08-19T12:00:00.000Z';

describe('buildWorkerOperationalHealthChecks', () => {
	it('reports only the general queue health signals', () => {
		const checks = buildWorkerOperationalHealthChecks(enabledHealth(), {
			meanMs: 1.25,
			p99Ms: 8.5,
			maxMs: 12
		});

		expect(checks).toEqual({
			lastSuccessfulClaimAt: GENERAL_CLAIM,
			claims: {
				generalLastSuccessfulAt: GENERAL_CLAIM
			},
			database: { connected: true, consecutiveClaimFailures: 0 },
			eventLoopLag: { meanMs: 1.25, p99Ms: 8.5, maxMs: 12 }
		});
		expect(checks).not.toHaveProperty('realtime');
		expect(checks).not.toHaveProperty('activeTurns');
	});

	it('derives database loss from general claim health', () => {
		const health = enabledHealth();
		health.queue = queueHealth({
			healthy: false,
			reason: 'repeated_claim_failures',
			lastSuccessfulClaimAt: null,
			lastPollSuccessAt: null,
			consecutiveClaimFailures: 3
		});
		expect(
			buildWorkerOperationalHealthChecks(health, { meanMs: 0, p99Ms: 0, maxMs: 0 })
		).toMatchObject({
			lastSuccessfulClaimAt: null,
			database: { connected: false, consecutiveClaimFailures: 3 }
		});
	});
});

function enabledHealth(): GeneralWorkerRuntimeLifecycleHealth {
	return {
		healthy: true,
		state: 'running',
		queue: queueHealth()
	};
}

function queueHealth(
	overrides: Partial<GeneralWorkerRuntimeLifecycleHealth['queue']> = {}
): GeneralWorkerRuntimeLifecycleHealth['queue'] {
	return {
		healthy: true,
		startedAt: GENERAL_CLAIM,
		lastSuccessfulClaimAt: GENERAL_CLAIM,
		lastPollSuccessAt: GENERAL_CLAIM,
		consecutiveClaimFailures: 0,
		processingBatch: false,
		draining: false,
		...overrides
	};
}
