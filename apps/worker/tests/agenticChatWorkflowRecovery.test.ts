// apps/worker/tests/agenticChatWorkflowRecovery.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	SupabaseAgenticChatExecutionControlAdapter,
	type AgenticChatExecutionRpcClient
} from '../src/workers/agentic-chat/turn/execution-control';
import { AgenticChatStalledRecoverySweep } from '../src/workers/agentic-chat/host/stalled-recovery';
import { AGENTIC_CHAT_WORKFLOW_CUT_SHORT_NOTE } from '../src/workers/agentic-chat/workflow/workflow-projection';
import { stableAgenticChatWorkflowAnswerMessageIdV1 } from '../src/workers/agentic-chat/workflow/workflow-terminal';

/**
 * A dead workflow turn (docs/architecture/AGENTIC_CHAT_TURN_LEASES_2026-09-23.md):
 * `recover_dead_agentic_chat_turns` runs `recover_agentic_chat_workflow_turn_v1`
 * in SQL and, when the turn must end, hands it to the worker sweep with a rotated
 * token and the workflow outcome. The sweep renders the terminal from durable
 * workflow truth, with no claim, no model call, and no second workflow recovery.
 * Requeues, stale owners, and ordinary turns never reach this path; the SQL test
 * covers them.
 */

const TURN_RUN_ID = '10000000-0000-4000-8000-000000000001';
const QUEUE_JOB_ID = '20000000-0000-4000-8000-000000000002';
const PROCESSING_TOKEN = '30000000-0000-4000-8000-000000000003';
const USER_ID = '40000000-0000-4000-8000-000000000004';
const SESSION_ID = '50000000-0000-4000-8000-000000000005';
const CORRELATION_ID = '60000000-0000-4000-8000-000000000006';
const GENERATION = 2;
const NOW = new Date('2026-09-18T12:10:00.000Z');

function ordinaryRecovery(outcome: string, overrides: Record<string, unknown> = {}) {
	return {
		outcome,
		execution_may_retry: false,
		failure_code: outcome === 'finalize_cancelled' ? 'cancelled' : 'permanent',
		turn_run_id: TURN_RUN_ID,
		queue_job_id: QUEUE_JOB_ID,
		session_id: SESSION_ID,
		user_id: USER_ID,
		correlation_id: CORRELATION_ID,
		execution_generation: GENERATION,
		status: 'running',
		...overrides
	};
}

function terminal(status: 'completed' | 'failed' | 'cancelled', failureCode: string | null) {
	return {
		outcome: 'finalized',
		turn_run_id: TURN_RUN_ID,
		queue_job_id: QUEUE_JOB_ID,
		session_id: SESSION_ID,
		user_id: USER_ID,
		execution_generation: GENERATION,
		status,
		finished_reason:
			status === 'cancelled'
				? 'cancelled'
				: status === 'completed'
					? 'stop'
					: 'worker_interrupted',
		failure_code: failureCode
	};
}

type Specialist = 'project_analyst' | 'risk_reviewer';

function durableReport(role: Specialist, summary: string) {
	return {
		version: 'chat_workflow_role_report_v1',
		role,
		summary,
		findings: [
			{
				claim: `${role} finding about the venue.`,
				basis: 'recorded',
				evidence: [
					{
						kind: 'project_record',
						id: 'task-1',
						version: 'v1',
						label: 'Task: Book the venue'
					}
				]
			}
		],
		risks: [],
		unknowns: [],
		recommendation: 'Book the venue after confirming capacity.',
		unsupportedReferences: 0,
		unsupportedFindings: 0
	};
}

function stepRow(
	key: Specialist | 'planner' | 'editor',
	status: 'pending' | 'claimed' | 'accepted' | 'failed' | 'skipped',
	result: Record<string, unknown> | null = null
) {
	return {
		key,
		status,
		attemptsUsed: status === 'pending' ? 0 : 1,
		attemptIds: [],
		currentAttemptId: null,
		currentAttemptGeneration: null,
		assignment: {},
		quality: status === 'accepted' ? 'complete' : null,
		result,
		resultHash: result ? 'a'.repeat(64) : null,
		acceptedAttemptId: null,
		failureCode: status === 'failed' ? 'workflow_specialist_unavailable' : null
	};
}

