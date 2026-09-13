// apps/worker/tests/agenticChatDeliveryHealth.test.ts

import { describe, expect, it, vi } from 'vitest';
import {
	AgenticChatTurnActivityRegistry,
	agenticChatDeliveryStateFromPublisherObservationV1,
	agenticChatDeliveryStateFromPublisherV1,
	projectAgenticChatTurnProgressHealthV1,
	projectAgenticChatWorkerProgressHealthV1,
	withAgenticChatTurnActivityV1,
	type AgenticChatTurnProgressHealthInputV1
} from '../src/workers/agentic-chat/deliveryHealth';
import type { AgenticChatPublisherTurnProgressObservationV1 } from '../src/workers/agentic-chat/streamPublisher';

const NOW = '2026-09-13T12:10:00.000Z';
const NOW_MS = Date.parse(NOW);

function running(
	overrides: Partial<AgenticChatTurnProgressHealthInputV1> = {}
): AgenticChatTurnProgressHealthInputV1 {
	return {
		turnRunId: 'turn-health',
		executionGeneration: 1,
		transportStatus: 'running',
		executionPhase: 'executing',
		acceptedAt: '2026-09-13T12:00:00.000Z',
		lastDurableProgressAt: '2026-09-13T12:08:00.000Z',
		providerActivity: {
			state: 'waiting',
			lastObservedAt: '2026-09-13T12:08:00.000Z'
		},
		delivery: {
			state: 'connected',
			lastObservedAt: '2026-09-13T12:08:00.000Z'
		},
		now: NOW,
		providerActiveTimeoutMs: 300_000,
		stallTimeoutMs: 420_000,
		...overrides
	};
}

function publisherObservation(
	overrides: Partial<AgenticChatPublisherTurnProgressObservationV1> = {}
): AgenticChatPublisherTurnProgressObservationV1 {
	return {
		turnRunId: 'turn-worker',
		executionGeneration: 1,
		acceptedAt: '2026-09-13T12:00:00.000Z',
		registeredAt: '2026-09-13T12:00:01.000Z',
		durableSequence: 4,
		lastDurableProgressAt: '2026-09-13T12:09:50.000Z',
		lastDurableEventType: 'tool_result',
		lastDelivery: 'broadcast_acknowledged',
		lastDeliveryAt: '2026-09-13T12:09:51.000Z',
		reconcileOnly: false,
		blockedReason: null,
		pendingPersistenceEvents: 0,
		pendingDeliveryEvents: 0,
		oldestPendingDeliveryAgeMs: null,
		...overrides
	};
}

