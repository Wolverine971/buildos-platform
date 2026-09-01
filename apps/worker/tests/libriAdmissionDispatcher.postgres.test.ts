// apps/worker/tests/libriAdmissionDispatcher.postgres.test.ts
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Pool, type PoolConfig } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	createLibriAdmissionDispatcher,
	type LibriAdmissionDispatcherPort
} from '../src/workers/libri/admissionDispatcher';
import {
	createLibriAdmissionReconciler,
	type LibriAdmissionReconcilerPort
} from '../src/workers/libri/admissionReconciler';
import { createLibriCostLedger, type LibriCostLedgerPort } from '../src/workers/libri/costLedger';
import { createLibriLifecycle, type LibriLifecyclePort } from '../src/workers/libri/lifecycle';
import {
	createLibriOcrExecution,
	type LibriOcrExecutionPort
} from '../src/workers/libri/ocrExecution';

const USER_ID = 'a1000000-0000-4000-8000-000000000001';
const LIBRARY_ID = 'a2000000-0000-4000-8000-000000000001';
const BOOK_ID = 'a3000000-0000-4000-8000-000000000001';
const IMAGE_IDS = ['a4000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000002'];
const ADMISSION_ID = 'a5000000-0000-4000-8000-000000000001';
const CONTROL_ID = 'a6000000-0000-4000-8000-000000000001';

const externalDatabaseUrl = process.env.LIBRI_TEST_DATABASE_URL?.trim() || null;
const postgresAvailable =
	Boolean(externalDatabaseUrl) || ['initdb', 'pg_ctl', 'psql'].every(hasCommand);
if (process.env.CI && !postgresAvailable) {
	throw new Error('Libri PostgreSQL contract tests require initdb, pg_ctl, and psql in CI');
}
const describePostgres = postgresAvailable ? describe : describe.skip;

