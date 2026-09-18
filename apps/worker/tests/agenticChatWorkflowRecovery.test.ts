// apps/worker/tests/agenticChatWorkflowRecovery.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	AgenticChatExecutionControlRpcError,
	SupabaseAgenticChatExecutionControlAdapter,
	type AgenticChatExecutionRpcClient
} from '../src/workers/agentic-chat/executionControl';
import { AgenticChatStalledRecoverySweep } from '../src/workers/agentic-chat/stalledRecovery';

/**
 * Tasker 87 slice B: stalled-worker detection routes enforced read-only workflow
 * turns through Tasker 85's atomic recovery. Ordinary turns get `policy_denied` and
 * must see exactly the ordinary recovery they had before.
 */

const TURN_RUN_ID = '10000000-0000-4000-8000-000000000001';
const QUEUE_JOB_ID = '20000000-0000-4000-8000-000000000002';
const PROCESSING_TOKEN = '30000000-0000-4000-8000-000000000003';
const USER_ID = '40000000-0000-4000-8000-000000000004';
const SESSION_ID = '50000000-0000-4000-8000-000000000005';
const CORRELATION_ID = '60000000-0000-4000-8000-000000000006';
const GENERATION = 2;
const NOW = new Date('2026-09-18T12:10:00.000Z');

const candidate = {
	turnRunId: TURN_RUN_ID,
	queueJobId: QUEUE_JOB_ID,
	processingToken: PROCESSING_TOKEN,
	userId: USER_ID,
	correlationId: CORRELATION_ID,
	startedAt: '2026-09-18T11:55:00.000Z',
	stalledAt: '2026-09-18T12:00:00.000Z'
} as const;

function claimed(overrides: Record<string, unknown> = {}) {
	return {
		outcome: 'matching_current_claim',
		executionMayStart: false,
		turnRunId: TURN_RUN_ID,
		queueJobId: QUEUE_JOB_ID,
		sessionId: SESSION_ID,
		userId: USER_ID,
		correlationId: CORRELATION_ID,
		executionGeneration: GENERATION,
		status: 'running',
		inputArtifactId: '70000000-0000-4000-8000-000000000007',
		userMessageId: '80000000-0000-4000-8000-000000000008',
		...overrides
	};
}

function ordinaryRecovery(outcome: string, overrides: Record<string, unknown> = {}) {
	return {
		outcome,
		execution_may_retry: outcome === 'retry_scheduled',
		failure_code: outcome === 'finalize_cancelled' ? 'cancelled' : 'timeout_post_start',
		turn_run_id: TURN_RUN_ID,
		queue_job_id: QUEUE_JOB_ID,
		session_id: SESSION_ID,
		user_id: USER_ID,
		correlation_id: CORRELATION_ID,
		execution_generation: GENERATION,
		status: outcome === 'retry_scheduled' ? 'queued' : 'running',
		...overrides
	};
}

function workflowReceipt(outcome: string, extra: Record<string, unknown> = {}) {
	return {
		outcome,
		executionMayRetry: outcome === 'retry_scheduled',
		reason: null,
		uncertainCostHeld: false,
		raw: { outcome, turn_run_id: TURN_RUN_ID, ...extra }
	};
}

const snapshot = {
	turnRunId: TURN_RUN_ID,
	sessionId: SESSION_ID,
	userId: USER_ID,
	streamRunId: 'stream-run-1',
	clientTurnId: 'client-turn-1',
	executionGeneration: GENERATION,
	status: 'running',
	assistantText: '',
	projection: { version: 'agentic_chat_ui_projection_v1', semantic_events: [] },
	durableSequence: 4
} as const;

function terminal(status: 'failed' | 'cancelled', failureCode: string) {
	return {
		outcome: 'finalized',
		turn_run_id: TURN_RUN_ID,
		queue_job_id: QUEUE_JOB_ID,
		session_id: SESSION_ID,
		user_id: USER_ID,
		execution_generation: GENERATION,
		status,
		finished_reason: status === 'cancelled' ? 'cancelled' : 'worker_interrupted',
		failure_code: failureCode
	};
}

function createSweep(options: {
	claim?: unknown;
	workflow?: unknown | ((input: Record<string, unknown>) => Promise<unknown>) | null;
	recoveries?: unknown[];
	finalizations?: unknown[];
}) {
	const recoveries = [...(options.recoveries ?? [])];
	const finalizations = [...(options.finalizations ?? [])];
	const control: Record<string, ReturnType<typeof vi.fn>> = {
		claim: vi.fn(async () => options.claim ?? claimed()),
		recover: vi.fn(async (_input: Record<string, unknown>) => {
			const value = recoveries.shift();
			if (!value) throw new Error('Unexpected ordinary recovery call');
			return value;
		}),
		finalize: vi.fn(async (_input: Record<string, unknown>) => {
			const value = finalizations.shift();
			if (!value) throw new Error('Unexpected finalization call');
			return value;
		})
	};
	if (options.workflow !== null && options.workflow !== undefined) {
		const workflow = options.workflow;
		control.recoverWorkflow = vi.fn(async (input: Record<string, unknown>) =>
			typeof workflow === 'function'
				? await (workflow as (input: Record<string, unknown>) => Promise<unknown>)(input)
				: workflow
		);
	}
	const snapshots = { load: vi.fn(async () => snapshot) };
	const sweep = new AgenticChatStalledRecoverySweep(
		{
			candidates: { list: vi.fn(async () => [candidate]) },
			control: control as never,
			snapshots: snapshots as never
		},
		{ now: () => NOW, stallTimeoutMs: 420_000 }
	);
	return { sweep, control, snapshots };
}

