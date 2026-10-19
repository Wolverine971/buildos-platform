// apps/worker/tests/integration/agentRunAdmission.test.ts
// Actual upstream create RPC + replacement admission trigger, using disposable PostgreSQL.
import { execFile, execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const available = ['initdb', 'pg_ctl', 'psql'].every(
	(command) => spawnSync(command, ['--version'], { stdio: 'ignore' }).status === 0
);
const USER = 'b7000000-0000-4000-8000-000000000001';
(available ? describe : describe.skip)(
	'ordinary Agent Run admission after research retirement',
	() => {
		let temp = '';
		let data = '';
		let socket = '';
		let port = 0;
		const args = () => [
			'-h',
			socket,
			'-p',
			String(port),
			'-d',
			'postgres',
			'-v',
			'ON_ERROR_STOP=1',
			'-At'
		];
		const sql = (query: string) =>
			execFileSync('psql', [...args(), '-c', query], {
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'pipe']
			}).trim();
		const sqlAsync = (query: string) =>
			new Promise<string>((resolveQuery, reject) => {
				execFile('psql', [...args(), '-c', query], (error, stdout, stderr) =>
					error ? reject(new Error(stderr)) : resolveQuery(stdout.trim())
				);
			});
		const admit = (template = 'agent') => `SELECT public.create_agent_run_with_job(
  '{"user_id":"${USER}","trigger":"chat","label":"Run","goal":"Test","context_type":"global","scope_mode":"read_only","effort":"standard","run_template":"${template}"}', '{}')`;
		beforeAll(async () => {
			temp = mkdtempSync(join(tmpdir(), 'buildos-agent-admission-'));
			data = join(temp, 'data');
			socket = join(temp, 'socket');
			mkdirSync(socket);
			port = await new Promise<number>((resolvePort, reject) => {
				const server = createServer();
				server.once('error', reject);
				server.listen(0, '127.0.0.1', () => {
					const address = server.address();
					if (!address || typeof address === 'string') {
						server.close();
						reject(new Error('No local port'));
						return;
					}
					server.close((error) => (error ? reject(error) : resolvePort(address.port)));
				});
			});
			execFileSync('initdb', ['-D', data, '--no-locale', '--encoding=UTF8'], {
				stdio: 'pipe'
			});
			execFileSync(
				'pg_ctl',
				[
					'-D',
					data,
					'-l',
					join(temp, 'postgres.log'),
					'-o',
					`-p ${port} -k ${socket}`,
					'start'
				],
				{ stdio: 'pipe' }
			);
			const apply = (relative: string) =>
				execFileSync('psql', [...args(), '-f', resolve(process.cwd(), '../..', relative)], {
					stdio: 'pipe'
				});
			apply('supabase/tests/fixtures/agent_run_atomic_dispatch_base.sql');
			sql(
				'ALTER TABLE public.agent_runs ADD COLUMN orchestration_state jsonb, ADD COLUMN execution_generation integer NOT NULL DEFAULT 0, ADD COLUMN commit_started_at timestamptz'
			);
			apply('supabase/migrations/20260723030000_agent_run_atomic_dispatch.sql');
			apply(
				'supabase/migrations/20260830195800_fix_agent_run_atomic_dispatch_trigger_cast.sql'
			);
			apply('supabase/migrations/20261019150401_agent_run_durable_transitions.sql');
		}, 30_000);
		afterAll(() => {
			if (data) spawnSync('pg_ctl', ['-D', data, 'stop', '-m', 'fast'], { stdio: 'ignore' });
			if (temp) rmSync(temp, { recursive: true, force: true });
		});
		beforeEach(() => {
			sql('TRUNCATE public.queue_jobs, public.agent_runs CASCADE');
		});

		it('admits only one concurrent dispatcher into the last available slot', async () => {
			sql(admit());
			sql(admit());
			const results = await Promise.allSettled(
				Array.from({ length: 4 }, () => sqlAsync(admit()))
			);
			expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
			for (const result of results)
				if (result.status === 'rejected')
					expect(result.reason.message).toContain('agent_run_limit_exceeded');
			expect(sql('SELECT count(*) FROM public.agent_runs')).toBe('3');
			expect(sql('SELECT count(*) FROM public.queue_jobs')).toBe('3');
			expect(
				sql(
					"SELECT count(*) FROM public.queue_jobs q JOIN public.agent_runs r ON r.id::text=q.metadata->>'run_id'"
				)
			).toBe('3');
		});

		it('keeps parked slots reserved while allowing worker and approval transitions', () => {
			const run = JSON.parse(sql(admit())).run;
			sql(admit());
			sql(admit());
			sql(`UPDATE public.agent_runs SET status='paused' WHERE id='${run.id}'`);
			expect(() => sql(admit())).toThrow();
			sql(`UPDATE public.agent_runs SET status='queued' WHERE id='${run.id}'`);
			sql(
				`UPDATE public.agent_runs SET status='running',execution_generation=1 WHERE id='${run.id}'`
			);
			sql(`UPDATE public.agent_runs SET status='proposal_ready' WHERE id='${run.id}'`);
			sql(
				`UPDATE public.agent_runs SET status='running',commit_started_at=now() WHERE id='${run.id}'`
			);
			expect(sql(`SELECT status FROM public.agent_runs WHERE id='${run.id}'`)).toBe(
				'running'
			);
			sql(`UPDATE public.agent_runs SET status='completed' WHERE id='${run.id}'`);
			expect(() => sql(admit())).not.toThrow();
			expect(() =>
				sql(`UPDATE public.agent_runs SET status='queued' WHERE id='${run.id}'`)
			).toThrow();
		});

		it('rejects the retired template without a run or queue side effect', () => {
			expect(() => sql(admit('deep_research'))).toThrow();
			expect(sql('SELECT count(*) FROM public.agent_runs')).toBe('0');
			expect(sql('SELECT count(*) FROM public.queue_jobs')).toBe('0');
			expect(
				sql("SELECT to_regprocedure('public.queue_deep_research_synthesis(uuid)') IS NULL")
			).toBe('t');
		});
	}
);
