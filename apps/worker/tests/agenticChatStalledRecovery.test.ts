// apps/worker/tests/agenticChatStalledRecovery.test.ts
//
// The in-worker dead-turn sweep (docs/architecture/AGENTIC_CHAT_TURN_LEASES_2026-09-23.md).
// The database decides and settles every dead turn; this sweep only renders
// handed-off workflow turns from durable truth, bounds each RPC, and reports
// health (unhealthy until its first successful sweep, so a worker deployed
// without the recovery function never passes its healthcheck).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgenticChatExecutionControlRpcError } from '../src/workers/agentic-chat/turn/execution-control';
import {
	AgenticChatDeadTurnRecoveryProtocolError,
	type AgenticChatDeadTurnHandoffV1,
	type AgenticChatDeadTurnRecoveryBatchV1,
	type AgenticChatDeadTurnRecoveryPortV1,
	type AgenticChatDeadTurnRecoveryReportRowV1,
	AgenticChatStalledRecoverySweep,
	SupabaseAgenticChatDeadTurnRecoveryAdapter
} from '../src/workers/agentic-chat/host/stalled-recovery';

const TURN_RUN_ID = '10000000-0000-4000-8000-000000000001';
const QUEUE_JOB_ID = '20000000-0000-4000-8000-000000000002';
const PROCESSING_TOKEN = '30000000-0000-4000-8000-000000000003';
const USER_ID = '40000000-0000-4000-8000-000000000004';
const SESSION_ID = '50000000-0000-4000-8000-000000000005';
const CORRELATION_ID = '60000000-0000-4000-8000-000000000006';
const GENERATION = 1;
const NOW = new Date('2026-09-23T12:10:00.000Z');

const handoff: AgenticChatDeadTurnHandoffV1 = {
	turnRunId: TURN_RUN_ID,
	queueJobId: QUEUE_JOB_ID,
	processingToken: PROCESSING_TOKEN,
	userId: USER_ID,
	correlationId: CORRELATION_ID,
	executionGeneration: GENERATION,
	startedAt: '2026-09-23T12:05:00.000Z',
	silentSince: '2026-09-23T12:07:00.000Z',
	workflowOutcome: 'deadline_expired'
};

function batch(
	overrides: Partial<AgenticChatDeadTurnRecoveryBatchV1> = {}
): AgenticChatDeadTurnRecoveryBatchV1 {
	const results = overrides.results ?? [];
	const handoffs = overrides.handoffs ?? [];
	return {
		candidateCount: results.length + handoffs.length,
		hasMore: false,
		parkedCount: 0,
		results,
		handoffs,
		invalidRows: [],
		...overrides
	};
}

function row(
	outcome: AgenticChatDeadTurnRecoveryReportRowV1['outcome'],
	turnRunId: string,
	error: string | null = null
): AgenticChatDeadTurnRecoveryReportRowV1 {
	return {
		turnRunId,
		queueJobId: QUEUE_JOB_ID,
		executionGeneration: GENERATION,
		startedAt: '2026-09-23T12:05:00.000Z',
		silentSince: '2026-09-23T12:08:00.000Z',
		outcome,
		error
	};
}

