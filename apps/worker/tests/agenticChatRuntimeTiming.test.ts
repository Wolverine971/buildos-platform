// apps/worker/tests/agenticChatRuntimeTiming.test.ts
import { describe, expect, it } from 'vitest';
import {
	AgenticChatRuntimeTimingError,
	AgenticChatRuntimeTimingTracker
} from '../src/workers/agentic-chat/runtimeTiming';

const BASELINE = {
	admittedAt: '2026-08-03T11:59:50.000Z',
	startedAt: '2026-08-03T11:59:51.000Z',
	workerStartedAt: '2026-08-03T11:59:59.000Z',
	executionStartedAt: null,
	historyCutoffAt: '2026-08-03T11:59:51.000Z',
	requestPrewarmedContext: false,
	cacheSource: 'not_requested',
	cacheAgeSeconds: null,
	historyStrategy: 'raw_history',
	historyCompressed: false,
	rawHistoryCount: 0,
	historyForModelCount: 0,
	preparedPromptId: null,
	preparedPromptHit: false,
	preparedPromptMissReason: null,
	preparedSurfaceProfile: null
} as const;

function clock(values: number[]) {
	const remaining = [...values];
	return {
		nowMs() {
			const value = remaining.shift();
			if (value === undefined) throw new Error('Fixture monotonic clock exhausted');
			return value;
		},
		remaining
	};
}

function tracker(values: number[]) {
	return new AgenticChatRuntimeTimingTracker({
		turnRunId: '30000000-0000-4000-8000-000000000003',
		executionGeneration: 1,
		baseline: BASELINE,
		executionStartedAt: '2026-08-03T12:00:00.000Z',
		clock: clock(values)
	});
}

describe('AgenticChatRuntimeTimingTracker', () => {
	it('separates preterminal product sources from post-call terminal telemetry', () => {
		const timing = tracker([100, 110, 120, 150, 160, 190]);
		timing.observePersistedEvent('2026-08-03T12:00:00.010Z', 'turn_phase');
		timing.observePersistedEvent('2026-08-03T12:00:00.020Z', 'text_delta');
		timing.markProviderFinished();
		timing.markTerminalCallStarted();

		expect(timing.preterminalSnapshot()).toEqual({
			turnRunId: '30000000-0000-4000-8000-000000000003',
			executionGeneration: 1,
			database: {
				...BASELINE,
				executionStartedAt: '2026-08-03T12:00:00.000Z'
			},
			preterminal: {
				providerAuthorityObservedAtMs: 100,
				firstEventPersistedAt: '2026-08-03T12:00:00.010Z',
				firstEventPersistenceObservedAtMs: 110,
				firstResponsePersistedAt: '2026-08-03T12:00:00.020Z',
				firstResponsePersistenceObservedAtMs: 120,
				providerFinishedAtMs: 150,
				terminalCallStartedAtMs: 160,
				durationsMs: {
					authorityToFirstEventPersistence: 10,
					authorityToFirstResponsePersistence: 20,
					firstResponsePersistenceToProviderFinish: 30,
					authorityToProviderFinish: 50,
					providerFinishToTerminalCall: 10
				}
			}
		});
		expect(() => timing.snapshot()).toThrow(AgenticChatRuntimeTimingError);

		timing.markTerminalCallCompleted();

		expect(timing.snapshot()).toEqual({
			turnRunId: '30000000-0000-4000-8000-000000000003',
			executionGeneration: 1,
			database: {
				...BASELINE,
				executionStartedAt: '2026-08-03T12:00:00.000Z'
			},
			preterminal: {
				providerAuthorityObservedAtMs: 100,
				firstEventPersistedAt: '2026-08-03T12:00:00.010Z',
				firstEventPersistenceObservedAtMs: 110,
				firstResponsePersistedAt: '2026-08-03T12:00:00.020Z',
				firstResponsePersistenceObservedAtMs: 120,
				providerFinishedAtMs: 150,
				terminalCallStartedAtMs: 160,
				durationsMs: {
					authorityToFirstEventPersistence: 10,
					authorityToFirstResponsePersistence: 20,
					firstResponsePersistenceToProviderFinish: 30,
					authorityToProviderFinish: 50,
					providerFinishToTerminalCall: 10
				}
			},
			postcallTelemetry: {
				terminalCallCompletedAtMs: 190,
				terminalCall: 30
			}
		});
	});

	it('records first boundaries once and preserves an absent text response', () => {
		const timing = tracker([10, 15, 20, 25, 30]);
		timing.observePersistedEvent('2026-08-03T12:00:00.010Z', 'turn_phase');
		timing.observePersistedEvent('2026-08-03T12:00:00.999Z', 'session');
		timing.markProviderFinished();
		timing.markTerminalCallStarted();
		timing.markTerminalCallCompleted();

		expect(timing.snapshot()).toMatchObject({
			preterminal: {
				firstEventPersistedAt: '2026-08-03T12:00:00.010Z',
				firstEventPersistenceObservedAtMs: 15,
				firstResponsePersistedAt: null,
				firstResponsePersistenceObservedAtMs: null,
				durationsMs: {
					authorityToFirstEventPersistence: 5,
					authorityToFirstResponsePersistence: null,
					firstResponsePersistenceToProviderFinish: null
				}
			}
		});
	});

	it('fails closed if the injected clock moves backwards', () => {
		const timing = tracker([100, 99, 110]);
		expect(() =>
			timing.observePersistedEvent('2026-08-03T12:00:00.010Z', 'turn_phase')
		).toThrow(AgenticChatRuntimeTimingError);
		expect(() =>
			timing.observePersistedEvent('2026-08-03T12:00:00.020Z', 'text_delta')
		).toThrow('runtime timing source is no longer trustworthy');
	});
});
