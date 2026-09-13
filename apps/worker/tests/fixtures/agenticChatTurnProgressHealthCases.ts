// apps/worker/tests/fixtures/agenticChatTurnProgressHealthCases.ts
//
// Canonical per-turn progress states for Tasker 88's chat UI. The JSON beside
// this file is generated from the real projection and guarded by a golden
// test, so UI fixtures cannot drift from worker semantics. `meaning` explains
// the state for the UI owner; it is not user-facing copy.

import type { AgenticChatTurnProgressHealthInputV1 } from '../../src/workers/agentic-chat/deliveryHealth';

const NOW = '2026-09-13T12:10:00.000Z';
const ACCEPTED_AT = '2026-09-13T12:00:00.000Z';
const LIMITS = {
	now: NOW,
	providerActiveTimeoutMs: 300_000,
	stallTimeoutMs: 420_000
} as const;

export type AgenticChatTurnProgressHealthCaseV1 = {
	name: string;
	meaning: string;
	input: AgenticChatTurnProgressHealthInputV1;
};

export const canonicalAgenticChatTurnProgressHealthCasesV1: AgenticChatTurnProgressHealthCaseV1[] =
	[
		{
			name: 'queued',
			meaning: 'Durably accepted and waiting for a worker; no semantic progress is implied.',
			input: {
				...LIMITS,
				turnRunId: 'fixture-queued',
				executionGeneration: null,
				transportStatus: 'queued',
				executionPhase: 'queued',
				acceptedAt: '2026-09-13T12:09:40.000Z',
				lastDurableProgressAt: null,
				providerActivity: { state: 'not_started', lastObservedAt: null },
				delivery: { state: 'not_started', lastObservedAt: null }
			}
		},
		{
			name: 'preparing',
			meaning: 'A worker holds the turn and recently saved progress before any model call.',
			input: {
				...LIMITS,
				turnRunId: 'fixture-preparing',
				executionGeneration: 1,
				transportStatus: 'running',
				executionPhase: 'preparing',
				acceptedAt: '2026-09-13T12:09:50.000Z',
				lastDurableProgressAt: '2026-09-13T12:09:52.000Z',
				lastDurableEventType: 'turn_phase',
				providerActivity: { state: 'not_started', lastObservedAt: null },
				delivery: {
					state: 'connected',
					lastObservedAt: '2026-09-13T12:09:52.100Z',
					pendingEvents: 0,
					oldestPendingAgeMs: null
				}
			}
		},
		{
			name: 'long_provider_call',
			meaning:
				'No new saved progress for minutes, but a model call started within its deadline is still running.',
			input: {
				...LIMITS,
				turnRunId: 'fixture-long-provider',
				executionGeneration: 1,
				transportStatus: 'running',
				executionPhase: 'executing',
				acceptedAt: ACCEPTED_AT,
				lastDurableProgressAt: '2026-09-13T12:06:30.000Z',
				lastDurableEventType: 'tool_result',
				providerActivity: { state: 'active', lastObservedAt: '2026-09-13T12:07:00.000Z' },
				delivery: {
					state: 'connected',
					lastObservedAt: '2026-09-13T12:06:30.200Z',
					pendingEvents: 0,
					oldestPendingAgeMs: null
				}
			}
		},
		{
			name: 'delivery_disconnected',
			meaning:
				'Work keeps saving progress while live delivery is down; the client must reconcile, not report failure.',
			input: {
				...LIMITS,
				turnRunId: 'fixture-delivery-disconnected',
				executionGeneration: 1,
				transportStatus: 'running',
				executionPhase: 'executing',
				acceptedAt: ACCEPTED_AT,
				lastDurableProgressAt: '2026-09-13T12:09:58.000Z',
				lastDurableEventType: 'text_delta',
				providerActivity: { state: 'active', lastObservedAt: '2026-09-13T12:09:30.000Z' },
				delivery: {
					state: 'disconnected',
					lastObservedAt: '2026-09-13T12:09:20.000Z',
					pendingEvents: 0,
					oldestPendingAgeMs: null
				}
			}
		},
		{
			name: 'delivery_delayed',
			meaning:
				'Progress is saved and the stream is connected, but live delivery is several seconds behind.',
			input: {
				...LIMITS,
				turnRunId: 'fixture-delivery-delayed',
				executionGeneration: 1,
				transportStatus: 'running',
				executionPhase: 'executing',
				acceptedAt: ACCEPTED_AT,
				lastDurableProgressAt: '2026-09-13T12:09:59.000Z',
				lastDurableEventType: 'text_delta',
				providerActivity: { state: 'active', lastObservedAt: '2026-09-13T12:09:40.000Z' },
				delivery: {
					state: 'connected',
					lastObservedAt: '2026-09-13T12:09:51.000Z',
					pendingEvents: 6,
					oldestPendingAgeMs: 8_000
				}
			}
		},
		{
			name: 'stalled',
			meaning:
				'No saved progress past the stall threshold and no bounded model call explains the silence.',
			input: {
				...LIMITS,
				turnRunId: 'fixture-stalled',
				executionGeneration: 1,
				transportStatus: 'running',
				executionPhase: 'executing',
				acceptedAt: ACCEPTED_AT,
				lastDurableProgressAt: '2026-09-13T12:02:00.000Z',
				lastDurableEventType: 'tool_call',
				providerActivity: { state: 'waiting', lastObservedAt: '2026-09-13T12:01:55.000Z' },
				delivery: {
					state: 'connected',
					lastObservedAt: '2026-09-13T12:02:00.300Z',
					pendingEvents: 0,
					oldestPendingAgeMs: null
				}
			}
		},
		{
			name: 'completed',
			meaning:
				'Terminal database truth wins over any older activity or delivery observation.',
			input: {
				...LIMITS,
				turnRunId: 'fixture-completed',
				executionGeneration: 1,
				transportStatus: 'completed',
				executionPhase: 'finished',
				acceptedAt: ACCEPTED_AT,
				lastDurableProgressAt: '2026-09-13T12:03:00.000Z',
				lastDurableEventType: 'done',
				providerActivity: { state: 'finished', lastObservedAt: '2026-09-13T12:02:58.000Z' },
				delivery: {
					state: 'finished',
					lastObservedAt: '2026-09-13T12:03:00.200Z',
					pendingEvents: 0,
					oldestPendingAgeMs: null
				}
			}
		}
	];
