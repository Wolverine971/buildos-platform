// apps/worker/tests/freshnessRadar.postgres.test.ts
//
// DISPOSABLE DATABASE ONLY. Tasker 88 Lane B end to end on real SQL: a
// socket-only local PostgreSQL (initdb) with the freshness radar fixture, the two
// 20260914 workflow migrations and the four radar migrations, plus test-local
// column-shaped stubs for the ontology tables the scanner reads. The scanner runs
// against a PostgREST-subset shim over one service_role connection, with the REAL
// shared helpers (verifyProjectSuggestionIntegrity, scoped fingerprints, inbox
// sync, attention budget, freshness retire/mark). Jev is scripted and the task
// gateway is a SQL stand-in; nothing here touches a hosted database or a model.
//
// The live scan's card payload is written (normalized) to
// tests/fixtures/freshness-card.v1.json for Lane C.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { JevDecider, JevDecisionResult, JevQuestionSet } from '@buildos/smart-llm';
import {
	applyProjectAttentionBudget,
	syncInboxItemForProjectSuggestion
} from '@buildos/shared-agent-ops/inbox-index';
import { computeProjectSuggestionFreshnessFingerprint } from '@buildos/shared-agent-ops';
import { verifyProjectSuggestionIntegrity } from '@buildos/shared-agent-ops/proposal-context';
import { parseFreshnessCardPayloadV1 } from '@buildos/shared-types';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildFreshnessScanContext } from '../src/workers/freshness-radar/context';
import { SupabaseFreshnessDataPort } from '../src/workers/freshness-radar/dataPort';
import { FRESHNESS_POLICY_V1 } from '../src/workers/freshness-radar/freshnessPolicy';
import {
	type FreshnessRadarDeps,
	createSharedInboxCleanupOps,
	processFreshnessRadarScanJob
} from '../src/workers/freshness-radar/signalJob';
import { availablePort, createPgSupabaseShim, postgresAvailable } from './helpers/workflowPostgres';

const describePostgres = postgresAvailable ? describe : describe.skip;
const REPO = resolve(__dirname, '../../..');
const CARD_FIXTURE = resolve(__dirname, 'fixtures/freshness-card.v1.json');
const SQL_FILES = [
	'supabase/tests/fixtures/freshness_radar_base.sql',
	'supabase/migrations/20260914203007_agentic_chat_workflow_v1_storage.sql',
	'supabase/migrations/20260914203008_agentic_chat_workflow_v1_dispatch_recovery.sql',
	'supabase/migrations/20260918200000_freshness_radar_ledger.sql',
	'supabase/migrations/20260918200100_freshness_radar_queue_type.sql',
	'supabase/migrations/20260918200200_freshness_radar_suggestion_inbox_columns.sql',
	'supabase/migrations/20260918200300_freshness_radar_turn_signal_trigger.sql'
];

// Column-shaped stubs (database.types.ts shapes) for tables the fixture lacks.
const ONTOLOGY_STUBS = `
SET client_min_messages = warning;
CREATE TABLE public.onto_tasks (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES public.onto_projects(id),
	title text NOT NULL, description text, type_key text NOT NULL DEFAULT 'task.default',
	state_key text NOT NULL DEFAULT 'todo' CHECK (state_key IN ('todo','in_progress','blocked','done')),
	priority int, start_at timestamptz, due_at timestamptz, completed_at timestamptz,
	props jsonb NOT NULL DEFAULT '{}', created_by uuid, facet_scale text, idempotency_key text,
	created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
	archived_at timestamptz, deleted_at timestamptz);
CREATE TABLE public.onto_goals (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES public.onto_projects(id),
	name text NOT NULL, description text, goal text, type_key text,
	state_key text NOT NULL DEFAULT 'active' CHECK (state_key IN ('draft','active','achieved','abandoned')),
	target_date timestamptz, props jsonb NOT NULL DEFAULT '{}', created_by uuid,
	created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz,
	archived_at timestamptz, deleted_at timestamptz, completed_at timestamptz);
CREATE TABLE public.onto_milestones (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES public.onto_projects(id),
	title text NOT NULL, description text, milestone text, type_key text,
	state_key text NOT NULL DEFAULT 'pending' CHECK (state_key IN ('pending','in_progress','completed','missed')),
	due_at timestamptz, props jsonb NOT NULL DEFAULT '{}', created_by uuid,
	created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz,
	archived_at timestamptz, deleted_at timestamptz, completed_at timestamptz);
CREATE TABLE public.onto_documents (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES public.onto_projects(id),
	title text NOT NULL, description text, content text, content_hash text, children jsonb, outline jsonb,
	type_key text NOT NULL DEFAULT 'document.default', state_key text NOT NULL DEFAULT 'draft',
	props jsonb NOT NULL DEFAULT '{}', created_by uuid,
	created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
	archived_at timestamptz, deleted_at timestamptz);
CREATE TABLE public.onto_edges (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL,
	src_kind text NOT NULL, src_id uuid NOT NULL, dst_kind text NOT NULL, dst_id uuid NOT NULL,
	rel text NOT NULL, props jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.onto_project_logs (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL, entity_type text NOT NULL,
	entity_id uuid NOT NULL, action text NOT NULL, before_data jsonb, after_data jsonb, changed_by uuid NOT NULL,
	changed_by_actor_id uuid, change_source text, chat_session_id uuid, agent_call_session_id uuid,
	external_agent_caller_id uuid, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.onto_task_assignees (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL, task_id uuid NOT NULL,
	assignee_actor_id uuid NOT NULL, assigned_by_actor_id uuid NOT NULL, source text NOT NULL DEFAULT 'manual',
	created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.task_calendar_events (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(), task_id uuid NOT NULL, user_id uuid NOT NULL,
	calendar_event_id text NOT NULL, calendar_id text NOT NULL, sync_status text NOT NULL DEFAULT 'synced',
	created_at timestamptz DEFAULT now());
-- Hosted Supabase grants service_role ALL on public tables by default privileges;
-- the fixture stubs (feature_flags, project_suggestions, inbox_items) do not.
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
`;