describe('Agentic Chat per-turn progress health', () => {
	it('keeps an accepted turn queued without inventing semantic progress', () => {
		const projection = projectAgenticChatTurnProgressHealthV1(
			running({
				executionGeneration: null,
				transportStatus: 'queued',
				executionPhase: 'queued',
				lastDurableProgressAt: null,
				providerActivity: { state: 'not_started', lastObservedAt: null },
				delivery: { state: 'not_started', lastObservedAt: null }
			})
		);

		expect(projection).toMatchObject({
			executionState: 'queued',
			queueAgeMs: 600_000,
			durableProgress: { lastObservedAt: null, ageMs: null, source: 'database' },
			stall: { stalled: false, reason: null }
		});
	});

	it('distinguishes bounded provider work from a stalled turn', () => {
		const providerActive = projectAgenticChatTurnProgressHealthV1(
			running({
				lastDurableProgressAt: '2026-09-13T12:00:30.000Z',
				providerActivity: {
					state: 'active',
					lastObservedAt: '2026-09-13T12:07:00.000Z'
				}
			})
		);
		const stalled = projectAgenticChatTurnProgressHealthV1(
			running({
				lastDurableProgressAt: '2026-09-13T12:00:30.000Z',
				providerActivity: {
					state: 'active',
					lastObservedAt: '2026-09-13T12:04:00.000Z'
				}
			})
		);

		expect(providerActive).toMatchObject({
			executionState: 'provider_active',
			providerActivity: { ageMs: 180_000, source: 'worker_memory' },
			stall: { stalled: false }
		});
		expect(stalled).toMatchObject({
			executionState: 'stalled',
			stall: { stalled: true, reason: 'durable_progress_overdue' }
		});
	});

	it('reports disconnected and delayed delivery without claiming execution stopped', () => {
		const projection = projectAgenticChatTurnProgressHealthV1(
			running({
				delivery: {
					state: 'disconnected',
					lastObservedAt: '2026-09-13T12:09:30.000Z',
					pendingEvents: 3,
					oldestPendingAgeMs: 12_000
				}
			})
		);

		expect(projection).toMatchObject({
			executionState: 'active',
			delivery: {
				state: 'disconnected',
				disconnected: true,
				ageMs: 30_000,
				pendingEvents: 3,
				oldestPendingAgeMs: 12_000,
				delayed: true,
				source: 'worker_memory'
			},
			stall: { stalled: false }
		});
	});

	it('keeps terminal truth authoritative over old activity observations', () => {
		const projection = projectAgenticChatTurnProgressHealthV1(
			running({
				transportStatus: 'completed',
				executionPhase: 'finished',
				lastDurableProgressAt: '2026-09-13T12:00:30.000Z',
				providerActivity: {
					state: 'finished',
					lastObservedAt: '2026-09-13T12:00:30.000Z'
				},
				delivery: {
					state: 'finished',
					lastObservedAt: '2026-09-13T12:00:31.000Z'
				}
			})
		);

		expect(projection.executionState).toBe('terminal');
		expect(projection.stall).toMatchObject({ stalled: false, reason: null });
	});

	it('clamps small database-ahead clock skew instead of failing a health read', () => {
		const projection = projectAgenticChatTurnProgressHealthV1(
			running({
				acceptedAt: '2026-09-13T12:10:00.004Z',
				lastDurableProgressAt: '2026-09-13T12:10:00.003Z',
				lastDurableEventType: 'text_delta',
				delivery: { state: 'connected', lastObservedAt: NOW }
			})
		);

		expect(projection).toMatchObject({
			executionState: 'active',
			durableProgress: { ageMs: 0, lastEventType: 'text_delta' },
			delivery: { ageMs: 0, delayed: false }
		});
	});

	it('exposes only bounded event-type identifiers as the last durable progress', () => {
		const projection = projectAgenticChatTurnProgressHealthV1(
			running({ lastDurableEventType: 'Summarize my private board meeting notes' })
		);

		expect(projection.durableProgress.lastEventType).toBeNull();
	});

	it('maps delivery outcomes without treating uncertain acknowledgement as connected', () => {
		expect(agenticChatDeliveryStateFromPublisherV1('broadcast_acknowledged')).toBe('connected');
		expect(agenticChatDeliveryStateFromPublisherV1('broadcast_sent_reconcile_pending')).toBe(
			'uncertain'
		);
		expect(agenticChatDeliveryStateFromPublisherV1('reconcile_only')).toBe('disconnected');
		expect(agenticChatDeliveryStateFromPublisherV1('already_persisted')).toBe('uncertain');
	});

	it('derives stream-level delivery state from sticky publisher evidence only', () => {
		expect(
			agenticChatDeliveryStateFromPublisherObservationV1(
				publisherObservation({ lastDelivery: 'broadcast_sent_reconcile_pending' })
			)
		).toBe('connected');
		expect(
			agenticChatDeliveryStateFromPublisherObservationV1(
				publisherObservation({ lastDelivery: 'reconcile_only', reconcileOnly: true })
			)
		).toBe('disconnected');
		expect(
			agenticChatDeliveryStateFromPublisherObservationV1(
				publisherObservation({
					lastDelivery: 'broadcast_sent_reconcile_pending',
					reconcileOnly: true
				})
			)
		).toBe('uncertain');
		expect(
			agenticChatDeliveryStateFromPublisherObservationV1(
				publisherObservation({ blockedReason: 'ownership_lost' })
			)
		).toBe('blocked');
		expect(
			agenticChatDeliveryStateFromPublisherObservationV1(
				publisherObservation({ lastDelivery: null, lastDeliveryAt: null })
			)
		).toBe('not_started');
	});
});

