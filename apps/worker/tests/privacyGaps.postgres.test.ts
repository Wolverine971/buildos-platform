// apps/worker/tests/privacyGaps.postgres.test.ts
//
// DISPOSABLE DATABASE ONLY. Runs migration 20260924190600_privacy_gaps.sql on a
// socket-only local PostgreSQL (initdb) with column-shaped stubs. Keys whose
// delete rule exists only in production use NO ACTION here, the strictest rule,
// so the notification cleanup must detach them itself. Proves the notification
// and Stripe webhook windows, the brain dump delete / hide / purge, and that the
// worker job schedules and drains every function the migration defines.
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

const MIGRATION = resolve(
	__dirname,
	'../../../supabase/migrations/20260924190600_privacy_gaps.sql'
);
const GAPS_TASKS = [
	'cleanup_privacy_notifications',
	'cleanup_privacy_webhook_events',
	'cleanup_privacy_soft_deleted_braindumps'
];

const postgresAvailable = ['initdb', 'pg_ctl', 'psql'].every(
	(command) => spawnSync(command, ['--version'], { stdio: 'ignore' }).status === 0
);
const describePostgres = postgresAvailable ? describe : describe.skip;

const FIXTURE = `
SET client_min_messages = warning;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
	SELECT (nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid
$$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

CREATE TYPE public.onto_braindump_status AS ENUM ('pending', 'processing', 'processed', 'failed');
CREATE TABLE public.onto_braindumps (
	id uuid PRIMARY KEY, user_id uuid NOT NULL, content text NOT NULL DEFAULT '',
	title text, topics text[], summary text,
	status public.onto_braindump_status NOT NULL DEFAULT 'processed',
	error_message text, metadata jsonb, processed_at timestamptz, chat_session_id uuid,
	created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.chat_sessions (
	id uuid PRIMARY KEY, user_id uuid NOT NULL, title text, auto_title text, chat_topics text[],
	summary text, context_type text NOT NULL DEFAULT 'global', entity_id uuid,
	message_count integer, status text NOT NULL DEFAULT 'active',
	created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
	last_message_at timestamptz);

CREATE TABLE public.notification_events (
	id uuid PRIMARY KEY, event_type text NOT NULL DEFAULT 'brief.completed',
	payload jsonb NOT NULL DEFAULT '{}', created_at timestamptz DEFAULT now());
CREATE TABLE public.notification_deliveries (
	id uuid PRIMARY KEY, event_id uuid REFERENCES public.notification_events(id),
	recipient_user_id uuid NOT NULL, channel text NOT NULL DEFAULT 'email',
	payload jsonb NOT NULL DEFAULT '{}', status text NOT NULL DEFAULT 'sent',
	created_at timestamptz DEFAULT now());
CREATE TABLE public.user_notifications (
	id uuid PRIMARY KEY, user_id uuid NOT NULL, title text NOT NULL, message text NOT NULL,
	type text NOT NULL DEFAULT 'info', read_at timestamptz, dismissed_at timestamptz,
	created_at timestamptz DEFAULT now(),
	delivery_id uuid REFERENCES public.notification_deliveries(id) ON DELETE SET NULL,
	event_id uuid REFERENCES public.notification_events(id) ON DELETE SET NULL);
CREATE TABLE public.notification_logs (
	id uuid PRIMARY KEY,
	notification_delivery_id uuid REFERENCES public.notification_deliveries(id),
	notification_event_id uuid REFERENCES public.notification_events(id),
	created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.notification_tracking_links (
	id uuid PRIMARY KEY,
	delivery_id uuid NOT NULL REFERENCES public.notification_deliveries(id),
	short_code text NOT NULL, destination_url text NOT NULL, created_at timestamptz DEFAULT now());
CREATE TABLE public.sms_messages (
	id uuid PRIMARY KEY,
	notification_delivery_id uuid REFERENCES public.notification_deliveries(id));
CREATE TABLE public.project_notification_batches (
	id uuid PRIMARY KEY,
	flushed_event_id uuid REFERENCES public.notification_events(id) ON DELETE SET NULL);
CREATE TABLE public.onto_comment_mentions (
	id uuid PRIMARY KEY,
	notification_id uuid REFERENCES public.user_notifications(id) ON DELETE SET NULL);

CREATE TABLE public.webhook_events (
	id uuid PRIMARY KEY, event_id text NOT NULL UNIQUE, event_type text NOT NULL DEFAULT 'invoice.paid',
	payload jsonb, status text NOT NULL DEFAULT 'processed',
	created_at timestamptz DEFAULT now(), processed_at timestamptz);
`;

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const USER = ID(9001);
const OTHER_USER = ID(9002);

