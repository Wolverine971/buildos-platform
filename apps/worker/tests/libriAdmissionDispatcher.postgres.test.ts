import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	createLibriAdmissionDispatcher,
	type LibriAdmissionDispatcherPort
} from '../src/workers/libri/admissionDispatcher';

const USER_ID = 'a1000000-0000-4000-8000-000000000001';
const LIBRARY_ID = 'a2000000-0000-4000-8000-000000000001';
const BOOK_ID = 'a3000000-0000-4000-8000-000000000001';
const IMAGE_IDS = ['a4000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000002'];
const ADMISSION_ID = 'a5000000-0000-4000-8000-000000000001';
const CONTROL_ID = 'a6000000-0000-4000-8000-000000000001';

const postgresAvailable = ['initdb', 'pg_ctl', 'psql'].every(hasCommand);
const describePostgres = postgresAvailable ? describe : describe.skip;

describePostgres('Libri OCR admission dispatcher restricted-role PostgreSQL contract', () => {
	let tempDir = '';
	let dataDir = '';
	let socketDir = '';
	let port = 0;
	let workerPool: Pool | null = null;
	let adminPool: Pool | null = null;
	let dispatcher: LibriAdmissionDispatcherPort;
	let runId = '';
	let manifestSha256 = '';
	let controlHash = '';

	beforeAll(async () => {
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
		} catch (error) {
			throw new Error(
				`Disposable PostgreSQL failed to start:\n${readFileSync(postgresLog, 'utf8')}`,
				{ cause: error }
			);
		}

		const repositoryRoot = resolve(process.cwd(), '../..');
		applySqlFile(
			resolve(
				repositoryRoot,
				'supabase/tests/fixtures/libri_ocr_batch_dispatcher_access_base.sql'
			)
		);
		applySql(seedSql());

		const poolOptions = {
			host: socketDir,
			port,
			database: 'postgres'
		};
		workerPool = new Pool({ ...poolOptions, user: 'libri_worker', max: 2 });
		adminPool = new Pool({ ...poolOptions, user: 'postgres', max: 1 });
		dispatcher = createLibriAdmissionDispatcher(workerPool);

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
		if (dataDir) {
			spawnSync('pg_ctl', ['-D', dataDir, 'stop', '-m', 'fast'], { stdio: 'ignore' });
		}
		if (tempDir) rmSync(tempDir, { recursive: true, force: true });
	});

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

		const concurrent = await Promise.all([
			dispatcher.dispatchOcrAdmission({ admissionId: ADMISSION_ID }),
			dispatcher.dispatchOcrAdmission({ admissionId: ADMISSION_ID })
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

function hasCommand(command: string): boolean {
	return spawnSync(command, ['--version'], { stdio: 'ignore' }).status === 0;
}
