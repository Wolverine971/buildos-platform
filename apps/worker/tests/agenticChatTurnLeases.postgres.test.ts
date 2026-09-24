// apps/worker/tests/agenticChatTurnLeases.postgres.test.ts
//
// Turn leases under real concurrency (docs/architecture/AGENTIC_CHAT_TURN_LEASES_2026-09-23.md),
// in a disposable, socket-only local PostgreSQL with separate connections, the
// way the per-minute web cron, the 15 s worker sweep, and a live worker's
// renewal meet in production. Single-connection behavior is covered by
// supabase/tests/20260924000100_agentic_chat_turn_leases.test.sql. No hosted
// database and no paid call exists anywhere in this file.
import { resolve } from 'node:path';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admitE2ETurn, leaseAndClaimE2E, seedE2EOwner } from './helpers/workflowEndToEnd';
import {
	type DisposablePostgres,
	createPgSupabaseShim,
	expireWorkerLease,
	postgresAvailable,
	serviceClient,
	startDisposableWorkflowPostgres
} from './helpers/workflowPostgres';

const describePostgres = postgresAvailable ? describe : describe.skip;

type RecoveryRow = { turn_run_id: string; outcome: string };
type RecoveryReport = { results: RecoveryRow[]; skipped_count: number };
type Renewal = { outcome: 'renewed' | 'lost'; reason?: string };

const SETTLED = new Set(['requeued', 'finalized', 'terminal_reconciled']);