describePostgres('Libri OCR admission dispatcher restricted-role PostgreSQL contract', () => {
	let tempDir = '';
	let dataDir = '';
	let socketDir = '';
	let port = 0;
	let ownsCluster = false;
	let psqlConnectionArgs: string[] = [];
	let workerPool: Pool | null = null;
	let adminPool: Pool | null = null;
	let dispatcher: LibriAdmissionDispatcherPort;
	let reconciler: LibriAdmissionReconcilerPort;
	let lifecycle: LibriLifecyclePort;
	let costLedger: LibriCostLedgerPort;
	let ocrExecution: LibriOcrExecutionPort;
	let runId = '';
	let stepIds: string[] = [];
	let manifestSha256 = '';
	let controlHash = '';

	beforeAll(async () => {
		let poolOptions: PoolConfig;
		let adminUser: string | undefined;
		if (externalDatabaseUrl) {
			const external = parseExternalTestDatabase(externalDatabaseUrl);
			poolOptions = external.poolOptions;
			adminUser = external.adminUser;
			psqlConnectionArgs = external.psqlConnectionArgs;
		} else {
			tempDir = mkdtempSync('/tmp/buildos-libri-admission-dispatch-pg-');
			dataDir = join(tempDir, 'data');
			socketDir = join(tempDir, 'socket');
			port = 56_000 + (process.pid % 1_000);
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
				ownsCluster = true;
			} catch (error) {
				throw new Error(
					`Disposable PostgreSQL failed to start:\n${readFileSync(postgresLog, 'utf8')}`,
					{ cause: error }
				);
			}
			poolOptions = { host: socketDir, port, database: 'postgres' };
			adminUser = 'postgres';
			psqlConnectionArgs = [
				'-h',
				socketDir,
				'-p',
				String(port),
				'-d',
				'postgres',
				'-U',
				'postgres'
			];
		}

		const repositoryRoot = resolve(process.cwd(), '../..');
		applySqlFile(
			resolve(
				repositoryRoot,
				'supabase/tests/fixtures/libri_ocr_batch_dispatcher_access_base.sql'
			)
		);
		applySqlFile(
			resolve(
				repositoryRoot,
				'supabase/migrations/20260901153414_libri_ocr_admission_dispatch_timestamp_guard.sql'
			)
		);
		applySqlFile(
			resolve(
				repositoryRoot,
				'supabase/migrations/20260901155435_libri_ocr_admission_finalizer_hardening.sql'
			)
		);
		applySqlFile(
			resolve(
				repositoryRoot,
				'supabase/migrations/20260901163552_libri_ocr_admission_production_drift_correction.sql'
			)
		);
		applySql(seedSql());

		workerPool = new Pool({ ...poolOptions, user: 'libri_worker', max: 2 });
		adminPool = new Pool({ ...poolOptions, user: adminUser, max: 1 });
		dispatcher = createLibriAdmissionDispatcher(workerPool);
		reconciler = createLibriAdmissionReconciler(workerPool);
		lifecycle = createLibriLifecycle(workerPool);
		costLedger = createLibriCostLedger(workerPool);
		ocrExecution = createLibriOcrExecution(workerPool);

		const planned = await adminPool.query<{ run_id: string }>(
			`SELECT run_id
			FROM libri.plan_explicit_ocr_batch($1, $2, $3::uuid[], $4, $5)`,
			[LIBRARY_ID, BOOK_ID, IMAGE_IDS, 'ocr-batch:postgres-dispatch-contract', USER_ID]
		);
		runId = planned.rows[0]!.run_id;
		const manifest = await adminPool.query<{
			step_id: string;
			image_id: string;
			position: number;
			expected_ocr_version: number;
			image_content_sha256: string;
		}>(
			`SELECT step_id, image_id, position, expected_ocr_version, image_content_sha256
			FROM libri.ocr_batch_items
			WHERE library_id = $1 AND run_id = $2
			ORDER BY position`,
			[LIBRARY_ID, runId]
		);
		stepIds = manifest.rows.map((item) => item.step_id);
		manifestSha256 = createHash('sha256')
			.update(
				JSON.stringify({
					version: 1,
					runId,
					libraryId: LIBRARY_ID,
					bookId: BOOK_ID,
					items: manifest.rows.map((item) => ({
						stepId: item.step_id,
						imageId: item.image_id,
						position: item.position,
						expectedOcrVersion: item.expected_ocr_version,
						imageContentSha256: item.image_content_sha256
					}))
				}),
				'utf8'
			)
			.digest('hex');
		await adminPool.query(
			`INSERT INTO libri.ocr_batch_admissions (
				id, library_id, run_id, confirmation_id, confirmed_by, manifest_sha256
			) VALUES ($1, $2, $3, $4, $5, $6)`,
			[
				ADMISSION_ID,
				LIBRARY_ID,
				runId,
				'a7000000-0000-4000-8000-000000000001',
				USER_ID,
				manifestSha256
			]
		);
		const before = await adminPool.query<{ hash: string }>(
			'SELECT md5(to_jsonb(job)::text) AS hash FROM public.queue_jobs job WHERE id = $1',
			[CONTROL_ID]
		);
		controlHash = before.rows[0]!.hash;
	}, 30_000);

	afterAll(async () => {
		await workerPool?.end();
		await adminPool?.end();
		if (ownsCluster && dataDir) {
			spawnSync('pg_ctl', ['-D', dataDir, 'stop', '-m', 'fast'], { stdio: 'ignore' });
		}
		if (tempDir) rmSync(tempDir, { recursive: true, force: true });
	});

	it('rejects raw or expired finalization and rolls back when a lock outlives the canary', async () => {
		await expect(
			workerPool?.query(
				`UPDATE libri.ocr_batch_admissions
				SET status = 'enqueued', enqueued_at = transaction_timestamp(), updated_at = now()
				WHERE id = $1`,
				[ADMISSION_ID]
			)
		).rejects.toThrow('permission denied for table ocr_batch_admissions');
		await expect(
			workerPool?.query(
				`SELECT admission_id
				FROM libri.finalize_ocr_batch_admission_dispatch($1, clock_timestamp() - interval '1 second')`,
				[ADMISSION_ID]
			)
		).rejects.toThrow('dispatch window expired or is invalid');

		const blocker = await adminPool!.connect();
		try {
			await blocker.query('BEGIN');
			await blocker.query('SELECT id FROM libri.research_runs WHERE id = $1 FOR UPDATE', [
				runId
			]);
			await expect(
				dispatcher.dispatchOcrAdmission({
					admissionId: ADMISSION_ID,
					dispatchExpiresAt: new Date(Date.now() + 350).toISOString()
				})
			).rejects.toThrow(/lock timeout|statement timeout/);
		} finally {
			await blocker.query('ROLLBACK');
			blocker.release();
		}

		const state = await adminPool?.query<{
			admission_status: string;
			queue_jobs: string;
			pending_steps: string;
		}>(
			`SELECT
				(SELECT status FROM libri.ocr_batch_admissions WHERE id = $1) AS admission_status,
				(SELECT count(*)::text FROM public.queue_jobs
					WHERE metadata->>'libriAdmissionId' = $1::text) AS queue_jobs,
				(SELECT count(*)::text FROM libri.research_steps
					WHERE run_id = $2 AND status = 'pending') AS pending_steps`,
			[ADMISSION_ID, runId]
		);
		expect(state?.rows[0]).toEqual({
			admission_status: 'confirmed',
			queue_jobs: '0',
			pending_steps: '2'
		});
	}, 5_000);

	it('dispatches and replays the whole exact batch without touching the BuildOS control', async () => {
		const visibility = await workerPool?.query<{
			admissions: string;
			runs: string;
			libraries: string;
			joined: string;
		}>(
			`SELECT
				(SELECT count(*)::text FROM libri.ocr_batch_admissions WHERE id = $1) AS admissions,
				(SELECT count(*)::text FROM libri.research_runs WHERE id = $2) AS runs,
				(SELECT count(*)::text FROM libri.libraries WHERE id = $3) AS libraries,
				(SELECT count(*)::text
				 FROM libri.ocr_batch_admissions admission
				 JOIN libri.research_runs run
					ON run.library_id = admission.library_id AND run.id = admission.run_id
				 JOIN libri.libraries library ON library.id = admission.library_id
				 WHERE admission.id = $1) AS joined`,
			[ADMISSION_ID, runId, LIBRARY_ID]
		);
		expect(visibility?.rows[0]).toEqual({
			admissions: '1',
			runs: '1',
			libraries: '1',
			joined: '1'
		});
		await expect(
			reconciler.auditOcrAdmission({ admissionId: ADMISSION_ID })
		).resolves.toMatchObject({
			classification: 'confirmed_ready',
			healthy: true,
			manifestItems: 2,
			queueReceipts: 0,
			issues: []
		});

		await expect(
			adminPool?.query(
				`UPDATE libri.research_steps
			SET payload = jsonb_set(payload, '{maxOutputChars}', '1'::jsonb)
			WHERE id = $1`,
				[stepIds[0]]
			)
		).rejects.toThrow('step execution contract is immutable');

		await expect(
			adminPool?.query(
				`UPDATE libri.images SET content_sha256 = repeat('f', 64) WHERE id = $1`,
				[IMAGE_IDS[0]]
			)
		).rejects.toThrow('image identity is immutable');
		await expect(
			adminPool?.query(
				`UPDATE libri.ocr_batch_items
				SET run_id = 'a9000000-0000-4000-8000-000000000099'
				WHERE library_id = $1 AND run_id = $2 AND step_id = $3`,
				[LIBRARY_ID, runId, stepIds[0]]
			)
		).rejects.toThrow('batch items are immutable');

		const concurrent = await Promise.all([
			dispatcher.dispatchOcrAdmission(dispatchInput()),
			dispatcher.dispatchOcrAdmission(dispatchInput())
		]);
		const first = concurrent.find((receipt) => receipt.created);
		const replay = concurrent.find((receipt) => !receipt.created);
		expect(first).toBeDefined();
		expect(replay).toBeDefined();
		expect(first).toMatchObject({
			admissionId: ADMISSION_ID,
			runId,
			manifestSha256,
			created: true
		});
		expect(first?.jobs).toHaveLength(2);
		expect(first?.jobs.every((job) => job.created)).toBe(true);
		expect(replay).toMatchObject({
			admissionId: ADMISSION_ID,
			runId,
			manifestSha256,
			created: false
		});
		expect(replay?.jobs.map((job) => job.queueRowId)).toEqual(
			first?.jobs.map((job) => job.queueRowId)
		);
		await expect(
			adminPool?.query(
				`UPDATE libri.research_steps SET active_queue_job_id = NULL WHERE id = $1`,
				[stepIds[0]]
			)
		).rejects.toThrow('step execution contract is immutable');
		await expect(
			reconciler.auditOcrAdmission({ admissionId: ADMISSION_ID })
		).resolves.toMatchObject({
			classification: 'enqueued_consistent',
			healthy: true,
			manifestItems: 2,
			queueReceipts: 2,
			issues: []
		});

		const state = await adminPool?.query<{
			admission_status: string;
			enqueued_at_present: boolean;
			queued_steps: string;
			linked_steps: string;
			queue_jobs: string;
			control_hash: string;
		}>(
			`SELECT
				(SELECT status FROM libri.ocr_batch_admissions WHERE id = $1) AS admission_status,
				(SELECT enqueued_at IS NOT NULL FROM libri.ocr_batch_admissions WHERE id = $1)
					AS enqueued_at_present,
				(SELECT count(*)::text FROM libri.research_steps
					WHERE run_id = $2 AND status = 'queued') AS queued_steps,
				(SELECT count(*)::text FROM libri.research_steps
					WHERE run_id = $2 AND active_queue_job_id IS NOT NULL) AS linked_steps,
				(SELECT count(*)::text FROM public.queue_jobs
					WHERE job_type = 'libri_ingest'
						AND metadata->>'libriAdmissionId' = $1::text) AS queue_jobs,
				(SELECT md5(to_jsonb(job)::text) FROM public.queue_jobs job WHERE id = $3)
					AS control_hash`,
			[ADMISSION_ID, runId, CONTROL_ID]
		);
		expect(state?.rows[0]).toEqual({
			admission_status: 'enqueued',
			enqueued_at_present: true,
			queued_steps: '2',
			linked_steps: '2',
			queue_jobs: '2',
			control_hash: controlHash
		});

		const workerVisible = await workerPool?.query<{ count: string }>(
			'SELECT count(*)::text AS count FROM public.queue_jobs'
		);
		expect(workerVisible?.rows[0]?.count).toBe('2');
	}, 15_000);

	it('requires the exact admitted queue lease immediately before paid OCR authority', async () => {
		const claim = await lifecycle.claimNextStep({
			workerId: 'aa000000-0000-4000-8000-000000000001',
			leaseDurationMs: 60_000,
			queueTypes: ['libri_ingest'],
			stepIds: [stepIds[0]!]
		});
		expect(claim).toMatchObject({ kind: 'claimed', stepId: stepIds[0] });
		if (!claim || claim.kind !== 'claimed') throw new Error('OCR step was not claimed');

		const reservation = await costLedger.reserveProviderCost({
			stepId: claim.stepId,
			executionGeneration: claim.executionGeneration,
			leaseToken: claim.leaseToken,
			reservationKey: `ocr:image:${IMAGE_IDS[0]}:version:1`,
			provider: 'openrouter',
			model: 'openai/gpt-4o-mini',
			reservedMicrousd: 100_000n
		});
		expect(reservation).toMatchObject({ outcome: 'reserved', created: true });
		if (!reservation.reservationId) throw new Error('OCR cost reservation was not created');

		await adminPool?.query(
			`UPDATE public.queue_jobs
			SET metadata = jsonb_set(metadata, '{libriManifestSha256}', to_jsonb(repeat('f', 64)))
			WHERE id = $1`,
			[claim.queueRowId]
		);
		await expect(
			ocrExecution.authorizeOcrProviderCall({
				...claimOwnership(claim),
				reservationId: reservation.reservationId,
				imageId: IMAGE_IDS[0]!
			})
		).rejects.toThrow('paid OCR authorization lacks an exact enqueued admission');
		await adminPool?.query(
			`UPDATE public.queue_jobs
			SET metadata = jsonb_set(metadata, '{libriManifestSha256}', to_jsonb($2::text))
			WHERE id = $1`,
			[claim.queueRowId, manifestSha256]
		);

		await expect(
			ocrExecution.authorizeOcrProviderCall({
				...claimOwnership(claim),
				reservationId: reservation.reservationId,
				imageId: IMAGE_IDS[0]!
			})
		).resolves.toMatchObject({
			authorized: true,
			outcome: 'started',
			maxOutputChars: 50_000,
			provider: 'openrouter',
			model: 'openai/gpt-4o-mini'
		});
		await expect(
			adminPool?.query<{ ocr_status: string }>(
				'SELECT ocr_status::text FROM libri.images WHERE id = $1',
				[IMAGE_IDS[0]]
			)
		).resolves.toMatchObject({ rows: [{ ocr_status: 'processing' }] });

		await expect(
			ocrExecution.completeOcrStep({
				...claimOwnership(claim),
				reservationId: reservation.reservationId,
				imageId: IMAGE_IDS[0]!,
				extractedText: 'Exact admitted OCR text',
				summary: 'Exact admitted OCR summary',
				confidence: 0.99,
				language: 'en',
				actualCostMicrousd: 50_000n,
				promptTokens: 100n,
				completionTokens: 200n,
				providerRequestId: 'provider-request-admitted-ocr'
			})
		).resolves.toMatchObject({
			accepted: true,
			outcome: 'settled',
			ocrVersion: 1,
			provider: 'openrouter',
			model: 'openai/gpt-4o-mini'
		});
		await expect(
			reconciler.auditOcrAdmission({ admissionId: ADMISSION_ID })
		).resolves.toMatchObject({
			classification: 'enqueued_consistent',
			healthy: true,
			issues: []
		});
	});

	function applySqlFile(path: string): void {
		execFileSync('psql', [...psqlConnectionArgs, '-v', 'ON_ERROR_STOP=1', '-f', path], {
			stdio: 'pipe'
		});
	}

	function applySql(sql: string): void {
		execFileSync('psql', [...psqlConnectionArgs, '-v', 'ON_ERROR_STOP=1', '-c', sql], {
			stdio: 'pipe'
		});
	}
});