type Pg = { stop(): void; client: Client };

async function startDisposablePostgres(): Promise<Pg> {
	const tempDir = mkdtempSync('/tmp/buildos-freshness-radar-pg-');
	const dataDir = join(tempDir, 'data');
	const socketDir = join(tempDir, 'socket');
	const port = await availablePort();
	mkdirSync(socketDir);
	execFileSync(
		'initdb',
		['-D', dataDir, '--no-locale', '--encoding=UTF8', '--auth=trust', '--username=postgres'],
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
		throw new Error(`Disposable PostgreSQL failed to start:\n${readFileSync(log, 'utf8')}`, {
			cause: error
		});
	}
	const stubFile = join(tempDir, 'ontology_stubs.sql');
	writeFileSync(stubFile, ONTOLOGY_STUBS);
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
			...SQL_FILES.flatMap((file) => ['-f', resolve(REPO, file)]),
			'-f',
			stubFile
		],
		{ encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 }
	);
	const client = new Client({ host: socketDir, port, user: 'postgres', database: 'postgres' });
	await client.connect();
	return {
		client,
		stop() {
			void client.end().catch(() => undefined);
			spawnSync('pg_ctl', ['-D', dataDir, 'stop', '-m', 'fast'], { stdio: 'ignore' });
			rmSync(tempDir, { recursive: true, force: true });
		}
	};
}

/**
 * One connection, one statement at a time: the data port reads in parallel
 * (Promise.all), and pg deprecates overlapping client.query calls.
 */
function serialized(client: Client): Client {
	let tail: Promise<unknown> = Promise.resolve();
	const query = (...args: unknown[]) => {
		const run = tail.then(() =>
			(client.query as (...a: unknown[]) => Promise<unknown>)(...args)
		);
		tail = run.catch(() => undefined);
		return run;
	};
	return new Proxy(client, {
		get: (target, key) => (key === 'query' ? query : Reflect.get(target, key, target))
	});
}

// ---------------------------------------------------------------------------
// PostgREST subset over pg (select/insert/update/upsert + filters + rpc)
// ---------------------------------------------------------------------------

type PgError = { code: string; message: string };
type PgResult = { data: any; error: PgError | null };
type Clause = (params: unknown[]) => string;

const SAFE_IDENT = /^[a-z_][a-z0-9_]*$/;
function ident(value: string): string {
	if (!SAFE_IDENT.test(value)) throw new Error(`unsafe identifier ${value}`);
	return value;
}

/**
 * Just enough of supabase-js for the radar, its data port and the shared
 * helpers: every call becomes one parameterized SQL statement whose rows come
 * back through row_to_json (so timestamps and json read exactly as PostgREST
 * returns them). Undefined values are dropped, as supabase-js JSON-encodes them.
 */
