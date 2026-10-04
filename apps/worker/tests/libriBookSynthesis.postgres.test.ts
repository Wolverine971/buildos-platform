import { randomUUID } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { trackPoolDisconnections } from './helpers/trackPoolDisconnections';
import { book, chapter, analysis } from './helpers/libriSynthesisFixture';
import { createLibriLifecycle, type ClaimedLibriStep } from '../src/workers/libri/lifecycle';
import { createLibriTaskDispatcher } from '../src/workers/libri/taskDispatcher';
import { createLibriCostLedger } from '../src/workers/libri/costLedger';
import { createBookSynthesisExecution } from '../src/workers/libri/bookSynthesisExecution';
import {
	createBookSynthesisProcessor,
	validateBookAnalysis,
	type SynthesisInput
} from '../src/workers/libri/bookSynthesis';

const available = ['initdb', 'pg_ctl', 'psql'].every(
	(cmd) => spawnSync(cmd, ['--version'], { stdio: 'ignore' }).status === 0
);
if (process.env.CI && !available) throw new Error('Synthesis contracts require PostgreSQL in CI');
const owner = 'f1000000-0000-4000-8000-000000000001';
const signal = new AbortController().signal;
describe.skipIf(!available)('book synthesis restricted-role PostgreSQL completion', () => {
	let dir = '',
		started = false,
		admin: Pool,
		worker: Pool,
		library: string;
	const closers: Array<() => Promise<void>> = [];
	let lifecycle: ReturnType<typeof createLibriLifecycle>;
	let execution: ReturnType<typeof createBookSynthesisExecution>;
	let ledger: ReturnType<typeof createLibriCostLedger>;
	beforeAll(async () => {
		dir = mkdtempSync('/tmp/libri-synthesis-pg-');
		const data = join(dir, 'data');
		const run = (cmd: string, args: string[]) =>
			execFileSync(cmd, args, { stdio: 'pipe', timeout: 30000 });
		run('initdb', [
			'-D',
			data,
			'--no-locale',
			'--encoding=UTF8',
			'--auth=trust',
			'--username=postgres'
		]);
		run('pg_ctl', [
			'-D',
			data,
			'-l',
			join(dir, 'server.log'),
			'-o',
			`-k ${dir} -p 57503 -c listen_addresses=''`,
			'-w',
			'start'
		]);
		started = true;
		run('psql', [
			'-X',
			'-q',
			'-h',
			dir,
			'-p',
			'57503',
			'-U',
			'postgres',
			'-d',
			'postgres',
			'-v',
			'ON_ERROR_STOP=1',
			'-f',
			resolve('../../supabase/tests/20261004031434_libri_book_synthesis_execution.test.sql')
		]);
		admin = new Pool({
			host: dir,
			port: 57503,
			database: 'postgres',
			user: 'postgres',
			max: 2
		});
		worker = new Pool({
			host: dir,
			port: 57503,
			database: 'postgres',
			user: 'libri_worker',
			max: 2
		});
		closers.push(trackPoolDisconnections(admin), trackPoolDisconnections(worker));
		lifecycle = createLibriLifecycle(worker);
		execution = createBookSynthesisExecution(worker);
		ledger = createLibriCostLedger(worker);
		await admin.query('INSERT INTO auth.users(id) VALUES($1)', [owner]);
	}, 30000);
	afterAll(async () => {
		await Promise.all(closers.map((close) => close()));
		if (started)
			spawnSync('pg_ctl', ['-D', join(dir, 'data'), '-m', 'fast', '-w', 'stop'], {
				stdio: 'ignore'
			});
		if (dir) rmSync(dir, { recursive: true, force: true });
	});
	beforeEach(async () => {
		await admin.query('TRUNCATE libri.libraries CASCADE; TRUNCATE public.queue_jobs');
		library = randomUUID();
		await admin.query(
			"INSERT INTO libri.libraries(id,slug,name,created_by) VALUES($1,'synthesis','Synthesis',$2)",
			[library, owner]
		);
		await admin.query(
			"INSERT INTO libri.library_members(library_id,user_id,role) VALUES($1,$2,'owner')",
			[library, owner]
		);
		await admin.query(
			"INSERT INTO libri.books(id,library_id,title) VALUES($1,$2,'Offline Book')",
			[book, library]
		);
		await admin.query(
			"INSERT INTO libri.chapters(id,library_id,book_id,position,number,title,summary) VALUES($1,$2,$3,0,'1','First','Deliberate practice supports learning.')",
			[chapter, library, book]
		);
		await admin.query(
			"INSERT INTO libri.notes(library_id,book_id,owner_user_id,visibility,content) VALUES($1,$2,$3,'private','PRIVATE SECRET NOTE'),($1,$2,$3,'shared_link','Shared practice note.')",
			[library, book, owner]
		);
		await admin.query(
			"INSERT INTO libri.research_queue_controls(library_id,dispatch_enabled,supported_task_types,task_budget_microusd,daily_budget_microusd) VALUES($1,true,ARRAY['synthesize_book'],1000,10000)",
			[library]
		);
	});
	async function ownerQuery(sql: string, values: unknown[]) {
		const c = await admin.connect();
		try {
			await c.query('BEGIN');
			await c.query('SET LOCAL ROLE authenticated');
			await c.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [owner]);
			const r = await c.query(sql, values);
			await c.query('COMMIT');
			return r;
		} catch (e) {
			await c.query('ROLLBACK');
			throw e;
		} finally {
			c.release();
		}
	}
	async function claim(force = false): Promise<ClaimedLibriStep> {
		await ownerQuery("SELECT libri.manage_research_tasks($1,'create',$2::jsonb)", [
			library,
			JSON.stringify({
				type: 'synthesize_book',
				bookId: book,
				title: 'Synthesize book',
				priority: 'high',
				idempotencyKey: randomUUID()
			})
		]);
		if (force)
			await admin.query(
				"UPDATE libri.research_tasks SET mode='force' WHERE library_id=$1 AND status='pending'",
				[library]
			);
		await ownerQuery("SELECT libri.admit_research_task_batch($1,$2,'round_now','{}')", [
			library,
			randomUUID()
		]);
		await createLibriTaskDispatcher(worker, lifecycle).dispatchPending(signal);
		const c = await lifecycle.claimNextStep({
			workerId: 'offline-synthesis',
			leaseDurationMs: 60000
		});
		if (!c || c.kind !== 'claimed') throw new Error('Expected claim');
		return c;
	}
	const provider = () => ({
		execute: vi.fn(async (input: SynthesisInput, model: string) => ({
			analysis: validateBookAnalysis(analysis, input),
			model,
			providerRequestId: `offline-${randomUUID()}`,
			costMicrousd: 20n,
			promptTokens: 10n,
			completionTokens: 5n
		}))
	});
	const processor = (p = provider()) =>
		createBookSynthesisProcessor(
			{ execution, ledger, provider: p },
			{ model: 'openai/gpt-5-nano', reservedMicrousd: 100n }
		);
	async function state() {
		return (
			await admin.query(`SELECT (SELECT count(*)::int FROM libri.derived_artifacts) artifacts,
  (SELECT status FROM libri.research_steps ORDER BY created_at DESC LIMIT 1) step,
  (SELECT status FROM public.queue_jobs ORDER BY created_at DESC LIMIT 1) queue,
  (SELECT status FROM libri.research_runs ORDER BY created_at DESC LIMIT 1) run,
  (SELECT status FROM libri.research_tasks ORDER BY created_at DESC LIMIT 1) task,
  (SELECT status FROM libri.provider_cost_reservations ORDER BY created_at DESC LIMIT 1) cost`)
		).rows[0];
	}
	it('isolates private notes and rejects a forged lease without catalog grants', async () => {
		const c = await claim();
		const i = await execution.load(c);
		expect(i.snapshot.noteCount).toBe(1);
		expect(JSON.stringify(i)).toContain('Shared practice note');
		expect(JSON.stringify(i)).not.toContain('PRIVATE SECRET');
		await expect(execution.load({ ...c, leaseToken: randomUUID() })).rejects.toThrow();
		await expect(worker.query('SELECT * FROM libri.notes')).rejects.toThrow(
			'permission denied'
		);
	});
	it('atomically saves the artifact, exact cost, queue, root task and run', async () => {
		const c = await claim();
		await processor().execute(c, signal);
		expect(await state()).toEqual({
			artifacts: 1,
			step: 'completed',
			queue: 'completed',
			run: 'completed',
			task: 'complete',
			cost: 'settled'
		});
		const a = (
			await admin.query(
				'SELECT structured_data,version,input_snapshot,content_sha256,status FROM libri.derived_artifacts'
			)
		).rows[0];
		expect(a.version).toBe(1);
		expect(a.status).toBe('generated');
		expect(a.input_snapshot.notesVisibility).toBe('shared_link');
		expect(a.structured_data.chapterInsights[0].chapterId).toBe(chapter);
		expect(a.content_sha256).toMatch(/^[a-f0-9]{64}$/);
		expect(
			(
				await admin.query(
					'SELECT actual_cost_microusd::text AS cost FROM libri.provider_cost_reservations'
				)
			).rows[0].cost
		).toBe('20');
		await expect(execution.load(c)).rejects.toThrow();
	});
	it('rolls all artifact and queue writes back if cost settlement is invalid', async () => {
		const c = await claim();
		const p = provider();
		p.execute.mockImplementation(async (i, model) => ({
			analysis: validateBookAnalysis(analysis, i),
			model,
			providerRequestId: 'offline-bad-cost',
			costMicrousd: -1n,
			promptTokens: 10n,
			completionTokens: 5n
		}));
		await expect(processor(p).execute(c, signal)).rejects.toMatchObject({
			code: 'provider_reconciliation_required'
		});
		expect(await state()).toEqual({
			artifacts: 0,
			step: 'leased',
			queue: 'processing',
			run: 'running',
			task: 'in_progress',
			cost: 'started'
		});
	});
	it('marks a result outdated when its source changes during generation', async () => {
		const c = await claim();
		const p = provider();
		const original = p.execute.getMockImplementation()!;
		p.execute.mockImplementation(async (i, m) => {
			await admin.query(
				"UPDATE libri.chapters SET summary='A changed argument' WHERE id=$1",
				[chapter]
			);
			return original(i, m);
		});
		await processor(p).execute(c, signal);
		expect(
			(await admin.query('SELECT status FROM libri.derived_artifacts')).rows[0].status
		).toBe('outdated');
	});
	it('reuses a current result without a paid call and force creates the next version', async () => {
		await processor().execute(await claim(), signal);
		const cached = provider();
		await processor(cached).execute(await claim(), signal);
		expect(cached.execute).not.toHaveBeenCalled();
		expect((await state()).step).toBe('completed');
		await processor().execute(await claim(true), signal);
		expect(
			(
				await admin.query(
					'SELECT version,is_current FROM libri.derived_artifacts ORDER BY version'
				)
			).rows
		).toEqual([
			{ version: 1, is_current: false },
			{ version: 2, is_current: true }
		]);
		expect(
			(await admin.query('SELECT count(*)::int AS n FROM libri.provider_cost_reservations'))
				.rows[0].n
		).toBe(2);
	});
	it('refuses completion after owner revocation and preserves the unresolved charge', async () => {
		const c = await claim();
		const p = provider();
		const original = p.execute.getMockImplementation()!;
		p.execute.mockImplementation(async (i, m) => {
			await admin.query(
				"UPDATE libri.library_members SET role='viewer' WHERE library_id=$1",
				[library]
			);
			return original(i, m);
		});
		await expect(processor(p).execute(c, signal)).rejects.toMatchObject({
			code: 'provider_reconciliation_required'
		});
		expect((await state()).artifacts).toBe(0);
		expect((await state()).cost).toBe('started');
	});
});