function seedSql(): string {
	return `
		INSERT INTO auth.users (id) VALUES ('${USER_ID}');
		INSERT INTO libri.libraries (id, slug, name, created_by) VALUES (
			'${LIBRARY_ID}', 'dispatcher-postgres', 'Dispatcher PostgreSQL', '${USER_ID}'
		);
		INSERT INTO libri.library_members (library_id, user_id, role) VALUES (
			'${LIBRARY_ID}', '${USER_ID}', 'owner'
		);
		INSERT INTO libri.books (id, library_id, title) VALUES (
			'${BOOK_ID}', '${LIBRARY_ID}', 'Atomic dispatch'
		);
		INSERT INTO libri.sources (
			id, library_id, source_type, source_key, title, status, discovered_by
		) VALUES
		(
			'a8000000-0000-4000-8000-000000000001', '${LIBRARY_ID}', 'scanned_image',
			'dispatch:image-one', 'Dispatch image one', 'ready', 'convex_migration'
		),
		(
			'a8000000-0000-4000-8000-000000000002', '${LIBRARY_ID}', 'scanned_image',
			'dispatch:image-two', 'Dispatch image two', 'ready', 'convex_migration'
		);
		INSERT INTO libri.images (
			id, library_id, book_id, source_id, object_path, original_filename,
			mime_type, byte_size, content_sha256, image_type, ocr_status, ocr_version
		) VALUES
		(
			'${IMAGE_IDS[0]}', '${LIBRARY_ID}', '${BOOK_ID}',
			'a8000000-0000-4000-8000-000000000001',
			'${LIBRARY_ID}/books/${BOOK_ID}/images/${IMAGE_IDS[0]}/original.jpeg',
			'one.jpeg', 'image/jpeg', 1024, repeat('a', 64), 'page', 'pending', 0
		),
		(
			'${IMAGE_IDS[1]}', '${LIBRARY_ID}', '${BOOK_ID}',
			'a8000000-0000-4000-8000-000000000002',
			'${LIBRARY_ID}/books/${BOOK_ID}/images/${IMAGE_IDS[1]}/original.webp',
			'two.webp', 'image/webp', 2048, repeat('b', 64), 'page', 'failed', 2
		);
		INSERT INTO public.queue_jobs (
			id, queue_job_id, user_id, job_type, metadata, status, priority, scheduled_for
		) VALUES (
			'${CONTROL_ID}', 'buildos_dispatch_control', '${USER_ID}', 'other',
			'{"control":"must-remain-byte-identical"}'::jsonb,
			'pending', 1, '2026-09-01T00:00:00Z'
		);
	`;
}