function recovery(outcome: string, overrides: Record<string, unknown> = {}) {
	return {
		outcome,
		execution_may_retry: outcome === 'retry_scheduled',
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

function terminal(status: 'failed' | 'cancelled') {
	return {
		outcome: 'finalized',
		turn_run_id: TURN_RUN_ID,
		queue_job_id: QUEUE_JOB_ID,
		session_id: SESSION_ID,
		user_id: USER_ID,
		execution_generation: GENERATION,
		status,
		finished_reason: status === 'cancelled' ? 'cancelled' : 'worker_interrupted',
		failure_code: status === 'cancelled' ? 'cancelled' : 'workflow_deadline_expired'
	};
}

/** A sweep wired for workflow handoffs, with scripted control answers. */
function createSweep(options: {
	batches?: AgenticChatDeadTurnRecoveryBatchV1[];
	recoveries?: unknown[];
	finalizations?: unknown[];
	workflowRuns?: boolean;
	sweepOptions?: ConstructorParameters<typeof AgenticChatStalledRecoverySweep>[1];
}) {
	const batches = [...(options.batches ?? [batch({ handoffs: [handoff] })])];
	const recoveries = [...(options.recoveries ?? [])];
	const finalizations = [...(options.finalizations ?? [])];
	const recover = vi.fn(
		async (_input: Parameters<AgenticChatDeadTurnRecoveryPortV1['recover']>[0]) =>
			batches.shift() ?? batch()
	);
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
	const workflowRuns = { loadRun: vi.fn(async (_turnRunId: string) => null) };
	const sweep = new AgenticChatStalledRecoverySweep(
		{
			recovery: { recover },
			control: control as never,
			...(options.workflowRuns === false ? {} : { workflowRuns: workflowRuns as never })
		},
		{ now: () => NOW, ...options.sweepOptions }
	);
	return { sweep, recover, control, workflowRuns };
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

afterEach(() => {
	vi.useRealTimers();
});

describe('SupabaseAgenticChatDeadTurnRecoveryAdapter', () => {
	function client(data: unknown, error: { code?: string; message: string } | null = null) {
		const abortSignal = vi.fn(async (_signal: AbortSignal) => ({ data, error }));
		const rpc = vi.fn(() => ({ abortSignal }));
		return {
			rpc,
			abortSignal,
			adapter: new SupabaseAgenticChatDeadTurnRecoveryAdapter({ rpc })
		};
	}
	const signal = new AbortController().signal;

	function sqlRow(outcome: string, overrides: Record<string, unknown> = {}) {
		return {
			outcome,
			turn_run_id: TURN_RUN_ID,
			queue_job_id: QUEUE_JOB_ID,
			user_id: USER_ID,
			execution_generation: GENERATION,
			started_at: '2026-09-23T12:05:00.000Z',
			silent_since: '2026-09-23T12:08:00.000Z',
			lease_state: 'expired',
			...overrides
		};
	}
	function handoffRow(overrides: Record<string, unknown> = {}) {
		return sqlRow('workflow_handoff', {
			processing_token: PROCESSING_TOKEN,
			correlation_id: CORRELATION_ID,
			silent_since: '2026-09-23T12:07:00.000Z',
			workflow_outcome: 'deadline_expired',
			...overrides
		});
	}
	function report(overrides: Record<string, unknown> = {}) {
		return {
			candidate_count: 0,
			requeued_count: 0,
			finalized_count: 0,
			reconciled_count: 0,
			handoff_count: 0,
			deferred_count: 0,
			not_dead_count: 0,
			skipped_count: 0,
			failed_count: 0,
			parked_count: 0,
			has_more: false,
			batch_size: 16,
			results: [],
			handoffs: [],
			...overrides
		};
	}

	it('calls the one recovery RPC, bounded by the caller signal, and parses rows and handoffs', async () => {
		const handedOff = '10000000-0000-4000-8000-00000000000c';
		const { rpc, abortSignal, adapter } = client(
			report({
				candidate_count: 3,
				parked_count: 2,
				has_more: true,
				results: [
					sqlRow('requeued'),
					sqlRow('finalized', {
						turn_run_id: '10000000-0000-4000-8000-00000000000b',
						status: 'failed',
						failure_code: 'uncertain_external_commit',
						recovery_failure_count: 1
					}),
					// The tokenless summary of a handoff also appears in results.
					sqlRow('workflow_handoff', { turn_run_id: handedOff })
				],
				handoffs: [handoffRow({ turn_run_id: handedOff })]
			})
		);

		const result = await adapter.recover({ batchSize: 16, workflowHandoff: true, signal });

		expect(rpc).toHaveBeenCalledWith('recover_dead_agentic_chat_turns', {
			p_batch_size: 16,
			p_workflow_handoff: true
		});
		expect(abortSignal).toHaveBeenCalledWith(signal);
		expect(result).toEqual({
			candidateCount: 3,
			hasMore: true,
			parkedCount: 2,
			results: [
				row('requeued', TURN_RUN_ID),
				expect.objectContaining({
					turnRunId: '10000000-0000-4000-8000-00000000000b',
					outcome: 'finalized'
				})
			],
			handoffs: [{ ...handoff, turnRunId: handedOff }],
			invalidRows: []
		});
	});

	it('never drops a valid handoff because a sibling row is malformed', async () => {
		const { adapter } = client(
			report({
				candidate_count: 4,
				results: [
					sqlRow('revived', { turn_run_id: '10000000-0000-4000-8000-00000000000e' })
				],
				handoffs: [
					handoffRow({
						turn_run_id: '10000000-0000-4000-8000-00000000000d',
						processing_token: null
					}),
					handoffRow(),
					handoffRow(),
					handoffRow({
						turn_run_id: '10000000-0000-4000-8000-00000000000f',
						workflow_outcome: ''
					})
				]
			})
		);
		const result = await adapter.recover({ batchSize: 16, workflowHandoff: true, signal });

		expect(result.handoffs).toEqual([handoff]);
		expect(result.invalidRows).toEqual([
			{
				turnRunId: '10000000-0000-4000-8000-00000000000d',
				error: expect.stringContaining('processing_token')
			},
			{ turnRunId: TURN_RUN_ID, error: expect.stringContaining('duplicate handoff') },
			{
				turnRunId: '10000000-0000-4000-8000-00000000000f',
				error: expect.stringContaining('workflow_outcome')
			},
			{
				turnRunId: '10000000-0000-4000-8000-00000000000e',
				error: expect.stringContaining('result outcome is invalid')
			}
		]);
	});

	it('reads what it can from a damaged report and never loops on an unreadable flag', async () => {
		const read = (data: unknown) =>
			client(data).adapter.recover({ batchSize: 16, workflowHandoff: false, signal });

		await expect(read(report({ has_more: 'yes' }))).resolves.toMatchObject({ hasMore: false });
		await expect(
			read(
				report({ candidate_count: -1, parked_count: 'many', results: [sqlRow('skipped')] })
			)
		).resolves.toMatchObject({ candidateCount: 1, parkedCount: 0 });
		await expect(read(report({ results: null }))).resolves.toMatchObject({
			invalidRows: [{ turnRunId: null, error: 'results or handoffs are not arrays' }]
		});
		await expect(read(report({ results: [sqlRow('toString')] }))).resolves.toMatchObject({
			results: [],
			invalidRows: [{ turnRunId: TURN_RUN_ID }]
		});
		await expect(read([])).rejects.toBeInstanceOf(AgenticChatDeadTurnRecoveryProtocolError);
	});

	it('surfaces RPC errors, including a missing migration, and refuses an oversized batch', async () => {
		const { adapter } = client(null, {
			code: 'PGRST202',
			message: 'Could not find the function'
		});
		await expect(
			adapter.recover({ batchSize: 16, workflowHandoff: false, signal })
		).rejects.toThrow('recover_dead_agentic_chat_turns failed (PGRST202)');
		await expect(
			adapter.recover({ batchSize: 101, workflowHandoff: false, signal })
		).rejects.toThrow('batchSize must be between 1 and 100');
	});
});

describe('AgenticChatStalledRecoverySweep', () => {
	it('stays unhealthy until its first sweep (run at boot) succeeds', async () => {
		const first = deferred<AgenticChatDeadTurnRecoveryBatchV1>();
		const recover = vi.fn(() => first.promise);
		const onReport = vi.fn();
		const sweep = new AgenticChatStalledRecoverySweep(
			{ recovery: { recover }, control: {} as never },
			{ now: () => NOW, onReport }
		);

		expect(sweep.getHealth()).toMatchObject({
			healthy: false,
			state: 'idle',
			reason: 'not_started'
		});
		sweep.start();
		expect(recover).toHaveBeenCalledOnce();
		expect(sweep.getHealth()).toMatchObject({
			healthy: false,
			state: 'running',
			reason: 'awaiting_first_sweep'
		});

		first.resolve(batch());
		await vi.waitFor(() => expect(onReport).toHaveBeenCalledOnce());
		expect(sweep.getHealth()).toMatchObject({
			healthy: true,
			lastSuccessfulSweepAt: NOW.toISOString()
		});
		await sweep.stop();
	});

	it('never reports healthy when the recovery function is missing', async () => {
		const recover = vi
			.fn()
			.mockRejectedValue(
				new Error(
					'recover_dead_agentic_chat_turns failed (PGRST202): Could not find the function'
				)
			);
		const onError = vi.fn();
		const sweep = new AgenticChatStalledRecoverySweep(
			{ recovery: { recover }, control: {} as never },
			{ now: () => NOW, onError }
		);
		sweep.start();
		await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());
		expect(sweep.getHealth()).toMatchObject({
			healthy: false,
			reason: 'awaiting_first_sweep',
			consecutiveSweepFailures: 1,
			lastError: expect.stringContaining('PGRST202')
		});
		await expect(sweep.runOnce()).rejects.toThrow('PGRST202');
		await expect(sweep.runOnce()).rejects.toThrow('PGRST202');
		expect(sweep.getHealth()).toMatchObject({
			healthy: false,
			reason: 'repeated_sweep_failures',
			consecutiveSweepFailures: 3
		});

		recover.mockResolvedValueOnce(batch());
		await sweep.runOnce();
		expect(sweep.getHealth()).toMatchObject({ healthy: true, consecutiveSweepFailures: 0 });
		await expect(sweep.stop()).resolves.toBe(true);
		expect(sweep.getHealth()).toMatchObject({
			healthy: true,
			state: 'stopped',
			reason: 'stopped'
		});
	});

	it('abandons a recovery RPC that never settles, so the next sweep still runs', async () => {
		const signals: AbortSignal[] = [];
		const recover = vi.fn((input: { signal: AbortSignal }) => {
			signals.push(input.signal);
			return new Promise<AgenticChatDeadTurnRecoveryBatchV1>(() => undefined);
		});
		const sweep = new AgenticChatStalledRecoverySweep(
			{ recovery: { recover }, control: {} as never },
			{ now: () => NOW, rpcTimeoutMs: 20 }
		);

		await expect(sweep.runOnce()).rejects.toThrow(
			'recover_dead_agentic_chat_turns did not settle within 20ms'
		);
		expect(signals[0]?.aborted).toBe(true);
		expect(sweep.getHealth()).toMatchObject({ consecutiveSweepFailures: 1 });

		// Not coalesced onto the hung call: a fresh sweep issues a fresh RPC.
		await expect(sweep.runOnce()).rejects.toThrow('did not settle');
		expect(recover).toHaveBeenCalledTimes(2);
	});

	it('reports a sweep stuck past three intervals as overdue', async () => {
		let clock = NOW.getTime();
		const pending = deferred<AgenticChatDeadTurnRecoveryBatchV1>();
		const recover = vi
			.fn()
			.mockResolvedValueOnce(batch())
			.mockImplementationOnce(() => pending.promise);
		const sweep = new AgenticChatStalledRecoverySweep(
			{ recovery: { recover }, control: {} as never },
			{ now: () => new Date(clock), intervalMs: 1_000, rpcTimeoutMs: 60_000 }
		);
		sweep.start();
		await vi.waitFor(() => expect(sweep.getHealth().healthy).toBe(true));

		const stuck = sweep.runOnce();
		clock += 3_000;
		expect(sweep.getHealth()).toMatchObject({ healthy: true });
		clock += 1;
		expect(sweep.getHealth()).toMatchObject({ healthy: false, reason: 'sweep_overdue' });

		pending.resolve(batch());
		await stuck;
		expect(sweep.getHealth()).toMatchObject({ healthy: true });
		await sweep.stop();
	});

	it('reports what the database settled without touching the TypeScript convergence path', async () => {
		const harness = createSweep({
			batches: [
				batch({
					candidateCount: 7,
					parkedCount: 2,
					results: [
						row('requeued', '10000000-0000-4000-8000-000000000011'),
						row('finalized', '10000000-0000-4000-8000-000000000012'),
						row('terminal_reconciled', '10000000-0000-4000-8000-000000000013'),
						row('workflow_deferred', '10000000-0000-4000-8000-000000000014'),
						row('not_dead', '10000000-0000-4000-8000-000000000015'),
						row('skipped', '10000000-0000-4000-8000-000000000016'),
						row('failed', '10000000-0000-4000-8000-000000000017', 'deadlock detected')
					]
				})
			]
		});

		const report = await harness.sweep.runOnce();

		expect(report.results.map((result) => result.outcome)).toEqual([
			'requeued',
			'finalized',
			'terminal_reconciled',
			'deferred',
			// Honest: alive after all, or held by someone else right now.
			'not_dead',
			'skipped',
			'failed'
		]);
		expect(report.parkedCount).toBe(2);
		expect(report.results[0]).toMatchObject({
			stalledAt: '2026-09-23T12:08:00.000Z',
			startedAt: '2026-09-23T12:05:00.000Z'
		});
		expect(harness.control.recover).not.toHaveBeenCalled();
		expect(harness.control.finalize).not.toHaveBeenCalled();
		expect(harness.sweep.getHealth()).toMatchObject({
			lastCandidateCount: 7,
			lastParkedCount: 2,
			// One failed row plus the two parked turns.
			lastAttentionRequiredCount: 3
		});
	});

	it('follows has_more within one sweep, bounded by batches and by one interval', async () => {
		const more = () => batch({ hasMore: true, results: [row('requeued', TURN_RUN_ID)] });
		const harness = createSweep({ batches: [more(), more(), batch()] });
		await expect(harness.sweep.runOnce()).resolves.toMatchObject({ candidateCount: 2 });
		expect(harness.recover).toHaveBeenCalledTimes(3);

		const endless = createSweep({
			batches: Array.from({ length: 10 }, more),
			sweepOptions: { maxBatchesPerSweep: 4 }
		});
		await endless.sweep.runOnce();
		expect(endless.recover).toHaveBeenCalledTimes(4);

		let clock = NOW.getTime();
		const slow = new AgenticChatStalledRecoverySweep(
			{
				recovery: {
					recover: vi.fn(async () => {
						clock += 1_000;
						return more();
					})
				},
				control: {} as never
			},
			{ now: () => new Date(clock), intervalMs: 1_000 }
		);
		await slow.runOnce();
		expect(clock - NOW.getTime()).toBe(1_000);
	});

	it('asks for workflow handoffs only when it can render workflow terminals', async () => {
		const plain = createSweep({ batches: [batch()], workflowRuns: false });
		await plain.sweep.runOnce();
		expect(plain.recover).toHaveBeenCalledWith({
			batchSize: 16,
			workflowHandoff: false,
			signal: expect.any(AbortSignal)
		});

		const workflow = createSweep({ batches: [batch()], sweepOptions: { batchSize: 8 } });
		await workflow.sweep.runOnce();
		expect(workflow.recover).toHaveBeenCalledWith({
			batchSize: 8,
			workflowHandoff: true,
			signal: expect.any(AbortSignal)
		});
	});

	it('refuses a handoff it cannot render without writing anything', async () => {
		const harness = createSweep({ workflowRuns: false });
		await expect(harness.sweep.runOnce()).resolves.toMatchObject({
			results: [
				{
					outcome: 'failed',
					error: 'A workflow handoff arrived without a durable workflow reader'
				}
			]
		});
		expect(harness.control.recover).not.toHaveBeenCalled();
		expect(harness.control.finalize).not.toHaveBeenCalled();
	});

	it('renders a handoff from its workflow outcome with the rotated token, no claim and no retry', async () => {
		const harness = createSweep({
			recoveries: [
				recovery('finalize_failed'),
				recovery('queue_reconciled', { status: 'failed' })
			],
			finalizations: [terminal('failed')]
		});

		await expect(harness.sweep.runOnce()).resolves.toMatchObject({
			candidateCount: 1,
			results: [
				{
					turnRunId: TURN_RUN_ID,
					outcome: 'terminal_reconciled',
					stalledAt: handoff.silentSince
				}
			]
		});
		expect(harness.control.recover.mock.calls[0]?.[0]).toEqual({
			turnRunId: TURN_RUN_ID,
			queueJobId: QUEUE_JOB_ID,
			processingToken: PROCESSING_TOKEN,
			executionGeneration: GENERATION,
			failureClass: 'permanent',
			errorMessage: 'Agentic Chat worker lease expired'
		});
		expect(harness.workflowRuns.loadRun).toHaveBeenCalledWith(TURN_RUN_ID);
		expect(harness.control.finalize).toHaveBeenCalledWith(
			expect.objectContaining({
				processingToken: PROCESSING_TOKEN,
				status: 'failed',
				failureCode: 'workflow_deadline_expired',
				assistantText: '',
				assistantMetadata: expect.objectContaining({ recovered_from_stall: true })
			})
		);
		// Only the two ports the sweep is allowed to use exist on the control double.
		expect(Object.keys(harness.control).sort()).toEqual(['finalize', 'recover']);
	});

	it('ends a durable Stop as cancelled', async () => {
		const harness = createSweep({
			batches: [batch({ handoffs: [{ ...handoff, workflowOutcome: 'cancel_requested' }] })],
			recoveries: [
				recovery('finalize_cancelled'),
				recovery('queue_reconciled', { status: 'cancelled', failure_code: 'cancelled' })
			],
			finalizations: [terminal('cancelled')]
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

	it('converges after a committed finalization response is lost', async () => {
		const harness = createSweep({
			recoveries: [
				recovery('finalize_failed'),
				recovery('queue_reconciled', { status: 'failed' })
			]
		});
		harness.control.finalize.mockRejectedValueOnce(
			new Error('connection dropped after commit')
		);

		await expect(harness.sweep.runOnce()).resolves.toMatchObject({
			results: [{ outcome: 'terminal_reconciled' }]
		});
		expect(harness.control.finalize).toHaveBeenCalledOnce();
		expect(harness.control.recover).toHaveBeenCalledTimes(2);
	});

	it('rechecks durable cancellation when it wins failed finalization', async () => {
		const harness = createSweep({
			recoveries: [
				recovery('finalize_failed'),
				recovery('finalize_cancelled'),
				recovery('queue_reconciled', { status: 'cancelled', failure_code: 'cancelled' })
			],
			finalizations: [
				{ ...terminal('failed'), outcome: 'cancel_requested', status: 'running' },
				terminal('cancelled')
			]
		});
		await expect(harness.sweep.runOnce()).resolves.toMatchObject({
			results: [{ outcome: 'terminal_reconciled' }]
		});
		expect(harness.control.recover.mock.calls[1]?.[0]).toMatchObject({
			failureClass: 'cancelled'
		});
		expect(harness.control.finalize.mock.calls[1]?.[0]).toMatchObject({
			status: 'cancelled',
			failureCode: 'cancelled'
		});
	});

	it('classifies another recoverer winning as stale ownership, not a failure', async () => {
		const stale = createSweep({ recoveries: [recovery('stale_generation')] });
		await expect(stale.sweep.runOnce()).resolves.toMatchObject({
			results: [{ outcome: 'stale_owner', executionGeneration: GENERATION }]
		});
		expect(stale.control.finalize).not.toHaveBeenCalled();

		const lost = createSweep({});
		lost.control.recover.mockRejectedValueOnce(
			new AgenticChatExecutionControlRpcError(
				'recover_agentic_chat_turn',
				'P0001',
				'agentic_chat_recovery_ownership_lost'
			)
		);
		await expect(lost.sweep.runOnce()).resolves.toMatchObject({
			results: [{ outcome: 'stale_owner', error: expect.stringContaining('ownership_lost') }]
		});
	});

	it('hands an unconvergeable workflow turn back until the database ends it itself', async () => {
		// Sweeps 1 and 2: the handoff cannot be rendered (finalize keeps failing).
		// Sweep 3: the turn is past the abandoned threshold, so the database finalizes
		// it in SQL (the fallback) and never hands it off again.
		const harness = createSweep({
			batches: [
				batch({ handoffs: [handoff] }),
				batch({
					handoffs: [
						{ ...handoff, processingToken: '30000000-0000-4000-8000-0000000000aa' }
					]
				}),
				batch({ results: [row('finalized', TURN_RUN_ID)] })
			],
			recoveries: Array.from({ length: 8 }, () => recovery('finalize_failed'))
		});
		harness.control.finalize.mockRejectedValue(
			new Error('agentic_chat_finalize_invalid_assistant_message')
		);

		await expect(harness.sweep.runOnce()).resolves.toMatchObject({
			results: [
				{
					outcome: 'manual_recovery_required',
					error: expect.stringContaining(
						'agentic_chat_finalize_invalid_assistant_message'
					)
				}
			]
		});
		expect(harness.sweep.getHealth()).toMatchObject({ lastAttentionRequiredCount: 1 });
		await expect(harness.sweep.runOnce()).resolves.toMatchObject({
			results: [{ outcome: 'manual_recovery_required' }]
		});
		expect(harness.control.recover.mock.calls[4]?.[0]).toMatchObject({
			processingToken: '30000000-0000-4000-8000-0000000000aa'
		});
		await expect(harness.sweep.runOnce()).resolves.toMatchObject({
			results: [{ turnRunId: TURN_RUN_ID, outcome: 'finalized' }]
		});
		expect(harness.control.recover).toHaveBeenCalledTimes(8);
		expect(harness.control.finalize).toHaveBeenCalledTimes(8);
		expect(harness.sweep.getHealth()).toMatchObject({ lastAttentionRequiredCount: 0 });
	});

	it('reports an unreadable row as failed and still renders the readable handoff', async () => {
		const harness = createSweep({
			batches: [
				batch({
					candidateCount: 2,
					handoffs: [handoff],
					invalidRows: [
						{
							turnRunId: '10000000-0000-4000-8000-00000000000d',
							error: 'handoff timestamps are invalid'
						}
					]
				})
			],
			recoveries: [recovery('queue_reconciled', { status: 'failed' })]
		});
		await expect(harness.sweep.runOnce()).resolves.toMatchObject({
			results: [
				{
					turnRunId: '10000000-0000-4000-8000-00000000000d',
					outcome: 'failed',
					queueJobId: null
				},
				{ turnRunId: TURN_RUN_ID, outcome: 'terminal_reconciled' }
			]
		});
	});

	it('coalesces overlapping sweeps and drains an in-flight run on stop', async () => {
		const pending = deferred<AgenticChatDeadTurnRecoveryBatchV1>();
		const recover = vi.fn(() => pending.promise);
		const sweep = new AgenticChatStalledRecoverySweep(
			{ recovery: { recover }, control: {} as never },
			{ now: () => NOW, drainTimeoutMs: 1_000 }
		);
		const first = sweep.runOnce();
		expect(sweep.runOnce()).toBe(first);
		const stopping = sweep.stop();
		pending.resolve(batch());
		await expect(stopping).resolves.toBe(true);
		await first;
		expect(recover).toHaveBeenCalledOnce();
	});

	it('bounds recovery drain time without starting another sweep', async () => {
		const pending = deferred<AgenticChatDeadTurnRecoveryBatchV1>();
		const recover = vi.fn(() => pending.promise);
		const sweep = new AgenticChatStalledRecoverySweep(
			{ recovery: { recover }, control: {} as never },
			{ now: () => NOW, drainTimeoutMs: 20 }
		);
		const active = sweep.runOnce();
		await expect(sweep.stop()).resolves.toBe(false);
		expect(recover).toHaveBeenCalledOnce();
		pending.resolve(batch());
		await active;
		await expect(sweep.runOnce()).rejects.toThrow(/is stopping/);
		expect(() => sweep.start()).toThrow(/is stopping/);
	});
});