/** Durable workflow truth as the store adapter returns it. */
function runState(
	overrides: {
		steps?: Record<string, unknown>;
		answer?: Record<string, unknown>;
		userId?: string;
	} = {}
) {
	return {
		turnRunId: TURN_RUN_ID,
		sessionId: SESSION_ID,
		userId: overrides.userId ?? USER_ID,
		projectId: '90000000-0000-4000-8000-000000000009',
		requestArtifactId: '70000000-0000-4000-8000-000000000007',
		requestHash: 'b'.repeat(64),
		phase: 'executing',
		terminalOutcome: null,
		limits: {
			maxSpendMicroUsd: 250_000,
			synthesisHeadroomMicroUsd: 50_000,
			maxPhysicalDispatches: 16,
			maxStepAttempts: 2,
			wholeRunLifetimeMs: 900_000
		},
		deadlineAt: '2026-09-18T12:05:00.000Z',
		recoveryCount: 1,
		context: null,
		plan: null,
		answer: {
			answerId: null,
			editorStepAttemptId: null,
			text: '',
			textSha256: null,
			status: 'not_started',
			quality: null,
			acceptedAt: null,
			...overrides.answer
		},
		steps: overrides.steps ?? {},
		dispatches: []
	};
}

const BOTH_ACCEPTED = {
	planner: stepRow('planner', 'accepted'),
	project_analyst: stepRow(
		'project_analyst',
		'accepted',
		durableReport('project_analyst', 'The venue is the next blocker.')
	),
	risk_reviewer: stepRow(
		'risk_reviewer',
		'accepted',
		durableReport('risk_reviewer', 'Catering is the main risk.')
	),
	editor: stepRow('editor', 'claimed')
};

function createSweep(options: {
	/** recover_agentic_chat_workflow_turn_v1's decision, as the database hands it over. */
	workflowOutcome: string;
	recoveries?: unknown[];
	finalizations?: unknown[];
	/** Durable workflow truth; a function may throw. */
	run?: unknown | (() => Promise<unknown>);
}) {
	const recoveries = [...(options.recoveries ?? [])];
	const finalizations = [...(options.finalizations ?? [])];
	const control = {
		recover: vi.fn(async (_input: Record<string, unknown>) => {
			const value = recoveries.shift();
			if (!value) throw new Error('Unexpected recovery call');
			return value;
		}),
		finalize: vi.fn(async (_input: Record<string, unknown>) => {
			const value = finalizations.shift();
			if (!value) throw new Error('Unexpected finalization call');
			return value;
		})
	};
	const run = options.run ?? null;
	const workflowRuns = {
		loadRun: vi.fn(async (_turnRunId: string) =>
			typeof run === 'function' ? await (run as () => Promise<unknown>)() : run
		)
	};
	const recovery = {
		recover: vi.fn(async () => ({
			candidateCount: 1,
			hasMore: false,
			parkedCount: 0,
			results: [],
			handoffs: [
				{
					turnRunId: TURN_RUN_ID,
					queueJobId: QUEUE_JOB_ID,
					processingToken: PROCESSING_TOKEN,
					userId: USER_ID,
					correlationId: CORRELATION_ID,
					executionGeneration: GENERATION,
					startedAt: '2026-09-18T11:55:00.000Z',
					silentSince: '2026-09-18T12:00:00.000Z',
					workflowOutcome: options.workflowOutcome
				}
			],
			invalidRows: []
		}))
	};
	const sweep = new AgenticChatStalledRecoverySweep(
		{ recovery, control: control as never, workflowRuns: workflowRuns as never },
		{ now: () => NOW }
	);
	return { sweep, control, workflowRuns, recovery };
}

/** A terminal write settles the sweep: finalize, then the ordinary queue reconciliation. */
function settlesAs(status: 'completed' | 'failed', failureCode: string | null) {
	return {
		recoveries: [
			ordinaryRecovery('finalize_failed', { failure_code: 'permanent' }),
			ordinaryRecovery('queue_reconciled', { status, failure_code: failureCode })
		],
		finalizations: [terminal(status, failureCode)]
	};
}