describePostgres('turn leases across concurrent connections', () => {
	let pg: DisposablePostgres;
	let admin: Client;
	let sweepA: Client;
	let sweepB: Client;
	let worker: Client;
	let shim: ReturnType<typeof createPgSupabaseShim>;
	let turnNumber = 0;

	beforeAll(async () => {
		pg = await startDisposableWorkflowPostgres(
			resolve(process.cwd(), '../..'),
			'buildos-turn-leases-pg-'
		);
		const { Client: PgClient } = await import('pg');
		admin = new PgClient(pg.connection);
		await admin.connect();
		[sweepA, sweepB, worker] = await Promise.all([
			serviceClient(pg.connection),
			serviceClient(pg.connection),
			serviceClient(pg.connection)
		]);
		shim = createPgSupabaseShim(worker);
		await seedE2EOwner(admin);
	}, 120_000);

	afterAll(async () => {
		for (const client of [sweepA, sweepB, worker, admin]) {
			await client?.end().catch(() => undefined);
		}
		pg?.stop();
	});

	/** A turn a worker claimed (generation 1) and then stopped renewing. */
	async function claimedTurn(leaseAgeSeconds: number) {
		turnNumber += 1;
		const turnRunId = await admitE2ETurn(shim, turnNumber);
		const lease = await leaseAndClaimE2E(admin, shim, turnRunId);
		await expireWorkerLease(admin, turnRunId, leaseAgeSeconds);
		return {
			turnRunId,
			fence: {
				p_turn_run_id: turnRunId,
				p_queue_job_id: lease.job,
				p_processing_token: lease.token,
				p_execution_generation: lease.claim.executionGeneration
			}
		};
	}

	async function recover(client: Client): Promise<RecoveryReport> {
		const { rows } = await client.query(
			'SELECT public.recover_dead_agentic_chat_turns(p_batch_size => 100, p_workflow_handoff => false) AS data'
		);
		return rows[0].data as RecoveryReport;
	}

	async function renew(
		client: Client,
		fence: Awaited<ReturnType<typeof claimedTurn>>['fence']
	): Promise<Renewal> {
		const { rows } = await client.query(
			`SELECT public.renew_agentic_chat_turn_lease(
				p_turn_run_id => $1, p_queue_job_id => $2,
				p_processing_token => $3, p_execution_generation => $4) AS data`,
			[
				fence.p_turn_run_id,
				fence.p_queue_job_id,
				fence.p_processing_token,
				fence.p_execution_generation
			]
		);
		return rows[0].data as Renewal;
	}

	async function turnState(turnRunId: string) {
		const { rows } = await admin.query(
			`SELECT turns.status, turns.execution_generation, jobs.status AS job_status, jobs.attempts
			FROM public.chat_turn_runs turns JOIN public.queue_jobs jobs ON jobs.id = turns.queue_job_id
			WHERE turns.id = $1`,
			[turnRunId]
		);
		return rows[0] as {
			status: string;
			execution_generation: number;
			job_status: string;
			attempts: number;
		};
	}

	const outcomesFor = (report: RecoveryReport, ids: Set<string>) =>
		report.results.filter((row) => ids.has(row.turn_run_id));

	it('two overlapping sweeps settle each dead turn once, and the second never waits', async () => {
		const turns = await Promise.all(Array.from({ length: 6 }, () => claimedTurn(100)));
		const ids = new Set(turns.map((turn) => turn.turnRunId));
		const attemptsBefore = new Map(
			await Promise.all(
				turns.map(
					async (turn) =>
						[turn.turnRunId, (await turnState(turn.turnRunId)).attempts] as const
				)
			)
		);

		// Sweep A holds every row lock it took until it commits.
		await sweepA.query('BEGIN');
		try {
			const first = await recover(sweepA);
			expect(
				outcomesFor(first, ids)
					.map((row) => row.outcome)
					.sort()
			).toEqual(Array.from({ length: 6 }, () => 'requeued'));

			const startedAt = Date.now();
			const second = await recover(sweepB);
			// SKIP LOCKED: the overlapping sweep moves on instead of queueing behind A.
			expect(Date.now() - startedAt).toBeLessThan(1_500);
			expect(outcomesFor(second, ids).map((row) => row.outcome)).toEqual(
				Array.from({ length: 6 }, () => 'skipped')
			);
			await sweepA.query('COMMIT');
		} catch (error) {
			await sweepA.query('ROLLBACK');
			throw error;
		}

		// Nothing left for anyone: settled exactly once.
		expect(outcomesFor(await recover(sweepB), ids)).toEqual([]);
		for (const turn of turns) {
			const state = await turnState(turn.turnRunId);
			expect(state).toMatchObject({ status: 'queued', execution_generation: 1 });
			expect(state.attempts).toBe(attemptsBefore.get(turn.turnRunId)! + 1);
		}
	}, 60_000);

	it('two free-running sweeps never settle the same turn twice', async () => {
		const turns = await Promise.all(Array.from({ length: 6 }, () => claimedTurn(100)));
		const ids = new Set(turns.map((turn) => turn.turnRunId));

		const [a, b] = await Promise.all([recover(sweepA), recover(sweepB)]);

		for (const id of ids) {
			const rows = [...outcomesFor(a, new Set([id])), ...outcomesFor(b, new Set([id]))];
			expect(rows.filter((row) => SETTLED.has(row.outcome))).toHaveLength(1);
			// The loser saw it locked, or re-checked it under the lock and found it moved on.
			for (const row of rows.filter((candidate) => !SETTLED.has(candidate.outcome))) {
				expect(['skipped', 'not_dead']).toContain(row.outcome);
			}
			expect(await turnState(id)).toMatchObject({ status: 'queued' });
		}
	}, 60_000);

	it('a renewal that arrives while recovery holds the turn learns it lost the turn', async () => {
		const turn = await claimedTurn(100);
		await sweepA.query('BEGIN');
		let renewal: Promise<Renewal> | null = null;
		try {
			const report = await recover(sweepA);
			expect(outcomesFor(report, new Set([turn.turnRunId]))).toEqual([
				expect.objectContaining({ outcome: 'requeued' })
			]);
			// The renewal waits on the turn lock rather than reading a pre-recovery row.
			let settled = false;
			renewal = renew(worker, turn.fence).finally(() => {
				settled = true;
			});
			await new Promise((resolveWait) => setTimeout(resolveWait, 300));
			expect(settled).toBe(false);
			await sweepA.query('COMMIT');
		} catch (error) {
			await sweepA.query('ROLLBACK');
			throw error;
		}
		await expect(renewal).resolves.toMatchObject({ outcome: 'lost', reason: 'not_running' });
		expect(await turnState(turn.turnRunId)).toMatchObject({ status: 'queued' });
	}, 60_000);

	it('a renewal that holds the turn keeps it: recovery skips it, then sees it alive', async () => {
		// 89.5 s old: still renewable (stale, not expired).
		const turn = await claimedTurn(89.5);
		await worker.query('BEGIN');
		try {
			await expect(renew(worker, turn.fence)).resolves.toMatchObject({ outcome: 'renewed' });
			// Past 90 s by the committed row, so recovery picks it as a candidate,
			// but the renewal holds its lock.
			await new Promise((resolveWait) => setTimeout(resolveWait, 700));
			const during = await recover(sweepA);
			expect(outcomesFor(during, new Set([turn.turnRunId]))).toEqual([
				expect.objectContaining({ outcome: 'skipped' })
			]);
			await worker.query('COMMIT');
		} catch (error) {
			await worker.query('ROLLBACK');
			throw error;
		}
		const after = await recover(sweepA);
		expect(outcomesFor(after, new Set([turn.turnRunId]))).toEqual([]);
		expect(await turnState(turn.turnRunId)).toMatchObject({
			status: 'running',
			execution_generation: 1,
			job_status: 'processing'
		});
	}, 60_000);

	it('racing a renewal against recovery at the 90 s boundary always yields a consistent pair', async () => {
		const seen = new Set<string>();
		// 85 s and 95 s pin both sides; the rest land wherever the clock falls.
		for (const age of [85, 89.9, 89.95, 90, 90.05, 90.1, 95]) {
			const turn = await claimedTurn(age);
			const [renewal, report] = await Promise.all([
				renew(worker, turn.fence),
				recover(sweepA)
			]);
			const recovered = outcomesFor(report, new Set([turn.turnRunId])).some((row) =>
				SETTLED.has(row.outcome)
			);
			const state = await turnState(turn.turnRunId);
			seen.add(renewal.outcome);
			if (renewal.outcome === 'renewed') {
				// The worker keeps the turn, so nobody else may have taken it.
				expect(recovered).toBe(false);
				expect(state).toMatchObject({ status: 'running', job_status: 'processing' });
			} else {
				// The worker was told to stop; the turn is recovered now or on the next sweep.
				expect(renewal.outcome).toBe('lost');
				if (!recovered) {
					const next = await recover(sweepA);
					expect(
						outcomesFor(next, new Set([turn.turnRunId])).some((row) =>
							SETTLED.has(row.outcome)
						)
					).toBe(true);
				}
				expect((await turnState(turn.turnRunId)).status).toBe('queued');
			}
		}
		expect([...seen].sort()).toEqual(['lost', 'renewed']);
	}, 60_000);
});