function createRestShim(client: Client) {
	const rpcShim = createPgSupabaseShim(client);
	const udtCache = new Map<string, Map<string, string>>();
	async function udts(table: string) {
		const cached = udtCache.get(table);
		if (cached) return cached;
		const { rows } = await client.query(
			`SELECT column_name, udt_name FROM information_schema.columns
			 WHERE table_schema = 'public' AND table_name = $1`,
			[table]
		);
		const map = new Map(rows.map((row) => [row.column_name as string, row.udt_name as string]));
		udtCache.set(table, map);
		return map;
	}
	const encode = (udt: string | undefined, value: unknown) =>
		value === null ? null : udt === 'json' || udt === 'jsonb' ? JSON.stringify(value) : value;

	function from(table: string) {
		ident(table);
		let op: 'select' | 'insert' | 'update' | 'upsert' = 'select';
		let payload: Record<string, unknown> | Array<Record<string, unknown>> = {};
		let onConflict: string | null = null;
		let columns = '*';
		let returning = false;
		const where: Clause[] = [];
		const orders: string[] = [];
		let limit = '';

		const filter = (column: string, sql: (placeholder: string) => string, value: unknown) => {
			ident(column);
			where.push((params) => {
				params.push(value);
				return sql(`$${params.length}`);
			});
		};

		async function run(mode: 'many' | 'single' | 'maybe'): Promise<PgResult> {
			try {
				const types = await udts(table);
				const params: unknown[] = [];
				const projection = columns
					.split(',')
					.map((column) => column.trim())
					.filter(Boolean)
					.map((column) => (column === '*' ? '*' : ident(column)))
					.join(', ');
				const whereSql = () =>
					where.length
						? ` WHERE ${where.map((clause) => clause(params)).join(' AND ')}`
						: '';
				let sql: string;
				if (op === 'select') {
					const filters = whereSql();
					const order = orders.length ? ` ORDER BY ${orders.join(', ')}` : '';
					sql = `SELECT row_to_json(r) AS data FROM (SELECT ${projection} FROM public.${table}${filters}${order}${limit}) r`;
				} else if (op === 'update') {
					const patch = payload as Record<string, unknown>;
					const sets = Object.keys(patch)
						.filter((column) => patch[column] !== undefined)
						.map((column) => {
							params.push(encode(types.get(column), patch[column]));
							return `${ident(column)} = $${params.length}`;
						});
					sql = `WITH r AS (UPDATE public.${table} SET ${sets.join(', ')}${whereSql()} RETURNING ${projection}) SELECT row_to_json(r) AS data FROM r`;
				} else {
					const rows = Array.isArray(payload) ? payload : [payload];
					const keys = [
						...new Set(
							rows.flatMap((row) =>
								Object.keys(row).filter((key) => row[key] !== undefined)
							)
						)
					];
					const values = rows.map(
						(row) =>
							`(${keys
								.map((key) => {
									if (row[key] === undefined) return 'DEFAULT';
									params.push(encode(types.get(key), row[key]));
									return `$${params.length}`;
								})
								.join(', ')})`
					);
					const conflict =
						op === 'upsert' && onConflict
							? ` ON CONFLICT (${onConflict
									.split(',')
									.map((column) => ident(column.trim()))
									.join(', ')}) DO UPDATE SET ${keys
									.map((key) => `${ident(key)} = EXCLUDED.${key}`)
									.join(', ')}`
							: '';
					sql = `WITH r AS (INSERT INTO public.${table} (${keys.map(ident).join(', ')}) VALUES ${values.join(', ')}${conflict} RETURNING ${projection}) SELECT row_to_json(r) AS data FROM r`;
				}
				const { rows } = await client.query(sql, params);
				const data = rows.map((row) => row.data);
				if (op !== 'select' && !returning) return { data: null, error: null };
				if (mode === 'many') return { data, error: null };
				if (data.length > 1)
					return { data: null, error: { code: 'PGRST116', message: 'multiple rows' } };
				if (mode === 'single' && !data.length)
					return { data: null, error: { code: 'PGRST116', message: 'no rows' } };
				return { data: data[0] ?? null, error: null };
			} catch (error) {
				const pgError = error as { code?: string; message?: string };
				return {
					data: null,
					error: {
						code: pgError.code ?? 'XX000',
						message: pgError.message ?? String(error)
					}
				};
			}
		}

		const chain: any = {
			select(cols = '*') {
				columns = cols;
				if (op !== 'select') returning = true;
				return chain;
			},
			insert(rows: Record<string, unknown> | Array<Record<string, unknown>>) {
				op = 'insert';
				payload = rows;
				return chain;
			},
			upsert(
				rows: Record<string, unknown> | Array<Record<string, unknown>>,
				options: { onConflict?: string } = {}
			) {
				op = 'upsert';
				payload = rows;
				onConflict = options.onConflict ?? null;
				return chain;
			},
			update(patch: Record<string, unknown>) {
				op = 'update';
				payload = patch;
				return chain;
			},
			eq: (column: string, value: unknown) => (
				filter(column, (p) => `${column} = ${p}`, value),
				chain
			),
			neq: (column: string, value: unknown) => (
				filter(column, (p) => `${column} <> ${p}`, value),
				chain
			),
			gt: (column: string, value: unknown) => (
				filter(column, (p) => `${column} > ${p}`, value),
				chain
			),
			gte: (column: string, value: unknown) => (
				filter(column, (p) => `${column} >= ${p}`, value),
				chain
			),
			lt: (column: string, value: unknown) => (
				filter(column, (p) => `${column} < ${p}`, value),
				chain
			),
			lte: (column: string, value: unknown) => (
				filter(column, (p) => `${column} <= ${p}`, value),
				chain
			),
			in: (column: string, values: unknown[]) => (
				filter(column, (p) => `${column}::text = ANY(${p}::text[])`, values.map(String)),
				chain
			),
			is(column: string, value: null) {
				if (value !== null) throw new Error('only IS NULL is supported');
				ident(column);
				where.push(() => `${column} IS NULL`);
				return chain;
			},
			not(column: string, operator: string, value: unknown) {
				if (operator === 'in') {
					const list = String(value)
						.replace(/^\(|\)$/g, '')
						.split(',')
						.filter(Boolean);
					filter(column, (p) => `NOT (${column}::text = ANY(${p}::text[]))`, list);
				} else if (operator === 'is' && value === null) {
					ident(column);
					where.push(() => `${column} IS NOT NULL`);
				} else throw new Error(`unsupported not(${operator})`);
				return chain;
			},
			order(column: string, options: { ascending?: boolean; nullsFirst?: boolean } = {}) {
				orders.push(
					`${ident(column)} ${options.ascending === false ? 'DESC' : 'ASC'} NULLS ${options.nullsFirst ? 'FIRST' : 'LAST'}`
				);
				return chain;
			},
			limit(value: number) {
				limit = ` LIMIT ${Math.max(0, Math.floor(value))}`;
				return chain;
			},
			single: () => run('single'),
			maybeSingle: () => run('maybe'),
			then: (
				onResult: (value: PgResult) => unknown,
				onError?: (reason: unknown) => unknown
			) => run('many').then(onResult, onError)
		};
		return chain;
	}

	return {
		from,
		rpc: (name: string, args: Record<string, unknown> = {}) => rpcShim.rpc(name, args)
	};
}

