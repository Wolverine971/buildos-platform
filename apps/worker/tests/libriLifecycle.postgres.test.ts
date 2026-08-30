import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLibriLifecycle, type LibriLifecyclePort } from '../src/workers/libri/lifecycle';

const LIBRARY_ID = '8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const RUN_ID = '81000000-0000-4000-8000-000000000001';
const STEP_ID = '82000000-0000-4000-8000-000000000001';
const USER_ID = '81111111-1111-4111-8111-111111111111';
const OTHER_QUEUE_ID = '83000000-0000-4000-8000-000000000001';
const RETRY_RUN_ID = '81000000-0000-4000-8000-000000000002';
const RETRY_STEP_ID = '82000000-0000-4000-8000-000000000002';
const CANCEL_RUN_ID = '81000000-0000-4000-8000-000000000003';
const CANCEL_STEP_ID = '82000000-0000-4000-8000-000000000003';
const RECOVERY_RUN_ID = '81000000-0000-4000-8000-000000000004';
const RECOVERY_STEP_ID = '82000000-0000-4000-8000-000000000004';

const postgresAvailable = ['initdb', 'pg_ctl', 'psql'].every(hasCommand);
const describePostgres = postgresAvailable ? describe : describe.skip;

describePostgres('Libri lifecycle restricted-role PostgreSQL contract', () => {
	let tempDir = '';
	let dataDir = '';
	let socketDir = '';
	let port = 0;
	let workerPool: Pool | null = null;
	let adminPool: Pool | null = null;
	let lifecycle: LibriLifecyclePort;

	beforeAll(async () => {
		tempDir = mkdtempSync('/tmp/buildos-libri-lifecycle-pg-');
		dataDir = join(tempDir, 'data');
		socketDir = join(tempDir, 'socket');
		port = 54_000 + (process.pid % 1_000);
		mkdirSync(socketDir);

		execFileSync(
			'initdb',
			[
				'-D',
				dataDir,
				'--no-locale',
				'--encoding=UTF8',
				'--auth=trust',
				'--username=postgres'
			],
			{ stdio: 'pipe' }
		);
		const postgresLog = join(tempDir, 'postgres.log');
		try {
			execFileSync(
				'pg_ctl',
				[
					'-D',
					dataDir,
					'-l',
					postgresLog,
					'-o',
					`-p ${port} -k ${socketDir} -c listen_addresses=''`,
					'start'
				],
				{ stdio: 'pipe' }
			);
		} catch (error) {
			throw new Error(
				`Disposable PostgreSQL failed to start:\n${readFileSync(postgresLog, 'utf8')}`,
				{
					cause: error
				}
			);
		}

		const repositoryRoot = resolve(process.cwd(), '../..');
		applySqlFile(
			resolve(repositoryRoot, 'supabase/tests/fixtures/libri_worker_access_boundary_base.sql')
		);
		applySql(`
			INSERT INTO auth.users (id) VALUES ('${USER_ID}');
			INSERT INTO libri.libraries (id, slug, name, created_by) VALUES (
				'${LIBRARY_ID}', 'worker-lifecycle', 'Worker lifecycle', '${USER_ID}'
			);
			INSERT INTO libri.library_members (library_id, user_id, role) VALUES (
				'${LIBRARY_ID}', '${USER_ID}', 'owner'
			);
			INSERT INTO libri.research_runs (
				id, library_id, idempotency_key, queue_family, kind, subject_type,
				requested_by_actor, planned_steps
			) VALUES
			(
				'${RUN_ID}', '${LIBRARY_ID}', 'worker-lifecycle-run',
				'libri_maintenance', 'synthetic_smoke', 'maintenance', 'system', 1
			),
			(
				'${RETRY_RUN_ID}', '${LIBRARY_ID}', 'worker-retry-run',
				'libri_maintenance', 'synthetic_retry', 'maintenance', 'system', 1
			),
			(
				'${CANCEL_RUN_ID}', '${LIBRARY_ID}', 'worker-cancel-run',
				'libri_maintenance', 'synthetic_cancel', 'maintenance', 'system', 1
			),
			(
				'${RECOVERY_RUN_ID}', '${LIBRARY_ID}', 'worker-recovery-run',
				'libri_maintenance', 'synthetic_recovery', 'maintenance', 'system', 1
			);
			INSERT INTO libri.research_steps (
				id, library_id, run_id, idempotency_key, queue_family, kind,
				stage, position, payload, max_attempts
			) VALUES
			(
				'${STEP_ID}', '${LIBRARY_ID}', '${RUN_ID}', 'worker-lifecycle-step',
				'libri_maintenance', 'synthetic_smoke', 'maintenance', 0,
				'{"canary":true}'::jsonb, 3
			),
			(
				'${RETRY_STEP_ID}', '${LIBRARY_ID}', '${RETRY_RUN_ID}', 'worker-retry-step',
				'libri_maintenance', 'synthetic_retry', 'maintenance', 0,
				'{"retry":true}'::jsonb, 2
			),
			(
				'${CANCEL_STEP_ID}', '${LIBRARY_ID}', '${CANCEL_RUN_ID}', 'worker-cancel-step',
				'libri_maintenance', 'synthetic_cancel', 'maintenance', 0,
				'{"cancel":true}'::jsonb, 2
			),
			(
				'${RECOVERY_STEP_ID}', '${LIBRARY_ID}', '${RECOVERY_RUN_ID}', 'worker-recovery-step',
				'libri_maintenance', 'synthetic_recovery', 'maintenance', 0,
				'{"recovery":true}'::jsonb, 2
			);
			INSERT INTO public.queue_jobs (
				id, queue_job_id, user_id, job_type, status, priority, scheduled_for
			) VALUES (
				'${OTHER_QUEUE_ID}', 'other_buildos_control', '${USER_ID}',
				'other', 'pending', 1, now()
			);
		`);

		const poolOptions = {
			host: socketDir,
			port,
			database: 'postgres',
			max: 1
		};
		workerPool = new Pool({ ...poolOptions, user: 'libri_worker' });
		adminPool = new Pool({ ...poolOptions, user: 'postgres' });
		lifecycle = createLibriLifecycle(workerPool);
	}, 30_000);

	afterAll(async () => {
		await workerPool?.end();
		await adminPool?.end();
		if (dataDir) {
			spawnSync('pg_ctl', ['-D', dataDir, 'stop', '-m', 'fast'], { stdio: 'ignore' });
		}
		if (tempDir) rmSync(tempDir, { recursive: true, force: true });
	});

	it('passes idempotent enqueue, claim, heartbeat, completion, stale fencing, and BuildOS isolation', async () => {
		const firstEnqueue = await lifecycle.enqueueStep({ stepId: STEP_ID, priority: 5 });
		const repeatedEnqueue = await lifecycle.enqueueStep({ stepId: STEP_ID, priority: 5 });
		expect(firstEnqueue.created).toBe(true);
		expect(repeatedEnqueue).toMatchObject({
			created: false,
			queueRowId: firstEnqueue.queueRowId,
			queueType: 'libri_maintenance'
		});

		const claim = await lifecycle.claimNextStep({
			workerId: 'libri-worker:postgres-contract',
			leaseDurationMs: 60_000
		});
		expect(claim).toMatchObject({
			kind: 'claimed',
			queueRowId: firstEnqueue.queueRowId,
			stepId: STEP_ID,
			runId: RUN_ID,
			payload: { canary: true }
		});
		if (!claim || claim.kind !== 'claimed') throw new Error('Expected the Libri canary claim');

		await expect(
			lifecycle.heartbeatStep({
				queueRowId: claim.queueRowId,
				stepId: claim.stepId,
				processingToken: '99999999-9999-4999-8999-999999999999',
				leaseToken: claim.leaseToken,
				executionGeneration: claim.executionGeneration,
				workerId: 'libri-worker:postgres-contract',
				leaseDurationMs: 60_000
			})
		).resolves.toBe(false);
		await expect(
			lifecycle.heartbeatStep({
				queueRowId: claim.queueRowId,
				stepId: claim.stepId,
				processingToken: claim.processingToken,
				leaseToken: claim.leaseToken,
				executionGeneration: claim.executionGeneration,
				workerId: 'libri-worker:postgres-contract',
				leaseDurationMs: 60_000
			})
		).resolves.toBe(true);

		const completion = {
			queueRowId: claim.queueRowId,
			stepId: claim.stepId,
			processingToken: claim.processingToken,
			leaseToken: claim.leaseToken,
			executionGeneration: claim.executionGeneration,
			result: { canary: 'passed' }
		};
		await expect(lifecycle.completeStep(completion)).resolves.toBe(true);
		await expect(lifecycle.completeStep(completion)).resolves.toBe(false);
		await expect(
			lifecycle.claimNextStep({
				workerId: 'libri-worker:postgres-contract',
				leaseDurationMs: 60_000
			})
		).resolves.toBeNull();

		const workerVisibleJobs = await workerPool?.query<{ count: string }>(
			'SELECT count(*)::text AS count FROM public.queue_jobs'
		);
		expect(workerVisibleJobs?.rows[0]?.count).toBe('1');
		const finalState = await adminPool?.query<{
			other_status: string;
			libri_status: string;
			step_status: string;
			run_status: string;
		}>(`
			SELECT
				(SELECT status::text FROM public.queue_jobs WHERE id = '${OTHER_QUEUE_ID}') AS other_status,
				(SELECT status::text FROM public.queue_jobs WHERE id = '${firstEnqueue.queueRowId}') AS libri_status,
				(SELECT status FROM libri.research_steps WHERE id = '${STEP_ID}') AS step_status,
				(SELECT status FROM libri.research_runs WHERE id = '${RUN_ID}') AS run_status
		`);
		expect(finalState?.rows[0]).toEqual({
			other_status: 'pending',
			libri_status: 'completed',
			step_status: 'completed',
			run_status: 'completed'
		});
	}, 15_000);

	it('retries a transient failure once and dead-letters the exhausted fenced attempt', async () => {
		await lifecycle.enqueueStep({ stepId: RETRY_STEP_ID, priority: 5 });
		const firstClaim = await lifecycle.claimNextStep({
			workerId: 'libri-worker:retry-contract',
			leaseDurationMs: 60_000
		});
		if (!firstClaim || firstClaim.kind !== 'claimed') throw new Error('Expected retry claim');
		await expect(
			lifecycle.failStep({
				queueRowId: firstClaim.queueRowId,
				stepId: firstClaim.stepId,
				processingToken: firstClaim.processingToken,
				leaseToken: firstClaim.leaseToken,
				executionGeneration: firstClaim.executionGeneration,
				errorClass: 'provider_transient',
				errorMessage: 'synthetic retry',
				retry: true,
				retryDelayMs: 0
			})
		).resolves.toMatchObject({ accepted: true, outcome: 'retry_scheduled' });

		const secondClaim = await lifecycle.claimNextStep({
			workerId: 'libri-worker:retry-contract',
			leaseDurationMs: 60_000
		});
		if (!secondClaim || secondClaim.kind !== 'claimed') {
			throw new Error('Expected second retry claim');
		}
		expect(secondClaim.executionGeneration).toBe(2);
		await expect(
			lifecycle.failStep({
				queueRowId: secondClaim.queueRowId,
				stepId: secondClaim.stepId,
				processingToken: secondClaim.processingToken,
				leaseToken: secondClaim.leaseToken,
				executionGeneration: secondClaim.executionGeneration,
				errorClass: 'provider_transient',
				errorMessage: 'synthetic exhausted retry',
				retry: true
			})
		).resolves.toEqual({ accepted: true, outcome: 'dead_letter' });
		await expect(
			lifecycle.failStep({
				queueRowId: firstClaim.queueRowId,
				stepId: firstClaim.stepId,
				processingToken: firstClaim.processingToken,
				leaseToken: firstClaim.leaseToken,
				executionGeneration: firstClaim.executionGeneration,
				errorClass: 'stale',
				errorMessage: 'stale worker'
			})
		).resolves.toEqual({ accepted: false, outcome: 'stale' });

		const terminal = await adminPool?.query<{ step_status: string; run_status: string }>(`
			SELECT
				(SELECT status FROM libri.research_steps WHERE id = '${RETRY_STEP_ID}') AS step_status,
				(SELECT status FROM libri.research_runs WHERE id = '${RETRY_RUN_ID}') AS run_status
		`);
		expect(terminal?.rows[0]).toEqual({ step_status: 'dead_letter', run_status: 'failed' });
	}, 15_000);

	it('persists cancellation intent before sweeping the active queue and step', async () => {
		await lifecycle.enqueueStep({ stepId: CANCEL_STEP_ID, priority: 5 });
		const claim = await lifecycle.claimNextStep({
			workerId: 'libri-worker:cancel-contract',
			leaseDurationMs: 60_000
		});
		if (!claim || claim.kind !== 'claimed') throw new Error('Expected cancellation claim');

		await expect(
			lifecycle.cancelRun({ runId: CANCEL_RUN_ID, reason: 'synthetic cancellation' })
		).resolves.toEqual({
			accepted: true,
			cancelledSteps: 1,
			cancelledQueueJobs: 1,
			remainingSteps: 0
		});
		await expect(
			lifecycle.cancelRun({ runId: CANCEL_RUN_ID, reason: 'synthetic cancellation retry' })
		).resolves.toEqual({
			accepted: true,
			cancelledSteps: 0,
			cancelledQueueJobs: 0,
			remainingSteps: 0
		});
		await expect(
			lifecycle.completeStep({
				queueRowId: claim.queueRowId,
				stepId: claim.stepId,
				processingToken: claim.processingToken,
				leaseToken: claim.leaseToken,
				executionGeneration: claim.executionGeneration,
				result: { unsafe: true }
			})
		).resolves.toBe(false);

		const cancelled = await adminPool?.query<{
			queue_status: string;
			step_status: string;
			run_status: string;
		}>(`
			SELECT
				(SELECT status::text FROM public.queue_jobs WHERE id = '${claim.queueRowId}') AS queue_status,
				(SELECT status FROM libri.research_steps WHERE id = '${CANCEL_STEP_ID}') AS step_status,
				(SELECT status FROM libri.research_runs WHERE id = '${CANCEL_RUN_ID}') AS run_status
		`);
		expect(cancelled?.rows[0]).toEqual({
			queue_status: 'cancelled',
			step_status: 'cancelled',
			run_status: 'cancelled'
		});
	}, 15_000);

	it('recovers one expired lease and dead-letters the next exhausted generation', async () => {
		await lifecycle.enqueueStep({ stepId: RECOVERY_STEP_ID, priority: 5 });
		const firstClaim = await lifecycle.claimNextStep({
			workerId: 'libri-worker:recovery-contract',
			leaseDurationMs: 60_000
		});
		if (!firstClaim || firstClaim.kind !== 'claimed')
			throw new Error('Expected recovery claim');
		await adminPool?.query(
			`UPDATE libri.research_steps
			SET
				leased_at = now() - interval '2 minutes',
				last_heartbeat_at = now() - interval '2 minutes',
				lease_expires_at = now() - interval '1 minute'
			WHERE id = $1`,
			[RECOVERY_STEP_ID]
		);
		await expect(lifecycle.recoverStaleLeases({ limit: 1 })).resolves.toEqual({
			retried: 1,
			deadLettered: 0,
			cancelled: 0
		});

		await adminPool?.query('UPDATE public.queue_jobs SET scheduled_for = now() WHERE id = $1', [
			firstClaim.queueRowId
		]);
		const secondClaim = await lifecycle.claimNextStep({
			workerId: 'libri-worker:recovery-contract',
			leaseDurationMs: 60_000
		});
		if (!secondClaim || secondClaim.kind !== 'claimed') {
			throw new Error('Expected recovered second claim');
		}
		await adminPool?.query(
			`UPDATE libri.research_steps
			SET
				leased_at = now() - interval '2 minutes',
				last_heartbeat_at = now() - interval '2 minutes',
				lease_expires_at = now() - interval '1 minute'
			WHERE id = $1`,
			[RECOVERY_STEP_ID]
		);
		await expect(lifecycle.recoverStaleLeases({ limit: 1 })).resolves.toEqual({
			retried: 0,
			deadLettered: 1,
			cancelled: 0
		});

		const terminal = await adminPool?.query<{ step_status: string; run_status: string }>(`
			SELECT
				(SELECT status FROM libri.research_steps WHERE id = '${RECOVERY_STEP_ID}') AS step_status,
				(SELECT status FROM libri.research_runs WHERE id = '${RECOVERY_RUN_ID}') AS run_status
		`);
		expect(terminal?.rows[0]).toEqual({ step_status: 'dead_letter', run_status: 'failed' });
	}, 15_000);

	function applySqlFile(path: string): void {
		execFileSync(
			'psql',
			[
				'-h',
				socketDir,
				'-p',
				String(port),
				'-d',
				'postgres',
				'-U',
				'postgres',
				'-v',
				'ON_ERROR_STOP=1',
				'-f',
				path
			],
			{ stdio: 'pipe' }
		);
	}

	function applySql(sql: string): void {
		execFileSync(
			'psql',
			[
				'-h',
				socketDir,
				'-p',
				String(port),
				'-d',
				'postgres',
				'-U',
				'postgres',
				'-v',
				'ON_ERROR_STOP=1',
				'-c',
				sql
			],
			{ stdio: 'pipe' }
		);
	}
});

function hasCommand(command: string): boolean {
	return spawnSync(command, ['--version'], { stdio: 'ignore' }).status === 0;
}
