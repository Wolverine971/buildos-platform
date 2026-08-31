import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLibriCostLedger, type LibriCostLedgerPort } from '../src/workers/libri/costLedger';

const LIBRARY_ID = '8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const USER_ID = '81111111-1111-4111-8111-111111111111';
const LEASE_TOKEN = '84000000-0000-4000-8000-000000000001';
const RACE_RUN_ID = '81000000-0000-4000-8000-000000000001';
const RACE_STEP_A = '82000000-0000-4000-8000-000000000001';
const RACE_STEP_B = '82000000-0000-4000-8000-000000000002';
const IDEMPOTENT_RUN_ID = '81000000-0000-4000-8000-000000000002';
const IDEMPOTENT_STEP_ID = '82000000-0000-4000-8000-000000000003';

const postgresAvailable = ['initdb', 'pg_ctl', 'psql'].every(hasCommand);
const describePostgres = postgresAvailable ? describe : describe.skip;

describePostgres('Libri provider cost ledger PostgreSQL races', () => {
	let tempDir = '';
	let dataDir = '';
	let socketDir = '';
	let port = 0;
	let workerPool: Pool | null = null;
	let adminPool: Pool | null = null;
	let ledger: LibriCostLedgerPort;

	beforeAll(async () => {
		tempDir = mkdtempSync('/tmp/buildos-libri-cost-pg-');
		dataDir = join(tempDir, 'data');
		socketDir = join(tempDir, 'socket');
		port = 55_000 + (process.pid % 500);
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
				{ cause: error }
			);
		}

		const repositoryRoot = resolve(process.cwd(), '../..');
		applySqlFile(
			resolve(repositoryRoot, 'supabase/tests/fixtures/libri_provider_cost_ledger_base.sql')
		);
		applySql(`
			INSERT INTO auth.users (id) VALUES ('${USER_ID}');
			INSERT INTO libri.libraries (id, slug, name, created_by) VALUES (
				'${LIBRARY_ID}', 'cost-race', 'Cost race', '${USER_ID}'
			);
			INSERT INTO libri.library_members (library_id, user_id, role) VALUES (
				'${LIBRARY_ID}', '${USER_ID}', 'owner'
			);
			INSERT INTO libri.research_runs (
				id, library_id, idempotency_key, queue_family, kind, subject_type,
				requested_by_actor, status, started_at, planned_steps, cost_budget_microusd
			) VALUES
			(
				'${RACE_RUN_ID}', '${LIBRARY_ID}', 'cost-race-run', 'libri_ingest',
				'ocr_image', 'maintenance', 'system', 'running', now(), 2, 100
			),
			(
				'${IDEMPOTENT_RUN_ID}', '${LIBRARY_ID}', 'cost-idempotent-run', 'libri_ingest',
				'ocr_image', 'maintenance', 'system', 'running', now(), 1, 100
			);
			INSERT INTO libri.research_steps (
				id, library_id, run_id, idempotency_key, queue_family, kind, stage, position,
				status, active_queue_job_id, active_processing_token, execution_generation,
				lease_token, lease_owner, leased_at, lease_expires_at, last_heartbeat_at, started_at
			) VALUES
			(
				'${RACE_STEP_A}', '${LIBRARY_ID}', '${RACE_RUN_ID}', 'cost-race-step-a',
				'libri_ingest', 'ocr_image', 'capture_sources', 0, 'leased',
				'83000000-0000-4000-8000-000000000001',
				'83111111-1111-4111-8111-111111111111', 1, '${LEASE_TOKEN}',
				'libri-worker:race-a', now(), now() + interval '5 minutes', now(), now()
			),
			(
				'${RACE_STEP_B}', '${LIBRARY_ID}', '${RACE_RUN_ID}', 'cost-race-step-b',
				'libri_ingest', 'ocr_image', 'capture_sources', 1, 'leased',
				'83000000-0000-4000-8000-000000000002',
				'83222222-2222-4222-8222-222222222222', 1, '${LEASE_TOKEN}',
				'libri-worker:race-b', now(), now() + interval '5 minutes', now(), now()
			),
			(
				'${IDEMPOTENT_STEP_ID}', '${LIBRARY_ID}', '${IDEMPOTENT_RUN_ID}',
				'cost-idempotent-step', 'libri_ingest', 'ocr_image', 'capture_sources', 0,
				'leased', '83000000-0000-4000-8000-000000000003',
				'83333333-3333-4333-8333-333333333333', 1, '${LEASE_TOKEN}',
				'libri-worker:idempotent', now(), now() + interval '5 minutes', now(), now()
			);
		`);

		const poolOptions = {
			host: socketDir,
			port,
			database: 'postgres'
		};
		workerPool = new Pool({ ...poolOptions, user: 'libri_worker', max: 2 });
		adminPool = new Pool({ ...poolOptions, user: 'postgres', max: 1 });
		ledger = createLibriCostLedger(workerPool);
	}, 30_000);

	afterAll(async () => {
		await workerPool?.end();
		await adminPool?.end();
		if (dataDir) {
			spawnSync('pg_ctl', ['-D', dataDir, 'stop', '-m', 'fast'], { stdio: 'ignore' });
		}
		if (tempDir) rmSync(tempDir, { recursive: true, force: true });
	});

	it('serializes competing step reservations against one run budget', async () => {
		const reserve = (stepId: string, reservationKey: string) =>
			ledger.reserveProviderCost({
				stepId,
				executionGeneration: 1,
				leaseToken: LEASE_TOKEN,
				reservationKey,
				provider: 'openrouter',
				model: 'openai/gpt-4o-mini',
				reservedMicrousd: 80n
			});
		const receipts = await Promise.all([
			reserve(RACE_STEP_A, 'race-a'),
			reserve(RACE_STEP_B, 'race-b')
		]);

		expect(receipts.map((receipt) => receipt.outcome).sort()).toEqual([
			'budget_unavailable',
			'reserved'
		]);
		expect(receipts.filter((receipt) => receipt.created)).toHaveLength(1);
		const state = await adminPool?.query<{ reserved: string; ledger_rows: string }>(`
			SELECT
				COALESCE(sum(reserved_microusd) FILTER (
					WHERE status IN ('reserved', 'started')
				), 0)::text AS reserved,
				(SELECT count(*)::text FROM libri.provider_cost_reservations
				 WHERE run_id = '${RACE_RUN_ID}') AS ledger_rows
			FROM libri.provider_cost_reservations
			WHERE run_id = '${RACE_RUN_ID}'
		`);
		expect(state?.rows[0]).toEqual({ reserved: '80', ledger_rows: '1' });
	}, 15_000);

	it('collapses concurrent retries of one reservation key without double holding cost', async () => {
		const input = {
			stepId: IDEMPOTENT_STEP_ID,
			executionGeneration: 1,
			leaseToken: LEASE_TOKEN,
			reservationKey: 'same-provider-call',
			provider: 'openrouter',
			model: 'openai/gpt-4o-mini',
			reservedMicrousd: 60n
		};
		const receipts = await Promise.all([
			ledger.reserveProviderCost(input),
			ledger.reserveProviderCost(input)
		]);

		expect(new Set(receipts.map((receipt) => receipt.reservationId)).size).toBe(1);
		expect(receipts.map((receipt) => receipt.created).sort()).toEqual([false, true]);
		const state = await adminPool?.query<{ reserved: string; ledger_rows: string }>(`
			SELECT
				COALESCE(sum(reserved_microusd) FILTER (
					WHERE status IN ('reserved', 'started')
				), 0)::text AS reserved,
				(SELECT count(*)::text FROM libri.provider_cost_reservations
				 WHERE run_id = '${IDEMPOTENT_RUN_ID}') AS ledger_rows
			FROM libri.provider_cost_reservations
			WHERE run_id = '${IDEMPOTENT_RUN_ID}'
		`);
		expect(state?.rows[0]).toEqual({ reserved: '60', ledger_rows: '1' });
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