describe('a handed-off workflow turn is rendered from durable workflow truth', () => {
	it.each([
		'deadline_expired',
		'budget_exhausted',
		'attempts_exhausted',
		'access_revoked',
		'finalize_failed'
	])(
		'fails a workflow that may not retry (%s) with no content when no report was accepted',
		async (outcome) => {
			const harness = createSweep({
				workflowOutcome: outcome,
				run: runState({
					steps: {
						planner: stepRow('planner', 'accepted'),
						project_analyst: stepRow('project_analyst', 'failed'),
						risk_reviewer: stepRow('risk_reviewer', 'claimed')
					}
				}),
				...settlesAs('failed', `workflow_${outcome}`)
			});
			await expect(harness.sweep.runOnce()).resolves.toMatchObject({
				results: [{ outcome: 'terminal_reconciled' }]
			});
			expect(harness.control.recover.mock.calls[0]?.[0]).toMatchObject({
				failureClass: 'permanent'
			});
			expect(harness.control.finalize).toHaveBeenCalledOnce();
			expect(harness.control.finalize).toHaveBeenCalledWith(
				expect.objectContaining({
					processingToken: PROCESSING_TOKEN,
					executionGeneration: GENERATION,
					status: 'failed',
					finishedReason: 'worker_interrupted',
					failureCode: `workflow_${outcome}`,
					assistantMessageId: null,
					assistantText: '',
					assistantMetadata: expect.objectContaining({ recovered_from_stall: true }),
					projection: expect.objectContaining({
						workflow: expect.objectContaining({
							phase: 'finished',
							terminalOutcome: 'failed'
						})
					}),
					eventPayload: expect.objectContaining({
						failure_code: `workflow_${outcome}`,
						recovered_from_stall: true
					})
				})
			);
		}
	);

	it('uses an accepted answer as-is', async () => {
		const answer = 'Book the venue first, then confirm the caterer.';
		const harness = createSweep({
			workflowOutcome: 'deadline_expired',
			run: runState({
				steps: { ...BOTH_ACCEPTED, editor: stepRow('editor', 'accepted') },
				answer: {
					answerId: 'a0000000-0000-4000-8000-00000000000a',
					text: answer,
					status: 'accepted',
					quality: 'complete',
					acceptedAt: '2026-09-18T12:01:00.000Z'
				}
			}),
			...settlesAs('completed', null)
		});
		await expect(harness.sweep.runOnce()).resolves.toMatchObject({
			results: [{ outcome: 'terminal_reconciled' }]
		});
		expect(harness.control.finalize).toHaveBeenCalledOnce();
		expect(harness.control.finalize.mock.calls[0]![0]).toMatchObject({
			status: 'completed',
			finishedReason: 'stop',
			failureCode: null,
			assistantText: answer,
			assistantMessageId: stableAgenticChatWorkflowAnswerMessageIdV1(TURN_RUN_ID, GENERATION),
			assistantMetadata: expect.objectContaining({
				workflow_answer_source: 'accepted_answer',
				workflow_quality: 'complete',
				recovered_from_stall: true
			}),
			projection: expect.objectContaining({
				workflow: expect.objectContaining({
					terminalOutcome: 'complete',
					coverageGap: null
				})
			})
		});
		// Settles the queue through the ordinary reconciliation after terminal truth.
		expect(harness.control.recover.mock.calls[1]?.[0]).toMatchObject({
			failureClass: 'unknown'
		});
	});

	it('keeps an unfinished durable prefix with the fixed notice and never extends it', async () => {
		const prefix = 'Book the venue first: it blocks every later';
		const harness = createSweep({
			workflowOutcome: 'budget_exhausted',
			run: runState({
				steps: BOTH_ACCEPTED,
				answer: {
					answerId: 'a0000000-0000-4000-8000-00000000000a',
					editorStepAttemptId: 'e0000000-0000-4000-8000-00000000000e',
					text: prefix,
					status: 'streaming'
				}
			}),
			...settlesAs('completed', null)
		});
		await harness.sweep.runOnce();
		const request = harness.control.finalize.mock.calls[0]![0] as Record<string, any>;
		expect(request).toMatchObject({
			status: 'completed',
			assistantText: `${prefix}${AGENTIC_CHAT_WORKFLOW_CUT_SHORT_NOTE}`,
			assistantMetadata: expect.objectContaining({
				workflow_answer_source: 'durable_prefix',
				workflow_quality: 'partial'
			}),
			projection: expect.objectContaining({
				workflow: expect.objectContaining({ terminalOutcome: 'partial' })
			})
		});
		expect(request.assistantText.startsWith(prefix)).toBe(true);
	});

	it('builds a model-free partial from accepted reports and names the missing coverage', async () => {
		const harness = createSweep({
			workflowOutcome: 'attempts_exhausted',
			run: runState({
				steps: {
					planner: stepRow('planner', 'accepted'),
					project_analyst: stepRow(
						'project_analyst',
						'accepted',
						durableReport('project_analyst', 'The venue is the next blocker.')
					),
					// Still claimed when the run stopped: it will never finish.
					risk_reviewer: stepRow('risk_reviewer', 'claimed')
				}
			}),
			...settlesAs('completed', null)
		});
		await harness.sweep.runOnce();
		const request = harness.control.finalize.mock.calls[0]![0] as Record<string, any>;
		expect(request.status).toBe('completed');
		expect(request.assistantText).toMatch(
			/^Partial review: the combined answer could not be written after its allowed attempts\./
		);
		expect(request.assistantText).toContain('The venue is the next blocker.');
		expect(request.assistantText).toContain(
			'## Risk and alternatives reviewer\n\nThis part of the review did not finish.'
		);
		expect(request.assistantMetadata).toMatchObject({
			workflow_answer_source: 'model_free_reports',
			workflow_quality: 'partial'
		});
		expect(request.projection.workflow).toMatchObject({
			terminalOutcome: 'partial',
			coverageGap:
				'The risk and alternatives reviewer did not finish, so this review is partial.'
		});
	});

	it('shows no content when access was revoked, even with an accepted answer', async () => {
		const harness = createSweep({
			workflowOutcome: 'access_revoked',
			run: runState({
				steps: { ...BOTH_ACCEPTED, editor: stepRow('editor', 'accepted') },
				answer: { text: 'Private project detail.', status: 'accepted', quality: 'complete' }
			}),
			...settlesAs('failed', 'workflow_access_revoked')
		});
		await harness.sweep.runOnce();
		expect(harness.control.finalize.mock.calls[0]![0]).toMatchObject({
			status: 'failed',
			failureCode: 'workflow_access_revoked',
			assistantText: '',
			assistantMessageId: null
		});
		expect(JSON.stringify(harness.control.finalize.mock.calls[0]![0])).not.toContain(
			'Private project detail.'
		);
	});

	it('shows no content when durable truth is missing or names another owner', async () => {
		for (const run of [null, runState({ steps: BOTH_ACCEPTED, userId: SESSION_ID })]) {
			const harness = createSweep({
				workflowOutcome: 'deadline_expired',
				run,
				...settlesAs('failed', 'workflow_deadline_expired')
			});
			await harness.sweep.runOnce();
			expect(harness.control.finalize.mock.calls[0]![0]).toMatchObject({
				status: 'failed',
				failureCode: 'workflow_deadline_expired',
				assistantText: '',
				assistantMessageId: null
			});
		}
	});

	it('retries an unreadable durable truth inside the bounded window, then finalizes once', async () => {
		let reads = 0;
		const harness = createSweep({
			workflowOutcome: 'deadline_expired',
			run: async () => {
				reads += 1;
				if (reads === 1) throw new Error('connection reset');
				return runState({ steps: BOTH_ACCEPTED });
			},
			recoveries: [
				ordinaryRecovery('finalize_failed', { failure_code: 'permanent' }),
				ordinaryRecovery('finalize_failed', { failure_code: 'permanent' }),
				ordinaryRecovery('queue_reconciled', { status: 'completed', failure_code: null })
			],
			finalizations: [terminal('completed', null)]
		});
		await expect(harness.sweep.runOnce()).resolves.toMatchObject({
			results: [{ outcome: 'terminal_reconciled' }]
		});
		expect(reads).toBe(2);
		expect(harness.control.finalize).toHaveBeenCalledOnce();
		expect(harness.control.finalize.mock.calls[0]![0]).toMatchObject({ status: 'completed' });
	});

	it('never fails a turn it cannot read: bounded retries end in manual recovery', async () => {
		const harness = createSweep({
			workflowOutcome: 'deadline_expired',
			run: async () => {
				throw new Error('connection reset');
			},
			recoveries: Array.from({ length: 4 }, () =>
				ordinaryRecovery('finalize_failed', { failure_code: 'permanent' })
			)
		});
		await expect(harness.sweep.runOnce()).resolves.toMatchObject({
			results: [
				{
					outcome: 'manual_recovery_required',
					error: 'Workflow truth read failed: connection reset'
				}
			]
		});
		expect(harness.workflowRuns!.loadRun).toHaveBeenCalledTimes(4);
		expect(harness.control.finalize).not.toHaveBeenCalled();
	});

	it('cancels a durable Stop with exactly the durable prefix, as the live worker would', async () => {
		const prefix = 'Book the venue first: it blocks every later';
		const harness = createSweep({
			workflowOutcome: 'cancel_requested',
			run: runState({ steps: BOTH_ACCEPTED, answer: { text: prefix, status: 'streaming' } }),
			recoveries: [
				ordinaryRecovery('finalize_cancelled'),
				ordinaryRecovery('queue_reconciled', {
					status: 'cancelled',
					failure_code: 'cancelled'
				})
			],
			finalizations: [terminal('cancelled', 'cancelled')]
		});
		await expect(harness.sweep.runOnce()).resolves.toMatchObject({
			results: [{ outcome: 'terminal_reconciled' }]
		});
		expect(harness.control.recover.mock.calls[0]?.[0]).toMatchObject({
			failureClass: 'cancelled'
		});
		expect(harness.control.finalize.mock.calls[0]![0]).toMatchObject({
			status: 'cancelled',
			failureCode: 'cancelled',
			finishedReason: 'cancelled',
			assistantText: prefix,
			assistantMessageId: stableAgenticChatWorkflowAnswerMessageIdV1(TURN_RUN_ID, GENERATION),
			assistantMetadata: expect.objectContaining({ recovered_from_stall: true }),
			projection: expect.objectContaining({
				workflow: expect.objectContaining({ terminalOutcome: 'cancelled' })
			})
		});
	});

	it('finalizes a durable cancellation as cancelled', async () => {
		const harness = createSweep({
			workflowOutcome: 'cancel_requested',
			recoveries: [
				ordinaryRecovery('finalize_cancelled'),
				ordinaryRecovery('queue_reconciled', {
					status: 'cancelled',
					failure_code: 'cancelled'
				})
			],
			finalizations: [terminal('cancelled', 'cancelled')]
		});
		await expect(harness.sweep.runOnce()).resolves.toMatchObject({
			results: [{ outcome: 'terminal_reconciled' }]
		});
		expect(harness.control.recover.mock.calls[0]?.[0]).toMatchObject({
			failureClass: 'cancelled'
		});
		expect(harness.control.finalize).toHaveBeenCalledWith(
			expect.objectContaining({ status: 'cancelled', failureCode: 'cancelled' })
		);
	});
});