describe('stalled recovery routes workflow turns through atomic workflow recovery', () => {
	it.each(['retry_scheduled', 'already_requeued'])(
		'reports %s as requeued without the ordinary post-start policy',
		async (outcome) => {
			const harness = createSweep({ workflow: workflowReceipt(outcome) });
			await expect(harness.sweep.runOnce()).resolves.toMatchObject({
				results: [{ outcome: 'requeued', executionGeneration: GENERATION }]
			});
			expect(harness.control.recoverWorkflow).toHaveBeenCalledWith({
				turnRunId: TURN_RUN_ID,
				queueJobId: QUEUE_JOB_ID,
				processingToken: PROCESSING_TOKEN,
				executionGeneration: GENERATION,
				failureClass: 'timeout_post_start',
				errorMessage: 'Agentic Chat worker interrupted while queue ownership was stalled'
			});
			expect(harness.control.recover).not.toHaveBeenCalled();
			expect(harness.control.finalize).not.toHaveBeenCalled();
		}
	);

	it.each([
		['stale_generation', 'stale_owner'],
		['ownership_lost', 'stale_owner'],
		['terminal_reconciled', 'terminal_reconciled']
	])('settles %s as %s with no further write', async (outcome, expected) => {
		const harness = createSweep({ workflow: workflowReceipt(outcome) });
		await expect(harness.sweep.runOnce()).resolves.toMatchObject({
			results: [{ outcome: expected }]
		});
		expect(harness.control.recover).not.toHaveBeenCalled();
		expect(harness.control.finalize).not.toHaveBeenCalled();
	});

	it.each([
		'deadline_expired',
		'budget_exhausted',
		'attempts_exhausted',
		'access_revoked',
		'finalize_failed'
	])(
		'finalizes a workflow that may not retry (%s) as failed with its workflow reason',
		async (outcome) => {
			const harness = createSweep({
				workflow: workflowReceipt(outcome),
				recoveries: [
					ordinaryRecovery('finalize_failed', { failure_code: 'permanent' }),
					ordinaryRecovery('queue_reconciled', { status: 'failed' })
				],
				finalizations: [terminal('failed', `workflow_${outcome}`)]
			});
			await expect(harness.sweep.runOnce()).resolves.toMatchObject({
				results: [{ outcome: 'terminal_reconciled' }]
			});
			expect(harness.control.recover.mock.calls[0]?.[0]).toMatchObject({
				failureClass: 'permanent'
			});
			expect(harness.control.finalize).toHaveBeenCalledWith(
				expect.objectContaining({
					status: 'failed',
					failureCode: `workflow_${outcome}`,
					eventPayload: expect.objectContaining({ failure_code: `workflow_${outcome}` })
				})
			);
		}
	);

	it('finalizes a durable cancellation as cancelled', async () => {
		const harness = createSweep({
			workflow: workflowReceipt('cancel_requested'),
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

	it('never calls workflow recovery for a turn that is already terminal', async () => {
		const harness = createSweep({
			claim: claimed({ outcome: 'already_terminal', status: 'completed' }),
			workflow: workflowReceipt('retry_scheduled'),
			recoveries: [
				ordinaryRecovery('queue_reconciled', { status: 'completed', failure_code: null })
			]
		});
		await expect(harness.sweep.runOnce()).resolves.toMatchObject({
			results: [{ outcome: 'terminal_reconciled' }]
		});
		expect(harness.control.recoverWorkflow).not.toHaveBeenCalled();
	});
});

describe('ordinary-turn parity', () => {
	const scenarios: Array<
		[string, { claim?: unknown; recoveries: unknown[]; finalizations?: unknown[] }]
	> = [
		[
			'pre-start retry',
			{
				claim: claimed({ outcome: 'claimed', executionMayStart: true }),
				recoveries: [
					ordinaryRecovery('retry_scheduled', { failure_code: 'timeout_pre_start' })
				]
			}
		],
		[
			'post-start failure',
			{
				recoveries: [
					ordinaryRecovery('finalize_failed'),
					ordinaryRecovery('queue_reconciled', { status: 'failed' })
				],
				finalizations: [terminal('failed', 'timeout_post_start')]
			}
		]
	];

	it.each(scenarios)(
		'%s: policy_denied yields the same calls and result as no workflow recovery',
		async (_name, scenario) => {
			const without = createSweep({ ...scenario, workflow: null });
			const denied = createSweep({
				...scenario,
				workflow: workflowReceipt('policy_denied', { reason: 'not_a_workflow_turn' })
			});
			const thrown = createSweep({
				...scenario,
				workflow: async () => {
					throw new AgenticChatExecutionControlRpcError(
						'recover_agentic_chat_workflow_turn_v1',
						'08006',
						'connection reset'
					);
				}
			});

			const baseline = await without.sweep.runOnce();
			for (const harness of [denied, thrown]) {
				await expect(harness.sweep.runOnce()).resolves.toEqual(baseline);
				expect(harness.control.recover.mock.calls).toEqual(
					without.control.recover.mock.calls
				);
				expect(harness.control.finalize.mock.calls).toEqual(
					without.control.finalize.mock.calls
				);
				expect(harness.control.recoverWorkflow).toHaveBeenCalledOnce();
			}
		}
	);
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
