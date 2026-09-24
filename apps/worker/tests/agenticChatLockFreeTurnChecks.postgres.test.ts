// apps/worker/tests/agenticChatLockFreeTurnChecks.postgres.test.ts
//
// Tasker 102 (case 13 of the 2026-09-24 gate): the read-tool fence used
// claim_agentic_chat_turn, which takes FOR UPDATE on the turn and queue-job
// rows, so it queued behind the prompt-snapshot transaction holding them and
// hit the statement timeout. check_agentic_chat_turn_read_fence answers the
// same question without row locks, and observe_agentic_chat_turn_cancellations
// no longer locks every running turn when none has a cancel request.
// Disposable, socket-only local PostgreSQL; no hosted database and no paid call.
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	AgenticChatExecutionControlRpcError,
	SupabaseAgenticChatExecutionControlAdapter
} from '../src/workers/agentic-chat/turn/execution-control';
import { admitE2ETurn, leaseAndClaimE2E, seedE2EOwner } from './helpers/workflowEndToEnd';
import {
	type DisposablePostgres,
	createPgSupabaseShim,
	postgresAvailable,
	serviceClient,
	startDisposableWorkflowPostgres
} from './helpers/workflowPostgres';

const describePostgres = postgresAvailable ? describe : describe.skip;
const REPOSITORY_ROOT = resolve(process.cwd(), '../..');