// ---------------------------------------------------------------------------
// Scenario (the same store as freshnessRadarWorker.test.ts, on real tables)
// ---------------------------------------------------------------------------

const USER = '11111111-1111-4111-8111-111111111111';
const ACTOR = '22222222-2222-4222-8222-222222222222';
const PROJECT = '33333333-3333-4333-8333-333333333333';
const SESSION = '44444444-4444-4444-8444-444444444444';
const SIGNAL = '55555555-5555-4555-8555-555555555555';
const RUN = '66666666-6666-4666-8666-666666666666';
const T_DECK = 'aaaaaaa1-0000-4000-8000-000000000001';
const T_VENUE = 'aaaaaaa1-0000-4000-8000-000000000002';
const T_CATERING = 'aaaaaaa1-0000-4000-8000-000000000003';
const G_OPEN = 'bbbbbbb1-0000-4000-8000-000000000001';
const M_SOFT = 'ccccccc1-0000-4000-8000-000000000001';
const D_PLAN = 'ddddddd1-0000-4000-8000-000000000001';
const D_START = 'ddddddd1-0000-4000-8000-000000000002';
const S_OLD = 'eeeeeee1-0000-4000-8000-000000000001';
const INBOX_OLD = 'fffffff1-0000-4000-8000-000000000001';
const JOB_ROW = '99999999-9999-4999-8999-999999999999';
const KNOWN_IDS = [
	USER,
	PROJECT,
	SESSION,
	SIGNAL,
	T_DECK,
	T_VENUE,
	T_CATERING,
	G_OPEN,
	M_SOFT,
	D_PLAN,
	S_OLD,
	INBOX_OLD
];
const NOW = new Date('2026-09-18T15:00:00.000Z');
const OLD = '2026-09-01T12:00:00.000Z';
const DUMP =
	'Quick update on the store. The investor deck is done and sent to Jen. The venue contract is now due Oct 3. Still waiting on the caterer quote.';

