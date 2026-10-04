import { randomUUID } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { trackPoolDisconnections } from './helpers/trackPoolDisconnections';
import { createLibriLifecycle, type ClaimedLibriStep } from '../src/workers/libri/lifecycle';
import { createLibriTaskDispatcher } from '../src/workers/libri/taskDispatcher';

// Socket-only disposable database. No hosted URLs, providers, storage, or user data.
const available = ['initdb', 'pg_ctl', 'psql'].every(
	(command) => spawnSync(command, ['--version'], { stdio: 'ignore' }).status === 0
);
if (process.env.CI && !available)
	throw new Error('Task dispatch contracts require local PostgreSQL in CI');
const owner = 'f1000000-0000-4000-8000-000000000001';
const secondOwner = 'f1000000-0000-4000-8000-000000000002';
const controller = new AbortController();

describe.skipIf(!available)(
	'Libri task admission and dispatch on restricted PostgreSQL roles',
	() => {
		let directory = '',
			started = false;
		let admin: Pool, worker: Pool;
		const closers: Array<() => Promise<void>> = [];
		let lifecycle: ReturnType<typeof createLibriLifecycle>;
		let dispatcher: ReturnType<typeof createLibriTaskDispatcher>;
		beforeAll(async () => {
			directory = mkdtempSync('/tmp/libri-task-dispatch-pg-');
			const data = join(directory, 'data');
			const run = (command: string, args: string[]) =>
				execFileSync(command, args, { stdio: 'pipe', timeout: 30000 });
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
				join(directory, 'server.log'),
				'-o',
				`-k ${directory} -p 57499 -c listen_addresses=''`,
				'-w',
				'start'
			]);
			started = true;
			for (const path of [
				'supabase/tests/fixtures/libri_research_tasks_base.sql',
				'supabase/migrations/20261004022726_libri_research_task_dispatch.sql'
			]) {
				run('psql', [
					'-X',
					'-q',
					'-h',
					directory,
					'-p',
					'57499',
					'-U',
					'postgres',
					'-d',
					'postgres',
					'-v',
					'ON_ERROR_STOP=1',
					'-f',
					resolve('../..', path)
				]);
			}
			admin = new Pool({
				host: directory,
				port: 57499,
				database: 'postgres',
				user: 'postgres',
				max: 3
			});
			worker = new Pool({
				host: directory,
				port: 57499,
				database: 'postgres',
				user: 'libri_worker',
				max: 2
			});
			closers.push(trackPoolDisconnections(admin), trackPoolDisconnections(worker));
			lifecycle = createLibriLifecycle(worker);
			dispatcher = createLibriTaskDispatcher(worker, lifecycle);
			await admin.query('INSERT INTO auth.users(id) VALUES($1),($2)', [owner, secondOwner]);
		}, 30000);
		afterAll(async () => {
			await Promise.all(closers.map((close) => close()));
			if (started)
				spawnSync('pg_ctl', ['-D', join(directory, 'data'), '-m', 'fast', '-w', 'stop'], {
					stdio: 'ignore'
				});
			if (directory) rmSync(directory, { recursive: true, force: true });
		});
		beforeEach(async () => {
			await admin.query('TRUNCATE libri.libraries CASCADE');
			await admin.query('TRUNCATE public.queue_jobs');
		});
		async function seed(count = 1, daily = 1000) {
			const library = randomUUID();
			await admin.query(
				"INSERT INTO libri.libraries(id,slug,name,created_by) VALUES($1::uuid,$1::text,'Contract library',$2)",
				[library, owner]
			);
			await admin.query(
				"INSERT INTO libri.library_members(library_id,user_id,role) VALUES($1,$2,'owner'),($1,$3,'owner')",
				[library, owner, secondOwner]
			);
			await admin.query(
				"INSERT INTO libri.research_queue_controls(library_id,dispatch_enabled,supported_task_types,max_batch_tasks,task_budget_microusd,daily_budget_microusd,max_concurrent_steps) VALUES($1,true,ARRAY['find_book_info'],10,100,$2,1)",
				[library, daily]
			);
			const tasks: string[] = [];
			for (let index = 0; index < count; index++) {
				const receipt = await asOwner(
					owner,
					"SELECT libri.manage_research_tasks($1,'create',$2::jsonb) AS receipt",
					[
						library,
						JSON.stringify({
							type: 'find_book_info',
							title: `Task ${index}`,
							priority: 'medium',
							idempotencyKey: randomUUID()
						})
					]
				);
				const rows = await admin.query<{ id: string }>(
					'SELECT id FROM libri.research_tasks WHERE library_id=$1 ORDER BY created_at,id',
					[library]
				);
				tasks.splice(0, tasks.length, ...rows.rows.map((row) => row.id));
				expect(receipt).toBeTruthy();
			}
			return { library, tasks };
		}
		async function asOwner(actor: string, sql: string, args: unknown[]) {
			const connection = await admin.connect();
			try {
				await connection.query('BEGIN');
				await connection.query('SET LOCAL ROLE authenticated');
				await connection.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [
					actor
				]);
				const result = await connection.query(sql, args);
				await connection.query('COMMIT');
				return result.rows[0]?.receipt;
			} catch (error) {
				await connection.query('ROLLBACK');
				throw error;
			} finally {
				connection.release();
			}
		}
		const admit = (library: string, key = randomUUID(), actor = owner, ids?: string[]) =>
			asOwner(
				actor,
				'SELECT libri.admit_research_task_batch($1,$2,$3,$4::jsonb) AS receipt',
				[library, key, ids ? 'batch_now' : 'round_now', JSON.stringify(ids ? { ids } : {})]
			);
		const claim = () =>
			lifecycle.claimNextStep({
				workerId: 'libri-task-contract',
				leaseDurationMs: 30000,
				queueTypes: ['libri_research']
			});
		async function finish(receipt: Awaited<ReturnType<typeof claim>>) {
			expect(receipt?.kind).toBe('claimed');
			const step = receipt as ClaimedLibriStep;
			expect(
				await lifecycle.completeStep({
					...step,
					result: { message: 'Local result persisted.' }
				})
			).toBe(true);
		}
		it('admits once, dispatches under the restricted role, caps concurrent claims, and publishes task outcomes', async () => {
			const { library } = await seed(2);
			const key = randomUUID();
			const admitted = await Promise.all([admit(library, key), admit(library, key)]);
			expect(admitted[0].runId).toBe(admitted[1].runId);
			expect(admitted.map((item) => item.deduped).sort()).toEqual([false, true]);
			const dispatches = await Promise.all([
				dispatcher.dispatchPending(controller.signal),
				dispatcher.dispatchPending(controller.signal)
			]);
			expect(dispatches.some((result) => result.batches === 1)).toBe(true);
			expect(
				(await admin.query('SELECT count(*)::integer AS n FROM public.queue_jobs')).rows[0]
					.n
			).toBe(2);
			const claims = await Promise.all([claim(), claim()]);
			expect(claims.filter((item) => item?.kind === 'claimed')).toHaveLength(1);
			expect(claims.filter((item) => item === null)).toHaveLength(1);
			const deferred = await admin.query(
				"SELECT attempts FROM libri.research_steps WHERE status='queued'"
			);
			expect(deferred.rows).toEqual([{ attempts: 0 }]);
			await finish(claims.find((item) => item?.kind === 'claimed')!);
			await admin.query(
				"UPDATE public.queue_jobs SET scheduled_for=now() WHERE status='pending'"
			);
			await finish(await claim());
			const tasks = await admin.query(
				'SELECT status,active_run_id,result_message FROM libri.research_tasks ORDER BY id'
			);
			expect(tasks.rows).toEqual(
				Array(2).fill({
					status: 'complete',
					active_run_id: null,
					result_message: 'Local result persisted.'
				})
			);
			expect((await admin.query('SELECT status FROM libri.research_runs')).rows).toEqual([
				{ status: 'completed' }
			]);
		});
		it('serializes different owners against the same daily admission budget', async () => {
			const { library, tasks } = await seed(2, 100);
			const outcomes = await Promise.allSettled([
				admit(library, randomUUID(), owner, [tasks[0]]),
				admit(library, randomUUID(), secondOwner, [tasks[1]])
			]);
			expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
			const rejected = outcomes.find(
				(outcome) => outcome.status === 'rejected'
			) as PromiseRejectedResult;
			expect(rejected.reason.code).toBe('54000');
			expect(
				(await admin.query('SELECT count(*)::integer AS n FROM libri.research_runs'))
					.rows[0].n
			).toBe(1);
			expect(
				(
					await admin.query(
						"SELECT count(*)::integer AS n FROM libri.research_tasks WHERE status='pending' AND active_run_id IS NULL"
					)
				).rows[0].n
			).toBe(1);
		});
		it('rechecks owner authorization at enqueue and claim after a previously valid manifest', async () => {
			const { library } = await seed();
			await admit(library);
			const step = (await admin.query('SELECT id FROM libri.research_steps')).rows[0].id;
			await admin.query(
				'DELETE FROM libri.library_members WHERE library_id=$1 AND user_id=$2',
				[library, owner]
			);
			await expect(lifecycle.enqueueStep({ stepId: step })).rejects.toThrow(
				'authority expired or was revoked'
			);
			await admin.query(
				"INSERT INTO libri.library_members(library_id,user_id,role) VALUES($1,$2,'owner')",
				[library, owner]
			);
			await dispatcher.dispatchPending(controller.signal);
			await admin.query(
				'DELETE FROM libri.library_members WHERE library_id=$1 AND user_id=$2',
				[library, owner]
			);
			expect(await claim()).toMatchObject({
				kind: 'quarantined',
				reason: 'libri_execution_authority_revoked'
			});
			expect(
				(await admin.query('SELECT status,active_run_id FROM libri.research_tasks')).rows
			).toEqual([{ status: 'blocked', active_run_id: null }]);
			expect((await admin.query('SELECT attempts FROM libri.research_steps')).rows).toEqual([
				{ attempts: 0 }
			]);
		});
		it('expires queued work without acquiring a provider attempt', async () => {
			const { library } = await seed();
			await admit(library);
			await dispatcher.dispatchPending(controller.signal);
			await admin.query(
				"UPDATE libri.research_runs SET deadline_at=now()-interval '1 second'"
			);
			expect(await claim()).toMatchObject({
				kind: 'quarantined',
				reason: 'libri_run_deadline_expired'
			});
			expect(
				(await admin.query('SELECT status,attempts FROM libri.research_steps')).rows
			).toEqual([{ status: 'failed', attempts: 0 }]);
			expect((await admin.query('SELECT status FROM libri.research_runs')).rows).toEqual([
				{ status: 'failed' }
			]);
		});
		it('retires expired admissions that never reached a queue and clears the task ownership', async () => {
			const { library } = await seed();
			await admit(library);
			await admin.query(
				"UPDATE libri.research_runs SET deadline_at=now()-interval '1 second'"
			);
			expect(await dispatcher.dispatchPending(controller.signal)).toEqual({
				batches: 0,
				steps: 0
			});
			expect(
				(await admin.query('SELECT count(*)::integer AS n FROM public.queue_jobs')).rows[0]
					.n
			).toBe(0);
			expect(
				(await admin.query('SELECT status,active_run_id FROM libri.research_tasks')).rows
			).toEqual([{ status: 'blocked', active_run_id: null }]);
			expect((await admin.query('SELECT status FROM libri.research_runs')).rows).toEqual([
				{ status: 'failed' }
			]);
		});
		it('continues an eligible task when another admitted task type is disabled before dispatch', async () => {
			const { library, tasks } = await seed(2);
			await admin.query(
				"UPDATE libri.research_tasks SET task_type='find_youtube' WHERE id=$1",
				[tasks[0]]
			);
			await admin.query(
				"UPDATE libri.research_queue_controls SET supported_task_types=ARRAY['find_book_info','find_youtube']"
			);
			await admit(library);
			await admin.query(
				"UPDATE libri.research_queue_controls SET supported_task_types=ARRAY['find_book_info']"
			);
			expect(await dispatcher.dispatchPending(controller.signal)).toEqual({
				batches: 1,
				steps: 2
			});
			expect(
				(await admin.query('SELECT count(*)::integer AS n FROM public.queue_jobs')).rows[0]
					.n
			).toBe(1);
			await finish(await claim());
			expect((await admin.query('SELECT status FROM libri.research_runs')).rows).toEqual([
				{ status: 'partial' }
			]);
			expect(
				(await admin.query('SELECT status FROM libri.research_tasks ORDER BY status')).rows
			).toEqual([{ status: 'blocked' }, { status: 'complete' }]);
		});
		it('rejects forged acknowledgement and reconciles a lost real enqueue reply without duplicate jobs', async () => {
			const { library } = await seed();
			const receipt = await admit(library);
			expect(
				(
					await worker.query(
						'SELECT libri.acknowledge_research_task_dispatch($1) AS ok',
						[receipt.runId]
					)
				).rows[0].ok
			).toBe(false);
			const lostReply = createLibriTaskDispatcher(worker, {
				enqueueStep: async (input) => {
					await lifecycle.enqueueStep(input);
					throw new Error('Reply lost after commit');
				}
			});
			expect(await lostReply.dispatchPending(controller.signal)).toEqual({
				batches: 1,
				steps: 1
			});
			expect(
				(await admin.query('SELECT count(*)::integer AS n FROM public.queue_jobs')).rows[0]
					.n
			).toBe(1);
			expect((await claim())?.kind).toBe('claimed');
			await admin.query(
				"UPDATE public.queue_jobs SET status='processing',processing_token=NULL"
			);
			expect(
				(
					await worker.query(
						'SELECT libri.acknowledge_research_task_dispatch($1) AS ok',
						[receipt.runId]
					)
				).rows[0].ok
			).toBe(false);
			await admin.query("UPDATE public.queue_jobs SET dedup_key='forged'");
			expect(
				(
					await worker.query(
						'SELECT libri.acknowledge_research_task_dispatch($1) AS ok',
						[receipt.runId]
					)
				).rows[0].ok
			).toBe(false);
		});
	}
);
