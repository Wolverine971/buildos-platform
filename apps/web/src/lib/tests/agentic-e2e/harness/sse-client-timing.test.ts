// apps/web/src/lib/tests/agentic-e2e/harness/sse-client-timing.test.ts
import { describe, expect, it } from 'vitest';

import {
	createTurnEventTiming,
	createTurnTiming,
	readServerTiming,
	recordTurnEventTiming
} from './sse-client';

describe('agentic E2E client timing', () => {
	it('records TTFT from the first text event, not the first SSE event', () => {
		const timing = createTurnTiming('2026-07-24T17:00:00.000Z');

		recordTurnEventTiming(timing, 'session', 12.5);
		recordTurnEventTiming(timing, 'turn_phase', 30);
		recordTurnEventTiming(timing, 'text_delta', 84.25);
		recordTurnEventTiming(timing, 'text_delta', 90);
		recordTurnEventTiming(timing, 'done', 140);

		expect(timing).toEqual({
			requestStartedAt: '2026-07-24T17:00:00.000Z',
			responseHeadersMs: null,
			firstSseEventMs: 12.5,
			ttftMs: 84.25,
			terminalEventMs: 140,
			totalDurationMs: null
		});
	});

	it('never records negative elapsed time', () => {
		const timing = createTurnTiming();
		recordTurnEventTiming(timing, 'text', -1);
		expect(timing.firstSseEventMs).toBe(0);
		expect(timing.ttftMs).toBe(0);
	});

	it('retains only timing and envelope metadata for the event timeline', () => {
		expect(
			createTurnEventTiming(
				{
					type: 'tool_result',
					phase: 'tool',
					sequence_index: 7,
					result: { private: 'not retained' }
				},
				42.5
			)
		).toEqual({
			type: 'tool_result',
			phase: 'tool',
			sequenceIndex: 7,
			observedMs: 42.5
		});
	});

	it('accepts the server timing event used by the Phase 0 artifact', () => {
		expect(
			readServerTiming({
				type: 'timing',
				timing: {
					request_started_at: '2026-07-30T12:00:00.000Z',
					phases: { turn_admission_ms: 18, total_request_ms: 140 }
				}
			})
		).toEqual({
			request_started_at: '2026-07-30T12:00:00.000Z',
			phases: { turn_admission_ms: 18, total_request_ms: 140 }
		});
		expect(readServerTiming({ type: 'timing', timing: { phases: {} } })).toBeNull();
	});
});