function dispatchInput() {
	return {
		admissionId: ADMISSION_ID,
		dispatchExpiresAt: new Date(Date.now() + 5 * 60_000).toISOString()
	};
}

function claimOwnership(claim: {
	queueRowId: string;
	processingToken: string;
	stepId: string;
	executionGeneration: number;
	leaseToken: string;
}) {
	return {
		queueRowId: claim.queueRowId,
		processingToken: claim.processingToken,
		stepId: claim.stepId,
		executionGeneration: claim.executionGeneration,
		leaseToken: claim.leaseToken
	};
}

function hasCommand(command: string): boolean {
	return spawnSync(command, ['--version'], { stdio: 'ignore' }).status === 0;
}

function parseExternalTestDatabase(databaseUrl: string): {
	poolOptions: PoolConfig;
	adminUser: string | undefined;
	psqlConnectionArgs: string[];
} {
	const parsed = new URL(databaseUrl);
	const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
	if (
		!['postgres:', 'postgresql:'].includes(parsed.protocol) ||
		!['', 'localhost', '127.0.0.1', '::1'].includes(parsed.hostname) ||
		parsed.password ||
		!/^(?:codex|buildos)_libri_[a-z0-9_]+$/.test(database)
	) {
		throw new Error(
			'LIBRI_TEST_DATABASE_URL must target a passwordless local codex_libri_* or buildos_libri_* database'
		);
	}
	const adminUser = parsed.username ? decodeURIComponent(parsed.username) : undefined;
	const poolOptions: PoolConfig = {
		database,
		...(parsed.hostname ? { host: parsed.hostname } : {}),
		...(parsed.port ? { port: Number(parsed.port) } : {})
	};
	const psqlConnectionArgs = ['-d', database];
	if (parsed.hostname) psqlConnectionArgs.push('-h', parsed.hostname);
	if (parsed.port) psqlConnectionArgs.push('-p', parsed.port);
	if (adminUser) psqlConnectionArgs.push('-U', adminUser);
	return { poolOptions, adminUser, psqlConnectionArgs };
}
