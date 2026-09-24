// apps/worker/tests/userDataPanel.postgres.test.ts
//
// Settings → Your data SQL (20260924190300) on a disposable, socket-only local
// PostgreSQL with a minimal fixture (supabase/tests/fixtures/user_data_panel_base.sql):
// the one-round-trip summary, the export request limits, completion, and the
// retention cleanup. No hosted database and no paid call.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const REPOSITORY_ROOT = resolve(process.cwd(), '../..');
const FILES = [
	'supabase/tests/fixtures/user_data_panel_base.sql',
	'supabase/migrations/20260924190250_user_data_export_queue_type.sql',
	'supabase/migrations/20260924190300_user_data_panel_and_exports.sql'
];

const USER = '0f000000-0000-4000-8000-000000000001';
const OTHER = '0f000000-0000-4000-8000-000000000002';

const postgresAvailable = ['initdb', 'pg_ctl', 'psql'].every(
	(command) => spawnSync(command, ['--version'], { stdio: 'ignore' }).status === 0
);
const describePostgres = postgresAvailable ? describe : describe.skip;

async function availablePort(): Promise<number> {
	return new Promise((resolvePort, reject) => {
		const server = createServer();
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			const address = server.address();
			const port = typeof address === 'object' && address ? address.port : 0;
			server.close(() => resolvePort(port));
		});
	});
}

