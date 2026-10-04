import { randomUUID } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { trackPoolDisconnections } from './helpers/trackPoolDisconnections';
import { book, chapter } from './helpers/libriSynthesisFixture';
const available = ['initdb', 'pg_ctl', 'psql'].every(
	(cmd) => spawnSync(cmd, ['--version'], { stdio: 'ignore' }).status === 0
);
if (process.env.CI && !available) throw new Error('Book research actions require PostgreSQL in CI');
const owner = 'f1000000-0000-4000-8000-000000000001';
describe.skipIf(!available)('book page durable research actions', () => {
	let dir = '',
		started = false,
		admin: Pool,
		worker: Pool,
		library: string;
	const closers: Array<() => Promise<void>> = [];
	beforeAll(async () => {
		dir = mkdtempSync('/tmp/libri-book-actions-pg-');
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
			`-k ${dir} -p 57505 -c listen_addresses=''`,
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
			'57505',
			'-U',
			'postgres',
			'-d',
			'postgres',
			'-v',
			'ON_ERROR_STOP=1',
			'-f',
			resolve('../../supabase/tests/20261004040345_libri_book_research_actions.test.sql')
		]);
		admin = new Pool({
			host: dir,
			port: 57505,
			database: 'postgres',
			user: 'postgres',
			max: 2
		});
		worker = new Pool({
			host: dir,
			port: 57505,
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
			"INSERT INTO libri.research_queue_controls(library_id,dispatch_enabled,supported_task_types,task_budget_microusd,daily_budget_microusd) VALUES($1,true,ARRAY['synthesize_book','generate_agent_profile'],1000,10000)",
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
	const enqueue = async (
		key = randomUUID(),
		action = 'agent_profile',
		mode = 'gaps',
		subject = book,
		priority = 'medium'
	) =>
		(
			await ownerQuery('SELECT libri.enqueue_book_research($1,$2,$3,$4,$5,$6) receipt', [
				library,
				key,
				subject,
				action,
				mode,
				priority
			])
		).rows[0].receipt;
	const counts = async () =>
		(
			await admin.query(
				'SELECT (SELECT count(*)::int FROM libri.research_tasks) tasks,(SELECT count(*)::int FROM libri.research_task_batches) batches,(SELECT count(*)::int FROM libri.book_research_requests) receipts'
			)
		).rows[0];
	it('creates and admits the exact book task and selected mode atomically', async () => {
		const receipt = await enqueue(randomUUID(), 'book_synthesis', 'force');
		expect(receipt).toMatchObject({
			queued: true,
			selectedCount: 1,
			taskType: 'synthesize_book',
			deduped: false
		});
		expect(
			(await admin.query('SELECT mode,status,active_run_id FROM libri.research_tasks'))
				.rows[0]
		).toEqual({ mode: 'force', status: 'in_progress', active_run_id: receipt.runId });
		expect(
			(await admin.query('SELECT payload FROM libri.research_steps')).rows[0].payload
		).toMatchObject({
			bookId: book,
			taskType: 'synthesize_book',
			mode: 'force',
			taskId: receipt.taskId
		});
		expect(await counts()).toEqual({ tasks: 1, batches: 1, receipts: 1 });
	});
	it('deduplicates concurrent clicks and preserves replay receipts after work finishes', async () => {
		const a = randomUUID(),
			b = randomUUID();
		const [first, second] = await Promise.all([enqueue(a), enqueue(b)]);
		expect(first.taskId).toBe(second.taskId);
		expect(first.runId).toBe(second.runId);
		expect(await counts()).toEqual({ tasks: 1, batches: 1, receipts: 2 });
		await admin.query(
			"UPDATE libri.research_tasks SET status='complete',completed_at=clock_timestamp(),active_run_id=NULL"
		);
		expect(await enqueue(a)).toMatchObject({
			taskId: first.taskId,
			runId: first.runId,
			deduped: true
		});
		expect(await enqueue(b)).toMatchObject({
			taskId: first.taskId,
			runId: first.runId,
			deduped: true
		});
		expect(await counts()).toEqual({ tasks: 1, batches: 1, receipts: 2 });
		expect((await enqueue()).taskId).not.toBe(first.taskId);
		expect((await counts()).tasks).toBe(2);
	});
	it('refuses key reuse with altered parameters while allowing distinct force intent', async () => {
		const key = randomUUID();
		await enqueue(key);
		await expect(enqueue(key, 'agent_profile', 'force')).rejects.toThrow('another operation');
		await expect(enqueue(key, 'book_synthesis')).rejects.toThrow('another operation');
		await expect(enqueue(key, 'agent_profile', 'gaps', book, 'high')).rejects.toThrow(
			'another operation'
		);
		await enqueue(randomUUID(), 'agent_profile', 'force');
		expect((await counts()).tasks).toBe(2);
	});
	it('rolls back task creation and receipts when budget or activation refuses admission', async () => {
		await admin.query('UPDATE libri.research_queue_controls SET daily_budget_microusd=1');
		await expect(enqueue()).rejects.toThrow('budget');
		expect(await counts()).toEqual({ tasks: 0, batches: 0, receipts: 0 });
		await admin.query('UPDATE libri.research_queue_controls SET dispatch_enabled=false');
		await expect(enqueue()).rejects.toThrow('disabled');
		expect((await counts()).tasks).toBe(0);
	});
	it('enforces owner, library book scope, processor allowlist and strict options', async () => {
		await expect(enqueue(randomUUID(), 'agent_profile', 'gaps', randomUUID())).rejects.toThrow(
			'Book unavailable'
		);
		await expect(enqueue(randomUUID(), 'generate_all')).rejects.toThrow('Invalid');
		await expect(enqueue(randomUUID(), 'agent_profile', 'invented')).rejects.toThrow('Invalid');
		await admin.query(
			"UPDATE libri.research_queue_controls SET supported_task_types=ARRAY['synthesize_book']"
		);
		await expect(enqueue()).rejects.toThrow('disabled');
		await admin.query("UPDATE libri.library_members SET role='viewer' WHERE library_id=$1", [
			library
		]);
		await expect(enqueue()).rejects.toThrow('owner');
		expect(await counts()).toEqual({ tasks: 0, batches: 0, receipts: 0 });
	});
	it('returns the same saved receipt during a pause but rechecks ownership', async () => {
		const key = randomUUID(),
			first = await enqueue(key);
		await admin.query('UPDATE libri.research_queue_controls SET dispatch_enabled=false');
		expect(await enqueue(key)).toMatchObject({
			taskId: first.taskId,
			runId: first.runId,
			deduped: true
		});
		await admin.query("UPDATE libri.library_members SET role='viewer'");
		await expect(enqueue(key)).rejects.toThrow('owner');
	});
});
