// apps/worker/tests/agenticChatStalledRecovery.test.ts
import { createAgentStreamEventIdV1 } from '@buildos/shared-types';
import { describe, expect, it, vi } from 'vitest';
import { AgenticChatExecutionControlRpcError } from '../src/workers/agentic-chat/executionControl';
import {
	AgenticChatStalledCandidateSourceError,
	AgenticChatStalledRecoverySweep,
	SupabaseAgenticChatStalledCandidateSource,
	type AgenticChatStalledReadQuery
} from '../src/workers/agentic-chat/stalledRecovery';

const TURN_RUN_ID = '10000000-0000-4000-8000-000000000001';
const QUEUE_JOB_ID = '20000000-0000-4000-8000-000000000002';
const PROCESSING_TOKEN = '30000000-0000-4000-8000-000000000003';
const USER_ID = '40000000-0000-4000-8000-000000000004';
const SESSION_ID = '50000000-0000-4000-8000-000000000005';
const CORRELATION_ID = '60000000-0000-4000-8000-000000000006';
const INPUT_ARTIFACT_ID = '70000000-0000-4000-8000-000000000007';
const USER_MESSAGE_ID = '80000000-0000-4000-8000-000000000008';
const GENERATION = 1;
const NOW = new Date('2026-08-03T12:10:00.000Z');

const candidate = {
	turnRunId: TURN_RUN_ID,
	queueJobId: QUEUE_JOB_ID,
	processingToken: PROCESSING_TOKEN,
	userId: USER_ID,
	correlationId: CORRELATION_ID,
	startedAt: '2026-08-03T11:55:00.000Z',
	stalledAt: '2026-08-03T12:00:00.000Z'
} as const;

function claimed(overrides: Record<string, unknown> = {}) {
	return {
		outcome: 'claimed',
		executionMayStart: true,
		turnRunId: TURN_RUN_ID,
		queueJobId: QUEUE_JOB_ID,
		sessionId: SESSION_ID,
		userId: USER_ID,
		correlationId: CORRELATION_ID,
		executionGeneration: GENERATION,
		status: 'running',
		inputArtifactId: INPUT_ARTIFACT_ID,
		userMessageId: USER_MESSAGE_ID,
		...overrides
	};
}

