// apps/web/src/lib/tests/agentic-e2e/phase0/evidence-report.test.ts
import { describe, expect, it } from 'vitest';

import {
	buildPhase0EvidenceReport,
	classifyPhase0TurnResult,
	summarizePhase0Metric,
	wilson95,
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
		deterministicAssertionPassed: true,
		deterministicAssertionError: null,
		judge: {
			status: 'passed',
			threshold: 3,
			score: 4,
			passed: true,
			reasoning: 'The requested changes landed.',
			error: null
		},
		resultClass: 'end_to_end_pass',
		subchecks: [
			{ name: 'stream-health', category: 'transport', status: 'passed', error: null }
		],
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
				executionTimeMs: 40,
				decidedBy: null
			},
			{
				name: 'declare_turn_contract',
				op: null,
				success: true,
				sequenceIndex: 2,
				executionTimeMs: 15,
				decidedBy: 'contract_reviewer'
			}
		],
		controlDecisions: [
			{ name: 'declare_turn_contract', decidedBy: 'contract_reviewer', sequenceIndex: 2 }
		],
		executionObservations: [
			{
				executionGeneration: 1,
				phase: 'provider',
				eventType: 'provider_attempt_ended',
				observedAt: '2026-07-30T12:00:00.400Z',
				round: 1,
				logicalProviderRound: 1,
				routeId: 'route-a',
				modelRequested: 'model-a',
				modelUsed: 'model-a',
				provider: 'provider-a',
				status: 'success',
				durationMs: 300,
				finishReason: 'tool_calls',
				errorClass: null,
				toolName: null,
				providerToolCallId: null,
				sequenceIndex: null,
				usage: {
					promptTokens: 100,
					completionTokens: 20,
					totalTokens: 120,
					reasoningTokens: 5,
					cachedPromptTokens: 0,
					cacheWriteTokens: 0
				}
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

	it('reports a Wilson interval instead of treating a tiny cohort as a stable rate', () => {
		const interval = wilson95(1, 2);
		expect(interval.low).toBeCloseTo(0.0945, 3);
		expect(interval.high).toBeCloseTo(0.9055, 3);
	});

	it('separates provider transport failures from behavior and judge failures', () => {
		const baseOutcome = {
			deterministicAssertionPassed: false,
			deterministicAssertionError: new Error('effect missing'),
			judge: { status: 'not_reached' as const },
			overallError: new Error('effect missing')
		};
		expect(
			classifyPhase0TurnResult({
				result: {
					completed: true,
					errors: [{ error: 'provider_tool_validation_repair_exhausted' }],
					finishedReason: 'error'
				},
				turnRun: null,
				checkOutcome: baseOutcome,
				captureErrors: []
			})
		).toBe('transport_failure');
		expect(
			classifyPhase0TurnResult({
				result: { completed: true, errors: [], finishedReason: 'stop' },
				turnRun: null,
				checkOutcome: baseOutcome,
				captureErrors: []
			})
		).toBe('behavior_failure');
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
					deterministicAssertionPassed: false,
					deterministicAssertionError: 'fixture failed',
					judge: {
						status: 'not_reached',
						threshold: null,
						score: null,
						passed: null,
						reasoning: null,
						error: null
					},
					resultClass: 'behavior_failure',
					subchecks: [
						{
							name: 'resume-done',
							category: 'effect',
							status: 'failed',
							error: 'still todo'
						}
					],
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
			deterministicAssertionPassCount: 1,
			completedCount: 2,
			captureErrorTurnCount: 1,
			totalModelCostUsd: 0.03,
			judge: {
				configuredCount: 2,
				eligibleCount: 1,
				passCount: 1,
				failCount: 0,
				errorCount: 0,
				notReachedCount: 1,
				score: { samples: 1, p50: 4, p95: 4 }
			},
			resultClassCounts: {
				end_to_end_pass: 1,
				behavior_failure: 1
			},
			subchecks: { passedCount: 1, failedCount: 1, notApplicableCount: 0 },
			client: { ttftMs: { samples: 2, p50: 100, p95: 200 } },
			server: { turnAdmissionMs: { samples: 2, p50: 15, p95: 15 } },
			toolExecutionMs: { samples: 4, p50: 15, p95: 40 },
			retainedRowsPerTurn: { samples: 2, p50: 8, p95: 10 },
			retainedBytesPerTurn: { samples: 2, p50: 2_000, p95: 3_000 },
			executionObservationsPerTurn: { samples: 2, p50: 1, p95: 1 }
		});
		expect(report.schemaVersion).toBe(2);
		expect(report.configuration.executionMode).toBe('legacy_sse');
		expect(report.limitations.join(' ')).toContain('not a PostgreSQL WAL');
		expect(report.summary.scenarioResults[0]).toMatchObject({
			scenarioId: 'task-create',
			turnCount: 2,
			passCount: 1,
			passRate: 0.5
		});

		const [firstTurn] = report.turns;
		expect(firstTurn.toolExecutions[0].decidedBy).toBeNull();
		expect(firstTurn.toolExecutions[1].decidedBy).toBe('contract_reviewer');
		expect(firstTurn.controlDecisions).toEqual([
			{ name: 'declare_turn_contract', decidedBy: 'contract_reviewer', sequenceIndex: 2 }
		]);
	});
});