describe('SupabaseAgenticChatExecutionControlAdapter.recoverWorkflow', () => {
	function adapterFor(data: unknown, error: { code?: string; message: string } | null = null) {
		const rpc = vi.fn(async () => ({ data, error }));
		return {
			adapter: new SupabaseAgenticChatExecutionControlAdapter({
				rpc
			} as unknown as AgenticChatExecutionRpcClient),
			rpc
		};
	}
	const input = {
		turnRunId: TURN_RUN_ID,
		queueJobId: QUEUE_JOB_ID,
		processingToken: PROCESSING_TOKEN,
		executionGeneration: GENERATION,
		failureClass: 'timeout_post_start' as const,
		errorMessage: 'Agentic Chat worker interrupted while queue ownership was stalled'
	};

	it('calls the frozen RPC with the full generation fence and parses the receipt', async () => {
		const { adapter, rpc } = adapterFor({
			outcome: 'retry_scheduled',
			execution_may_retry: true,
			turn_run_id: TURN_RUN_ID,
			failure_code: 'timeout_post_start',
			released_dispatch_count: 1,
			uncertain_dispatch_count: 1,
			uncertain_cost_held: true
		});
		await expect(adapter.recoverWorkflow(input)).resolves.toMatchObject({
			outcome: 'retry_scheduled',
			executionMayRetry: true,
			uncertainCostHeld: true
		});
		expect(rpc).toHaveBeenCalledWith('recover_agentic_chat_workflow_turn_v1', {
			p_turn_run_id: TURN_RUN_ID,
			p_queue_job_id: QUEUE_JOB_ID,
			p_processing_token: PROCESSING_TOKEN,
			p_execution_generation: GENERATION,
			p_failure_class: 'timeout_post_start',
			p_error_message: input.errorMessage
		});
	});

	it('rejects a receipt that names another turn or claims retry authority inconsistently', async () => {
		await expect(
			adapterFor({
				outcome: 'policy_denied',
				execution_may_retry: false,
				turn_run_id: QUEUE_JOB_ID
			}).adapter.recoverWorkflow(input)
		).rejects.toThrow('workflow recovery receipt names another turn');
		await expect(
			adapterFor({
				outcome: 'deadline_expired',
				execution_may_retry: true,
				turn_run_id: TURN_RUN_ID
			}).adapter.recoverWorkflow(input)
		).rejects.toThrow();
	});

	it('validates the fence before any call', async () => {
		const { adapter, rpc } = adapterFor(null);
		await expect(
			adapter.recoverWorkflow({ ...input, executionGeneration: 0 })
		).rejects.toThrow();
		expect(rpc).not.toHaveBeenCalled();
	});
});