async function seed(client: Client) {
	const q = (sql: string, params: unknown[] = []) => client.query(sql, params);
	await q(`INSERT INTO auth.users (id) VALUES ($1)`, [USER]);
	await q(
		`INSERT INTO public.users (id, email, timezone) VALUES ($1, 'owner@example.test', 'America/New_York')`,
		[USER]
	);
	await q(
		`INSERT INTO public.onto_actors (id, kind, name, user_id, created_at) VALUES ($1, 'human', 'Owner', $2, '2026-01-01T00:00:00Z')`,
		[ACTOR, USER]
	);
	await q(
		`INSERT INTO public.onto_projects (id, name, description, created_by, state_key) VALUES ($1, 'Pop-up store', 'Open the pop-up store', $2, 'active')`,
		[PROJECT, ACTOR]
	);
	for (const feature of [
		'freshness_radar',
		'freshness_radar.surfaces',
		'freshness_radar.auto_apply',
		'freshness_radar.inbox_cleanup'
	]) {
		await q(
			`INSERT INTO public.feature_flags (user_id, feature_name, enabled) VALUES ($1, $2, true)`,
			[USER, feature]
		);
	}
	await q(
		`INSERT INTO public.chat_sessions (id, user_id, context_type, entity_id, updated_at) VALUES ($1, $2, 'project', $3, '2026-09-18T14:55:00Z')`,
		[SESSION, USER, PROJECT]
	);
	await q(
		`INSERT INTO public.chat_messages (session_id, user_id, role, content, message_type, created_at) VALUES
		 ($1, $2, 'user', $3, 'user_message', '2026-09-18T14:50:00Z'),
		 ($1, $2, 'assistant', 'The deck is done, noted.', 'assistant_message', '2026-09-18T14:51:00Z'),
		 ($1, $2, 'user', 'ok thanks', 'user_message', '2026-09-18T14:52:00Z')`,
		[SESSION, USER, DUMP]
	);
	await q(
		`INSERT INTO public.onto_tasks (id, project_id, title, state_key, due_at, created_at, updated_at) VALUES
		 ($1, $4, 'Investor deck', 'in_progress', NULL, $5, $5),
		 ($2, $4, 'Venue contract', 'todo', '2026-10-01T03:59:59Z', $5, $5),
		 ($3, $4, 'Caterer quote', 'todo', NULL, $5, $5)`,
		[T_DECK, T_VENUE, T_CATERING, PROJECT, OLD]
	);
	await q(
		`INSERT INTO public.onto_goals (id, project_id, name, state_key, target_date, created_at, updated_at) VALUES ($1, $2, 'Open the store', 'active', '2026-10-31T00:00:00Z', $3, $3)`,
		[G_OPEN, PROJECT, OLD]
	);
	await q(
		`INSERT INTO public.onto_milestones (id, project_id, title, state_key, due_at, created_at, updated_at) VALUES ($1, $2, 'Soft opening', 'pending', '2026-10-10T03:59:59Z', $3, $3)`,
		[M_SOFT, PROJECT, OLD]
	);
	await q(
		`INSERT INTO public.onto_documents (id, project_id, title, description, content, type_key, created_at, updated_at) VALUES
		 ($1, $3, 'Launch plan', 'Venue, catering and the investor deck timeline', 'Plan body', 'document.plan', $4, $4),
		 ($2, $3, 'Start here', 'Investor deck venue contract', NULL, 'document.context.project', $4, $4)`,
		[D_PLAN, D_START, PROJECT, OLD]
	);
	await q(
		`INSERT INTO public.onto_edges (project_id, src_kind, src_id, dst_kind, dst_id, rel) VALUES
		 ($1, 'goal', $2, 'task', $3, 'has_task'), ($1, 'goal', $2, 'task', $4, 'has_task'),
		 ($1, 'goal', $2, 'milestone', $5, 'has_milestone')`,
		[PROJECT, G_OPEN, T_DECK, T_VENUE, M_SOFT]
	);
	await q(
		`INSERT INTO public.project_loop_runs (id, project_id, user_id, status) VALUES ($1, $2, $3, 'completed')`,
		[RUN, PROJECT, USER]
	);
	await q(
		`INSERT INTO public.project_suggestions (id, run_id, project_id, kind, status, title, operations, created_at, updated_at)
		 VALUES ($1, $2, $3, 'task_conflict', 'pending', 'Resolve the investor deck overlap', $4, '2026-09-10T12:00:00Z', '2026-09-10T12:00:00Z')`,
		[
			S_OLD,
			RUN,
			PROJECT,
			JSON.stringify([
				{ tool: 'update_onto_task', args: { task_id: T_DECK, props: { x: 1 } } }
			])
		]
	);
	await q(
		`INSERT INTO public.inbox_items (id, source_type, source_ref_id, source_status, project_id, audience, status, title, risk_tier, created_at, updated_at)
		 VALUES ($1, 'project_suggestion', $2, 'pending', $3, 'project_members', 'pending', 'Resolve the investor deck overlap', 2, '2026-09-10T12:00:00Z', '2026-09-10T12:00:00Z')`,
		[INBOX_OLD, S_OLD, PROJECT]
	);
	await q(
		`INSERT INTO public.freshness_radar_signals (id, session_id, user_id, status, project_id_hints, first_turn_at, last_turn_at, due_at, max_due_at)
		 VALUES ($1, $2, $3, 'pending', ARRAY[$4]::uuid[], '2026-09-18T14:50:00Z', '2026-09-18T14:50:00Z', '2026-09-18T14:59:00Z', '2026-09-18T15:00:00Z')`,
		[SIGNAL, SESSION, USER, PROJECT]
	);
}

const choice = (options: string[], chosen: string, probability: number) => ({
	type: 'choice',
	choice: chosen,
	confidence: probability,
	probabilities: Object.fromEntries(
		options.map((option) => [
			option,
			option === chosen ? probability : (1 - probability) / (options.length - 1)
		])
	)
});

/**
 * Scripted Jev (no network): calm defaults, plus the store update: the deck is
 * done (P 0.97), the venue contract moved to Oct 3 (d1), the old review
 * suggestion is obsolete, and the goal reads at risk.
 */
function scriptedJev(): JevDecider & { requests: number } {
	const decider = {
		requests: 0,
		decide: async <Qs extends JevQuestionSet>(req: { state: unknown; questions: Qs }) => {
			decider.requests += 1;
			const entities = (
				(req.state as { entities?: Array<{ title: string }> }).entities ?? []
			).map((entity) => entity.title);
			const deck = entities.indexOf('Investor deck');
			const venue = entities.indexOf('Venue contract');
			const answers: Record<string, unknown> = {};
			for (const [key, question] of Object.entries(req.questions)) {
				const options = question.type === 'choice' ? Object.keys(question.criteria) : [];
				if (question.type === 'noul') answers[key] = { type: 'noul', noul: 0.05 };
				else if (question.type === 'choice')
					answers[key] = choice(
						options,
						options.includes('no_change_needed')
							? 'no_change_needed'
							: options.includes('none')
								? 'none'
								: options[0]!,
						0.9
					);
				else
					answers[key] = {
						type: 'score',
						score: 2,
						confidence: 0.8,
						probabilities: { '0': 0, '1': 0, '2': 1, '3': 0 }
					};
				if (key === 'status_news') answers[key] = { type: 'noul', noul: 0.97 };
				if (key === `stale_${deck}`) answers[key] = { type: 'noul', noul: 0.97 };
				if (key === `change_${deck}`) answers[key] = choice(options, 'mark_done', 0.96);
				if (key === `stale_${venue}`) answers[key] = { type: 'noul', noul: 0.8 };
				if (key === `change_${venue}`)
					answers[key] = choice(options, 'reschedule_due', 0.85);
				if (key === `date_${venue}`) answers[key] = choice(options, 'd1', 0.9);
				if (key === 'obsolete_0') answers[key] = { type: 'noul', noul: 0.95 };
				if (key === 'track_0')
					answers[key] = {
						type: 'score',
						score: 0.9,
						confidence: 0.8,
						probabilities: { '0': 0.2, '1': 0.7, '2': 0.1, '3': 0 }
					};
				if (key === 'evidence_0') answers[key] = { type: 'noul', noul: 0.9 };
			}
			const receipt = {
				modelRequested: 'typesafe/jev-1.13',
				modelUsed: 'typesafe/jev-1.13-20260917',
				requestId: 'gen-local',
				inputTokens: 1_000,
				outputTokens: 100,
				costUsd: 0.0002,
				durationMs: 420,
				requestBytes: 1,
				questionCount: Object.keys(req.questions).length,
				attempts: 1
			};
			return {
				ok: true,
				answers,
				receipt,
				rawResponse: { answers }
			} as unknown as JevDecisionResult<Qs>;
		}
	};
	return decider;
}