async function availablePort(): Promise<number> {
	return new Promise((resolvePort, reject) => {
		const server = createServer();
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			const address = server.address();
			server.close(() =>
				typeof address === 'object' && address
					? resolvePort(address.port)
					: reject(new Error('no port'))
			);
		});
	});
}

describe('privacy gaps job wiring', () => {
	it('schedules every retention function the migration defines', () => {
		const defined = [
			...readFileSync(MIGRATION, 'utf8').matchAll(
				/CREATE OR REPLACE FUNCTION public\.((?:cleanup|list|claim)_privacy_[a-z_]+)\(/g
			)
		].map((match) => match[1]);
		expect(defined.sort()).toEqual([...GAPS_TASKS].sort());
		const scheduled = PRIVACY_RETENTION_TASKS.map((task) => task.rpc);
		expect(scheduled).toEqual(expect.arrayContaining(GAPS_TASKS));
		expect(new Set(scheduled).size).toBe(scheduled.length);
	});
});

describePostgres('migration 20260924190600: privacy gaps', () => {
	let tempDir = '';
	let dataDir = '';
	let socketDir = '';
	let port = 0;
	let client: Client;

	const sql = (text: string, params: unknown[] = []) => client.query(text, params);
	const exists = async (table: string, id: string) =>
		(await sql(`SELECT 1 FROM public.${table} WHERE id = $1`, [id])).rowCount === 1;
	const row = async (table: string, id: string) =>
		(await sql(`SELECT * FROM public.${table} WHERE id = $1`, [id])).rows[0];

	/** Runs one call as a signed-in user (or no user); returns its value or the SQLSTATE. */
	async function asUser(
		userId: string | null,
		text: string,
		params: unknown[]
	): Promise<{ data?: unknown; code?: string }> {
		await sql('BEGIN');
		try {
			await sql(`SELECT set_config('request.jwt.claims', $1, true)`, [
				userId ? JSON.stringify({ sub: userId }) : ''
			]);
			await sql('SET LOCAL ROLE authenticated');
			const { rows } = await sql(text, params);
			await sql('COMMIT');
			return { data: rows[0]?.data };
		} catch (error) {
			await sql('ROLLBACK');
			return { code: (error as { code?: string }).code };
		}
	}

	const pgClient: PrivacyRetentionClient = {
		async rpc(name, args = {}) {
			try {
				const { rows } = await sql(`SELECT public.${name}(p_batch_size => $1) AS data`, [
					args.p_batch_size
				]);
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
			from() {
				return { remove: async () => ({ data: [], error: null }) };
			}
		}
	};

	beforeAll(async () => {
		tempDir = mkdtempSync('/tmp/buildos-tasker103-gaps-pg-');
		dataDir = join(tempDir, 'data');
		socketDir = join(tempDir, 'socket');
		mkdirSync(socketDir);
		port = await availablePort();
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
		const log = join(tempDir, 'postgres.log');
		try {
			execFileSync(
				'pg_ctl',
				[
					'-D',
					dataDir,
					'-l',
					log,
					'-o',
					`-p ${port} -k ${socketDir} -c listen_addresses=''`,
					'-w',
					'start'
				],
				{ stdio: 'pipe' }
			);
		} catch (error) {
			throw new Error(
				`Disposable PostgreSQL failed to start:\n${readFileSync(log, 'utf8')}`,
				{ cause: error }
			);
		}
		client = new Client({ host: socketDir, port, user: 'postgres', database: 'postgres' });
		await client.connect();
		await sql(FIXTURE);
		await sql(readFileSync(MIGRATION, 'utf8'));

		// Notifications. E1/D1 are old; E2 is old but a recent delivery (D2) still
		// points at it; E3 is recent.
		await sql(`
			INSERT INTO public.notification_events (id, created_at) VALUES
				('${ID(1)}', now() - interval '100 days'),
				('${ID(2)}', now() - interval '100 days'),
				('${ID(3)}', now() - interval '10 days');
			INSERT INTO public.notification_deliveries (id, event_id, recipient_user_id, created_at) VALUES
				('${ID(11)}', '${ID(1)}', '${USER}', now() - interval '100 days'),
				('${ID(12)}', '${ID(2)}', '${USER}', now() - interval '10 days');
			INSERT INTO public.user_notifications
				(id, user_id, title, message, read_at, dismissed_at, delivery_id, event_id, created_at) VALUES
				('${ID(21)}', '${USER}', 'Brief ready', 'Your brief is ready', now() - interval '99 days', NULL, '${ID(11)}', '${ID(1)}', now() - interval '100 days'),
				('${ID(22)}', '${USER}', 'Unread', 'Never opened', NULL, NULL, '${ID(11)}', '${ID(1)}', now() - interval '100 days'),
				('${ID(23)}', '${USER}', 'Dismissed', 'Dismissed', NULL, now() - interval '95 days', NULL, NULL, now() - interval '100 days'),
				('${ID(24)}', '${USER}', 'Recent', 'Read recently', now(), NULL, NULL, NULL, now() - interval '10 days');
			INSERT INTO public.notification_logs (id, notification_delivery_id, notification_event_id) VALUES
				('${ID(31)}', '${ID(11)}', '${ID(1)}');
			INSERT INTO public.notification_tracking_links (id, delivery_id, short_code, destination_url) VALUES
				('${ID(41)}', '${ID(11)}', 'abc123', '/app/briefs/today');
			INSERT INTO public.sms_messages (id, notification_delivery_id) VALUES ('${ID(51)}', '${ID(11)}');
			INSERT INTO public.project_notification_batches (id, flushed_event_id) VALUES ('${ID(61)}', '${ID(1)}');
			INSERT INTO public.onto_comment_mentions (id, notification_id) VALUES ('${ID(71)}', '${ID(21)}');
		`);

		// Stripe webhook payloads.
		await sql(`
			INSERT INTO public.webhook_events (id, event_id, payload, created_at, processed_at) VALUES
				('${ID(81)}', 'evt_old', '{"customer_email": "a@example.com"}', now() - interval '91 days', now() - interval '91 days'),
				('${ID(82)}', 'evt_new', '{"customer_email": "b@example.com"}', now() - interval '10 days', NULL),
				('${ID(83)}', 'evt_undated', '{}', NULL, now() - interval '120 days');
		`);

		// Brain dumps: B1 live (deleted by the test), B2 someone else's,
		// B3 deleted 31 days ago, B4 deleted 5 days ago, B5 live.
		await sql(`
			INSERT INTO public.onto_braindumps (id, user_id, content, title, created_at) VALUES
				('${ID(101)}', '${USER}', 'call the landlord about the lease', 'Lease', now() - interval '3 days'),
				('${ID(102)}', '${OTHER_USER}', 'someone else''s thought', 'Other', now() - interval '3 days'),
				('${ID(103)}', '${USER}', 'old deleted thought', 'Old', now() - interval '60 days'),
				('${ID(104)}', '${USER}', 'recently deleted thought', 'Recent', now() - interval '20 days'),
				('${ID(105)}', '${USER}', 'a live idea', 'Idea', now() - interval '1 day');
			UPDATE public.onto_braindumps SET deleted_at = now() - interval '31 days' WHERE id = '${ID(103)}';
			UPDATE public.onto_braindumps SET deleted_at = now() - interval '5 days' WHERE id = '${ID(104)}';
		`);
	}, 60_000);

	afterAll(async () => {
		await client?.end().catch(() => undefined);
		if (dataDir)
			spawnSync('pg_ctl', ['-D', dataDir, 'stop', '-m', 'fast'], { stdio: 'ignore' });
		if (tempDir) rmSync(tempDir, { recursive: true, force: true });
	});

	it('lets only the owner delete a brain dump, and only once', async () => {
		const call = 'SELECT public.delete_my_braindump($1) AS data';
		expect(await asUser(USER, call, [ID(101)])).toEqual({ data: { deleted: true } });
		expect((await row('onto_braindumps', ID(101))).deleted_at).not.toBeNull();
		expect(await asUser(USER, call, [ID(101)])).toEqual({ code: 'P0002' });
		expect(await asUser(USER, call, [ID(102)])).toEqual({ code: 'P0002' });
		expect((await row('onto_braindumps', ID(102))).deleted_at).toBeNull();
		expect(await asUser(null, call, [ID(105)])).toEqual({ code: '42501' });
		const { rows } = await sql(`
			SELECT
				has_function_privilege('authenticated', 'public.delete_my_braindump(uuid)', 'EXECUTE') AS signed_in,
				has_function_privilege('anon', 'public.delete_my_braindump(uuid)', 'EXECUTE') AS anon,
				has_function_privilege('authenticated', 'public.cleanup_privacy_notifications(integer)', 'EXECUTE') AS cleanup_by_user,
				has_function_privilege('service_role', 'public.cleanup_privacy_notifications(integer)', 'EXECUTE') AS cleanup_by_service
		`);
		expect(rows[0]).toEqual({
			signed_in: true,
			anon: false,
			cleanup_by_user: false,
			cleanup_by_service: true
		});
	});

	it('leaves deleted brain dumps out of the History page, its selection and its counts', async () => {
		await sql(`SELECT set_config('request.jwt.claims', $1, false)`, [
			JSON.stringify({ sub: USER })
		]);
		const { rows } = await sql(
			`SELECT public.get_history_page_v1($1, 'braindumps', NULL, NULL, 50, 0, $2, 'braindump') AS page`,
			[USER, ID(101)]
		);
		await sql(`SELECT set_config('request.jwt.claims', '', false)`);
		const page = rows[0].page;
		expect(page.rows.map((item: { data: { id: string } }) => item.data.id)).toEqual([ID(105)]);
		expect(page.stats.totalBraindumps).toBe(1);
		expect(page.totalItems).toBe(1);
		expect(page.selectedRow).toBeNull();
	});

	it('drains the notification, webhook and brain dump windows through the worker job', async () => {
		const summary = await runPrivacyRetention({
			client: pgClient,
			tasks: PRIVACY_RETENTION_TASKS.filter((task) => GAPS_TASKS.includes(task.rpc)),
			batchSize: 1
		});
		const byName = new Map(summary.results.map((result) => [result.name, result]));
		for (const name of GAPS_TASKS) expect(byName.get(name)?.status, name).toBe('drained');
		expect(byName.get('cleanup_privacy_notifications')?.counts).toEqual({
			user_notifications_deleted: 2,
			notification_deliveries_deleted: 1,
			notification_tracking_links_deleted: 1,
			notification_events_deleted: 1
		});
		expect(byName.get('cleanup_privacy_webhook_events')?.counts).toEqual({
			webhook_events_deleted: 2
		});
		expect(byName.get('cleanup_privacy_soft_deleted_braindumps')?.counts).toEqual({
			onto_braindumps_deleted: 1
		});

		// Inbox: read and dismissed items older than 90 days go; unread and recent stay.
		expect(await exists('user_notifications', ID(21))).toBe(false);
		expect(await exists('user_notifications', ID(23))).toBe(false);
		expect(await row('user_notifications', ID(22))).toMatchObject({
			delivery_id: null,
			event_id: null
		});
		expect(await exists('user_notifications', ID(24))).toBe(true);
		expect((await row('onto_comment_mentions', ID(71))).notification_id).toBeNull();

		// Deliveries and events, with every reference detached or removed.
		expect(await exists('notification_deliveries', ID(11))).toBe(false);
		expect(await exists('notification_deliveries', ID(12))).toBe(true);
		expect(await exists('notification_tracking_links', ID(41))).toBe(false);
		expect((await row('sms_messages', ID(51))).notification_delivery_id).toBeNull();
		expect(await row('notification_logs', ID(31))).toMatchObject({
			notification_delivery_id: null,
			notification_event_id: null
		});
		expect(await exists('notification_events', ID(1))).toBe(false);
		expect(await exists('notification_events', ID(2))).toBe(true);
		expect(await exists('notification_events', ID(3))).toBe(true);
		expect((await row('project_notification_batches', ID(61))).flushed_event_id).toBeNull();

		// Stripe payloads.
		expect(await exists('webhook_events', ID(81))).toBe(false);
		expect(await exists('webhook_events', ID(82))).toBe(true);
		expect(await exists('webhook_events', ID(83))).toBe(false);

		// Brain dumps: erased 30 days after deletion, not before.
		expect(await exists('onto_braindumps', ID(103))).toBe(false);
		expect(await exists('onto_braindumps', ID(104))).toBe(true);
		expect(await exists('onto_braindumps', ID(101))).toBe(true);
		expect(await exists('onto_braindumps', ID(105))).toBe(true);
	});
});