function recovery(outcome: string, overrides: Record<string, unknown> = {}) {
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

function terminal(status: 'failed' | 'cancelled', overrides: Record<string, unknown> = {}) {
	return {
		outcome: 'finalized',
		turn_run_id: TURN_RUN_ID,
		queue_job_id: QUEUE_JOB_ID,
		session_id: SESSION_ID,
		user_id: USER_ID,
		execution_generation: GENERATION,
		status,
		finished_reason: status === 'cancelled' ? 'cancelled' : 'worker_interrupted',
		failure_code: status === 'cancelled' ? 'cancelled' : 'timeout_post_start',
		assistant_message_id: '90000000-0000-5000-8000-000000000009',
		terminal_event_id: createAgentStreamEventIdV1(TURN_RUN_ID, GENERATION, 3),
		terminal_sequence_index: 3,
		terminalized_at: '2026-08-03T12:10:01.000Z',
		...overrides
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
	assistantText: 'durable partial',
	projection: { version: 'agentic_chat_ui_projection_v1', semantic_events: [] },
	durableSequence: 2
} as const;

function createSweep(options: {
	claim?: unknown;
	recoveries: unknown[];
	finalizations?: unknown[];
	snapshot?: unknown;
}) {
	const recoveries = [...options.recoveries];
	const finalizations = [...(options.finalizations ?? [])];
	const control = {
		claim: vi.fn(async () => options.claim ?? claimed()),
		recover: vi.fn(async () => {
			const value = recoveries.shift();
			if (!value) throw new Error('Unexpected recovery call');
			return value;
		}),
		finalize: vi.fn(async () => {
			const value = finalizations.shift();
			if (!value) throw new Error('Unexpected finalization call');
			return value;
		})
	};
	const snapshots = { load: vi.fn(async () => options.snapshot ?? snapshot) };
	const candidates = { list: vi.fn(async () => [candidate]) };
	const sweep = new AgenticChatStalledRecoverySweep(
		{ candidates, control: control as never, snapshots: snapshots as never },
		{ now: () => NOW, stallTimeoutMs: 420_000 }
	);
	return { sweep, control, snapshots, candidates };
}

describe('SupabaseAgenticChatStalledCandidateSource', () => {
	it('queries only stale processing chat rows and validates their exact envelope', async () => {
		const calls: Array<[string, unknown, unknown?]> = [];
		const rows = [
			{
				id: QUEUE_JOB_ID,
				processing_token: PROCESSING_TOKEN,
				user_id: USER_ID,
				started_at: '2026-08-03T11:55:00.000Z',
				updated_at: '2026-08-03T12:00:00.000Z',
				metadata: { turnRunId: TURN_RUN_ID, correlationId: CORRELATION_ID }
			}
		];
		const query = createQuery(rows, calls);
		const source = new SupabaseAgenticChatStalledCandidateSource({
			from: vi.fn(() => ({ select: vi.fn(() => query) }))
		});

		await expect(
			source.list({ stalledBefore: '2026-08-03T12:03:00.000Z', limit: 32 })
		).resolves.toEqual([candidate]);
		expect(calls).toEqual([
			['eq', 'job_type', 'agentic_chat_turn'],
			['eq', 'status', 'processing'],
			['lt', 'updated_at', '2026-08-03T12:03:00.000Z'],
			['order', 'updated_at', { ascending: true, nullsFirst: false }],
			['limit', 32]
		]);
	});

	it('isolates malformed and duplicate rows without hiding a valid candidate', async () => {
		const invalid = vi.fn();
		const rows = [
			{ ...candidateRow(), processing_token: null },
			candidateRow(),
			candidateRow()
		];
		const source = new SupabaseAgenticChatStalledCandidateSource(
			{ from: () => ({ select: () => createQuery(rows, []) }) },
			invalid
		);

		await expect(
			source.list({ stalledBefore: '2026-08-03T12:03:00.000Z', limit: 32 })
		).resolves.toEqual([candidate]);
		expect(invalid).toHaveBeenCalledTimes(2);
		expect(invalid.mock.calls[0]?.[0]).toBeInstanceOf(AgenticChatStalledCandidateSourceError);
		expect(invalid.mock.calls[0]?.[1]).toBe(0);
		expect(invalid.mock.calls[1]?.[1]).toBe(2);
	});
});

describe('AgenticChatStalledRecoverySweep', () => {
	it('bridges a pre-domain queue claim and schedules only the safe pre-start retry', async () => {
		const harness = createSweep({
			recoveries: [recovery('retry_scheduled', { failure_code: 'timeout_pre_start' })]
		});

		await expect(harness.sweep.runOnce()).resolves.toMatchObject({
			candidateCount: 1,
			results: [{ outcome: 'requeued', executionGeneration: GENERATION }]
		});
		expect(harness.control.recover).toHaveBeenCalledWith(
			expect.objectContaining({ failureClass: 'timeout_pre_start' })
		);
		expect(harness.snapshots.load).not.toHaveBeenCalled();
		expect(harness.control.finalize).not.toHaveBeenCalled();
	});

	it('finalizes from durable snapshot truth and then reconciles the queue', async () => {
		const harness = createSweep({
			claim: claimed({ outcome: 'matching_current_claim', executionMayStart: false }),
			recoveries: [
				recovery('finalize_failed'),
				recovery('queue_reconciled', { status: 'failed' })
			],
			finalizations: [terminal('failed')]
		});

		await expect(harness.sweep.runOnce()).resolves.toMatchObject({
			results: [{ outcome: 'terminal_reconciled' }]
		});
		expect(harness.control.finalize).toHaveBeenCalledWith(
			expect.objectContaining({
				status: 'failed',
				assistantMessageId: null,
				assistantText: 'durable partial',
				projection: snapshot.projection,
				assistantMetadata: expect.objectContaining({ recovered_from_stall: true })
			})
		);
		expect(harness.control.recover.mock.calls[0]?.[0]).toMatchObject({
			failureClass: 'timeout_post_start'
		});
	});

	it('reconciles a terminal domain row without rerunning or refinalizing the turn', async () => {
		const harness = createSweep({
			claim: claimed({
				outcome: 'already_terminal',
				executionMayStart: false,
				status: 'completed'
			}),
			recoveries: [
				recovery('queue_reconciled', {
					status: 'completed',
					failure_code: null
				})
			]
		});

		await expect(harness.sweep.runOnce()).resolves.toMatchObject({
			results: [{ outcome: 'terminal_reconciled' }]
		});
		expect(harness.control.recover).toHaveBeenCalledWith(
			expect.objectContaining({ failureClass: 'unknown' })
		);
		expect(harness.snapshots.load).not.toHaveBeenCalled();
		expect(harness.control.finalize).not.toHaveBeenCalled();
	});

	it('converges after a committed finalization response is lost', async () => {
		const harness = createSweep({
			claim: claimed({ outcome: 'matching_current_claim', executionMayStart: false }),
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
		expect(harness.snapshots.load).toHaveBeenCalledOnce();
		expect(harness.control.finalize).toHaveBeenCalledOnce();
		expect(harness.control.recover).toHaveBeenCalledTimes(2);
	});

	it('reports the terminal contract failure when bounded recovery cannot converge', async () => {
		const harness = createSweep({
			claim: claimed({ outcome: 'matching_current_claim', executionMayStart: false }),
			recoveries: Array.from({ length: 4 }, () => recovery('finalize_failed'))
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
		expect(harness.control.finalize).toHaveBeenCalledTimes(4);
	});

	it('rechecks durable cancellation when it wins failed finalization', async () => {
		const harness = createSweep({
			claim: claimed({ outcome: 'matching_current_claim', executionMayStart: false }),
			recoveries: [
				recovery('finalize_failed'),
				recovery('finalize_cancelled'),
				recovery('queue_reconciled', { status: 'cancelled', failure_code: 'cancelled' })
			],
			finalizations: [
				{
					outcome: 'cancel_requested',
					turn_run_id: TURN_RUN_ID,
					queue_job_id: QUEUE_JOB_ID,
					session_id: SESSION_ID,
					user_id: USER_ID,
					execution_generation: GENERATION,
					status: 'running',
					cancel_requested_at: '2026-08-03T12:10:00.000Z',
					cancel_reason: 'user_cancelled'
				},
				terminal('cancelled')
			]
		});

		await expect(harness.sweep.runOnce()).resolves.toMatchObject({
			results: [{ outcome: 'terminal_reconciled' }]
		});
		expect(harness.control.finalize).toHaveBeenCalledTimes(2);
		expect(harness.control.finalize.mock.calls[1]?.[0]).toMatchObject({
			status: 'cancelled',
			failureCode: 'cancelled',
			assistantMessageId: expect.stringMatching(
				/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
			)
		});
	});

	it('never finalizes a turn whose effects require reconciliation', async () => {
		const harness = createSweep({
			claim: claimed({ outcome: 'matching_current_claim', executionMayStart: false }),
			recoveries: [recovery('effect_reconciliation_required')]
		});

		await expect(harness.sweep.runOnce()).resolves.toMatchObject({
			results: [{ outcome: 'effect_reconciliation_required' }]
		});
		expect(harness.snapshots.load).not.toHaveBeenCalled();
		expect(harness.control.finalize).not.toHaveBeenCalled();
	});

	it('classifies a concurrent sweeper winner as stale ownership, not a failed recovery', async () => {
		const harness = createSweep({ recoveries: [] });
		harness.control.claim.mockRejectedValueOnce(
			new AgenticChatExecutionControlRpcError(
				'claim_agentic_chat_turn',
				'P0001',
				'agentic_chat_claim_ownership_lost'
			)
		);

		await expect(harness.sweep.runOnce()).resolves.toMatchObject({
			results: [
				{
					outcome: 'stale_owner',
					error: expect.stringContaining('ownership_lost')
				}
			]
		});
	});

	it('stops immediately when recovery reports that the generation is stale', async () => {
		const harness = createSweep({ recoveries: [recovery('stale_generation')] });

		await expect(harness.sweep.runOnce()).resolves.toMatchObject({
			results: [{ outcome: 'stale_owner', executionGeneration: GENERATION }]
		});
		expect(harness.snapshots.load).not.toHaveBeenCalled();
		expect(harness.control.finalize).not.toHaveBeenCalled();
	});

	it('trips health after repeated sweep failures and recovers after a successful pass', async () => {
		const candidates = {
			list: vi.fn().mockRejectedValue(new Error('database unavailable'))
		};
		const onError = vi.fn();
		const onReport = vi.fn();
		const sweep = new AgenticChatStalledRecoverySweep(
			{
				candidates,
				control: {} as never,
				snapshots: {} as never
			},
			{ now: () => NOW, intervalMs: 60_000, onError, onReport }
		);

		expect(sweep.getHealth()).toMatchObject({
			healthy: false,
			state: 'idle',
			reason: 'not_started'
		});
		sweep.start();
		await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());
		await expect(sweep.runOnce()).rejects.toThrow('database unavailable');
		await expect(sweep.runOnce()).rejects.toThrow('database unavailable');
		expect(sweep.getHealth()).toMatchObject({
			healthy: false,
			state: 'running',
			reason: 'repeated_sweep_failures',
			consecutiveSweepFailures: 3,
			lastError: 'database unavailable'
		});

		candidates.list.mockResolvedValueOnce([]);
		await expect(sweep.runOnce()).resolves.toMatchObject({ candidateCount: 0 });
		expect(onReport).toHaveBeenCalledWith(
			expect.objectContaining({ candidateCount: 0, results: [] })
		);
		expect(sweep.getHealth()).toMatchObject({
			healthy: true,
			state: 'running',
			consecutiveSweepFailures: 0,
			lastError: null,
			lastSuccessfulSweepAt: NOW.toISOString()
		});
		await expect(sweep.stop()).resolves.toBe(true);
		expect(sweep.getHealth()).toMatchObject({
			healthy: true,
			state: 'stopped',
			reason: 'stopped'
		});
	});

	it('surfaces candidates that still require operator or reconciliation attention', async () => {
		const harness = createSweep({
			claim: claimed({ outcome: 'matching_current_claim', executionMayStart: false }),
			recoveries: [recovery('effect_reconciliation_required')]
		});

		await harness.sweep.runOnce();
		expect(harness.sweep.getHealth()).toMatchObject({
			lastCandidateCount: 1,
			lastAttentionRequiredCount: 1
		});
	});

	it('coalesces overlapping sweeps and drains an in-flight run on stop', async () => {
		let release!: () => void;
		const wait = new Promise<void>((resolve) => {
			release = resolve;
		});
		const candidates = {
			list: vi.fn(async () => {
				await wait;
				return [];
			})
		};
		const sweep = new AgenticChatStalledRecoverySweep(
			{
				candidates,
				control: {} as never,
				snapshots: {} as never
			},
			{ now: () => NOW, drainTimeoutMs: 1_000 }
		);
		const first = sweep.runOnce();
		const second = sweep.runOnce();
		expect(second).toBe(first);
		const stopping = sweep.stop();
		release();
		await expect(stopping).resolves.toBe(true);
		await first;
		expect(candidates.list).toHaveBeenCalledOnce();
	});

	it('bounds recovery drain time without starting another sweep', async () => {
		let release!: () => void;
		const wait = new Promise<void>((resolve) => {
			release = resolve;
		});
		const candidates = {
			list: vi.fn(async () => {
				await wait;
				return [];
			})
		};
		const sweep = new AgenticChatStalledRecoverySweep(
			{
				candidates,
				control: {} as never,
				snapshots: {} as never
			},
			{ now: () => NOW, drainTimeoutMs: 20 }
		);
		const active = sweep.runOnce();
		await expect(sweep.stop()).resolves.toBe(false);
		expect(candidates.list).toHaveBeenCalledOnce();
		release();
		await active;
		await expect(sweep.runOnce()).rejects.toThrow(/is stopping/);
		expect(() => sweep.start()).toThrow(/is stopping/);
	});
});

function candidateRow() {
	return {
		id: QUEUE_JOB_ID,
		processing_token: PROCESSING_TOKEN,
		user_id: USER_ID,
		started_at: '2026-08-03T11:55:00.000Z',
		updated_at: '2026-08-03T12:00:00.000Z',
		metadata: { turnRunId: TURN_RUN_ID, correlationId: CORRELATION_ID }
	};
}

function createQuery(
	data: unknown,
	calls: Array<[string, unknown, unknown?]>
): AgenticChatStalledReadQuery {
	const query = {
		eq(column: string, value: unknown) {
			calls.push(['eq', column, value]);
			return query;
		},
		lt(column: string, value: unknown) {
			calls.push(['lt', column, value]);
			return query;
		},
		order(column: string, options?: unknown) {
			calls.push(['order', column, options]);
			return query;
		},
		limit(value: number) {
			calls.push(['limit', value]);
			return query;
		},
		then<TResult1 = { data: unknown; error: null }, TResult2 = never>(
			onfulfilled?:
				| ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>)
				| null,
			onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
		): PromiseLike<TResult1 | TResult2> {
			return Promise.resolve({ data, error: null }).then(onfulfilled, onrejected);
		}
	};
	return query as AgenticChatStalledReadQuery;
}
