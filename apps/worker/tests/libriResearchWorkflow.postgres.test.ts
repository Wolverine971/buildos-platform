import { randomUUID } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createLibriLifecycle, type ClaimedLibriStep } from '../src/workers/libri/lifecycle';
import { createLibriCostLedger } from '../src/workers/libri/costLedger';
import { createLibriTaskDispatcher } from '../src/workers/libri/taskDispatcher';
import { createLibriResearchWorkflow } from '../src/workers/libri/researchWorkflow';
import { trackPoolDisconnections } from './helpers/trackPoolDisconnections';
import { book, chapter } from './helpers/libriSynthesisFixture';
const available = ['initdb', 'pg_ctl', 'psql'].every(
	(cmd) => spawnSync(cmd, ['--version'], { stdio: 'ignore' }).status === 0
);
if (process.env.CI && !available) throw new Error('Book research actions require PostgreSQL in CI');
const owner = 'f1000000-0000-4000-8000-000000000001';
describe.skipIf(!available)('durable research workflow prerequisites', () => {
	let dir = '',
		started = false,
		admin: Pool,
		worker: Pool,
		library: string;
	const closers: Array<() => Promise<void>> = [];
	beforeAll(async () => {
		dir = mkdtempSync('/tmp/libri-workflow-pg-');
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
			`-k ${dir} -p 57506 -c listen_addresses=''`,
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
			'57506',
			'-U',
			'postgres',
			'-d',
			'postgres',
			'-v',
			'ON_ERROR_STOP=1',
			'-f',
			resolve(
				'../../supabase/tests/20261004041654_libri_research_workflow_dependencies.test.sql'
			)
		]);
		admin = new Pool({
			host: dir,
			port: 57506,
			database: 'postgres',
			user: 'postgres',
			max: 2
		});
		worker = new Pool({
			host: dir,
			port: 57506,
			database: 'postgres',
			user: 'libri_worker',
			max: 2
		});
		closers.push(trackPoolDisconnections(admin), trackPoolDisconnections(worker));
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
			"INSERT INTO libri.research_queue_controls(library_id,dispatch_enabled,supported_task_types,task_budget_microusd,daily_budget_microusd) VALUES($1,true,ARRAY['find_book_info'],1000,10000)",
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

	const signal = new AbortController().signal;
	const lifecycle = () => createLibriLifecycle(worker);
	const workflow = () => createLibriResearchWorkflow(worker, lifecycle());
	const stages = () => [
		{ phase: 'chapter_search' as const, chapterId: chapter, dependsOn: [] },
		{ phase: 'chapter_extract' as const, chapterId: chapter, dependsOn: [0] }
	];
	async function next(): Promise<ClaimedLibriStep> {
		const c = await lifecycle().claimNextStep({
			workerId: 'offline-workflow',
			leaseDurationMs: 60000,
			taskTypes: ['find_book_info']
		});
		if (!c || c.kind !== 'claimed') throw new Error('Expected claim');
		return c;
	}
	async function root() {
		await ownerQuery("SELECT libri.manage_research_tasks($1,'create',$2::jsonb)", [
			library,
			JSON.stringify({
				type: 'find_book_info',
				bookId: book,
				title: 'Research chapters',
				priority: 'high',
				idempotencyKey: randomUUID()
			})
		]);
		await ownerQuery("SELECT libri.admit_research_task_batch($1,$2,'round_now','{}')", [
			library,
			randomUUID()
		]);
		await createLibriTaskDispatcher(worker, lifecycle()).dispatchPending(signal);
		return next();
	}
	const state = async () =>
		(
			await admin.query(`SELECT
  (SELECT status FROM libri.research_tasks LIMIT 1) task,
  (SELECT status FROM libri.research_steps WHERE parent_step_id IS NULL LIMIT 1) parent,
  (SELECT status FROM libri.research_runs LIMIT 1) run,
  (SELECT planned_steps FROM libri.research_runs LIMIT 1) planned,
  (SELECT completed_steps FROM libri.research_runs LIMIT 1) completed,
  (SELECT failed_steps FROM libri.research_runs LIMIT 1) failed,
  (SELECT count(*)::int FROM libri.research_steps) steps`)
		).rows[0];
	it('keeps the task pending until the saved search and dependent extraction both finish', async () => {
		const parent = await root();
		const plan = await workflow().plan(parent, stages());
		expect(plan.plannedCount).toBe(2);
		expect(await state()).toMatchObject({
			task: 'in_progress',
			parent: 'waiting',
			run: 'running',
			planned: 3,
			completed: 0,
			steps: 3
		});
		const history = (
			await ownerQuery('SELECT libri.read_research_queue_runs($1,50,$2) rows', [
				library,
				parent.runId
			])
		).rows[0].rows;
		expect(history[0]).toMatchObject({ succeeded: 0, results: [{ status: 'leased' }] });
		await expect(lifecycle().enqueueStep({ stepId: plan.stepIds[1] })).rejects.toThrow(
			'prerequisites'
		);
		expect(await workflow().dispatch(signal)).toEqual({ dispatched: 1 });
		const search = await next();
		expect(search.payload.phase).toBe('chapter_search');
		expect(await workflow().dispatch(signal)).toEqual({ dispatched: 0 });
		expect(
			await lifecycle().completeStep({
				...search,
				result: { evidence: ['saved offline result'] }
			})
		).toBe(true);
		// A fresh workflow object stands in for a process restart.
		expect(await workflow().reconcile(signal)).toEqual({ skipped: 0, completedParents: 0 });
		expect(await workflow().dispatch(signal)).toEqual({ dispatched: 1 });
		const extract = await next();
		expect(extract.payload.phase).toBe('chapter_extract');
		await lifecycle().completeStep({ ...extract, result: { outcome: 'complete' } });
		expect(await state()).toMatchObject({
			parent: 'waiting',
			task: 'in_progress',
			completed: 2
		});
		expect(await workflow().reconcile(signal)).toEqual({ skipped: 0, completedParents: 1 });
		expect(await state()).toMatchObject({
			parent: 'completed',
			task: 'complete',
			run: 'completed',
			completed: 3,
			failed: 0
		});
		expect(await workflow().reconcile(signal)).toEqual({ skipped: 0, completedParents: 0 });
	});
	it('skips extraction after a failed search and never claims successful parent completion', async () => {
		await workflow().plan(await root(), stages());
		await workflow().dispatch(signal);
		await lifecycle().failStep({
			...(await next()),
			errorClass: 'offline_search_failure',
			errorMessage: 'No search response',
			retry: false
		});
		expect(await workflow().reconcile(signal)).toEqual({ skipped: 1, completedParents: 1 });
		expect(await state()).toMatchObject({
			parent: 'failed',
			task: 'blocked',
			run: 'failed',
			completed: 0,
			failed: 2
		});
		expect(await workflow().dispatch(signal)).toEqual({ dispatched: 0 });
	});
	it('reports insufficient evidence as needing attention after successful paid stages', async () => {
		await workflow().plan(await root(), stages());
		await workflow().dispatch(signal);
		await lifecycle().completeStep({ ...(await next()), result: { evidence: [] } });
		await workflow().dispatch(signal);
		await lifecycle().completeStep({
			...(await next()),
			result: { outcome: 'insufficient_evidence' }
		});
		await workflow().reconcile(signal);
		expect(await state()).toMatchObject({
			parent: 'needs_review',
			task: 'blocked',
			run: 'partial',
			completed: 2,
			failed: 1
		});
	});
	it('rolls back invalid dependencies, duplicate stages, wrong chapters and over-budget plans', async () => {
		const parent = await root();
		for (const invalid of [
			[{ ...stages()[0], chapterId: randomUUID() }, stages()[1]],
			[stages()[0], { ...stages()[1], dependsOn: [1] }],
			[stages()[0]],
			[...stages(), ...stages()]
		]) {
			await expect(workflow().plan(parent, invalid)).rejects.toThrow();
			expect(await state()).toMatchObject({ parent: 'leased', steps: 1, planned: 1 });
		}
		await admin.query(
			'UPDATE libri.research_queue_controls SET max_steps_per_task=2 WHERE library_id=$1',
			[library]
		);
		await expect(workflow().plan(parent, stages())).rejects.toThrow('bounds');
		expect(await state()).toMatchObject({ parent: 'leased', steps: 1, planned: 1 });
	});
	it('commits only one plan under concurrent exact-claim requests', async () => {
		const parent = await root();
		const results = await Promise.allSettled([
			workflow().plan(parent, stages()),
			workflow().plan(parent, stages())
		]);
		expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
		expect(await state()).toMatchObject({ parent: 'waiting', planned: 3, steps: 3 });
	});
	it('reconciles a lost child enqueue reply without creating another transport job', async () => {
		await workflow().plan(await root(), stages());
		const lost = createLibriResearchWorkflow(worker, {
			enqueueStep: async (input) => {
				await lifecycle().enqueueStep(input);
				throw new Error('reply lost');
			}
		});
		expect(await lost.dispatch(signal)).toEqual({ dispatched: 1 });
		expect(await workflow().dispatch(signal)).toEqual({ dispatched: 0 });
		expect((await admin.query('SELECT count(*)::int n FROM public.queue_jobs')).rows[0].n).toBe(
			2
		);
	});
	it('cancels waiting parents and their children without leaving a run open', async () => {
		const parent = await root();
		await workflow().plan(parent, stages());
		await workflow().dispatch(signal);
		const result = await lifecycle().cancelRun({
			runId: parent.runId,
			reason: 'Offline cancellation'
		});
		expect(result).toMatchObject({ accepted: true, cancelledSteps: 3, remainingSteps: 0 });
		expect(await state()).toMatchObject({
			parent: 'cancelled',
			task: 'skipped',
			run: 'cancelled'
		});
		expect(await workflow().dispatch(signal)).toEqual({ dispatched: 0 });
	});
	it('refuses stale ownership and revoked owners before creating work', async () => {
		const parent = await root();
		await expect(
			workflow().plan({ ...parent, leaseToken: randomUUID() }, stages())
		).rejects.toThrow('stale');
		await admin.query("UPDATE libri.library_members SET role='viewer' WHERE library_id=$1", [
			library
		]);
		await expect(workflow().plan(parent, stages())).rejects.toThrow('authority');
		expect(await state()).toMatchObject({ parent: 'leased', steps: 1, planned: 1 });
	});
	it('acknowledges a root consumed before its batch-dispatch reply was received', async () => {
		const parent = await root();
		await workflow().plan(parent, stages());
		await admin.query('UPDATE libri.research_task_batches SET dispatched_at=NULL WHERE id=$1', [
			parent.runId
		]);
		expect(
			await createLibriTaskDispatcher(worker, lifecycle()).dispatchPending(signal)
		).toEqual({ batches: 1, steps: 1 });
	});
	it.each([false, true])(
		'recovers an interrupted search without replaying a paid request (started=%s)',
		async (started) => {
			await workflow().plan(await root(), stages());
			await workflow().dispatch(signal);
			const search = await next(),
				ledger = createLibriCostLedger(worker);
			const cost = await ledger.reserveProviderCost({
				stepId: search.stepId,
				executionGeneration: search.executionGeneration,
				leaseToken: search.leaseToken,
				reservationKey: 'offline-search',
				provider: 'tavily',
				model: 'advanced',
				reservedMicrousd: 50n
			});
			if (!cost.reservationId) throw new Error('Expected cost reservation');
			if (started)
				expect(
					(
						await ledger.authorizeProviderCall({
							reservationId: cost.reservationId,
							executionGeneration: search.executionGeneration,
							leaseToken: search.leaseToken
						})
					).authorized
				).toBe(true);
			await admin.query(
				"UPDATE libri.research_steps SET leased_at=now()-interval '2 minutes',last_heartbeat_at=now()-interval '2 minutes',lease_expires_at=now()-interval '1 minute' WHERE id=$1",
				[search.stepId]
			);
			expect(
				await lifecycle().recoverStaleLeases({ queueTypes: ['libri_research'] })
			).toEqual({ retried: started ? 0 : 1, deadLettered: started ? 1 : 0, cancelled: 0 });
			if (started) {
				expect(await workflow().reconcile(signal)).toEqual({
					skipped: 1,
					completedParents: 1
				});
				expect(await state()).toMatchObject({
					parent: 'failed',
					task: 'blocked',
					run: 'failed'
				});
			} else {
				expect(await workflow().reconcile(signal)).toEqual({
					skipped: 0,
					completedParents: 0
				});
				expect(await state()).toMatchObject({
					parent: 'waiting',
					task: 'in_progress',
					run: 'running'
				});
			}
			expect(await workflow().dispatch(signal)).toEqual({ dispatched: 0 });
		}
	);
});
