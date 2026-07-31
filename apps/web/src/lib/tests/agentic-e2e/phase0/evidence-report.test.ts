// apps/web/src/lib/tests/agentic-e2e/phase0/evidence-report.test.ts
import { describe, expect, it } from 'vitest';

import {
	buildPhase0EvidenceReport,
	summarizePhase0Metric,
	type Phase0RepositoryState,
	type Phase0TurnEvidence
} from './evidence-report';

const repository: Phase0RepositoryState = {
	root: '/workspace',
	head: 'a'.repeat(40),
	headTree: 'b'.repeat(40),
	branch: 'main',
	dirty: false,
	status: []
};

function turn(overrides: Partial<Phase0TurnEvidence> = {}): Phase0TurnEvidence {
	return {
		scenarioId: 'task-create',
		scenarioTitle: 'Create a task',
		scenarioCategory: 'task',
		repetition: 1,
		turnIndex: 1,
		turnLabel: null,
		streamRunId: 'stream-1',
		clientTurnId: 'client-1',
		sessionId: 'session-1',
		assertionPassed: true,
		assertionError: null,
		completed: true,
		finishedReason: 'stop',
		streamErrors: [],
		clientTiming: {
			requestStartedAt: '2026-07-30T12:00:00.000Z',
			responseHeadersMs: 20,
			firstSseEventMs: 30,
			ttftMs: 100,
			terminalEventMs: 500,
			totalDurationMs: 510
		},
		serverTiming: {
			request_started_at: '2026-07-30T12:00:00.000Z',
			phases: {
				turn_admission_ms: 15,
				time_to_first_event_ms: 25,
				time_to_first_response_ms: 90,
				assistant_persist_ms: 12,
				finalization_ms: 20,
				total_request_ms: 500
			}
		},
		eventTimings: [{ type: 'done', phase: 'finalize', sequenceIndex: 8, observedMs: 500 }],
		toolExecutions: [
			{
				name: 'onto_task_create',
				op: 'onto.task.create',
				success: true,
				sequenceIndex: 1,
				executionTimeMs: 40
			}
		],
		usage: {
			requestCount: 1,
			promptTokens: 100,
			completionTokens: 20,
			totalTokens: 120,
			totalCostUsd: 0.01,
			models: ['model-a'],
			providers: ['provider-a'],
			profiles: ['fast'],
			operations: ['agentic_chat']
		},
		turnRun: null,
		persistence: {
			kind: 'retained_chat_path_rows_v1',
			tables: [],
			totalRetainedRows: 8,
			totalApproxJsonBytes: 2_000,
			measurementDurationMs: 500,
			retainedRowsPerSecond: 16,
			note: 'retained rows only'
		},
		captureErrors: [],
		...overrides
	};
}

describe('Phase 0 evidence report', () => {
	it('uses nearest-rank percentiles for the small baseline cohort', () => {
		expect(summarizePhase0Metric([10, 20, null, 30, 40])).toEqual({
			samples: 4,
			min: 10,
			p50: 20,
			p95: 40,
			max: 40
		});
	});

	it('aggregates client, server, tool, cost, and persistence evidence', () => {
		const report = buildPhase0EvidenceReport({
			runId: 'phase0-run',
			generatedAt: '2026-07-30T13:00:00.000Z',
			repository,
			baseUrl: 'http://127.0.0.1:5199',
			scenarioIds: ['task-create'],
			repetitions: 2,
			retryCount: 0,
			turns: [
				turn(),
				turn({
					repetition: 2,
					assertionPassed: false,
					assertionError: 'fixture failed',
					captureErrors: ['timing_metrics: unavailable'],
					clientTiming: {
						...turn().clientTiming,
						ttftMs: 200
					},
					usage: { ...turn().usage, totalCostUsd: 0.02 },
					persistence: {
						...turn().persistence!,
						totalRetainedRows: 10,
						totalApproxJsonBytes: 3_000
					}
				})
			]
		});

		expect(report.summary).toMatchObject({
			turnCount: 2,
			assertionPassCount: 1,
			completedCount: 2,
			captureErrorTurnCount: 1,
			totalModelCostUsd: 0.03,
			client: { ttftMs: { samples: 2, p50: 100, p95: 200 } },
			server: { turnAdmissionMs: { samples: 2, p50: 15, p95: 15 } },
			toolExecutionMs: { samples: 2, p50: 40, p95: 40 },
			retainedRowsPerTurn: { samples: 2, p50: 8, p95: 10 },
			retainedBytesPerTurn: { samples: 2, p50: 2_000, p95: 3_000 }
		});
		expect(report.limitations.join(' ')).toContain('not a PostgreSQL WAL');
	});
});
