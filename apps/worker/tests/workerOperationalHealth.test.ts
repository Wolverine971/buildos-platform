// apps/worker/tests/workerOperationalHealth.test.ts
import { describe, expect, it } from 'vitest';
import { buildWorkerOperationalHealthChecks } from '../src/lib/workerOperationalHealth';
import type { WorkerRuntimeLifecycleHealth } from '../src/lib/workerRuntimeLifecycle';

const GENERAL_CLAIM = '2026-08-19T12:00:00.000Z';
const CHAT_CLAIM = '2026-08-19T12:00:01.000Z';

describe('buildWorkerOperationalHealthChecks', () => {
	it('reports the five Phase 5 worker health signals without failing on Realtime fallback', () => {
		const checks = buildWorkerOperationalHealthChecks(enabledHealth(), {
			meanMs: 1.25,
			p99Ms: 8.5,
			maxMs: 12
		});

		expect(checks).toEqual({
			lastSuccessfulClaimAt: CHAT_CLAIM,
			claims: {
				generalLastSuccessfulAt: GENERAL_CLAIM,
				agenticChatLastSuccessfulAt: CHAT_CLAIM
			},
			database: { connected: true, consecutiveClaimFailures: 0 },
			realtime: {
				healthy: false,
				status: 'degraded',
				activeChannels: 0,
				lastTransitionAt: CHAT_CLAIM,
				consecutiveFailures: 1
			},
			activeTurns: 1,
			eventLoopLag: { meanMs: 1.25, p99Ms: 8.5, maxMs: 12 }
		});
	});

	it('reports disabled chat explicitly and derives DB loss from claim health', () => {
		const health = enabledHealth();
		health.queue = queueHealth({
			healthy: false,
			reason: 'repeated_claim_failures',
			lastSuccessfulClaimAt: null,
			lastPollSuccessAt: null,
			consecutiveClaimFailures: 3
		});
		health.agenticChat = {
			enabled: false,
			healthy: true,
			state: 'disabled',
			reason: 'disabled',
			runtime: null
		};

		expect(
			buildWorkerOperationalHealthChecks(health, { meanMs: 0, p99Ms: 0, maxMs: 0 })
		).toMatchObject({
			lastSuccessfulClaimAt: null,
			database: { connected: false, consecutiveClaimFailures: 3 },
			realtime: { healthy: true, status: 'disabled' },
			activeTurns: 0
		});
	});
});

function enabledHealth(): WorkerRuntimeLifecycleHealth {
	return {
		healthy: true,
		state: 'running',
		queue: queueHealth(),
		agenticChat: {
			enabled: true,
			healthy: true,
			state: 'running',
			runtime: {
				healthy: true,
				state: 'running',
				activeTurns: 1,
				realtime: {
					healthy: false,
					status: 'degraded',
					activeChannels: 0,
					lastTransitionAt: CHAT_CLAIM,
					consecutiveFailures: 1
				},
				recovery: {
					healthy: true,
					state: 'running',
					lastSweepStartedAt: CHAT_CLAIM,
					lastSweepFinishedAt: CHAT_CLAIM,
					lastSuccessfulSweepAt: CHAT_CLAIM,
					consecutiveSweepFailures: 0,
					lastError: null,
					lastCandidateCount: 0,
					lastAttentionRequiredCount: 0
				},
				queue: queueHealth({
					lastSuccessfulClaimAt: CHAT_CLAIM,
					lastPollSuccessAt: CHAT_CLAIM
				})
			}
		}
	};
}

function queueHealth(
	overrides: Partial<WorkerRuntimeLifecycleHealth['queue']> = {}
): WorkerRuntimeLifecycleHealth['queue'] {
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
