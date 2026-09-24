// apps/worker/tests/privacyRetention.postgres.test.ts
//
// Tasker 103 deliverable 5: one retention test per derived store. A disposable,
// socket-only local PostgreSQL gets a minimal fixture
// (supabase/tests/fixtures/privacy_retention_base.sql) and the new migration, then
// each cleanup function must remove or blank the old rows and keep the young ones.
// No hosted database and no paid call exists anywhere in this file.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	type PrivacyRetentionClient,
	PRIVACY_RETENTION_TASKS,
	runPrivacyRetention
} from '../src/scheduler/privacyRetention';

const REPOSITORY_ROOT = resolve(process.cwd(), '../..');
const FIXTURE = 'supabase/tests/fixtures/privacy_retention_base.sql';
const MIGRATION = 'supabase/migrations/20260924190000_privacy_retention.sql';
const CALENDAR_MIGRATION =
	'supabase/migrations/20260924190500_calendar_analysis_minimal_events.sql';

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

describePostgres('privacy retention functions (disposable PostgreSQL)', () => {
	let tempDir = '';
	let dataDir = '';
	let admin: Client;
	let service: Client;

	const sql = (text: string, params: unknown[] = []) => admin.query(text, params);
	const scalar = async <T = unknown>(text: string, params: unknown[] = []): Promise<T> =>
		(await admin.query(text, params)).rows[0]?.value as T;
	const count = (table: string, where = 'true') =>
		scalar<number>(`SELECT count(*)::int AS value FROM ${table} WHERE ${where}`);

	/** Calls a cleanup function as service_role, the only role granted EXECUTE. */
	async function cleanup(name: string, batchSize = 500): Promise<Record<string, number>> {
		const { rows } = await service.query(
			`SELECT public.${name}(p_batch_size => $1) AS summary`,
			[batchSize]
		);
		return rows[0].summary as Record<string, number>;
	}

	/** Calls until a batch affects nothing, like the worker job. */
	async function drain(name: string, batchSize = 500): Promise<Record<string, number>[]> {
		const batches: Record<string, number>[] = [];
		for (let i = 0; i < 50; i += 1) {
			const summary = await cleanup(name, batchSize);
			batches.push(summary);
			if (Object.values(summary).every((value) => value === 0)) break;
		}
		return batches;
	}

	async function turn(status: string, endedDaysAgo: number | null, createdDaysAgo = 200) {
		return scalar<string>(
			`INSERT INTO public.chat_turn_runs (status, request_message, request_payload, created_at, terminalized_at, finished_at)
			VALUES ($1, 'Plan the Baltimore launch', '{"message":"Plan the Baltimore launch"}'::jsonb,
				now() - make_interval(days => $3::int),
				CASE WHEN $2::int IS NULL THEN NULL ELSE now() - make_interval(days => $2::int) END,
				CASE WHEN $2::int IS NULL THEN NULL ELSE now() - make_interval(days => $2::int) END)
			RETURNING id AS value`,
			[status, endedDaysAgo, createdDaysAgo]
		);
	}

	beforeAll(async () => {
		tempDir = mkdtempSync('/tmp/buildos-privacy-retention-pg-');
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
				'-f',
				resolve(REPOSITORY_ROOT, FIXTURE),
				'-f',
				resolve(REPOSITORY_ROOT, MIGRATION),
				'-f',
				resolve(REPOSITORY_ROOT, CALENDAR_MIGRATION)
			],
			{ encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
		);
		const connection = { host: socketDir, port, user: 'postgres', database: 'postgres' };
		admin = new Client(connection);
		service = new Client(connection);
		await Promise.all([admin.connect(), service.connect()]);
		await service.query('SET ROLE service_role');
	}, 120_000);

	afterAll(async () => {
		await Promise.all([admin?.end(), service?.end()].map((p) => p?.catch(() => undefined)));
		if (dataDir)
			spawnSync('pg_ctl', ['-D', dataDir, 'stop', '-m', 'fast'], { stdio: 'ignore' });
		if (tempDir) rmSync(tempDir, { recursive: true, force: true });
	});

	it('grants the cleanup functions to service_role only', async () => {
		await sql('SET ROLE authenticated');
		await expect(sql('SELECT public.cleanup_privacy_error_logs(10)')).rejects.toThrow(
			/permission denied/
		);
		await sql('RESET ROLE');
	});

	describe('chat', () => {
		it('chat_turn_effects: 180-day ceiling removes even unresolved effects; younger guards stay', async () => {
			const ended = await turn('completed', 200);
			const running = await turn('running', null);
			const oldUncertain = await scalar<string>(
				`INSERT INTO public.chat_turn_effects (turn_run_id, state, created_at, updated_at)
				VALUES ($1, 'uncertain', now() - interval '181 days', now() - interval '181 days') RETURNING id AS value`,
				[ended]
			);
			const oldStartedOnRunningTurn = await scalar<string>(
				`INSERT INTO public.chat_turn_effects (turn_run_id, state, created_at, updated_at)
				VALUES ($1, 'started', now() - interval '181 days', now() - interval '181 days') RETURNING id AS value`,
				[running]
			);
			const youngUncertain = await scalar<string>(
				`INSERT INTO public.chat_turn_effects (turn_run_id, state, created_at, updated_at)
				VALUES ($1, 'uncertain', now() - interval '120 days', now() - interval '120 days') RETURNING id AS value`,
				[ended]
			);
			const toolExecution = await scalar<string>(
				`INSERT INTO public.chat_tool_executions (turn_run_id, effect_id) VALUES ($1, $2) RETURNING id AS value`,
				[ended, oldUncertain]
			);

			const batches = await drain('cleanup_privacy_chat_turn_effects');

			expect(batches[0]).toEqual({ chat_turn_effects_deleted: 2 });
			expect(
				await count(
					'public.chat_turn_effects',
					`id IN ('${oldUncertain}', '${oldStartedOnRunningTurn}')`
				)
			).toBe(0);
			expect(await count('public.chat_turn_effects', `id = '${youngUncertain}'`)).toBe(1);
			expect(
				await scalar(
					`SELECT effect_id AS value FROM public.chat_tool_executions WHERE id = $1`,
					[toolExecution]
				)
			).toBeNull();
			await expect(
				sql(`DELETE FROM public.chat_turn_effects WHERE id = $1`, [youngUncertain])
			).rejects.toThrow(/agentic_chat_uncertain_effect_cannot_be_deleted/);
		});

		it('chat_turn_runs: blanks request text 30 days after a turn ends, keeps the row', async () => {
			const old = await turn('completed', 31);
			const young = await turn('failed', 10);
			const stuck = await turn('running', null, 40);

			const batches = await drain('cleanup_privacy_chat_turn_requests');

			expect(batches[0]?.chat_turn_requests_cleared).toBeGreaterThanOrEqual(1);
			const rows = (
				await sql(
					`SELECT id, request_message, request_payload FROM public.chat_turn_runs WHERE id = ANY($1)`,
					[[old, young, stuck]]
				)
			).rows;
			const byId = new Map(rows.map((row) => [row.id, row]));
			expect(byId.get(old)).toMatchObject({ request_message: '', request_payload: {} });
			expect(byId.get(young)?.request_message).toBe('Plan the Baltimore launch');
			expect(byId.get(stuck)?.request_message).toBe('Plan the Baltimore launch');
		});

		it('chat_turn_checkpoints, execution observations, recovery failures: 30 days', async () => {
			const ended = await turn('completed', 40);
			const running = await turn('running', null);
			await sql(
				`INSERT INTO public.chat_turn_checkpoints (turn_run_id, updated_at) VALUES
					($1, now() - interval '31 days'), ($1, now() - interval '5 days')`,
				[ended]
			);
			await sql(
				`INSERT INTO public.agentic_chat_execution_observations (turn_run_id, observed_at) VALUES
					($1, now() - interval '31 days'), ($1, now() - interval '1 day')`,
				[ended]
			);
			const youngFailureTurn = await turn('completed', 40);
			await sql(
				`INSERT INTO public.chat_turn_recovery_failures (turn_run_id, last_failed_at) VALUES
					($1, now() - interval '31 days'), ($2, now() - interval '31 days'), ($3, now() - interval '5 days')`,
				[ended, running, youngFailureTurn]
			);

			await drain('cleanup_privacy_chat_turn_checkpoints');
			await drain('cleanup_privacy_chat_execution_observations');
			await drain('cleanup_privacy_chat_turn_recovery_failures');

			expect(await count('public.chat_turn_checkpoints', `turn_run_id = '${ended}'`)).toBe(1);
			expect(
				await count(
					'public.agentic_chat_execution_observations',
					`turn_run_id = '${ended}'`
				)
			).toBe(1);
			// A still-running turn stays parked; an ended turn's old failure goes.
			expect(
				await count('public.chat_turn_recovery_failures', `turn_run_id = '${ended}'`)
			).toBe(0);
			expect(
				await count('public.chat_turn_recovery_failures', `turn_run_id = '${running}'`)
			).toBe(1);
			expect(
				await count(
					'public.chat_turn_recovery_failures',
					`turn_run_id = '${youngFailureTurn}'`
				)
			).toBe(1);
		});

		it('workflow runs: 30 days after the turn ends, with steps, specialist snapshots, and read batches', async () => {
			const old = await turn('completed', 31);
			const young = await turn('completed', 10);
			for (const id of [old, young]) {
				await sql(
					`INSERT INTO public.chat_turn_workflow_runs (turn_run_id, answer_text) VALUES ($1, 'answer')`,
					[id]
				);
				await sql(
					`INSERT INTO public.chat_turn_workflow_steps (turn_run_id, step_key) VALUES ($1, 'read')`,
					[id]
				);
				await sql(
					`INSERT INTO public.chat_turn_specialist_snapshots (turn_run_id) VALUES ($1)`,
					[id]
				);
				await sql(
					`INSERT INTO public.chat_turn_document_read_batches (turn_run_id, result) VALUES ($1, '{"text":"doc"}')`,
					[id]
				);
			}

			const batches = await drain('cleanup_privacy_chat_workflow_runs');

			expect(batches[0]).toEqual({ workflow_runs_deleted: 1 });
			for (const table of [
				'public.chat_turn_workflow_runs',
				'public.chat_turn_workflow_steps',
				'public.chat_turn_specialist_snapshots',
				'public.chat_turn_document_read_batches'
			]) {
				expect(await count(table, `turn_run_id = '${old}'`)).toBe(0);
				expect(await count(table, `turn_run_id = '${young}'`)).toBe(1);
			}
		});

		it('answer comparisons and prompt evals: 90 days, children cascade', async () => {
			const oldComparison = await scalar<string>(
				`INSERT INTO public.agentic_chat_answer_comparisons (created_at) VALUES (now() - interval '91 days') RETURNING id AS value`
			);
			const youngComparison = await scalar<string>(
				`INSERT INTO public.agentic_chat_answer_comparisons (created_at) VALUES (now() - interval '10 days') RETURNING id AS value`
			);
			for (const id of [oldComparison, youngComparison]) {
				const candidate = await scalar<string>(
					`INSERT INTO public.agentic_chat_answer_comparison_candidates (comparison_id, answer) VALUES ($1, 'a') RETURNING id AS value`,
					[id]
				);
				await sql(
					`INSERT INTO public.agentic_chat_answer_comparison_votes (comparison_id, preferred_candidate_id) VALUES ($1, $2)`,
					[id, candidate]
				);
			}
			const oldEval = await scalar<string>(
				`INSERT INTO public.chat_prompt_eval_runs (created_at) VALUES (now() - interval '91 days') RETURNING id AS value`
			);
			await scalar(
				`INSERT INTO public.chat_prompt_eval_runs (created_at) VALUES (now() - interval '89 days') RETURNING id AS value`
			);
			await sql(`INSERT INTO public.chat_prompt_eval_assertions (eval_run_id) VALUES ($1)`, [
				oldEval
			]);

			await drain('cleanup_privacy_chat_answer_comparisons');
			await drain('cleanup_privacy_chat_prompt_evals');

			expect(await count('public.agentic_chat_answer_comparisons')).toBe(1);
			expect(
				await count(
					'public.agentic_chat_answer_comparison_candidates',
					`comparison_id = '${youngComparison}'`
				)
			).toBe(1);
			expect(
				await count(
					'public.agentic_chat_answer_comparison_candidates',
					`comparison_id = '${oldComparison}'`
				)
			).toBe(0);
			expect(
				await count(
					'public.agentic_chat_answer_comparison_votes',
					`comparison_id = '${oldComparison}'`
				)
			).toBe(0);
			expect(await count('public.chat_prompt_eval_runs')).toBe(1);
			expect(await count('public.chat_prompt_eval_assertions')).toBe(0);
		});

		it('prepared prompts: no longer capped at 50 per call', async () => {
			await sql(
				`INSERT INTO public.agentic_chat_prepared_prompts (expires_at)
				SELECT now() - interval '1 hour' FROM generate_series(1, 620)`
			);
			const first = await service.query(
				'SELECT public.cleanup_expired_agentic_chat_prepared_prompts() AS n'
			);
			const second = await service.query(
				'SELECT public.cleanup_expired_agentic_chat_prepared_prompts() AS n'
			);
			expect([first.rows[0].n, second.rows[0].n]).toEqual([500, 120]);
		});
	});

	describe('agents', () => {
		it('blanks tool content after 30 days, keeping ids, op, and status', async () => {
			await sql(
				`INSERT INTO public.agent_tool_executions (tool_name, result, created_at) VALUES
					('web_visit', '{"text":"page body"}', now() - interval '31 days'),
					('web_visit', '{"text":"fresh body"}', now() - interval '2 days')`
			);
			await sql(
				`INSERT INTO public.agent_run_events (event_type, payload, created_at) VALUES
					('tool_result', '{"text":"old"}', now() - interval '31 days'),
					('tool_result', '{"text":"new"}', now() - interval '2 days')`
			);
			await sql(
				`INSERT INTO public.agent_call_tool_executions (op, status, args, response_payload, error_payload, created_at) VALUES
					('onto.document.update', 'succeeded', '{"content":"old doc"}', '{"result":{"title":"Doc"}}', NULL, now() - interval '31 days'),
					('onto.task.create', 'failed', '{"title":"old task"}', NULL, '{"message":"denied"}', now() - interval '31 days'),
					('onto.document.update', 'succeeded', '{"content":"new doc"}', '{"result":{}}', NULL, now() - interval '2 days')`
			);

			await drain('cleanup_privacy_agent_tool_payloads');

			expect(await count('public.agent_tool_executions', `result IS NULL`)).toBe(1);
			expect(
				await count('public.agent_tool_executions', `result->>'text' = 'fresh body'`)
			).toBe(1);
			expect(await count('public.agent_run_events', `payload = '{}'::jsonb`)).toBe(1);
			expect(await count('public.agent_run_events', `payload->>'text' = 'new'`)).toBe(1);
			const calls = (
				await sql(
					`SELECT op, status, args, response_payload, error_payload FROM public.agent_call_tool_executions ORDER BY created_at, op`
				)
			).rows;
			expect(calls.slice(0, 2)).toEqual([
				{
					op: 'onto.document.update',
					status: 'succeeded',
					args: {},
					response_payload: null,
					error_payload: null
				},
				{
					op: 'onto.task.create',
					status: 'failed',
					args: {},
					response_payload: null,
					error_payload: null
				}
			]);
			expect(calls[2]?.args).toEqual({ content: 'new doc' });
		});
	});

	describe('logs and analytics', () => {
		it('drains a backlog far past one batch (the old once-a-day 1,000-row cap)', async () => {
			await sql(
				`INSERT INTO public.error_logs (error_message, created_at)
				SELECT 'boom', now() - interval '91 days' FROM generate_series(1, 1203)`
			);
			await sql(
				`INSERT INTO public.error_logs (error_message, created_at) VALUES ('recent', now() - interval '89 days')`
			);

			const batches = await drain('cleanup_privacy_error_logs', 500);

			expect(batches.map((batch) => batch.error_logs_deleted)).toEqual([500, 500, 203, 0]);
			expect(await count('public.error_logs')).toBe(1);
		});

		it('llm usage 400 d, notification and cron logs 90 d, user activity 180 d, page views 90 d', async () => {
			await sql(
				`INSERT INTO public.llm_usage_logs (created_at) VALUES (now() - interval '401 days'), (now() - interval '399 days')`
			);
			await sql(
				`INSERT INTO public.notification_logs (created_at) VALUES (now() - interval '91 days'), (now() - interval '89 days')`
			);
			await sql(
				`INSERT INTO public.cron_logs (executed_at) VALUES (now() - interval '91 days'), (now() - interval '89 days')`
			);
			await sql(
				`INSERT INTO public.user_activity_logs (created_at) VALUES (now() - interval '181 days'), (now() - interval '179 days')`
			);
			await sql(
				`INSERT INTO public.onto_public_page_views (viewed_at) VALUES (now() - interval '91 days'), (now() - interval '89 days')`
			);

			for (const name of [
				'cleanup_privacy_llm_usage_logs',
				'cleanup_privacy_notification_logs',
				'cleanup_privacy_cron_logs',
				'cleanup_privacy_user_activity_logs',
				'cleanup_privacy_public_page_views'
			]) {
				const [first] = await drain(name);
				expect(Object.values(first ?? {})).toEqual([1]);
			}
			for (const table of [
				'public.llm_usage_logs',
				'public.notification_logs',
				'public.cron_logs',
				'public.user_activity_logs',
				'public.onto_public_page_views'
			]) {
				expect(await count(table)).toBe(1);
			}
		});

		it('queue jobs: failed and cancelled after 30 days; completed and young rows stay', async () => {
			const oldFailed = await scalar<string>(
				`INSERT INTO public.queue_jobs (status, created_at, completed_at) VALUES ('failed', now() - interval '40 days', now() - interval '31 days') RETURNING id AS value`
			);
			await sql(
				`INSERT INTO public.queue_jobs (status, created_at, updated_at) VALUES
					('cancelled', now() - interval '40 days', now() - interval '31 days'),
					('completed', now() - interval '40 days', now() - interval '31 days'),
					('failed', now() - interval '10 days', now() - interval '10 days')`
			);
			const cycleRun = await scalar<string>(
				`INSERT INTO public.cycle_runs (queue_job_record_id) VALUES ($1) RETURNING id AS value`,
				[oldFailed]
			);

			const [first] = await drain('cleanup_privacy_queue_jobs');

			expect(first).toEqual({ failed_cancelled_jobs_deleted: 2 });
			expect(
				(await sql(`SELECT status FROM public.queue_jobs ORDER BY status`)).rows.map(
					(row) => row.status
				)
			).toEqual(['completed', 'failed']);
			expect(
				await scalar(
					`SELECT queue_job_record_id AS value FROM public.cycle_runs WHERE id = $1`,
					[cycleRun]
				)
			).toBeNull();
		});

		it('visitors and email tracking: IP and user agent blanked after 30 days, rows kept', async () => {
			await sql(
				`INSERT INTO public.visitors (visitor_id, ip_address, user_agent, created_at, updated_at) VALUES
					('v-old', '203.0.113.7', 'Mozilla/5.0', now() - interval '31 days', now() - interval '31 days'),
					('v-new', '203.0.113.8', 'Mozilla/5.0', now() - interval '31 days', now() - interval '2 days')`
			);
			await sql(
				`INSERT INTO public.email_tracking_events (ip_address, user_agent, created_at) VALUES
					('198.51.100.1', 'Mail', now() - interval '31 days'),
					('198.51.100.2', 'Mail', now() - interval '3 days')`
			);

			const [first] = await drain('cleanup_privacy_tracking_network_data');

			expect(first).toEqual({
				visitors_network_cleared: 1,
				email_tracking_network_cleared: 1
			});
			expect(await count('public.visitors')).toBe(2);
			expect(
				await count(
					'public.visitors',
					`visitor_id = 'v-old' AND ip_address IS NULL AND user_agent IS NULL`
				)
			).toBe(1);
			expect(
				await count('public.visitors', `visitor_id = 'v-new' AND ip_address IS NOT NULL`)
			).toBe(1);
			expect(await count('public.email_tracking_events')).toBe(2);
			expect(await count('public.email_tracking_events', `ip_address IS NULL`)).toBe(1);
		});

		it('security_logs: every row goes (the writer was removed)', async () => {
			await sql(
				`INSERT INTO public.security_logs (content, created_at) VALUES ('user input', now()), ('older', now() - interval '1 year')`
			);
			await drain('cleanup_privacy_security_logs');
			expect(await count('public.security_logs')).toBe(0);
		});
	});

	describe('sent messages', () => {
		it('email bodies: 30 days after send, system brief/notification emails only', async () => {
			await sql(
				`INSERT INTO public.email_logs (body, sent_at) VALUES
					('Your brief: Baltimore launch', now() - interval '31 days'),
					('Fresh body', now() - interval '3 days')`
			);
			await sql(
				`INSERT INTO public.emails (content, category, template_data, status, sent_at) VALUES
					('<p>brief</p>', 'daily_brief', '{"delivery_id":"d1"}', 'sent', now() - interval '31 days'),
					('<p>note</p>', 'notification', '{"delivery_id":"d2"}', 'failed', now() - interval '31 days'),
					('<p>campaign</p>', 'general', '{"sent_by_admin":true}', 'sent', now() - interval '31 days'),
					('<p>admin note</p>', 'notification', '{"sent_by_admin":true}', 'sent', now() - interval '31 days'),
					('<p>one-off</p>', NULL, '{"sent_by_admin":true}', 'sent', now() - interval '31 days'),
					('<p>fresh brief</p>', 'daily_brief', '{"delivery_id":"d3"}', 'sent', now() - interval '3 days'),
					('<p>queued brief</p>', 'daily_brief', '{"delivery_id":"d4"}', 'scheduled', NULL)`
			);

			const [first] = await drain('cleanup_privacy_email_bodies');

			expect(first).toEqual({ email_log_bodies_cleared: 1, system_email_bodies_cleared: 2 });
			expect(await count('public.email_logs', `body = ''`)).toBe(1);
			const kept = (
				await sql(`SELECT content FROM public.emails WHERE content <> '' ORDER BY content`)
			).rows.map((row) => row.content);
			expect(kept).toEqual([
				'<p>admin note</p>',
				'<p>campaign</p>',
				'<p>fresh brief</p>',
				'<p>one-off</p>',
				'<p>queued brief</p>'
			]);
		});

		it('SMS bodies and scheduled reminders: 30 days after send', async () => {
			await sql(
				`INSERT INTO public.sms_messages (message_content, template_vars, status, sent_at, created_at) VALUES
					('Standup in 15 min', '{"event":"Standup"}', 'delivered', now() - interval '31 days', now() - interval '31 days'),
					('Queued', NULL, 'pending', NULL, now() - interval '31 days'),
					('Recent', NULL, 'sent', now() - interval '2 days', now() - interval '2 days')`
			);
			await sql(
				`INSERT INTO public.scheduled_sms_messages (message_content, event_title, event_details, status, scheduled_for, sent_at) VALUES
					('Dentist at 3', 'Dentist', '{"location":"Main St"}', 'sent', now() - interval '31 days', now() - interval '31 days'),
					('Future', 'Board meeting', NULL, 'scheduled', now() + interval '1 day', NULL)`
			);

			const [first] = await drain('cleanup_privacy_sms_bodies');

			expect(first).toEqual({ sms_bodies_cleared: 1, scheduled_sms_bodies_cleared: 1 });
			expect(
				await count(
					'public.sms_messages',
					`message_content = '' AND template_vars IS NULL AND status = 'delivered'`
				)
			).toBe(1);
			expect(await count('public.sms_messages', `message_content <> ''`)).toBe(2);
			expect(
				await count(
					'public.scheduled_sms_messages',
					`status = 'sent' AND message_content = '' AND event_title IS NULL AND event_details IS NULL`
				)
			).toBe(1);
			expect(
				await count('public.scheduled_sms_messages', `event_title = 'Board meeting'`)
			).toBe(1);
		});
	});

	describe('calendar', () => {
		const analysis = async (
			completedDaysAgo: number | null,
			createdDaysAgo: number,
			status: string
		) =>
			scalar<string>(
				`INSERT INTO public.calendar_analyses (status, completed_at, created_at)
				VALUES ($3, CASE WHEN $1::int IS NULL THEN NULL ELSE now() - make_interval(days => $1::int) END,
					now() - make_interval(days => $2::int))
				RETURNING id AS value`,
				[completedDaysAgo, createdDaysAgo, status]
			);
		const suggestion = (
			analysisId: string,
			status: string,
			changedDaysAgo: number | null,
			eventIds: string[]
		) =>
			scalar<string>(
				`INSERT INTO public.calendar_project_suggestions (analysis_id, status, status_changed_at, calendar_event_ids)
				VALUES ($1, $2, CASE WHEN $3::int IS NULL THEN NULL ELSE now() - make_interval(days => $3::int) END, $4)
				RETURNING id AS value`,
				[analysisId, status, changedDaysAgo, eventIds]
			);
		const event = (
			analysisId: string,
			suggestionId: string | null,
			eventId: string,
			createdDaysAgo: number
		) =>
			scalar<string>(
				`INSERT INTO public.calendar_analysis_events
					(analysis_id, suggestion_id, calendar_id, calendar_event_id, event_title, event_start, event_end, created_at)
				VALUES ($1, $2, 'primary', $3, 'Weekly site walk', now(), now() + interval '1 hour',
					now() - make_interval(days => $4::int))
				RETURNING id AS value`,
				[analysisId, suggestionId, eventId, createdDaysAgo]
			);

		it('analysis events: deleted with their suggestion, never kept past 30 days; analyses and suggestions: 30 days after the decision or completion', async () => {
			const decidedLongAgo = await analysis(40, 40, 'completed');
			const decidedRecently = await analysis(40, 40, 'completed');
			const neverDecided = await analysis(40, 40, 'completed');
			await analysis(null, 40, 'failed');
			const recent = await analysis(2, 2, 'completed');
			const accepted = await suggestion(decidedLongAgo, 'accepted', 35, ['e-accepted']);
			const rejected = await suggestion(decidedRecently, 'rejected', 10, ['e-rejected']);
			const pending = await suggestion(neverDecided, 'pending', null, ['e-pending']);
			const young = await suggestion(recent, 'pending', null, ['e-young']);
			await event(decidedLongAgo, accepted, 'e-accepted', 40);
			// The suggestion is kept (decided 10 days ago), but its events hit the 30-day ceiling.
			await event(decidedRecently, rejected, 'e-rejected', 31);
			// Young enough for the events sweep; goes by cascade with its suggestion.
			await event(neverDecided, pending, 'e-pending', 20);
			const kept = await event(recent, young, 'e-young', 2);

			const [events] = await drain('cleanup_privacy_calendar_analysis_events');
			expect(events).toEqual({ calendar_analysis_events_deleted: 2 });
			expect(await count('public.calendar_analysis_events')).toBe(2);

			const [analyses] = await drain('cleanup_privacy_calendar_analyses');
			expect(analyses).toEqual({
				calendar_suggestions_deleted: 2,
				calendar_analyses_deleted: 3
			});
			const remaining = (await sql(`SELECT id FROM public.calendar_analyses`)).rows
				.map((row) => row.id)
				.sort();
			expect(remaining).toEqual([decidedRecently, recent].sort());
			expect(await count('public.calendar_project_suggestions')).toBe(2);
			const keptEvents = (await sql(`SELECT id FROM public.calendar_analysis_events`)).rows;
			expect(keptEvents.map((row) => row.id)).toEqual([kept]);
		});

		it('analysis events: only title and time columns exist, and every row backs a suggestion', async () => {
			const columns = (
				await sql(
					`SELECT column_name FROM information_schema.columns
					WHERE table_schema = 'public' AND table_name = 'calendar_analysis_events'`
				)
			).rows.map((row) => row.column_name);
			expect(columns).toEqual(
				expect.arrayContaining(['event_title', 'event_start', 'event_end'])
			);
			for (const dropped of ['event_description', 'event_location', 'attendee_emails']) {
				expect(columns).not.toContain(dropped);
			}
			expect(
				await scalar<string>(
					`SELECT confdeltype AS value FROM pg_constraint
					WHERE conrelid = 'public.calendar_analysis_events'::regclass
						AND conname = 'calendar_analysis_events_suggestion_id_fkey'`
				)
			).toBe('c');

			const analysisId = await analysis(1, 1, 'completed');
			await expect(event(analysisId, null, 'e-orphan', 0)).rejects.toThrow(/suggestion_id/);
		});

		it('minimal-events migration: deletes unlinked rows and drops the content columns', async () => {
			// Rebuild the pre-migration shape, seed legacy rows, then apply the file again.
			await sql(`ALTER TABLE public.calendar_analysis_events
				ADD COLUMN event_description text,
				ADD COLUMN event_location text,
				ADD COLUMN attendee_emails text[],
				ALTER COLUMN suggestion_id DROP NOT NULL`);
			const analysisId = await analysis(1, 1, 'completed');
			const cited = await suggestion(analysisId, 'pending', null, ['e-cited']);
			const linked = await event(analysisId, cited, 'e-cited', 0);
			const legacy = await event(analysisId, null, 'e-legacy', 0);
			const uncited = await event(analysisId, cited, 'e-uncited', 0);
			await sql(
				`UPDATE public.calendar_analysis_events
				SET event_description = 'Gate code 4412', event_location = '12 Pier Rd',
					attendee_emails = ARRAY['guest@example.com']
				WHERE id = ANY ($1::uuid[])`,
				[[linked, legacy, uncited]]
			);

			await sql(readFileSync(resolve(REPOSITORY_ROOT, CALENDAR_MIGRATION), 'utf8'));

			const rows = (
				await sql(`SELECT id FROM public.calendar_analysis_events WHERE analysis_id = $1`, [
					analysisId
				])
			).rows.map((row) => row.id);
			expect(rows).toEqual([linked]);
			expect(
				await count(
					'information_schema.columns',
					`table_schema = 'public' AND table_name = 'calendar_analysis_events'
					AND column_name IN ('event_description', 'event_location', 'attendee_emails')`
				)
			).toBe(0);

			await sql(`DELETE FROM public.calendar_project_suggestions WHERE id = $1`, [cited]);
			expect(await count('public.calendar_analysis_events', `id = '${linked}'`)).toBe(0);
		});

		it('OAuth states: expiry + 1 day', async () => {
			for (const table of ['public.calendar_oauth_states', 'public.email_oauth_states']) {
				await sql(
					`INSERT INTO ${table} (expires_at) VALUES (now() - interval '25 hours'), (now() - interval '1 hour')`
				);
			}
			const [first] = await drain('cleanup_privacy_oauth_states');
			expect(first).toEqual({
				calendar_oauth_states_deleted: 1,
				email_oauth_states_deleted: 1
			});
			expect(await count('public.calendar_oauth_states')).toBe(1);
			expect(await count('public.email_oauth_states')).toBe(1);
		});
	});

	describe('Gmail and connectors', () => {
		it('email_scan_checks: global sweep at expiry', async () => {
			await sql(
				`INSERT INTO public.email_scan_checks (user_id, connection_id, scope_key, message_key, expires_at) VALUES
					(gen_random_uuid(), gen_random_uuid(), 'project:1:v1', repeat('a', 32), now() - interval '1 minute'),
					(gen_random_uuid(), gen_random_uuid(), 'project:1:v1', repeat('b', 32), now() + interval '1 day')`
			);
			await drain('cleanup_privacy_email_scan_checks');
			expect(await count('public.email_scan_checks')).toBe(1);
		});

		it('access audits: 180 days in all four tables', async () => {
			const tables = [
				'public.email_access_audit_events',
				'public.calendar_access_audit_events',
				'public.profile_access_audit',
				'public.user_contact_access_audit'
			];
			for (const table of tables) {
				await sql(
					`INSERT INTO ${table} (created_at) VALUES (now() - interval '181 days'), (now() - interval '179 days')`
				);
			}
			const [first] = await drain('cleanup_privacy_access_audits');
			expect(Object.values(first ?? {})).toEqual([1, 1, 1, 1]);
			for (const table of tables) expect(await count(table)).toBe(1);
		});

		it('email relevance: a run and every child row 30 days after it ends, without tripping review triggers', async () => {
			const seedRun = async (completedDaysAgo: number) => {
				const run = await scalar<string>(
					`INSERT INTO public.email_relevance_scan_runs (expires_at, created_at, completed_at)
					VALUES (now() - make_interval(days => $1::int) + interval '1 hour',
						now() - make_interval(days => $1::int) - interval '1 hour',
						now() - make_interval(days => $1::int))
					RETURNING id AS value`,
					[completedDaysAgo]
				);
				const scope = await scalar<string>(
					`INSERT INTO public.email_relevance_scan_connections (run_id) VALUES ($1) RETURNING id AS value`,
					[run]
				);
				const observation = await scalar<string>(
					`INSERT INTO public.email_relevance_message_observations (run_id, connection_scope_id) VALUES ($1, $2) RETURNING id AS value`,
					[run, scope]
				);
				await sql(
					`INSERT INTO public.email_relevance_project_candidates (observation_id) VALUES ($1)`,
					[observation]
				);
				const sample = await scalar<string>(
					`INSERT INTO public.email_relevance_review_samples (run_id, connection_scope_id, source_observation_id)
					VALUES ($1, $2, $3) RETURNING id AS value`,
					[run, scope, observation]
				);
				await sql(
					`INSERT INTO public.email_relevance_adjudications (run_id, sample_id) VALUES ($1, $2)`,
					[run, sample]
				);
				return run;
			};
			const old = await seedRun(31);
			const young = await seedRun(10);

			const [first] = await drain('cleanup_privacy_email_relevance_runs');

			expect(first).toEqual({
				email_relevance_samples_deleted: 1,
				email_relevance_observations_deleted: 1,
				email_relevance_runs_deleted: 1
			});
			for (const table of [
				'public.email_relevance_scan_connections',
				'public.email_relevance_message_observations',
				'public.email_relevance_review_samples',
				'public.email_relevance_adjudications'
			]) {
				expect(await count(table, `run_id = '${old}'`)).toBe(0);
				expect(await count(table, `run_id = '${young}'`)).toBe(1);
			}
			expect(await count('public.email_relevance_project_candidates')).toBe(1);
		});

		it('agent OAuth: codes and access tokens at expiry/revocation + 7 d; refresh tokens only at expiry + 7 d', async () => {
			await sql(
				`INSERT INTO public.agent_oauth_authorization_codes (expires_at) VALUES
					(now() - interval '8 days'), (now() - interval '1 day')`
			);
			await sql(
				`INSERT INTO public.agent_oauth_access_tokens (expires_at, revoked_at) VALUES
					(now() - interval '8 days', NULL),
					(now() + interval '20 days', now() - interval '8 days'),
					(now() + interval '20 days', now() - interval '1 day'),
					(now() + interval '1 hour', NULL)`
			);
			const expiredRefresh = await scalar<string>(
				`INSERT INTO public.agent_oauth_refresh_tokens (expires_at) VALUES (now() - interval '8 days') RETURNING id AS value`
			);
			const rotated = await scalar<string>(
				`INSERT INTO public.agent_oauth_refresh_tokens (expires_at, revoked_at, used_at, rotated_from_id)
				VALUES (now() + interval '20 days', now() - interval '30 days', now() - interval '30 days', $1)
				RETURNING id AS value`,
				[expiredRefresh]
			);

			const [first] = await drain('cleanup_privacy_agent_oauth_artifacts');

			expect(first).toEqual({
				authorization_codes_deleted: 1,
				access_tokens_deleted: 2,
				refresh_tokens_deleted: 1
			});
			expect(await count('public.agent_oauth_authorization_codes')).toBe(1);
			expect(await count('public.agent_oauth_access_tokens')).toBe(2);
			// The long-revoked but unexpired rotated token stays for reuse detection.
			expect(
				await count(
					'public.agent_oauth_refresh_tokens',
					`id = '${rotated}' AND rotated_from_id IS NULL`
				)
			).toBe(1);
		});
	});

	describe('web', () => {
		it('native search cache: expiry + 1 day', async () => {
			await sql(
				`INSERT INTO public.native_search_cache (cache_key, response, expires_at) VALUES
					('old', '{"results":["x"]}', now() - interval '25 hours'),
					('live', '{"results":["y"]}', now() - interval '1 hour')`
			);
			await drain('cleanup_privacy_native_search_cache');
			expect((await sql(`SELECT cache_key FROM public.native_search_cache`)).rows).toEqual([
				{ cache_key: 'live' }
			]);
		});

		it('web pages: stale visits with their versions and chunks; superseded versions of live pages', async () => {
			const page = async (url: string, lastVisitedDaysAgo: number) =>
				scalar<string>(
					`INSERT INTO public.web_page_visits (url, last_visited_at) VALUES ($1, now() - make_interval(days => $2::int)) RETURNING id AS value`,
					[url, lastVisitedDaysAgo]
				);
			const version = async (visit: string, createdDaysAgo: number) => {
				const id = await scalar<string>(
					`INSERT INTO public.web_page_versions (web_page_visit_id, content, created_at)
					VALUES ($1, 'page text', now() - make_interval(days => $2::int)) RETURNING id AS value`,
					[visit, createdDaysAgo]
				);
				await sql(
					`INSERT INTO public.web_page_evidence_chunks (page_version_id, content) VALUES ($1, 'chunk')`,
					[id]
				);
				return id;
			};
			const stale = await page('https://stale.example', 31);
			const staleCurrent = await version(stale, 31);
			await sql(`UPDATE public.web_page_visits SET current_version_id = $2 WHERE id = $1`, [
				stale,
				staleCurrent
			]);
			const live = await page('https://live.example', 1);
			const superseded = await version(live, 40);
			const liveCurrent = await version(live, 40);
			await sql(`UPDATE public.web_page_visits SET current_version_id = $2 WHERE id = $1`, [
				live,
				liveCurrent
			]);

			const [first] = await drain('cleanup_privacy_web_page_evidence');

			expect(first).toEqual({ web_page_visits_deleted: 1, web_page_versions_deleted: 1 });
			expect((await sql(`SELECT id FROM public.web_page_versions`)).rows).toEqual([
				{ id: liveCurrent }
			]);
			expect(
				await count(
					'public.web_page_evidence_chunks',
					`page_version_id IN ('${staleCurrent}', '${superseded}')`
				)
			).toBe(0);
			expect(
				await count('public.web_page_evidence_chunks', `page_version_id = '${liveCurrent}'`)
			).toBe(1);
		});
	});

	describe('storage candidates', () => {
		it('chat-temp: only unattached uploads older than 24 hours are listed', async () => {
			const user = '11111111-1111-4111-8111-111111111111';
			const object = (bucket: string, name: string, hoursAgo: number) =>
				sql(
					`INSERT INTO storage.objects (bucket_id, name, created_at, updated_at)
					VALUES ($1, $2, now() - make_interval(hours => $3::int), now() - make_interval(hours => $3::int))`,
					[bucket, name, hoursAgo]
				);
			await object(
				'onto-assets',
				`users/${user}/chat-temp/aaaaaaaa-0000-4000-8000-000000000001/original.png`,
				25
			);
			await object(
				'onto-assets',
				`users/${user}/chat-temp/aaaaaaaa-0000-4000-8000-000000000002/original.png`,
				25
			);
			await object(
				'onto-assets',
				`users/${user}/chat-temp/aaaaaaaa-0000-4000-8000-000000000003/original.png`,
				1
			);
			await object('onto-assets', `projects/p1/assets/a1/original.png`, 100);
			await object(
				'voice_notes',
				`users/${user}/chat-temp/aaaaaaaa-0000-4000-8000-000000000004/original.png`,
				100
			);
			await sql(
				`INSERT INTO public.chat_message_attachments (user_id, attachment_kind, metadata)
				VALUES ($1, 'temporary_file', '{"temporary_attachment_id":"aaaaaaaa-0000-4000-8000-000000000002"}')`,
				[user]
			);

			const { rows } = await service.query(
				'SELECT object_name FROM public.list_privacy_chat_temp_orphans(100)'
			);

			expect(rows).toEqual([
				{
					object_name: `users/${user}/chat-temp/aaaaaaaa-0000-4000-8000-000000000001/original.png`
				}
			]);
		});

		it('brief-audio: claims 30-day-old objects and resets the brief so no player shows', async () => {
			const brief = (status: string, path: string | null) =>
				scalar<string>(
					`INSERT INTO public.ontology_daily_briefs (audio_status, audio_storage_path, audio_voice, audio_generated_at)
					VALUES ($1, $2, 'alloy', now() - interval '31 days') RETURNING id AS value`,
					[status, path]
				);
			const object = (name: string, daysAgo: number) =>
				sql(
					`INSERT INTO storage.objects (bucket_id, name, created_at, updated_at)
					VALUES ('brief-audio', $1, now() - make_interval(days => $2::int), now() - make_interval(days => $2::int))`,
					[name, daysAgo]
				);
			const ready = await brief('ready', 'u1/old.mp3');
			const regenerating = await brief('generating', 'u1/regen.mp3');
			const fresh = await brief('ready', 'u1/fresh.mp3');
			await object('u1/old.mp3', 31);
			await object('u1/regen.mp3', 31);
			await object('u1/fresh.mp3', 5);
			await object('u1/orphan.mp3', 40);

			const { rows } = await service.query(
				'SELECT object_name FROM public.claim_privacy_expired_brief_audio(100)'
			);

			expect(rows.map((row) => row.object_name).sort()).toEqual([
				'u1/old.mp3',
				'u1/orphan.mp3'
			]);
			const briefs = new Map(
				(
					await sql(
						`SELECT id, audio_status, audio_storage_path, audio_voice FROM public.ontology_daily_briefs`
					)
				).rows.map((row) => [row.id, row])
			);
			expect(briefs.get(ready)).toMatchObject({
				audio_status: 'none',
				audio_storage_path: null,
				audio_voice: null
			});
			expect(briefs.get(regenerating)?.audio_status).toBe('generating');
			expect(briefs.get(fresh)?.audio_storage_path).toBe('u1/fresh.mp3');
		});
	});

	it('the worker job drains every store end to end against this database', async () => {
		await sql(
			`INSERT INTO public.notification_logs (message, created_at)
			SELECT 'old', now() - interval '91 days' FROM generate_series(1, 25)`
		);
		await sql(
			`INSERT INTO storage.objects (bucket_id, name, created_at) VALUES
				('onto-assets', 'users/22222222-2222-4222-8222-222222222222/chat-temp/bbbbbbbb-0000-4000-8000-000000000001/original.png', now() - interval '2 days')`
		);
		const functionExists = async (name: string) =>
			(await count(
				'pg_proc',
				`proname = '${name}' AND pronamespace = 'public'::regnamespace`
			)) > 0;
		const pgClient: PrivacyRetentionClient = {
			async rpc(name, args = {}) {
				try {
					if (name.startsWith('list_') || name.startsWith('claim_')) {
						const { rows } = await service.query(
							`SELECT * FROM public.${name}(p_limit => $1)`,
							[args.p_limit]
						);
						return { data: rows, error: null };
					}
					const { rows } = await service.query(
						`SELECT public.${name}(p_batch_size => $1) AS data`,
						[args.p_batch_size]
					);
					return { data: rows[0].data, error: null };
				} catch (error) {
					return {
						data: null,
						error: {
							code: (error as { code?: string }).code,
							message: (error as Error).message
						}
					};
				}
			},
			storage: {
				from(bucket) {
					return {
						async remove(paths) {
							await sql(
								`DELETE FROM storage.objects WHERE bucket_id = $1 AND name = ANY($2)`,
								[bucket, paths]
							);
							return { data: paths, error: null };
						}
					};
				}
			}
		};

		const summary = await runPrivacyRetention({ client: pgClient, batchSize: 10 });
		const byName = new Map(summary.results.map((result) => [result.name, result]));

		// Only the privacy functions exist in this fixture; the pre-existing chat
		// cleanups fail in isolation (missing here, live in production).
		for (const task of PRIVACY_RETENTION_TASKS) {
			const result = byName.get(task.name);
			if (await functionExists(task.rpc)) {
				expect(result?.status, task.name).toBe('drained');
			} else {
				expect(result?.status, task.name).toBe('failed');
			}
		}
		expect(
			byName.get('cleanup_privacy_notification_logs')?.counts.notification_logs_deleted
		).toBe(25);
		expect(byName.get('cleanup_privacy_notification_logs')?.batches).toBe(4);
		// This upload plus the unattached one the chat-temp test left behind.
		expect(byName.get('chat_temp_images')?.counts['onto-assets_objects_removed']).toBe(2);
		expect(
			await count('storage.objects', `bucket_id = 'onto-assets' AND name LIKE 'users/2222%'`)
		).toBe(0);
	});
});