/** Replace DB-generated UUIDs with stable placeholders so the fixture is reproducible. */
function normalizeCard(card: unknown): unknown {
	const mapping = new Map<string, string>();
	const json = JSON.stringify(card).replace(
		/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g,
		(uuid) => {
			if (KNOWN_IDS.includes(uuid)) return uuid;
			if (!mapping.has(uuid))
				mapping.set(
					uuid,
					`00000000-0000-4000-8000-${String(mapping.size + 1).padStart(12, '0')}`
				);
			return mapping.get(uuid)!;
		}
	);
	return JSON.parse(json);
}

describePostgres('freshness radar on a disposable PostgreSQL', () => {
	let pg: Pg;
	let deps: FreshnessRadarDeps;
	let jev: ReturnType<typeof scriptedJev>;
	const gatewayCalls: Array<Record<string, unknown>> = [];

	beforeAll(async () => {
		pg = await startDisposablePostgres();
		await seed(pg.client); // as the superuser; the scan itself runs as service_role
		await pg.client.query('SET ROLE service_role');
		const sql = serialized(pg.client);
		const db = createRestShim(sql);
		jev = scriptedJev();
		deps = {
			db,
			port: new SupabaseFreshnessDataPort(db),
			jev,
			mode: 'live',
			model: 'typesafe/jev-1.13',
			policy: FRESHNESS_POLICY_V1,
			now: () => NOW,
			// SQL stand-in for runGatewayWriteOp (the real gateway needs the whole
			// ontology write stack). It writes the row the way the task updater does:
			// a civil due date is stored as the end of that day in the user's zone.
			runGateway: (async (params: { args?: Record<string, unknown> }) => {
				gatewayCalls.push(params as Record<string, unknown>);
				const args = params.args ?? {};
				const { rows } = await sql.query(
					`UPDATE public.onto_tasks SET
						state_key = COALESCE($2, state_key),
						due_at = CASE WHEN $3::text IS NULL THEN due_at
							ELSE (($3::date + 1)::timestamp AT TIME ZONE 'America/New_York') - interval '1 second' END,
						completed_at = CASE WHEN $2 = 'done' THEN clock_timestamp() ELSE completed_at END,
						updated_at = clock_timestamp()
					 WHERE id = $1 RETURNING row_to_json(onto_tasks) AS task`,
					[args.task_id, args.state_key ?? null, args.due_at ?? null]
				);
				return rows[0]
					? { ok: true, data: { task: rows[0].task } }
					: { ok: false, error: { code: 'NOT_FOUND', message: 'Task not found' } };
			}) as unknown as FreshnessRadarDeps['runGateway'],
			draftDeps: {
				verify: (client, input) =>
					verifyProjectSuggestionIntegrity(client as never, input) as never,
				fingerprint: (client, projectId, operations) =>
					computeProjectSuggestionFreshnessFingerprint(
						client as never,
						projectId,
						operations
					),
				syncInbox: (params) =>
					syncInboxItemForProjectSuggestion({
						supabase: params.supabase as never,
						suggestion: params.suggestion
					}),
				applyBudget: (params) =>
					applyProjectAttentionBudget({
						supabase: params.supabase as never,
						projectId: params.projectId
					})
			},
			inboxOps: createSharedInboxCleanupOps(PROJECT)
		};
	}, 120_000);

	afterAll(() => pg?.stop());

	const job = () =>
		({
			id: 'freshness_radar_scan_local',
			queueRowId: JOB_ROW,
			processingToken: null,
			correlationId: null,
			userId: USER,
			data: { signalId: SIGNAL, sessionId: SESSION, userId: USER },
			attempts: 1,
			signal: new AbortController().signal,
			updateProgress: async () => undefined,
			log: async () => undefined
		}) as never;

	const one = async (sql: string, params: unknown[] = []) =>
		(await pg.client.query(sql, params)).rows[0];

	it('does not replay the previous scan message or skip a later message in the same millisecond', async () => {
		const cursor = '2026-09-18T14:50:00.123456+00:00';
		const nextMessage = 'The caterer has now confirmed the quote and delivery for the opening.';
		await pg.client.query('BEGIN');
		try {
			await pg.client.query(
				`UPDATE public.chat_messages SET created_at = $1 WHERE session_id = $2 AND content = $3`,
				[cursor, SESSION, DUMP]
			);
			await pg.client.query(
				`INSERT INTO public.chat_messages (session_id, user_id, role, content, message_type, created_at)
				 VALUES ($1, $2, 'user', $3, 'user_message', '2026-09-18T14:50:00.123789+00:00')`,
				[SESSION, USER, nextMessage]
			);
			await pg.client.query(
				`INSERT INTO public.freshness_scans
				 (project_id, user_id, trigger, mode, status, info_cursor_at,
				  question_set_version, question_set_sha256, policy_version, policy)
				 VALUES ($1, $2, 'chat_turn', 'live', 'completed', $3, 'test', 'test', 'test', '{}')`,
				[PROJECT, USER, cursor]
			);
			const context = await buildFreshnessScanContext({
				port: deps.port,
				projectId: PROJECT,
				userId: USER,
				extraSessionIds: [SESSION],
				now: NOW,
				policy: FRESHNESS_POLICY_V1
			});
			expect(context.messages.map((message) => message.text)).toEqual([nextMessage]);
			expect(context.window.start).toBe(await deps.port.loadLastScanCursor(PROJECT, USER));
		} finally {
			await pg.client.query('ROLLBACK');
		}
	});

	it('runs a live scan end to end under the real constraints and helpers', async () => {
		const logs: string[] = [];
		const result = await processFreshnessRadarScanJob(
			{ ...(job() as object), log: async (line: string) => void logs.push(line) } as never,
			deps
		);
		expect(result, logs.join('\n')).toMatchObject({ success: true });
		expect(result.scans, logs.join('\n')).toEqual([
			{ projectId: PROJECT, scanId: expect.any(String), status: 'completed' }
		]);
		expect(jev.requests).toBe(3);

		const signal = await one(`SELECT * FROM public.freshness_radar_signals WHERE id = $1`, [
			SIGNAL
		]);
		expect(signal).toMatchObject({ status: 'completed', queue_job_id: JOB_ROW });

		const scan = await one(`SELECT * FROM public.freshness_scans`);
		expect(scan).toMatchObject({
			status: 'completed',
			mode: 'live',
			trigger: 'chat_turn',
			signal_id: SIGNAL,
			trigger_session_id: SESSION,
			jev_requests: 3,
			policy_version: 'freshness_policy_v1'
		});
		expect(new Date(scan.info_cursor_at).toISOString()).toBe('2026-09-18T14:50:00.000Z');
		expect(scan.counts).toMatchObject({
			auto_applied: 1,
			drafted: 1,
			retired: 1,
			bundle_operations: 1
		});

		// Auto-apply: the deck is done, the flag carries undo (the DB CHECK held).
		expect(gatewayCalls).toHaveLength(1);
		const task = await one(
			`SELECT state_key, updated_at FROM public.onto_tasks WHERE id = $1`,
			[T_DECK]
		);
		expect(task.state_key).toBe('done');
		const deck = await one(`SELECT * FROM public.freshness_flags WHERE subject_id = $1`, [
			T_DECK
		]);
		expect(deck).toMatchObject({
			disposition: 'auto_applied',
			applied_via: 'auto',
			status: 'open'
		});
		expect(new Date(deck.applied_after_updated_at).getTime()).toBe(task.updated_at.getTime());
		expect(deck.undo_operation).toMatchObject({
			kind: 'entity_field',
			operation: {
				tool: 'update_onto_task',
				args: { task_id: T_DECK, project_id: PROJECT, state_key: 'in_progress' }
			}
		});

		// Draft bundle: accepted by the REAL verifier, fingerprinted and indexed.
		const bundle = await one(
			`SELECT * FROM public.project_suggestions WHERE kind = 'freshness_update'`
		);
		expect(bundle).toMatchObject({
			run_id: null,
			freshness_scan_id: scan.id,
			status: 'pending',
			chat_session_id: SESSION,
			risk_tier: 1,
			reversible: true,
			title: 'Update 1 out-of-date item',
			operations: [
				{
					tool: 'update_onto_task',
					args: { task_id: T_VENUE, project_id: PROJECT, due_at: '2026-10-03' }
				}
			]
		});
		expect(bundle.source_fingerprint).toEqual(expect.any(String));
		const venue = await one(`SELECT * FROM public.freshness_flags WHERE subject_id = $1`, [
			T_VENUE
		]);
		expect(venue).toMatchObject({ disposition: 'drafted', suggestion_id: bundle.id });
		const bundleInbox = await one(`SELECT * FROM public.inbox_items WHERE source_ref_id = $1`, [
			bundle.id
		]);
		expect(bundleInbox).toMatchObject({
			source_type: 'project_suggestion',
			audience: 'project_members',
			status: 'pending',
			title: 'Update 1 out-of-date item'
		});
		expect(bundleInbox.source_status).toMatch(/^proposal_verified/);

		// Inbox cleanup through the shared H3 helper: source superseded, row retired.
		const retiredFlag = await one(
			`SELECT * FROM public.freshness_flags WHERE subject_kind = 'inbox_item'`
		);
		expect(retiredFlag).toMatchObject({
			disposition: 'retired',
			undo_operation: { kind: 'inbox_retire', suggestionId: S_OLD, inboxItemId: INBOX_OLD }
		});
		const retiredInbox = await one(`SELECT * FROM public.inbox_items WHERE id = $1`, [
			INBOX_OLD
		]);
		expect(retiredInbox).toMatchObject({
			status: 'expired',
			source_status: 'freshness_retired'
		});
		const retiredSource = await one(
			`SELECT status, result FROM public.project_suggestions WHERE id = $1`,
			[S_OLD]
		);
		expect(retiredSource.status).toBe('superseded');
		expect(JSON.stringify(retiredSource.result)).toContain(retiredFlag.id);

		// Start Here never reached the ledger; gauges were recorded.
		const subjects = (
			await pg.client.query(`SELECT subject_id FROM public.freshness_flags`)
		).rows.map((row) => row.subject_id);
		expect(subjects).not.toContain(D_START);
		const gauges = await one(`SELECT count(*)::int AS n FROM public.freshness_track_scores`);
		expect(gauges.n).toBeGreaterThan(0);

		// The card: one injected row, frozen key, payload round-trips the Lane A parser.
		const cards = (
			await pg.client.query(
				`SELECT * FROM public.chat_messages WHERE metadata->>'kind' = 'freshness_radar_card'`
			)
		).rows;
		expect(cards).toHaveLength(1);
		expect(cards[0].id).toBe(scan.card_message_id);
		expect(cards[0]).toMatchObject({
			role: 'assistant',
			message_type: 'assistant_message',
			user_id: USER,
			session_id: SESSION
		});
		expect(cards[0].metadata).toMatchObject({
			source: 'freshness_radar',
			kind: 'freshness_radar_card',
			freshness_scan_id: scan.id,
			idempotency_key: `freshness-scan:${scan.id}:card`
		});
		const card = parseFreshnessCardPayloadV1(cards[0].metadata.card);
		expect(card).not.toBeNull();
		expect(card!.bundle).toEqual({ suggestionId: bundle.id, operationCount: 1 });
		expect(card!.autoApplied).toEqual([
			{
				flagId: deck.id,
				entity: { kind: 'task', id: T_DECK, title: 'Investor deck' },
				summary: 'Mark done',
				undoableUntil: '2026-09-21T15:00:00.000Z'
			}
		]);
		expect(card!.inboxCleanup.retired).toEqual([
			{ flagId: retiredFlag.id, title: 'Resolve the investor deck overlap' }
		]);

		// Lane C handoff: a real payload, generated ids normalized for a stable diff.
		const normalized = normalizeCard(card);
		if (!existsSync(CARD_FIXTURE) || process.env.FRESHNESS_WRITE_CARD_FIXTURE === '1') {
			writeFileSync(CARD_FIXTURE, `${JSON.stringify(normalized, null, '\t')}\n`);
		}
		expect(JSON.parse(readFileSync(CARD_FIXTURE, 'utf8'))).toEqual(normalized);
		expect(parseFreshnessCardPayloadV1(normalized)).toEqual(normalized);
	});

	it('a replayed job is a no-op: one scan, one card, one bundle, one write', async () => {
		const result = await processFreshnessRadarScanJob(job(), deps);
		expect(result).toMatchObject({ success: true, skipped: 'signal_completed' });
		expect(
			await one(
				`SELECT (SELECT count(*) FROM public.freshness_scans)::int AS scans,
					(SELECT count(*) FROM public.chat_messages WHERE metadata->>'kind' = 'freshness_radar_card')::int AS cards,
					(SELECT count(*) FROM public.project_suggestions WHERE kind = 'freshness_update')::int AS bundles`
			)
		).toEqual({ scans: 1, cards: 1, bundles: 1 });
		expect(gatewayCalls).toHaveLength(1);
	});

	it('the frozen constraints refuse what the radar must never write', async () => {
		const scan = await one(`SELECT id FROM public.freshness_scans LIMIT 1`);
		const flag = (disposition: string) =>
			pg.client.query(
				`INSERT INTO public.freshness_flags (scan_id, project_id, user_id, subject_kind, subject_id, subject_title,
					subject_snapshot, question_set_version, probability, answers, disposition)
				 VALUES ($1, $2, $3, 'task', $4, 'Caterer quote', '{}', 'freshness_questions_v1', 0.9, '{}', $5)`,
				[scan.id, PROJECT, USER, T_CATERING, disposition]
			);
		await expect(flag('auto_applied')).rejects.toThrow(/freshness_flags_auto_has_undo/);
		await expect(flag('retired')).rejects.toThrow(/freshness_flags_retired_has_undo/);
		await expect(flag('auto_applying')).rejects.toThrow(
			/freshness_flags_disposition_check|check constraint/
		);
		// A second pending bundle for the project is refused.
		await expect(
			pg.client.query(
				`INSERT INTO public.project_suggestions (project_id, freshness_scan_id, kind, status, title)
				 VALUES ($1, $2, 'freshness_update', 'pending', 'Update 1 out-of-date item')`,
				[PROJECT, scan.id]
			)
		).rejects.toThrow(/project_suggestions_one_pending_freshness/);
	});
});