describePostgres('Your data SQL (disposable PostgreSQL)', () => {
	let tempDir = '';
	let dataDir = '';
	let admin: Client;
	let service: Client;
	let member: Client;

	const sql = (text: string, params: unknown[] = []) => admin.query(text, params);
	const as = async <T = Record<string, unknown>>(userId: string | null, text: string) => {
		await member.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [userId ?? '']);
		return (await member.query(text)).rows[0] as T;
	};
	const summary = async (userId: string) =>
		(await as<{ s: Record<string, any> }>(userId, 'SELECT public.get_my_data_summary() AS s'))
			.s;
	const request = async (userId: string) =>
		(
			await as<{ r: Record<string, any> }>(
				userId,
				'SELECT public.request_user_data_export() AS r'
			)
		).r;

	beforeAll(async () => {
		tempDir = mkdtempSync('/tmp/buildos-user-data-panel-pg-');
		dataDir = join(tempDir, 'data');
		const socketDir = join(tempDir, 'socket');
		mkdirSync(socketDir);
		const port = await availablePort();
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
		const logFile = join(tempDir, 'postgres.log');
		try {
			execFileSync(
				'pg_ctl',
				[
					'-D',
					dataDir,
					'-l',
					logFile,
					'-o',
					`-p ${port} -k ${socketDir} -c listen_addresses=''`,
					'-w',
					'start'
				],
				{ stdio: 'pipe' }
			);
		} catch (error) {
			throw new Error(
				`Disposable PostgreSQL failed to start:\n${readFileSync(logFile, 'utf8')}`,
				{
					cause: error
				}
			);
		}
		execFileSync(
			'psql',
			[
				'-X',
				'-q',
				'-h',
				socketDir,
				'-p',
				String(port),
				'-U',
				'postgres',
				'-d',
				'postgres',
				'-v',
				'ON_ERROR_STOP=1',
				...FILES.flatMap((file) => ['-f', resolve(REPOSITORY_ROOT, file)])
			],
			{ encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
		);
		const connection = { host: socketDir, port, user: 'postgres', database: 'postgres' };
		admin = new Client(connection);
		service = new Client(connection);
		member = new Client(connection);
		await Promise.all([admin.connect(), service.connect(), member.connect()]);
		await service.query('SET ROLE service_role');
		await member.query('SET ROLE authenticated');
		await member.query("SET TIME ZONE 'UTC'");

		await sql(`INSERT INTO auth.users (id) VALUES ($1), ($2)`, [USER, OTHER]);
		await sql(`INSERT INTO public.users (id) VALUES ($1), ($2)`, [USER, OTHER]);
	}, 120_000);

	afterAll(async () => {
		await Promise.all(
			[admin?.end(), service?.end(), member?.end()].map((p) => p?.catch(() => undefined))
		);
		if (dataDir)
			spawnSync('pg_ctl', ['-D', dataDir, 'stop', '-m', 'fast'], { stdio: 'ignore' });
		if (tempDir) rmSync(tempDir, { recursive: true, force: true });
	});

	describe('get_my_data_summary', () => {
		beforeAll(async () => {
			const [{ id: actor }] = (
				await sql(`INSERT INTO public.onto_actors (user_id) VALUES ($1) RETURNING id`, [
					USER
				])
			).rows;
			const [{ id: otherActor }] = (
				await sql(`INSERT INTO public.onto_actors (user_id) VALUES ($1) RETURNING id`, [
					OTHER
				])
			).rows;
			for (const table of ['onto_projects', 'onto_documents', 'onto_tasks', 'onto_assets']) {
				await sql(
					`INSERT INTO public.${table} (created_by, deleted_at)
					VALUES ($1, NULL), ($1, NULL), ($1, now()), ($2, NULL)`,
					[actor, otherActor]
				);
			}
			const [{ id: session }] = (
				await sql(`INSERT INTO public.chat_sessions (user_id) VALUES ($1) RETURNING id`, [
					USER
				])
			).rows;
			const [{ id: otherSession }] = (
				await sql(`INSERT INTO public.chat_sessions (user_id) VALUES ($1) RETURNING id`, [
					OTHER
				])
			).rows;
			await sql(
				`INSERT INTO public.chat_messages (user_id, session_id, role)
				VALUES ($1, $2, 'user'), ($1, $2, 'assistant'), ($1, $2, 'assistant'), ($3, $4, 'user')`,
				[USER, session, OTHER, otherSession]
			);
			await sql(
				`INSERT INTO public.chat_tool_executions (session_id) VALUES ($1), ($1), ($2)`,
				[session, otherSession]
			);
			await sql(`INSERT INTO public.chat_prompt_snapshots (user_id) VALUES ($1), ($2)`, [
				USER,
				OTHER
			]);
			await sql(`INSERT INTO public.llm_usage_logs (user_id) VALUES ($1), ($1), ($1), ($2)`, [
				USER,
				OTHER
			]);
			await sql(
				`INSERT INTO public.voice_notes (user_id, deleted_at) VALUES ($1, NULL), ($1, now()), ($2, NULL)`,
				[USER, OTHER]
			);
			await sql(
				`INSERT INTO public.ontology_daily_briefs (user_id) VALUES ($1), ($1), ($2)`,
				[USER, OTHER]
			);
			await sql(`INSERT INTO public.user_email_connections (user_id) VALUES ($1)`, [USER]);
			await sql(
				`INSERT INTO public.email_access_audit_events (user_id, operation, outcome, created_at) VALUES
					($1, 'gmail.messages.search', 'success', '2026-09-01T10:00:00Z'),
					($1, 'gmail.messages.get', 'failure', '2026-09-10T10:00:00Z'),
					($1, 'gmail.token.refresh', 'success', '2026-09-20T10:00:00Z'),
					($2, 'gmail.messages.search', 'success', '2026-09-22T10:00:00Z')`,
				[USER, OTHER]
			);
			await sql(
				`INSERT INTO public.user_calendar_tokens (user_id, access_token, refresh_token, updated_at)
				VALUES ($1, 'enc:a', 'enc:r', '2026-09-24T08:00:00Z')`,
				[USER]
			);
			await sql(
				`INSERT INTO public.user_calendar_connections (user_id, status, last_used_at)
				VALUES ($1, 'active', '2026-09-24T10:00:00Z'), ($1, 'disabled', '2026-09-24T11:00:00Z')`,
				[USER]
			);
			await sql(
				`INSERT INTO public.external_agent_callers (user_id, provider, status, metadata, last_used_at) VALUES
					($1, 'claude-browser', 'trusted', '{"installation_name":"Claude connector"}', '2026-09-24T09:00:00Z'),
					($1, 'codex-cli', 'revoked', '{}', '2026-09-24T12:00:00Z'),
					($2, 'openclaw', 'trusted', '{}', NULL)`,
				[USER, OTHER]
			);
		});

		it('counts only the caller’s live rows, in one call', async () => {
			const result = await summary(USER);
			expect(result.workspace).toEqual({
				projects: 2,
				documents: 2,
				tasks: 2,
				uploads: 2,
				chats: 1,
				messages: 3,
				voice_notes: 1,
				daily_briefs: 2
			});
			expect(result.traces).toEqual({
				tool_traces: 2,
				prompt_snapshots: 1,
				ai_usage_records: 3
			});
		});

		it('reports connections from structured status and operation codes only', async () => {
			const { connections } = await summary(USER);
			expect(connections.gmail).toEqual({
				connected: true,
				needs_reconnect: false,
				last_read_at: '2026-09-01T10:00:00+00:00'
			});
			expect(connections.calendar).toEqual({
				connected: true,
				last_synced_at: '2026-09-24T10:00:00+00:00'
			});
			expect(connections.agents).toEqual([
				expect.objectContaining({
					provider: 'claude-browser',
					name: 'Claude connector',
					last_used_at: '2026-09-24T09:00:00+00:00'
				})
			]);
		});

		it('shows a user with nothing connected as not connected', async () => {
			const { connections, workspace } = await summary(OTHER);
			expect(connections.gmail.connected).toBe(false);
			expect(connections.gmail.last_read_at).toBe('2026-09-22T10:00:00+00:00');
			expect(connections.calendar).toEqual({ connected: false, last_synced_at: null });
			expect(workspace.projects).toBe(1);
		});

		it('needs a signed-in caller and is closed to anon', async () => {
			await expect(as(null, 'SELECT public.get_my_data_summary()')).rejects.toThrow(
				/get_my_data_summary_auth_required/
			);
			await member.query('SET ROLE anon');
			try {
				await expect(as(USER, 'SELECT public.get_my_data_summary()')).rejects.toThrow(
					/permission denied/
				);
			} finally {
				await member.query('SET ROLE authenticated');
			}
		});
	});

	describe('exports', () => {
		beforeEach(async () => {
			await sql('DELETE FROM public.user_data_exports');
			await sql('DELETE FROM public.queue_jobs');
			await sql('DELETE FROM storage.objects');
			await sql('UPDATE public.users SET deletion_status = NULL');
		});

		it('creates one export and enqueues its job, then returns the active one', async () => {
			const first = await request(USER);
			expect(first.outcome).toBe('created');
			const jobs = (
				await sql(`SELECT job_type::text, metadata, dedup_key FROM public.queue_jobs`)
			).rows;
			expect(jobs).toEqual([
				{
					job_type: 'user_data_export',
					metadata: { exportId: first.export_id, userId: USER },
					dedup_key: `user-data-export:${first.export_id}`
				}
			]);

			const second = await request(USER);
			expect(second).toEqual({ outcome: 'active', export_id: first.export_id });
			expect((await sql('SELECT count(*)::int AS n FROM public.queue_jobs')).rows[0].n).toBe(
				1
			);
		});

		it('allows 3 per rolling day, not counting failed ones', async () => {
			await sql(
				`INSERT INTO public.user_data_exports (user_id, status, requested_at, storage_path, part_count, expires_at, error_code)
				VALUES ($1::uuid, 'ready', now() - interval '1 hour', $1::text || '/a.zip', 1, now() + interval '6 days', NULL),
					($1::uuid, 'expired', now() - interval '2 hours', NULL, NULL, NULL, NULL),
					($1::uuid, 'failed', now() - interval '3 hours', NULL, NULL, NULL, 'upload_failed'),
					($1::uuid, 'ready', now() - interval '25 hours', $1::text || '/b.zip', 1, now() + interval '5 days', NULL)`,
				[USER]
			);
			expect((await request(USER)).outcome).toBe('created');
			await sql(
				`UPDATE public.user_data_exports SET status = 'ready', storage_path = user_id || '/c.zip', part_count = 1, expires_at = now() + interval '7 days' WHERE status = 'queued'`
			);

			const limited = await request(USER);
			expect(limited.outcome).toBe('rate_limited');
			expect(limited.export_id).toBeNull();
			const nextAllowed = new Date(limited.next_allowed_at).getTime();
			expect(nextAllowed).toBeGreaterThan(Date.now() + 21 * 3_600_000);
			expect((await request(OTHER)).outcome).toBe('created');
		});

		it('refuses an account being deleted and writes nothing', async () => {
			await sql(`UPDATE public.users SET deletion_status = 'pending' WHERE id = $1`, [USER]);
			expect(await request(USER)).toEqual({
				outcome: 'account_deletion_pending',
				export_id: null
			});
			expect(
				(await sql('SELECT count(*)::int AS n FROM public.user_data_exports')).rows[0].n
			).toBe(0);
			expect((await sql('SELECT count(*)::int AS n FROM public.queue_jobs')).rows[0].n).toBe(
				0
			);
		});

		it('stops a stale export from blocking a new one', async () => {
			await sql(
				`INSERT INTO public.user_data_exports (user_id, status, requested_at) VALUES ($1, 'running', now() - interval '3 hours')`,
				[USER]
			);
			expect((await request(USER)).outcome).toBe('created');
			const statuses = (
				await sql(
					`SELECT status, error_code FROM public.user_data_exports ORDER BY requested_at`
				)
			).rows;
			expect(statuses).toEqual([
				{ status: 'failed', error_code: 'stale' },
				{ status: 'queued', error_code: null }
			]);
		});

		it('keeps rows owner-readable only and closed to browser writes', async () => {
			await request(USER);
			await request(OTHER);
			const own = await as<{ n: number }>(
				USER,
				'SELECT count(*)::int AS n FROM public.user_data_exports'
			);
			expect(own.n).toBe(1);
			await expect(
				as(USER, `UPDATE public.user_data_exports SET status = 'ready'`)
			).rejects.toThrow(/permission denied/);
			await expect(
				as(USER, `INSERT INTO public.user_data_exports (user_id) VALUES ('${USER}')`)
			).rejects.toThrow(/permission denied/);
			await expect(
				sql(
					`INSERT INTO public.user_data_exports (user_id, status) VALUES ($1, 'queued')`,
					[USER]
				)
			).rejects.toThrow(/user_data_exports_one_active_idx/);
		});

		it('completes only through service_role, only with the export’s own path, and opens a 7-day window', async () => {
			const { export_id: id } = await request(USER);
			await expect(
				as(
					USER,
					`SELECT public.complete_user_data_export('${id}', '${USER}/${id}.zip', 10, 1)`
				)
			).rejects.toThrow(/permission denied/);
			await expect(
				service.query(`SELECT public.complete_user_data_export($1, $2, 10, 1)`, [
					id,
					`${OTHER}/${id}.zip`
				])
			).rejects.toThrow(/user_data_export_not_completable/);

			const { rows } = await service.query(
				`SELECT public.complete_user_data_export($1, $2, 1234, 2) AS expires_at`,
				[id, `${USER}/${id}.zip`]
			);
			const days = (new Date(rows[0].expires_at).getTime() - Date.now()) / 86_400_000;
			expect(days).toBeGreaterThan(6.99);
			expect(days).toBeLessThanOrEqual(7);
			expect(
				(
					await sql(
						`SELECT status, byte_size, part_count FROM public.user_data_exports WHERE id = $1`,
						[id]
					)
				).rows[0]
			).toEqual({ status: 'ready', byte_size: '1234', part_count: 2 });
		});

		it('expires, fails stale, deletes old rows, and lists only objects whose export is over', async () => {
			const insert = async (
				status: string,
				requested: string,
				expires: string | null,
				error: string | null = null
			) =>
				(
					await sql(
						`INSERT INTO public.user_data_exports (user_id, status, requested_at, storage_path, part_count, expires_at, error_code)
						VALUES ($1, $2, now() - $3::interval,
							CASE WHEN $2 = 'ready' THEN 'set-below' END,
							CASE WHEN $2 = 'ready' THEN 1 END,
							CASE WHEN $4::text IS NULL THEN NULL ELSE now() + $4::interval END, $5)
						RETURNING id`,
						[USER, status, requested, expires, error]
					)
				).rows[0].id as string;
			const expired = await insert('ready', '8 days', '-1 hour');
			const live = await insert('ready', '1 day', '6 days');
			const stale = await insert('running', '3 hours', null);
			const old = await insert('failed', '31 days', null, 'upload_failed');
			await sql(
				`UPDATE public.user_data_exports SET storage_path = user_id || '/' || id || '.zip' WHERE status = 'ready'`
			);

			const object = (id: string, suffix = '.zip', age = '2 hours') =>
				sql(
					`INSERT INTO storage.objects (bucket_id, name, created_at) VALUES ('user-exports', $1, now() - $2::interval)`,
					[`${USER}/${id}${suffix}`, age]
				);
			await object(expired);
			await object(expired, '.part2.zip');
			await object(live);
			await object(stale);
			await object('ffffffff-0000-4000-8000-00000000dead'); // row gone (e.g. account deleted)
			await object('eeeeeeee-0000-4000-8000-00000000beef', '.zip', '5 minutes'); // too young
			await sql(
				`INSERT INTO storage.objects (bucket_id, name, created_at) VALUES ('onto-assets', $1, now() - interval '9 days')`,
				[`${USER}/${expired}.zip`]
			);

			const { rows: summaryRows } = await service.query(
				'SELECT public.cleanup_privacy_user_data_exports(p_batch_size => 500) AS s'
			);
			expect(summaryRows[0].s).toEqual({
				user_data_exports_expired: 1,
				user_data_exports_failed_stale: 1,
				user_data_export_rows_deleted: 1
			});
			const rows = new Map(
				(
					await sql(
						'SELECT id, status, storage_path, error_code FROM public.user_data_exports'
					)
				).rows.map((row) => [row.id, row])
			);
			expect(rows.get(expired)).toMatchObject({ status: 'expired', storage_path: null });
			expect(rows.get(live)?.status).toBe('ready');
			expect(rows.get(stale)).toMatchObject({ status: 'failed', error_code: 'stale' });
			expect(rows.has(old)).toBe(false);

			const listed = (
				await service.query(
					'SELECT object_name FROM public.list_privacy_expired_user_exports(100)'
				)
			).rows.map((row) => row.object_name);
			expect(listed.sort()).toEqual(
				[
					`${USER}/${expired}.zip`,
					`${USER}/${expired}.part2.zip`,
					`${USER}/${stale}.zip`,
					`${USER}/ffffffff-0000-4000-8000-00000000dead.zip`
				].sort()
			);

			await expect(
				as(USER, 'SELECT public.cleanup_privacy_user_data_exports(10)')
			).rejects.toThrow(/permission denied/);
		});
	});
});