describePostgres('lock-free turn checks', () => {
	let pg: DisposablePostgres;
	let admin: Client;
	let snapshotSession: Client;
	let worker: Client;
	let adapter: SupabaseAgenticChatExecutionControlAdapter;
	let shim: ReturnType<typeof createPgSupabaseShim>;
	let turnNumber = 0;

	beforeAll(async () => {
		pg = await startDisposableWorkflowPostgres(REPOSITORY_ROOT, 'buildos-read-fence-pg-');
		const { Client: PgClient } = await import('pg');
		admin = new PgClient(pg.connection);
		await admin.connect();
		[snapshotSession, worker] = await Promise.all([
			serviceClient(pg.connection),
			serviceClient(pg.connection)
		]);
		shim = createPgSupabaseShim(worker);
		adapter = new SupabaseAgenticChatExecutionControlAdapter(shim as never);
		await seedE2EOwner(admin);
	}, 120_000);

	afterAll(async () => {
		for (const client of [snapshotSession, worker, admin]) {
			await client?.end().catch(() => undefined);
		}
		pg?.stop();
	});

	async function runningTurn() {
		turnNumber += 1;
		const turnRunId = await admitE2ETurn(shim, turnNumber);
		const lease = await leaseAndClaimE2E(admin, shim, turnRunId);
		return {
			turnRunId,
			identity: { turnRunId, queueJobId: lease.job, processingToken: lease.token }
		};
	}

	it('returns the same receipt as claim for the running generation', async () => {
		const { identity } = await runningTurn();

		const checked = await adapter.checkReadFence(identity);
		const claimed = await adapter.claim(identity);

		expect(checked).toEqual(claimed);
		expect(checked).toMatchObject({ outcome: 'matching_current_claim', status: 'running' });
	});

	it('answers while the prompt snapshot holds the turn and queue-job row locks', async () => {
		const { turnRunId, identity } = await runningTurn();
		// persist_agentic_chat_prompt_snapshot_v3 → v1 take exactly these locks
		// first and keep them for the whole transaction.
		await snapshotSession.query('BEGIN');
		await snapshotSession.query(
			'SELECT 1 FROM public.chat_turn_runs WHERE id = $1 FOR UPDATE',
			[turnRunId]
		);
		await snapshotSession.query('SELECT 1 FROM public.queue_jobs WHERE id = $1 FOR UPDATE', [
			identity.queueJobId
		]);
		await worker.query(`SET lock_timeout = '300ms'`);
		try {
			// The old fence queues behind the snapshot; lock_timeout stands in for
			// the statement timeout that ended case 13.
			await expect(adapter.claim(identity)).rejects.toMatchObject({
				name: 'AgenticChatExecutionControlRpcError',
				code: '55P03'
			});

			const startedAt = performance.now();
			await expect(adapter.checkReadFence(identity)).resolves.toMatchObject({
				outcome: 'matching_current_claim',
				turnRunId,
				executionGeneration: 1
			});
			expect(performance.now() - startedAt).toBeLessThan(300);
		} finally {
			await snapshotSession.query('ROLLBACK');
			await worker.query('RESET lock_timeout');
		}
	});

	it('reports a committed cancellation request', async () => {
		const { turnRunId, identity } = await runningTurn();
		await admin.query(
			`UPDATE public.chat_turn_runs SET cancel_requested_at = now() WHERE id = $1`,
			[turnRunId]
		);

		await expect(adapter.checkReadFence(identity)).resolves.toMatchObject({
			outcome: 'cancel_requested',
			executionMayStart: false
		});
	});

	it('rejects a stale processing token and never claims a queued turn', async () => {
		const { identity } = await runningTurn();
		const stale = adapter.checkReadFence({ ...identity, processingToken: randomUUID() });
		await expect(stale).rejects.toBeInstanceOf(AgenticChatExecutionControlRpcError);
		await expect(stale).rejects.toThrow('agentic_chat_read_fence_ownership_lost');

		turnNumber += 1;
		const queuedTurnId = await admitE2ETurn(shim, turnNumber);
		const { rows } = await admin.query(
			'SELECT queue_job_id FROM public.chat_turn_runs WHERE id = $1',
			[queuedTurnId]
		);
		await expect(
			adapter.checkReadFence({
				turnRunId: queuedTurnId,
				queueJobId: rows[0].queue_job_id as string,
				processingToken: randomUUID()
			})
		).rejects.toBeInstanceOf(AgenticChatExecutionControlRpcError);
		const after = await admin.query(
			'SELECT turns.status, turns.execution_generation, jobs.status AS job_status FROM public.chat_turn_runs turns JOIN public.queue_jobs jobs ON jobs.id = turns.queue_job_id WHERE turns.id = $1',
			[queuedTurnId]
		);
		expect(after.rows[0]).toMatchObject({
			status: 'queued',
			execution_generation: 0,
			job_status: 'pending'
		});
	});

	it('answers a cancellation poll with no cancel request while a writer holds the turn row', async () => {
		const { turnRunId } = await runningTurn();
		await snapshotSession.query('BEGIN');
		await snapshotSession.query(
			'SELECT 1 FROM public.chat_turn_runs WHERE id = $1 FOR UPDATE',
			[turnRunId]
		);
		await worker.query(`SET lock_timeout = '300ms'`);
		try {
			const startedAt = performance.now();
			await expect(
				shim.rpc('observe_agentic_chat_turn_cancellations', {
					p_turns: [{ turn_run_id: turnRunId, execution_generation: 1 }]
				})
			).resolves.toEqual({ data: [], error: null });
			expect(performance.now() - startedAt).toBeLessThan(300);
		} finally {
			await snapshotSession.query('ROLLBACK');
			await worker.query('RESET lock_timeout');
		}
	});

	it('still consumes and replays a durable cancellation signal', async () => {
		const { turnRunId } = await runningTurn();
		const { rows } = await admin.query(
			`WITH requested AS (
				UPDATE public.chat_turn_runs
				SET cancel_requested_at = now(), cancel_reason = 'user_cancelled'
				WHERE id = $1
				RETURNING id, session_id, user_id, cancel_requested_at
			)
			INSERT INTO public.chat_turn_signals
				(turn_run_id, session_id, user_id, reason, source, created_at)
			SELECT id, session_id, user_id, 'user_cancelled', 'browser', cancel_requested_at
			FROM requested
			RETURNING id`,
			[turnRunId]
		);
		const signalId = rows[0].id as string;
		const poll = () =>
			shim.rpc('observe_agentic_chat_turn_cancellations', {
				p_turns: [{ turn_run_id: turnRunId, execution_generation: 1 }]
			});

		const first = await poll();
		expect(first.error).toBeNull();
		expect(first.data).toEqual([
			expect.objectContaining({
				turn_run_id: turnRunId,
				execution_generation: 1,
				signal_id: signalId,
				cancel_reason: 'user_cancelled',
				consumed_at: expect.any(String)
			})
		]);
		await expect(poll()).resolves.toEqual(first);
	});

	it('is callable only by service_role', async () => {
		const { identity } = await runningTurn();
		const { Client: PgClient } = await import('pg');
		const anon = new PgClient(pg.connection);
		await anon.connect();
		try {
			await anon.query('SET ROLE authenticated');
			await expect(
				anon.query(
					'SELECT public.check_agentic_chat_turn_read_fence($1::uuid, $2::uuid, $3::uuid)',
					[identity.turnRunId, identity.queueJobId, identity.processingToken]
				)
			).rejects.toMatchObject({ code: '42501' });
		} finally {
			await anon.end();
		}
	});
});