describe('Agentic Chat worker turn activity registry', () => {
	it('tracks open provider attempts per generation and forgets released turns', () => {
		let nowMs = NOW_MS - 60_000;
		const registry = new AgenticChatTurnActivityRegistry({ now: () => nowMs });

		expect(registry.snapshot('turn-a', 1)).toEqual({
			state: 'not_started',
			lastObservedAt: null
		});
		registry.observe({
			turnRunId: 'turn-a',
			executionGeneration: 1,
			eventType: 'provider_attempt_started'
		});
		expect(registry.snapshot('turn-a', 1)).toEqual({
			state: 'active',
			lastObservedAt: '2026-09-13T12:09:00.000Z'
		});
		registry.observe({
			turnRunId: 'turn-a',
			executionGeneration: 1,
			eventType: 'tool_execution_started'
		});
		nowMs += 5_000;
		registry.observe({
			turnRunId: 'turn-a',
			executionGeneration: 1,
			eventType: 'provider_attempt_ended'
		});
		expect(registry.snapshot('turn-a', 1)).toEqual({
			state: 'waiting',
			lastObservedAt: '2026-09-13T12:09:05.000Z'
		});
		expect(registry.snapshot('turn-a', 2).state).toBe('not_started');

		registry.prune([]);
		expect(registry.snapshot('turn-a', 1).state).toBe('not_started');
	});

	it('records provider activity before a durable observation write that fails', async () => {
		const registry = new AgenticChatTurnActivityRegistry({ now: () => NOW_MS });
		const durable = {
			observe: vi.fn(async () => {
				throw new Error('observation write timed out');
			})
		};
		const port = withAgenticChatTurnActivityV1(durable, registry);

		await expect(
			port.observe(
				{
					turnRunId: 'turn-b',
					executionGeneration: 1,
					eventType: 'provider_attempt_started'
				} as never,
				new AbortController().signal
			)
		).rejects.toThrow('observation write timed out');
		expect(durable.observe).toHaveBeenCalledOnce();
		expect(registry.snapshot('turn-b', 1).state).toBe('active');
	});

	it('bounds retained turns', () => {
		const registry = new AgenticChatTurnActivityRegistry({ now: () => NOW_MS, maxTurns: 2 });
		for (const turnRunId of ['turn-1', 'turn-2', 'turn-3']) {
			registry.observe({
				turnRunId,
				executionGeneration: 1,
				eventType: 'provider_attempt_started'
			});
		}
		expect(registry.snapshot('turn-1', 1).state).toBe('not_started');
		expect(registry.snapshot('turn-3', 1).state).toBe('active');
	});
});

describe('Agentic Chat worker progress health surface', () => {
	it('separates a long provider call, a stalled turn, and disconnected delivery', () => {
		const registry = new AgenticChatTurnActivityRegistry({
			now: () => Date.parse('2026-09-13T12:06:00.000Z')
		});
		registry.observe({
			turnRunId: 'turn-long-provider',
			executionGeneration: 1,
			eventType: 'provider_attempt_started'
		});

		const health = projectAgenticChatWorkerProgressHealthV1({
			publisher: [
				publisherObservation({
					turnRunId: 'turn-long-provider',
					lastDurableProgressAt: '2026-09-13T12:01:00.000Z'
				}),
				publisherObservation({
					turnRunId: 'turn-stalled',
					lastDurableProgressAt: '2026-09-13T12:01:00.000Z'
				}),
				publisherObservation({
					turnRunId: 'turn-disconnected',
					lastDelivery: 'reconcile_only',
					reconcileOnly: true,
					pendingDeliveryEvents: 2,
					oldestPendingDeliveryAgeMs: 9_000
				})
			],
			activity: registry,
			now: NOW,
			providerActiveTimeoutMs: 300_000,
			stallTimeoutMs: 420_000
		});

		expect(health).toMatchObject({
			stalledTurns: 1,
			delayedDeliveryTurns: 1,
			omittedTurns: 0
		});
		expect(
			health.turns.map((turn) => [turn.turnRunId, turn.executionState, turn.delivery.state])
		).toEqual([
			['turn-long-provider', 'provider_active', 'connected'],
			['turn-stalled', 'stalled', 'connected'],
			['turn-disconnected', 'active', 'disconnected']
		]);
		const serialized = JSON.stringify(health);
		expect(serialized).not.toContain('assistant');
		expect(serialized).not.toContain('prompt');
	});

	it('omits invalid or excess turns instead of failing the health read', () => {
		const health = projectAgenticChatWorkerProgressHealthV1({
			publisher: [
				publisherObservation({ turnRunId: 'turn-ok' }),
				publisherObservation({ turnRunId: 'turn-bad', acceptedAt: 'not-a-timestamp' }),
				publisherObservation({ turnRunId: 'turn-excess' })
			],
			activity: new AgenticChatTurnActivityRegistry({ now: () => NOW_MS }),
			now: NOW,
			providerActiveTimeoutMs: 300_000,
			stallTimeoutMs: 420_000,
			maxTurns: 1
		});

		expect(health.turns.map((turn) => turn.turnRunId)).toEqual(['turn-ok']);
		expect(health.omittedTurns).toBe(2);
	});
});
