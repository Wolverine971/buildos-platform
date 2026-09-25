// apps/worker/scripts/freshness-radar-backtest.ts
//
// Jev freshness radar backtest (Tasker 88, plan section 7). READ-ONLY.
//
//   pnpm --filter @buildos/worker backtest:freshness [options]
//
// Safety (plan section 7, "Safety"):
// - Dry run by default: without --execute nothing is read from any database and
//   no model is called; the read plan is printed and the script exits.
// - A database run needs all three: FRESHNESS_BACKTEST_DJ_OK=yes,
//   --confirm DJ-OK:<today's date> and --execute. So does --jev live.
// - The Supabase client is wrapped in a read-only proxy that throws on insert,
//   update, upsert, delete and every RPC.
// - The only path to a hosted database is the URL passed with --db-url (key in
//   FRESHNESS_BACKTEST_SUPABASE_KEY). The worker's own SUPABASE_* env is never read.
// - Output goes only to tmp/freshness-backtest/<ts>/ (gitignored). Message text
//   and evidence excerpts are redacted unless --include-text.
// - --fixture <json> replays a local dataset file fully offline (no opt-in).
//
// Replay runs the SAME stages as live: buildFreshnessScanContext over an as-of
// FreshnessDataPort (current rows with later onto_project_logs reversed), then
// planScanRequests and decideScan from scanStages.ts. Jev modes: live (cached
// by request SHA-256), cache, off. Scans are all-or-nothing, like live.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { JevClient, type JevDecider, type JevQuestionSet } from '@buildos/smart-llm';
import {
	type AnswerMap,
	type EntityDecision,
	type InboxDecision,
	rankCardDecisions
} from '../src/workers/freshness-radar/combine';
import { buildFreshnessScanContext, entityKey } from '../src/workers/freshness-radar/context';
import type {
	FreshnessDataPort,
	FreshnessDocumentRow,
	FreshnessEdgeRow,
	FreshnessGoalRow,
	FreshnessInboxRow,
	FreshnessLogRow,
	FreshnessMessageRow,
	FreshnessMilestoneRow,
	FreshnessOpenEntities,
	FreshnessPriorFlagRow,
	FreshnessProjectRow,
	FreshnessSuggestionRow,
	FreshnessTaskRow,
	FreshnessTurnRow
} from '../src/workers/freshness-radar/dataPort';
import { storedCivilDate } from '../src/workers/freshness-radar/dates';
import {
	FRESHNESS_POLICY_V1,
	type FreshnessPolicyV1,
	readFreshnessRadarJevModel
} from '../src/workers/freshness-radar/freshnessPolicy';
import {
	type FreshnessJevRequest,
	freshnessRequestSha256
} from '../src/workers/freshness-radar/questions';
import {
	type ScanRequestName,
	applyTargeting,
	decideScan,
	namespaceAnswers,
	planScanRequests,
	planTargeting
} from '../src/workers/freshness-radar/scanStages';

const REPO_ROOT = resolve(__dirname, '../../..');
const DAY_MS = 86_400_000;
/** Signal debounce, mirroring enqueue_freshness_radar_signal_v1. */
const SIGNAL_QUIET_MS = 60_000;
const SIGNAL_MAX_MS = 10 * 60_000;
const SIGNAL_PROJECT_LOOKBACK_MS = 5 * 60_000;
const SIGNAL_MIN_REQUEST_CHARS = 40;

// ---------------------------------------------------------------------------
// CLI and the triple opt-in
// ---------------------------------------------------------------------------

export type JevMode = 'live' | 'cache' | 'off';

export type BacktestArgs = {
	execute: boolean;
	confirm: string | null;
	userId: string | null;
	from: string | null;
	to: string | null;
	projectIds: string[];
	jev: JevMode;
	cacheDir: string | null;
	includeText: boolean;
	ledger: boolean;
	fixture: string | null;
	dbUrl: string | null;
	outDir: string | null;
	horizonDays: number;
	model: string;
	errors: string[];
};

export const BACKTEST_USAGE = `Usage: pnpm --filter @buildos/worker backtest:freshness [options]

  --fixture <file.json>     Replay a local dataset file (offline; no opt-in needed)
  --user <uuid>             The user whose turns are replayed (database runs)
  --from <ISO> --to <ISO>   Replay window (default: the last 14 days)
  --project <uuid>          Limit to a project (repeatable)
  --jev off|cache|live      Jev answers (default cache; live needs the opt-in)
  --cache-dir <dir>         Jev cache (default tmp/freshness-backtest/jev-cache)
  --horizon-days <n>        Label horizon (default 7)
  --ledger                  Calibrate from live ledger outcomes instead of replaying
  --include-text            Keep message text and excerpts in the output
  --out <dir>               Output directory (default tmp/freshness-backtest/<ts>)
  --db-url <url>            The database to read (key: FRESHNESS_BACKTEST_SUPABASE_KEY)
  --execute --confirm DJ-OK:<YYYY-MM-DD>   with FRESHNESS_BACKTEST_DJ_OK=yes

Without --execute nothing is read and no model is called (dry run).`;

export function parseBacktestArgs(
	argv: readonly string[],
	env: Record<string, string | undefined> = {}
): BacktestArgs {
	const args: BacktestArgs = {
		execute: false,
		confirm: null,
		userId: null,
		from: null,
		to: null,
		projectIds: [],
		jev: 'cache',
		cacheDir: null,
		includeText: false,
		ledger: false,
		fixture: null,
		dbUrl: null,
		outDir: null,
		horizonDays: FRESHNESS_POLICY_V1.outcomes.horizonDays,
		model: readFreshnessRadarJevModel(env),
		errors: []
	};
	const value = (index: number, flag: string): string | null => {
		const next = argv[index + 1];
		if (next === undefined || next.startsWith('--')) {
			args.errors.push(`${flag} needs a value`);
			return null;
		}
		return next;
	};
	for (let index = 0; index < argv.length; index += 1) {
		const flag = argv[index]!;
		const takes = (): string | null => {
			const next = value(index, flag);
			if (next !== null) index += 1;
			return next;
		};
		switch (flag) {
			case '--execute':
				args.execute = true;
				break;
			case '--include-text':
				args.includeText = true;
				break;
			case '--ledger':
				args.ledger = true;
				break;
			case '--confirm':
				args.confirm = takes();
				break;
			case '--user':
				args.userId = takes();
				break;
			case '--from':
				args.from = takes();
				break;
			case '--to':
				args.to = takes();
				break;
			case '--project': {
				const project = takes();
				if (project) args.projectIds.push(project);
				break;
			}
			case '--jev': {
				const mode = takes();
				if (mode === 'live' || mode === 'cache' || mode === 'off') args.jev = mode;
				else if (mode !== null) args.errors.push(`--jev must be off, cache or live`);
				break;
			}
			case '--cache-dir':
				args.cacheDir = takes();
				break;
			case '--fixture':
				args.fixture = takes();
				break;
			case '--db-url':
				args.dbUrl = takes();
				break;
			case '--out':
				args.outDir = takes();
				break;
			case '--horizon-days': {
				const days = Number(takes());
				if (Number.isInteger(days) && days > 0 && days <= 90) args.horizonDays = days;
				else args.errors.push('--horizon-days must be an integer from 1 to 90');
				break;
			}
			case '--help':
			case '-h':
				args.errors.push('help');
				break;
			default:
				args.errors.push(`unknown option ${flag}`);
		}
	}
	for (const [flag, iso] of [
		['--from', args.from],
		['--to', args.to]
	] as const) {
		if (iso !== null && !Number.isFinite(Date.parse(iso)))
			args.errors.push(`${flag} is not a date`);
	}
	if (args.fixture && args.dbUrl) args.errors.push('use --fixture or --db-url, not both');
	return args;
}

/** DJ's local calendar date (the --confirm token names it). */
export function localToday(now: Date = new Date()): string {
	const pad = (value: number) => String(value).padStart(2, '0');
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export type OptIn = { ok: true } | { ok: false; missing: string[] };

/** All three, every time: env flag, dated confirm token, --execute. */
export function checkOptIn(
	args: Pick<BacktestArgs, 'execute' | 'confirm'>,
	env: Record<string, string | undefined>,
	today: string
): OptIn {
	const missing: string[] = [];
	if (env.FRESHNESS_BACKTEST_DJ_OK !== 'yes') missing.push('FRESHNESS_BACKTEST_DJ_OK=yes');
	if (args.confirm !== `DJ-OK:${today}`) missing.push(`--confirm DJ-OK:${today}`);
	if (!args.execute) missing.push('--execute');
	return missing.length ? { ok: false, missing } : { ok: true };
}

// ---------------------------------------------------------------------------
// Read-only client
// ---------------------------------------------------------------------------

export class ReadOnlyViolation extends Error {
	constructor(what: string) {
		super(`freshness backtest is read-only: ${what} is blocked`);
		this.name = 'ReadOnlyViolation';
	}
}

const BLOCKED_BUILDER_METHODS = new Set(['insert', 'update', 'upsert', 'delete']);
const BLOCKED_CLIENT_MEMBERS = new Set(['rpc', 'storage', 'functions', 'channel', 'realtime']);

function guardBuilder<T>(builder: T, table: string): T {
	if (!builder || (typeof builder !== 'object' && typeof builder !== 'function')) return builder;
	return new Proxy(builder as object, {
		get(target, key) {
			if (typeof key === 'string' && BLOCKED_BUILDER_METHODS.has(key)) {
				return () => {
					throw new ReadOnlyViolation(`${table}.${key}()`);
				};
			}
			const member = Reflect.get(target, key, target);
			if (typeof member !== 'function') return member;
			return (...callArgs: unknown[]) => {
				const out = member.apply(target, callArgs);
				// Promises (then/catch) pass through; query builders stay guarded.
				return out instanceof Promise ? out : guardBuilder(out, table);
			};
		}
	}) as T;
}

/**
 * Wrap a Supabase client so only reads get through: from(...) builders throw on
 * insert/update/upsert/delete, and rpc/storage/functions/channels throw outright.
 */
export function readOnlyClient<T extends object>(client: T): T {
	return new Proxy(client, {
		get(target, key) {
			if (typeof key === 'string' && BLOCKED_CLIENT_MEMBERS.has(key)) {
				if (key === 'rpc') {
					return (name: unknown) => {
						throw new ReadOnlyViolation(`rpc(${String(name)})`);
					};
				}
				throw new ReadOnlyViolation(key);
			}
			const member = Reflect.get(target, key, target);
			if (key === 'from' || key === 'schema') {
				return (...callArgs: unknown[]) =>
					guardBuilder(
						(member as (...a: unknown[]) => unknown).apply(target, callArgs),
						String(callArgs[0])
					);
			}
			return typeof member === 'function' ? member.bind(target) : member;
		}
	});
}

// ---------------------------------------------------------------------------
// Dataset
// ---------------------------------------------------------------------------

export type DatasetTurn = {
	id: string;
	session_id: string;
	user_id: string;
	project_id: string | null;
	status: string;
	request_message: string | null;
	mutation_reserved_at: string | null;
	user_message_id: string | null;
	created_at: string;
	finished_at: string | null;
};

export type DatasetSession = {
	id: string;
	user_id: string;
	context_type: string;
	entity_id: string | null;
	created_at: string;
	updated_at: string | null;
};

export type DatasetSuggestion = FreshnessSuggestionRow & {
	project_id: string;
	created_at: string;
	updated_at?: string | null;
	decided_at?: string | null;
	applied_at?: string | null;
};

export type DatasetLedgerFlag = {
	id: string;
	subject_kind: string;
	probability: number;
	disposition: string;
	outcome: string | null;
	outcome_source: string | null;
	created_at: string;
};

export type CachedJevResult = {
	answers: Record<string, unknown>;
	receipt: { costUsd?: number; durationMs?: number; modelUsed?: string } | null;
};

export type BacktestDataset = {
	source: 'fixture' | 'database';
	/** When the data was read; label horizons past it are incomplete. */
	readAt: string;
	userId: string;
	timezone: string | null;
	actorId: string | null;
	window: { from: string; to: string };
	sessions: DatasetSession[];
	turns: DatasetTurn[];
	workflowTurnIds: string[];
	/** role='user' messages only. */
	messages: FreshnessMessageRow[];
	projects: Array<FreshnessProjectRow & { created_at?: string | null }>;
	tasks: FreshnessTaskRow[];
	goals: FreshnessGoalRow[];
	milestones: FreshnessMilestoneRow[];
	documents: Array<FreshnessDocumentRow & { content?: string | null }>;
	edges: Array<FreshnessEdgeRow & { project_id: string; created_at?: string | null }>;
	logs: Array<FreshnessLogRow & { project_id: string }>;
	assignees: Array<{ task_id: string; assignee_actor_id: string; created_at?: string | null }>;
	calendarEvents: Array<{ task_id: string; created_at?: string | null }>;
	suggestions: DatasetSuggestion[];
	inboxItems: Array<FreshnessInboxRow & { decided_at?: string | null }>;
	ledgerFlags: DatasetLedgerFlag[];
	/** Optional Jev answers keyed by request SHA-256 (fixtures ship their own). */
	jevCache: Record<string, CachedJevResult>;
};

const DATASET_ARRAYS = [
	'sessions',
	'turns',
	'workflowTurnIds',
	'messages',
	'projects',
	'tasks',
	'goals',
	'milestones',
	'documents',
	'edges',
	'logs',
	'assignees',
	'calendarEvents',
	'suggestions',
	'inboxItems',
	'ledgerFlags'
] as const;

/** Parse a fixture file; missing arrays default to empty. */
export function parseDataset(raw: unknown): BacktestDataset {
	if (!raw || typeof raw !== 'object') throw new Error('dataset must be a JSON object');
	const input = raw as Record<string, unknown>;
	if (typeof input.userId !== 'string') throw new Error('dataset.userId is required');
	const window = input.window as { from?: unknown; to?: unknown } | undefined;
	if (typeof window?.from !== 'string' || typeof window?.to !== 'string')
		throw new Error('dataset.window {from, to} is required');
	const dataset = {
		source: 'fixture',
		readAt: typeof input.readAt === 'string' ? input.readAt : new Date().toISOString(),
		userId: input.userId,
		timezone: typeof input.timezone === 'string' ? input.timezone : null,
		actorId: typeof input.actorId === 'string' ? input.actorId : null,
		window: { from: window.from, to: window.to },
		jevCache: (input.jevCache as Record<string, CachedJevResult> | undefined) ?? {}
	} as Record<string, unknown>;
	for (const key of DATASET_ARRAYS) {
		const value = input[key];
		if (value !== undefined && !Array.isArray(value))
			throw new Error(`dataset.${key} must be an array`);
		dataset[key] = value ?? [];
	}
	return dataset as unknown as BacktestDataset;
}

type ReadDb = { from: (table: string) => any };

async function readAll<T>(
	build: (fromRow: number, toRow: number) => PromiseLike<{ data: T[] | null; error: any }>,
	what: string,
	pageSize = 1_000,
	maxRows = 50_000
): Promise<T[]> {
	const rows: T[] = [];
	for (let offset = 0; offset < maxRows; offset += pageSize) {
		const { data, error } = await build(offset, offset + pageSize - 1);
		if (error) throw new Error(`backtest read failed (${what}): ${error.message ?? error}`);
		rows.push(...(data ?? []));
		if (!data || data.length < pageSize) break;
	}
	return rows;
}

function chunks<T>(values: readonly T[], size = 100): T[][] {
	const out: T[][] = [];
	for (let index = 0; index < values.length; index += size)
		out.push(values.slice(index, index + size));
	return out;
}

async function readIn<T>(
	db: ReadDb,
	table: string,
	columns: string,
	column: string,
	ids: readonly string[]
): Promise<T[]> {
	const rows: T[] = [];
	for (const part of chunks([...new Set(ids)])) {
		rows.push(
			...(await readAll<T>(
				(from, to) => db.from(table).select(columns).in(column, part).range(from, to),
				table
			))
		);
	}
	return rows;
}

export const BACKTEST_READ_TABLES = [
	'users (timezone)',
	'onto_actors',
	'chat_sessions',
	'chat_turn_runs (completed, in window)',
	'chat_turn_workflow_runs',
	'chat_messages (role user, window minus 7 days)',
	'onto_projects',
	'onto_tasks / onto_goals / onto_milestones / onto_documents (incl. deleted)',
	'onto_edges',
	'onto_project_logs (window minus 7 days to now)',
	'onto_task_assignees',
	'task_calendar_events',
	'project_suggestions',
	'inbox_items'
];

/** Count first, so the read plan can show the turn volume before reading more. */
export async function countTurns(db: ReadDb, userId: string, from: string, to: string) {
	const rows = await readAll<{ id: string }>(
		(start, end) =>
			db
				.from('chat_turn_runs')
				.select('id')
				.eq('user_id', userId)
				.eq('status', 'completed')
				.gte('created_at', from)
				.lte('created_at', to)
				.range(start, end),
		'chat_turn_runs'
	);
	return rows.length;
}

export async function loadDatasetFromDb(
	db: ReadDb,
	params: {
		userId: string;
		from: string;
		to: string;
		projectIds: readonly string[];
		ledger: boolean;
		now: Date;
	}
): Promise<BacktestDataset> {
	const lookback = new Date(
		Date.parse(params.from) - FRESHNESS_POLICY_V1.window.maxLookbackDays * DAY_MS
	).toISOString();
	const user = await db
		.from('users')
		.select('id, timezone')
		.eq('id', params.userId)
		.maybeSingle();
	if (user.error) throw new Error(`backtest read failed (users): ${user.error.message}`);
	const actors = await readAll<{ id: string; created_at: string }>(
		(from, to) =>
			db
				.from('onto_actors')
				.select('id, created_at')
				.eq('user_id', params.userId)
				.order('created_at', { ascending: true })
				.range(from, to),
		'onto_actors'
	);
	const sessions = await readAll<DatasetSession>(
		(from, to) =>
			db
				.from('chat_sessions')
				.select('id, user_id, context_type, entity_id, created_at, updated_at')
				.eq('user_id', params.userId)
				.lte('created_at', params.to)
				.range(from, to),
		'chat_sessions'
	);
	const turns = await readAll<DatasetTurn>(
		(from, to) =>
			db
				.from('chat_turn_runs')
				.select(
					'id, session_id, user_id, project_id, status, request_message, mutation_reserved_at, user_message_id, created_at, finished_at'
				)
				.eq('user_id', params.userId)
				.gte('created_at', lookback)
				.lte('created_at', params.to)
				.range(from, to),
		'chat_turn_runs'
	);
	const sessionIds = sessions.map((session) => session.id);
	const workflow = await readIn<{ turn_run_id: string }>(
		db,
		'chat_turn_workflow_runs',
		'turn_run_id',
		'session_id',
		sessionIds
	);
	const messages = (
		await readIn<FreshnessMessageRow>(
			db,
			'chat_messages',
			'id, session_id, role, content, created_at, metadata',
			'session_id',
			sessionIds
		)
	).filter(
		(message) =>
			message.role === 'user' &&
			message.created_at > lookback &&
			message.created_at <= params.to
	);
	const projectIds = new Set<string>(params.projectIds);
	if (!params.projectIds.length) {
		for (const turn of turns) if (turn.project_id) projectIds.add(turn.project_id);
		for (const session of sessions)
			if (session.context_type === 'project' && session.entity_id)
				projectIds.add(session.entity_id);
	}
	const ids = [...projectIds];
	const byProject = <T>(table: string, columns: string) =>
		readIn<T>(db, table, columns, 'project_id', ids);
	const [projects, tasks, goals, milestones, documents, edges, logs, suggestions, inboxItems] =
		await Promise.all([
			readIn<FreshnessProjectRow>(
				db,
				'onto_projects',
				'id, name, description, deleted_at, archived_at, created_at',
				'id',
				ids
			),
			byProject<FreshnessTaskRow>(
				'onto_tasks',
				'id, project_id, title, description, state_key, start_at, due_at, props, created_at, updated_at, archived_at, deleted_at, completed_at'
			),
			byProject<FreshnessGoalRow>(
				'onto_goals',
				'id, project_id, name, description, goal, state_key, target_date, props, created_at, updated_at, archived_at, deleted_at, completed_at'
			),
			byProject<FreshnessMilestoneRow>(
				'onto_milestones',
				'id, project_id, title, description, milestone, state_key, due_at, props, created_at, updated_at, archived_at, deleted_at, completed_at'
			),
			byProject<FreshnessDocumentRow & { content: string | null }>(
				'onto_documents',
				'id, project_id, title, description, content, state_key, type_key, props, created_at, updated_at, archived_at, deleted_at'
			),
			byProject<FreshnessEdgeRow & { project_id: string; created_at: string }>(
				'onto_edges',
				'project_id, src_kind, src_id, dst_kind, dst_id, rel, created_at'
			),
			byProject<FreshnessLogRow & { project_id: string }>(
				'onto_project_logs',
				'project_id, entity_type, entity_id, action, chat_session_id, changed_by, change_source, created_at, before_data, after_data'
			).then((rows) => rows.filter((row) => row.created_at > lookback)),
			byProject<DatasetSuggestion>(
				'project_suggestions',
				'id, project_id, kind, status, operations, title, created_at, updated_at, decided_at, applied_at'
			),
			byProject<FreshnessInboxRow & { decided_at: string | null }>(
				'inbox_items',
				'id, source_type, source_ref_id, source_status, project_id, audience, status, title, summary, risk_tier, snoozed_until, expires_at, created_at, updated_at, freshness_state, freshness_flag_id, decided_at'
			)
		]);
	const taskIds = tasks.map((task) => task.id);
	const [assignees, calendarEvents] = await Promise.all([
		readIn<{ task_id: string; assignee_actor_id: string; created_at: string }>(
			db,
			'onto_task_assignees',
			'task_id, assignee_actor_id, created_at',
			'task_id',
			taskIds
		),
		readIn<{ task_id: string; created_at: string }>(
			db,
			'task_calendar_events',
			'task_id, created_at',
			'task_id',
			taskIds
		)
	]);
	const ledgerFlags = params.ledger
		? await readAll<DatasetLedgerFlag>(
				(from, to) =>
					db
						.from('freshness_flags')
						.select(
							'id, subject_kind, probability, disposition, outcome, outcome_source, created_at'
						)
						.eq('user_id', params.userId)
						.gte('created_at', params.from)
						.lte('created_at', params.to)
						.range(from, to),
				'freshness_flags'
			)
		: [];
	return {
		source: 'database',
		readAt: params.now.toISOString(),
		userId: params.userId,
		timezone: (user.data as { timezone?: string | null } | null)?.timezone ?? null,
		actorId: actors[0]?.id ?? null,
		window: { from: params.from, to: params.to },
		sessions,
		turns,
		workflowTurnIds: workflow.map((row) => row.turn_run_id),
		messages,
		projects,
		tasks,
		goals,
		milestones,
		documents,
		edges,
		logs,
		assignees,
		calendarEvents,
		suggestions,
		inboxItems,
		ledgerFlags: ledgerFlags.map((flag) => ({
			...flag,
			probability: Number(flag.probability)
		})),
		jevCache: {}
	};
}

// ---------------------------------------------------------------------------
// As-of reconstruction: current rows with later logs reversed
// ---------------------------------------------------------------------------

type EntityKind = 'task' | 'goal' | 'milestone' | 'document';
type AnyEntityRow = Record<string, unknown> & {
	id: string;
	project_id: string;
	created_at: string;
	updated_at: string | null;
};

/** Fields the context reads; a later log that changed one without before_data is partial. */
export const RECONSTRUCTED_FIELDS: Record<EntityKind, readonly string[]> = {
	task: [
		'title',
		'description',
		'state_key',
		'start_at',
		'due_at',
		'props',
		'archived_at',
		'deleted_at',
		'completed_at'
	],
	goal: [
		'name',
		'description',
		'goal',
		'state_key',
		'target_date',
		'props',
		'archived_at',
		'deleted_at',
		'completed_at'
	],
	milestone: [
		'title',
		'description',
		'milestone',
		'state_key',
		'due_at',
		'props',
		'archived_at',
		'deleted_at',
		'completed_at'
	],
	document: [
		'title',
		'description',
		'state_key',
		'type_key',
		'props',
		'archived_at',
		'deleted_at'
	]
};

/** Fields whose later change labels a staleness flag positive (state, title, props, dates). */
export const LABEL_FIELDS: Record<EntityKind, readonly string[]> = {
	task: ['state_key', 'title', 'props', 'due_at', 'start_at', 'description'],
	goal: ['state_key', 'name', 'props', 'target_date', 'description', 'goal'],
	milestone: ['state_key', 'title', 'props', 'due_at', 'description', 'milestone'],
	document: ['state_key', 'title', 'props', 'description', 'content']
};

const ENTITY_TABLE: Record<EntityKind, 'tasks' | 'goals' | 'milestones' | 'documents'> = {
	task: 'tasks',
	goal: 'goals',
	milestone: 'milestones',
	document: 'documents'
};

export type Reconstruction<Row> = {
	row: Row;
	/** Fields whose value at T is unknown. */
	partial: Set<string>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isRadarLog(log: FreshnessLogRow): boolean {
	return (log.change_source ?? '').startsWith('freshness');
}

function sameValue(a: unknown, b: unknown): boolean {
	return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** The logged fields a log changed (null when the log carries no field data). */
export function changedFields(log: FreshnessLogRow): Set<string> | null {
	const before = isRecord(log.before_data) ? log.before_data : null;
	const after = isRecord(log.after_data) ? log.after_data : null;
	if (!before && !after) return null;
	const changed = new Set<string>();
	for (const key of new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])) {
		if (key === 'updated_at' || key === 'created_at' || key === 'id') continue;
		if (!before || !after || !sameValue(before[key], after[key])) changed.add(key);
	}
	return changed;
}

/**
 * One entity as of `at`. Logs after `at` are reversed newest first: 'created'
 * means it did not exist; 'deleted' restores it; 'updated' restores each field
 * from before_data. A field a later log changed without a before value is
 * partial, as is every field when the row changed after `at` with no log.
 */
export function reconstructEntity<Row extends AnyEntityRow>(
	kind: EntityKind,
	current: Row | null,
	logs: readonly FreshnessLogRow[],
	at: string
): Reconstruction<Row> | null {
	const fields = RECONSTRUCTED_FIELDS[kind];
	const later = logs
		.filter((log) => log.created_at > at)
		.sort((a, b) => b.created_at.localeCompare(a.created_at));
	const earlier = logs.filter((log) => log.created_at <= at);
	const partial = new Set<string>();
	let row: Record<string, unknown> | null = current ? { ...current } : null;

	if (!row) {
		// Hard-deleted after `at`: rebuild from the delete log's before_data.
		const deletion = later.find((log) => log.action === 'deleted' && isRecord(log.before_data));
		if (!deletion) return null;
		row = { ...(deletion.before_data as Record<string, unknown>) };
		for (const field of fields) if (!(field in row)) partial.add(field);
	}
	if (typeof row.created_at === 'string' && row.created_at > at) return null;

	for (const log of later) {
		if (log.action === 'created') return null;
		if (log.action === 'deleted') {
			row.deleted_at = null;
			continue;
		}
		const before = isRecord(log.before_data) ? log.before_data : null;
		const changed = changedFields(log);
		if (changed === null) {
			for (const field of fields) partial.add(field);
			continue;
		}
		for (const field of fields) {
			if (!changed.has(field)) continue;
			if (before && field in before) row[field] = before[field];
			else partial.add(field);
		}
	}
	const updatedAt = typeof row.updated_at === 'string' ? row.updated_at : null;
	if (updatedAt && updatedAt > at) {
		// Changed after `at`. Logged changes were reversed above; without a log the
		// change is unknown, so every field is partial.
		if (!later.length) for (const field of [...fields, 'updated_at']) partial.add(field);
		const lastEarlier =
			earlier
				.map((log) => log.created_at)
				.sort()
				.at(-1) ?? null;
		row.updated_at = lastEarlier ?? (row.created_at as string);
	}
	return { row: row as Row, partial };
}

export type AsOfEntities = {
	tasks: FreshnessTaskRow[];
	goals: FreshnessGoalRow[];
	milestones: FreshnessMilestoneRow[];
	documents: Array<FreshnessDocumentRow & { content?: string | null }>;
	/** entityKey -> partial fields. */
	partial: Map<string, Set<string>>;
};

export function reconstructProjectAsOf(
	dataset: BacktestDataset,
	projectId: string,
	at: string
): AsOfEntities {
	const out: AsOfEntities = {
		tasks: [],
		goals: [],
		milestones: [],
		documents: [],
		partial: new Map()
	};
	const logsByEntity = new Map<string, FreshnessLogRow[]>();
	for (const log of dataset.logs) {
		if (log.project_id !== projectId) continue;
		const key = entityKey(log.entity_type, log.entity_id);
		logsByEntity.set(key, [...(logsByEntity.get(key) ?? []), log]);
	}
	for (const kind of ['task', 'goal', 'milestone', 'document'] as const) {
		const table = ENTITY_TABLE[kind];
		const rows = (dataset[table] as AnyEntityRow[]).filter(
			(row) => row.project_id === projectId
		);
		const seen = new Set(rows.map((row) => row.id));
		const orphanIds = [...logsByEntity.keys()]
			.filter((key) => key.startsWith(`${kind}:`))
			.map((key) => key.slice(kind.length + 1))
			.filter((id) => !seen.has(id));
		for (const [id, current] of [
			...rows.map((row) => [row.id, row] as const),
			...orphanIds.map((id) => [id, null] as const)
		]) {
			const rebuilt = reconstructEntity(
				kind,
				current,
				logsByEntity.get(entityKey(kind, id)) ?? [],
				at
			);
			if (!rebuilt) continue;
			(out[table] as AnyEntityRow[]).push(rebuilt.row);
			if (rebuilt.partial.size) out.partial.set(entityKey(kind, id), rebuilt.partial);
		}
	}
	return out;
}

// ---------------------------------------------------------------------------
// The as-of data port (the live FreshnessDataPort contract over the dataset)
// ---------------------------------------------------------------------------

export type ReplayState = {
	/** Simulated info_cursor_at per project (completed scans only). */
	cursors: Map<string, string>;
	/** Simulated auto-applies for the 24h cap. */
	autoApplied: Array<{ projectId: string; appliedAt: string }>;
	/** Simulated latest gauge per subject id. */
	gauges: Map<string, string>;
};

export function newReplayState(): ReplayState {
	return { cursors: new Map(), autoApplied: [], gauges: new Map() };
}

const newestFirst = <T extends { created_at: string }>(a: T, b: T) =>
	b.created_at.localeCompare(a.created_at);

/**
 * Reads as of `at`. Prior flags are empty: a replay has no user dismissals to
 * suppress. Document content is the current content (content history is not
 * logged), so document summaries can be newer than `at`.
 */
export class AsOfFreshnessDataPort implements FreshnessDataPort {
	private readonly entities = new Map<string, AsOfEntities>();

	constructor(
		private readonly dataset: BacktestDataset,
		private readonly at: string,
		private readonly state: ReplayState
	) {}

	entitiesFor(projectId: string): AsOfEntities {
		let entities = this.entities.get(projectId);
		if (!entities) {
			entities = reconstructProjectAsOf(this.dataset, projectId, this.at);
			this.entities.set(projectId, entities);
		}
		return entities;
	}

	async loadUserTimezone(): Promise<string | null> {
		return this.dataset.timezone;
	}

	async loadUserActorId(): Promise<string | null> {
		return this.dataset.actorId;
	}

	async loadProject(projectId: string): Promise<FreshnessProjectRow | null> {
		const project = this.dataset.projects.find((row) => row.id === projectId);
		if (!project) return null;
		const deletedLater = project.deleted_at && project.deleted_at > this.at;
		const archivedLater = project.archived_at && project.archived_at > this.at;
		return {
			id: project.id,
			name: project.name,
			description: project.description,
			deleted_at: deletedLater ? null : project.deleted_at,
			archived_at: archivedLater ? null : project.archived_at
		};
	}

	async loadLastScanCursor(projectId: string): Promise<string | null> {
		return this.state.cursors.get(projectId) ?? null;
	}

	async loadProjectContextSessionIds(projectId: string, userId: string): Promise<string[]> {
		return this.dataset.sessions
			.filter(
				(session) =>
					session.user_id === userId &&
					session.context_type === 'project' &&
					session.entity_id === projectId &&
					session.created_at <= this.at
			)
			.sort((a, b) =>
				(b.updated_at ?? b.created_at).localeCompare(a.updated_at ?? a.created_at)
			)
			.slice(0, 20)
			.map((session) => session.id);
	}

	async filterUserSessionIds(sessionIds: readonly string[], userId: string): Promise<string[]> {
		const wanted = new Set(sessionIds);
		return this.dataset.sessions
			.filter((session) => wanted.has(session.id) && session.user_id === userId)
			.map((session) => session.id);
	}

	async loadProjectLogs(projectId: string, since: string): Promise<FreshnessLogRow[]> {
		return this.dataset.logs
			.filter(
				(log) =>
					log.project_id === projectId &&
					log.created_at > since &&
					log.created_at <= this.at
			)
			.sort(newestFirst)
			.slice(0, 500);
	}

	async loadUserMessages(
		sessionIds: readonly string[],
		since: string,
		until: string
	): Promise<FreshnessMessageRow[]> {
		const wanted = new Set(sessionIds);
		const cap = until < this.at ? until : this.at;
		return this.dataset.messages
			.filter(
				(message) =>
					wanted.has(message.session_id) &&
					message.role === 'user' &&
					message.created_at > since &&
					message.created_at <= cap
			)
			.sort(newestFirst)
			.slice(0, 200);
	}

	async loadTurns(
		sessionIds: readonly string[],
		since: string
	): Promise<{ turns: FreshnessTurnRow[]; workflowTurnIds: Set<string> }> {
		const wanted = new Set(sessionIds);
		const turns = this.dataset.turns
			.filter(
				(turn) =>
					wanted.has(turn.session_id) &&
					turn.created_at >= since &&
					turn.created_at <= this.at
			)
			.sort(newestFirst)
			.slice(0, 200)
			.map((turn) => ({
				id: turn.id,
				session_id: turn.session_id,
				user_message_id: turn.user_message_id,
				// A turn that finished after T was still running at T.
				status: turn.finished_at && turn.finished_at > this.at ? 'running' : turn.status,
				created_at: turn.created_at
			}));
		return { turns, workflowTurnIds: new Set(this.dataset.workflowTurnIds) };
	}

	async loadProjectEntities(projectId: string): Promise<FreshnessOpenEntities> {
		const entities = this.entitiesFor(projectId);
		const live = <Row extends { deleted_at: string | null }>(rows: Row[]) =>
			rows.filter((row) => !row.deleted_at);
		return {
			tasks: live(entities.tasks),
			goals: live(entities.goals),
			milestones: live(entities.milestones),
			documents: live(entities.documents).filter((row) => !row.archived_at)
		};
	}

	async loadDocumentContentHeads(
		documentIds: readonly string[],
		chars: number
	): Promise<Map<string, string>> {
		const wanted = new Set(documentIds);
		const heads = new Map<string, string>();
		for (const document of this.dataset.documents) {
			if (!wanted.has(document.id)) continue;
			const text = (document.content ?? '').replace(/\s+/g, ' ').trim();
			if (text) heads.set(document.id, text.slice(0, chars));
		}
		return heads;
	}

	async loadDocumentBodies(
		documentIds: readonly string[],
		maxChars: number
	): Promise<Map<string, string>> {
		// Current content (document bodies are not reversed as-of; tasker 106).
		const wanted = new Set(documentIds);
		const bodies = new Map<string, string>();
		for (const document of this.dataset.documents) {
			if (!wanted.has(document.id) || !document.content) continue;
			bodies.set(document.id, document.content.slice(0, maxChars));
		}
		return bodies;
	}

	async loadEdges(projectId: string): Promise<FreshnessEdgeRow[]> {
		return this.dataset.edges
			.filter((edge) => edge.project_id === projectId && (edge.created_at ?? '') <= this.at)
			.map(({ src_kind, src_id, dst_kind, dst_id, rel }) => ({
				src_kind,
				src_id,
				dst_kind,
				dst_id,
				rel
			}));
	}

	async loadCalendarEventTaskIds(taskIds: readonly string[]): Promise<Set<string>> {
		const wanted = new Set(taskIds);
		return new Set(
			this.dataset.calendarEvents
				.filter((row) => wanted.has(row.task_id) && (row.created_at ?? '') <= this.at)
				.map((row) => row.task_id)
		);
	}

	async loadTaskAssignees(taskIds: readonly string[]): Promise<Map<string, string[]>> {
		const wanted = new Set(taskIds);
		const map = new Map<string, string[]>();
		for (const row of this.dataset.assignees) {
			if (!wanted.has(row.task_id) || (row.created_at ?? '') > this.at) continue;
			map.set(row.task_id, [...(map.get(row.task_id) ?? []), row.assignee_actor_id]);
		}
		return map;
	}

	async loadPriorFlags(): Promise<FreshnessPriorFlagRow[]> {
		return [];
	}

	async countAutoApplied(projectId: string, since: string): Promise<number> {
		return this.state.autoApplied.filter(
			(entry) =>
				entry.projectId === projectId &&
				entry.appliedAt > since &&
				entry.appliedAt <= this.at
		).length;
	}

	/** Items that existed at T and were still open then (status at T is inferred). */
	async loadInboxItems(projectId: string): Promise<FreshnessInboxRow[]> {
		const rows: FreshnessInboxRow[] = [];
		for (const item of this.dataset.inboxItems) {
			if (item.project_id !== projectId || item.created_at > this.at) continue;
			const open = item.status === 'pending' || item.status === 'deferred';
			const closedAt = item.decided_at ?? item.updated_at;
			if (!open && closedAt <= this.at) continue;
			const { decided_at: _decided, ...row } = item;
			rows.push({
				...row,
				status: open ? item.status : 'pending',
				updated_at: item.updated_at > this.at ? item.created_at : item.updated_at,
				freshness_state: 'fresh',
				freshness_flag_id: null
			});
		}
		return rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 50);
	}

	async loadSuggestions(ids: readonly string[]): Promise<Map<string, FreshnessSuggestionRow>> {
		const wanted = new Set(ids);
		const map = new Map<string, FreshnessSuggestionRow>();
		for (const suggestion of this.dataset.suggestions) {
			if (!wanted.has(suggestion.id) || suggestion.created_at > this.at) continue;
			const changedAt =
				suggestion.decided_at ?? suggestion.applied_at ?? suggestion.updated_at ?? null;
			const status =
				suggestion.status !== 'pending' && changedAt && changedAt > this.at
					? 'pending'
					: suggestion.status;
			map.set(suggestion.id, {
				id: suggestion.id,
				kind: suggestion.kind,
				status,
				operations: suggestion.operations,
				title: suggestion.title
			});
		}
		return map;
	}

	async loadPreviousGauges(
		_projectId: string,
		_userId: string,
		subjectIds: readonly string[]
	): Promise<Map<string, string>> {
		const map = new Map<string, string>();
		for (const id of subjectIds) {
			const gauge = this.state.gauges.get(id);
			if (gauge) map.set(id, gauge);
		}
		return map;
	}
}

// ---------------------------------------------------------------------------
// Pseudo-signals (the enqueue_freshness_radar_signal_v1 debounce)
// ---------------------------------------------------------------------------

export type PseudoSignal = {
	sessionId: string;
	projectHints: string[];
	firstTurnAt: string;
	lastTurnAt: string;
	dueAt: string;
	turnIds: string[];
};

/** The trigger's admission rules: completed, not a workflow turn, project or mutation, 40+ chars. */
export function turnSignals(turn: DatasetTurn, workflowTurnIds: ReadonlySet<string>): boolean {
	if (turn.status !== 'completed' || workflowTurnIds.has(turn.id)) return false;
	if (!turn.project_id && !turn.mutation_reserved_at) return false;
	if (
		!turn.mutation_reserved_at &&
		(turn.request_message ?? '').trim().length < SIGNAL_MIN_REQUEST_CHARS
	)
		return false;
	return true;
}

export function rebuildSignals(
	turns: readonly DatasetTurn[],
	workflowTurnIds: ReadonlySet<string>,
	window: { from: string; to: string }
): PseudoSignal[] {
	const bySession = new Map<string, Array<{ turn: DatasetTurn; at: string }>>();
	for (const turn of turns) {
		const at = turn.finished_at ?? turn.created_at;
		if (at < window.from || at > window.to || !turnSignals(turn, workflowTurnIds)) continue;
		bySession.set(turn.session_id, [...(bySession.get(turn.session_id) ?? []), { turn, at }]);
	}
	const signals: PseudoSignal[] = [];
	for (const [sessionId, entries] of bySession) {
		entries.sort((a, b) => a.at.localeCompare(b.at));
		let open: PseudoSignal | null = null;
		for (const { turn, at } of entries) {
			const time = Date.parse(at);
			if (open && time < Date.parse(open.dueAt)) {
				open.lastTurnAt = at;
				open.turnIds.push(turn.id);
				open.dueAt = new Date(
					Math.min(time + SIGNAL_QUIET_MS, Date.parse(open.firstTurnAt) + SIGNAL_MAX_MS)
				).toISOString();
				if (turn.project_id && !open.projectHints.includes(turn.project_id))
					open.projectHints.push(turn.project_id);
				continue;
			}
			open = {
				sessionId,
				projectHints: turn.project_id ? [turn.project_id] : [],
				firstTurnAt: at,
				lastTurnAt: at,
				dueAt: new Date(time + SIGNAL_QUIET_MS).toISOString(),
				turnIds: [turn.id]
			};
			signals.push(open);
		}
	}
	return signals.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

/** Hints first, then the projects the session wrote to (the live projectsForSignal). */
export function projectsForPseudoSignal(
	dataset: BacktestDataset,
	signal: PseudoSignal,
	cap: number
): string[] {
	const since = new Date(
		Date.parse(signal.firstTurnAt) - SIGNAL_PROJECT_LOOKBACK_MS
	).toISOString();
	const counts = new Map<string, number>();
	for (const log of dataset.logs) {
		if (log.chat_session_id !== signal.sessionId) continue;
		if (log.created_at < since || log.created_at > signal.dueAt) continue;
		counts.set(log.project_id, (counts.get(log.project_id) ?? 0) + 1);
	}
	const written = [...counts.entries()]
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.map(([projectId]) => projectId);
	return [...new Set([...signal.projectHints, ...written])].slice(0, cap);
}

// ---------------------------------------------------------------------------
// Jev transport: live (cached by request SHA-256), cache, off
// ---------------------------------------------------------------------------

export type JevFetch = {
	source: 'cache' | 'live' | 'off' | 'miss' | 'failed';
	answers: Record<string, unknown> | null;
	receipt: CachedJevResult['receipt'];
	sha256: string;
	bytes: number;
};

export class BacktestJev {
	hits = 0;
	misses = 0;
	liveCalls = 0;

	constructor(
		private readonly options: {
			mode: JevMode;
			model: string;
			cacheDir: string | null;
			inline: Record<string, CachedJevResult>;
			live: JevDecider | null;
			timeoutMs: number;
		}
	) {}

	private readCache(sha: string): CachedJevResult | null {
		if (this.options.inline[sha]) return this.options.inline[sha]!;
		if (!this.options.cacheDir) return null;
		try {
			return JSON.parse(
				readFileSync(join(this.options.cacheDir, `${sha}.json`), 'utf8')
			) as CachedJevResult;
		} catch {
			return null;
		}
	}

	async ask(request: FreshnessJevRequest): Promise<JevFetch> {
		const sha = freshnessRequestSha256(this.options.model, request);
		const bytes = Buffer.byteLength(JSON.stringify(request));
		const base = { sha256: sha, bytes };
		if (this.options.mode === 'off')
			return { ...base, source: 'off', answers: null, receipt: null };
		const cached = this.readCache(sha);
		if (cached) {
			this.hits += 1;
			return { ...base, source: 'cache', answers: cached.answers, receipt: cached.receipt };
		}
		if (this.options.mode === 'cache' || !this.options.live) {
			this.misses += 1;
			return { ...base, source: 'miss', answers: null, receipt: null };
		}
		this.liveCalls += 1;
		const result = await this.options.live.decide(
			{ state: request.state, questions: request.questions as JevQuestionSet },
			{ timeoutMs: this.options.timeoutMs }
		);
		const receipt = result.receipt
			? {
					costUsd: result.receipt.costUsd ?? undefined,
					durationMs: result.receipt.durationMs,
					modelUsed: result.receipt.modelUsed ?? undefined
				}
			: null;
		if (!result.ok) return { ...base, source: 'failed', answers: null, receipt };
		const entry: CachedJevResult = {
			answers: result.answers as Record<string, unknown>,
			receipt
		};
		if (this.options.cacheDir) {
			mkdirSync(this.options.cacheDir, { recursive: true });
			writeFileSync(join(this.options.cacheDir, `${sha}.json`), JSON.stringify(entry));
		}
		return { ...base, source: 'live', answers: entry.answers, receipt };
	}
}

// ---------------------------------------------------------------------------
// Replay
// ---------------------------------------------------------------------------

export type ReplayedEntity = {
	kind: EntityKind;
	id: string;
	title: string;
	probability: number;
	disposition: string;
	reason: string;
	cardRank: number | null;
	wouldAutoApply: boolean;
	proposal: { field: string; from: string | null; to: string } | null;
	evidenceExcerpt: string | null;
	partialFields: string[];
};

export type ReplayedInbox = {
	inboxItemId: string;
	suggestionId: string | null;
	title: string;
	probability: number;
	action: string;
};

export type ScanRecord = {
	at: string;
	sessionId: string;
	projectId: string;
	status: 'decided' | 'skipped' | 'unanswered';
	reason: string | null;
	requests: Array<{ name: ScanRequestName; sha256: string; bytes: number; source: string }>;
	costUsd: number;
	latencyMs: number[];
	entities: ReplayedEntity[];
	inbox: ReplayedInbox[];
	gauges: Array<{ kind: string; id: string; gauge: string }>;
	newInformationChars: number;
};

export async function replayDataset(params: {
	dataset: BacktestDataset;
	jev: BacktestJev;
	model: string;
	policy?: FreshnessPolicyV1;
	projectFilter?: readonly string[];
}): Promise<{ signals: PseudoSignal[]; scans: ScanRecord[] }> {
	const policy = params.policy ?? FRESHNESS_POLICY_V1;
	const { dataset } = params;
	const state = newReplayState();
	const signals = rebuildSignals(dataset.turns, new Set(dataset.workflowTurnIds), dataset.window);
	const scans: ScanRecord[] = [];
	for (const signal of signals) {
		const at = signal.dueAt;
		const projects = projectsForPseudoSignal(
			dataset,
			signal,
			policy.maxProjectsPerSignal
		).filter(
			(projectId) => !params.projectFilter?.length || params.projectFilter.includes(projectId)
		);
		for (const projectId of projects) {
			const port = new AsOfFreshnessDataPort(dataset, at, state);
			const record: ScanRecord = {
				at,
				sessionId: signal.sessionId,
				projectId,
				status: 'skipped',
				reason: null,
				requests: [],
				costUsd: 0,
				latencyMs: [],
				entities: [],
				inbox: [],
				gauges: [],
				newInformationChars: 0
			};
			scans.push(record);
			const context = await buildFreshnessScanContext({
				port,
				projectId,
				userId: dataset.userId,
				extraSessionIds: signal.projectHints.includes(projectId) ? [signal.sessionId] : [],
				now: new Date(at),
				policy
			});
			record.newInformationChars = context.window.chars;
			if (context.skipReason) {
				record.reason = context.skipReason;
				continue;
			}
			// [1b] Targeting, exactly as live: a failed request falls back to the lexical top-N.
			const targetingPlan = planTargeting(context, params.model, policy);
			let targetingAnswers: AnswerMap | null = null;
			if (targetingPlan.request) {
				const fetched = await params.jev.ask(targetingPlan.request);
				record.requests.push({
					name: 'target',
					sha256: fetched.sha256,
					bytes: fetched.bytes,
					source: fetched.source
				});
				record.costUsd += fetched.receipt?.costUsd ?? 0;
				if (typeof fetched.receipt?.durationMs === 'number')
					record.latencyMs.push(fetched.receipt.durationMs);
				if (fetched.answers) targetingAnswers = fetched.answers as AnswerMap;
			}
			const targeting = applyTargeting({
				context,
				plan: targetingPlan,
				answers: targetingAnswers,
				forcedKeys: new Set(),
				policy
			});
			const plan = planScanRequests(context, targeting, params.model, policy);
			if (!plan.requests.length) {
				record.reason = 'no_questions';
				continue;
			}
			const answers: Record<string, unknown> = {};
			let failure: string | null = null;
			for (const { name, request } of plan.requests) {
				const fetched = await params.jev.ask(request);
				record.requests.push({
					name,
					sha256: fetched.sha256,
					bytes: fetched.bytes,
					source: fetched.source
				});
				record.costUsd += fetched.receipt?.costUsd ?? 0;
				if (typeof fetched.receipt?.durationMs === 'number')
					record.latencyMs.push(fetched.receipt.durationMs);
				if (!fetched.answers) failure = failure ?? `jev_${fetched.source}`;
				else Object.assign(answers, namespaceAnswers(name, fetched.answers));
			}
			if (failure) {
				// All-or-nothing, like live: no decisions and the cursor stays put.
				record.status = 'unanswered';
				record.reason = failure;
				continue;
			}
			const decided = decideScan({
				context,
				plan,
				projectId,
				answers: answers as AnswerMap,
				gateEnabled: true, // a live user with every flag on
				policy
			});
			const partial = port.entitiesFor(projectId).partial;
			const ranked = rankCardDecisions(decided.entityDecisions, policy.combine.cardMaxItems);
			record.status = 'decided';
			record.entities = decided.entityDecisions.map((decision: EntityDecision) => ({
				kind: decision.candidate.kind as EntityKind,
				id: decision.candidate.id,
				title: decision.candidate.title,
				probability: decision.probability,
				disposition: decision.disposition,
				reason: decision.reason,
				cardRank: ranked.top.indexOf(decision) >= 0 ? ranked.top.indexOf(decision) : null,
				wouldAutoApply: decision.disposition === 'auto_apply_pending',
				proposal: decision.proposal
					? {
							field: decision.proposal.field,
							from: decision.proposal.from,
							to: decision.proposal.to
						}
					: null,
				evidenceExcerpt: decision.evidence?.excerpt ?? null,
				partialFields: [
					...(partial.get(entityKey(decision.candidate.kind, decision.candidate.id)) ??
						[])
				]
			}));
			record.inbox = decided.inboxDecisions.map((decision: InboxDecision, index) => {
				const subject = plan.inboxSubjects[index]!;
				return {
					inboxItemId: subject.row.id,
					suggestionId: subject.suggestion?.id ?? null,
					title: subject.row.title,
					probability: decision.probability,
					action: decision.action
				};
			});
			record.gauges = decided.trackDecisions.map((track) => ({
				kind: track.subject.candidate.kind,
				id: track.subject.candidate.id,
				gauge: track.gauge.gauge
			}));
			// Simulate what the live scan would have persisted.
			if (context.window.cursorAt) state.cursors.set(projectId, context.window.cursorAt);
			for (const entity of record.entities)
				if (entity.wouldAutoApply) state.autoApplied.push({ projectId, appliedAt: at });
			for (const gauge of record.gauges) state.gauges.set(gauge.id, gauge.gauge);
		}
	}
	return { signals, scans };
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export type Label = {
	label: 'positive' | 'negative' | 'excluded';
	reason: string;
	/** Did the entity later take the proposed value (null: no proposal or unknown). */
	proposalCorrect: boolean | null;
};

function civil(value: unknown, timeZone: string | null): string | null {
	return typeof value === 'string' ? storedCivilDate(value, timeZone ?? 'UTC') : null;
}

/**
 * Plan section 7 labels. Positive: a non-radar log changed a label field within
 * the horizon, or a known field differs at the horizon's end. Negative: nothing
 * changed. Excluded: the reconstruction is partial for the field in question,
 * the entity was deleted, or the horizon has not elapsed.
 */
export function labelEntity(params: {
	dataset: BacktestDataset;
	projectId: string;
	kind: EntityKind;
	id: string;
	at: string;
	proposal: { field: string; to: string } | null;
	horizonDays: number;
}): Label {
	const { dataset, kind, id, at } = params;
	const end = new Date(Date.parse(at) + params.horizonDays * DAY_MS).toISOString();
	if (end > dataset.readAt)
		return { label: 'excluded', reason: 'horizon_open', proposalCorrect: null };
	const logs = dataset.logs.filter(
		(log) =>
			log.project_id === params.projectId && log.entity_type === kind && log.entity_id === id
	);
	const inHorizon = logs.filter(
		(log) => log.created_at > at && log.created_at <= end && !isRadarLog(log)
	);
	const fields = LABEL_FIELDS[kind];
	const table = ENTITY_TABLE[kind];
	const current = (dataset[table] as AnyEntityRow[]).find((row) => row.id === id) ?? null;
	const before = reconstructEntity(kind, current, logs, at);
	const after = reconstructEntity(kind, current, logs, end);

	let proposalCorrect: boolean | null = null;
	if (params.proposal) {
		const field = params.proposal.field;
		const matches = (value: unknown) =>
			field === 'state_key'
				? value === params.proposal!.to
				: civil(value, dataset.timezone) === params.proposal!.to;
		const logged = inHorizon.some(
			(log) =>
				isRecord(log.after_data) &&
				field in log.after_data &&
				matches(log.after_data[field])
		);
		if (logged) proposalCorrect = true;
		else if (after && !after.partial.has(field)) proposalCorrect = matches(after.row[field]);
	}

	if (
		inHorizon.some((log) => log.action === 'deleted') ||
		(current?.deleted_at && current.deleted_at <= end && current.deleted_at > at)
	)
		return { label: 'excluded', reason: 'entity_deleted', proposalCorrect };
	let unknownUpdate = false;
	for (const log of inHorizon) {
		const changed = changedFields(log);
		if (changed === null) {
			unknownUpdate = true;
			continue;
		}
		if (fields.some((field) => changed.has(field)))
			return { label: 'positive', reason: 'field_changed_within_horizon', proposalCorrect };
	}
	if (before && after) {
		const known = fields.filter(
			(field) =>
				field !== 'content' && !before.partial.has(field) && !after.partial.has(field)
		);
		if (known.some((field) => !sameValue(before.row[field], after.row[field])))
			return { label: 'positive', reason: 'known_field_differs', proposalCorrect };
		const partial = fields.some(
			(field) =>
				field !== 'content' && (before.partial.has(field) || after.partial.has(field))
		);
		if (partial)
			return { label: 'excluded', reason: 'partial_reconstruction', proposalCorrect };
	} else {
		return { label: 'excluded', reason: 'not_reconstructed', proposalCorrect };
	}
	if (unknownUpdate) return { label: 'excluded', reason: 'unlogged_fields', proposalCorrect };
	return { label: 'negative', reason: 'unchanged_within_horizon', proposalCorrect };
}

/** Retire label: later dismissed or superseded without approval. */
export function labelRetire(
	dataset: BacktestDataset,
	suggestionId: string | null
): 'correct' | 'incorrect' | 'excluded' {
	const suggestion = suggestionId
		? dataset.suggestions.find((row) => row.id === suggestionId)
		: null;
	if (!suggestion) return 'excluded';
	if (['rejected', 'superseded', 'failed'].includes(suggestion.status)) return 'correct';
	if (['applied', 'approved', 'addressed', 'delegated'].includes(suggestion.status))
		return 'incorrect';
	return 'excluded';
}

// ---------------------------------------------------------------------------
// Metrics and report
// ---------------------------------------------------------------------------

export type ScoredPoint = { p: number; y: 0 | 1 };

/** Mann-Whitney AUROC with average ranks for ties. */
export function auroc(points: readonly ScoredPoint[]): number | null {
	const positives = points.filter((point) => point.y === 1).length;
	const negatives = points.length - positives;
	if (!positives || !negatives) return null;
	const sorted = [...points].sort((a, b) => a.p - b.p);
	let rankSum = 0;
	for (let index = 0; index < sorted.length; ) {
		let end = index;
		while (end + 1 < sorted.length && sorted[end + 1]!.p === sorted[index]!.p) end += 1;
		const rank = (index + end + 2) / 2;
		for (let tie = index; tie <= end; tie += 1) if (sorted[tie]!.y === 1) rankSum += rank;
		index = end + 1;
	}
	return (rankSum - (positives * (positives + 1)) / 2) / (positives * negatives);
}

/** Average precision (area under the step PR curve), ties scored together. */
export function prAuc(points: readonly ScoredPoint[]): number | null {
	const positives = points.filter((point) => point.y === 1).length;
	if (!positives) return null;
	const sorted = [...points].sort((a, b) => b.p - a.p);
	let truePositives = 0;
	let seen = 0;
	let area = 0;
	let lastRecall = 0;
	for (let index = 0; index < sorted.length; ) {
		let end = index;
		while (end + 1 < sorted.length && sorted[end + 1]!.p === sorted[index]!.p) end += 1;
		for (let tie = index; tie <= end; tie += 1) {
			seen += 1;
			if (sorted[tie]!.y === 1) truePositives += 1;
		}
		const recall = truePositives / positives;
		area += (recall - lastRecall) * (truePositives / seen);
		lastRecall = recall;
		index = end + 1;
	}
	return area;
}

export function reliabilityBins(points: readonly ScoredPoint[]) {
	return Array.from({ length: 10 }, (_, bin) => {
		const lo = bin / 10;
		const hi = (bin + 1) / 10;
		const inBin = points.filter(
			(point) => point.p >= lo && (bin === 9 ? point.p <= hi : point.p < hi)
		);
		return {
			range: `${lo.toFixed(1)}-${hi.toFixed(1)}`,
			n: inBin.length,
			meanP: inBin.length
				? inBin.reduce((sum, point) => sum + point.p, 0) / inBin.length
				: null,
			positiveRate: inBin.length
				? inBin.filter((point) => point.y === 1).length / inBin.length
				: null
		};
	});
}

export function percentile(values: readonly number[], q: number): number | null {
	if (!values.length) return null;
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))]!;
}

const ratio = (hits: number, total: number) => (total ? hits / total : null);

export type BacktestReport = ReturnType<typeof buildReplayReport>;

export function buildReplayReport(params: {
	dataset: BacktestDataset;
	signals: readonly PseudoSignal[];
	scans: readonly ScanRecord[];
	horizonDays: number;
	jev: { mode: JevMode; hits: number; misses: number; liveCalls: number };
}) {
	const { dataset, scans } = params;
	const labeled = scans.flatMap((scan) =>
		scan.entities.map((entity) => ({
			scan,
			entity,
			label: labelEntity({
				dataset,
				projectId: scan.projectId,
				kind: entity.kind,
				id: entity.id,
				at: scan.at,
				proposal: entity.proposal,
				horizonDays: params.horizonDays
			})
		}))
	);
	const points: ScoredPoint[] = labeled
		.filter((row) => row.label.label !== 'excluded')
		.map((row) => ({ p: row.entity.probability, y: row.label.label === 'positive' ? 1 : 0 }));
	const top3 = labeled.filter(
		(row) => row.entity.cardRank !== null && row.label.label !== 'excluded'
	);
	const auto = labeled.filter((row) => row.entity.wouldAutoApply);
	const autoJudged = auto.filter((row) => row.label.proposalCorrect !== null);
	const retires = scans.flatMap((scan) =>
		scan.inbox
			.filter((item) => item.action === 'retire')
			.map((item) => ({ item, label: labelRetire(dataset, item.suggestionId) }))
	);
	const retireJudged = retires.filter((row) => row.label !== 'excluded');
	const latencies = scans.flatMap((scan) => scan.latencyMs);
	const countBy = (values: readonly string[]) =>
		values.reduce<Record<string, number>>((acc, value) => {
			acc[value] = (acc[value] ?? 0) + 1;
			return acc;
		}, {});
	const autoPrecision = ratio(
		autoJudged.filter((row) => row.label.proposalCorrect).length,
		autoJudged.length
	);
	return {
		dataset: {
			source: dataset.source,
			userId: dataset.userId,
			window: dataset.window,
			readAt: dataset.readAt,
			turns: dataset.turns.length,
			projects: dataset.projects.length
		},
		signals: params.signals.length,
		scans: {
			total: scans.length,
			byStatus: countBy(scans.map((scan) => scan.status)),
			skipReasons: countBy(scans.filter((scan) => scan.reason).map((scan) => scan.reason!)),
			partialEntities: labeled.filter((row) => row.entity.partialFields.length).length
		},
		labels: {
			evaluated: labeled.length,
			byLabel: countBy(labeled.map((row) => row.label.label)),
			excludedReasons: countBy(
				labeled
					.filter((row) => row.label.label === 'excluded')
					.map((row) => row.label.reason)
			)
		},
		calibration: {
			n: points.length,
			auroc: auroc(points),
			prAuc: prAuc(points),
			reliability: reliabilityBins(points)
		},
		cardTop3: {
			n: top3.length,
			precision: ratio(
				top3.filter((row) => row.label.label === 'positive').length,
				top3.length
			)
		},
		wouldAutoApply: {
			n: auto.length,
			judged: autoJudged.length,
			precision: autoPrecision,
			target: 0.95,
			meetsTarget: autoPrecision === null ? null : autoPrecision >= 0.95
		},
		retire: {
			n: retires.length,
			judged: retireJudged.length,
			precision: ratio(
				retireJudged.filter((row) => row.label === 'correct').length,
				retireJudged.length
			)
		},
		jev: {
			...params.jev,
			requests: scans.reduce((sum, scan) => sum + scan.requests.length, 0),
			costUsd: scans.reduce((sum, scan) => sum + scan.costUsd, 0),
			latencyMs: { p50: percentile(latencies, 0.5), p95: percentile(latencies, 0.95) }
		}
	};
}

/** --ledger: the same calibration from live ledger outcomes. */
export function buildLedgerReport(dataset: BacktestDataset) {
	const entityFlags = dataset.ledgerFlags.filter((flag) => flag.subject_kind !== 'inbox_item');
	const points: ScoredPoint[] = entityFlags
		.filter((flag) => flag.outcome === 'stale' || flag.outcome === 'not_stale')
		.map((flag) => ({ p: Number(flag.probability), y: flag.outcome === 'stale' ? 1 : 0 }));
	const auto = entityFlags.filter(
		(flag) => flag.disposition === 'auto_applied' && flag.outcome && flag.outcome !== 'unknown'
	);
	const retired = dataset.ledgerFlags.filter(
		(flag) => flag.subject_kind === 'inbox_item' && flag.disposition === 'retired'
	);
	const retiredJudged = retired.filter((flag) => flag.outcome && flag.outcome !== 'unknown');
	return {
		flags: dataset.ledgerFlags.length,
		calibration: {
			n: points.length,
			auroc: auroc(points),
			prAuc: prAuc(points),
			reliability: reliabilityBins(points)
		},
		autoApplied: {
			judged: auto.length,
			kept: ratio(auto.filter((flag) => flag.outcome === 'stale').length, auto.length)
		},
		retire: {
			judged: retiredJudged.length,
			precision: ratio(
				retiredJudged.filter((flag) => flag.outcome === 'stale').length,
				retiredJudged.length
			)
		}
	};
}

// ---------------------------------------------------------------------------
// Output (redacted by default)
// ---------------------------------------------------------------------------

export function redactScan(scan: ScanRecord, includeText: boolean): ScanRecord {
	if (includeText) return scan;
	return {
		...scan,
		entities: scan.entities.map((entity) => ({
			...entity,
			evidenceExcerpt:
				entity.evidenceExcerpt === null
					? null
					: `[redacted: ${entity.evidenceExcerpt.length} chars]`
		}))
	};
}

const fmt = (value: number | null | undefined, digits = 3) =>
	value === null || value === undefined ? 'n/a' : value.toFixed(digits);

export function formatReplayReport(report: BacktestReport): string {
	const lines = [
		`Freshness radar backtest: ${report.dataset.source}, user ${report.dataset.userId}`,
		`  window ${report.dataset.window.from} .. ${report.dataset.window.to} (read ${report.dataset.readAt})`,
		`  turns ${report.dataset.turns}, projects ${report.dataset.projects}, pseudo-signals ${report.signals}`,
		`  scans ${report.scans.total} ${JSON.stringify(report.scans.byStatus)} skips ${JSON.stringify(report.scans.skipReasons)}`,
		`  evaluated ${report.labels.evaluated} ${JSON.stringify(report.labels.byLabel)} excluded ${JSON.stringify(report.labels.excludedReasons)}; partial reconstructions ${report.scans.partialEntities}`,
		`  P(stale): AUROC ${fmt(report.calibration.auroc)}, PR-AUC ${fmt(report.calibration.prAuc)} (n=${report.calibration.n})`,
		'  reliability:',
		...report.calibration.reliability
			.filter((bin) => bin.n)
			.map(
				(bin) =>
					`    ${bin.range}: n=${bin.n} meanP=${fmt(bin.meanP, 2)} positive=${fmt(bin.positiveRate, 2)}`
			),
		`  card top-3 precision ${fmt(report.cardTop3.precision)} (n=${report.cardTop3.n})`,
		`  would-auto-apply ${report.wouldAutoApply.n}, precision ${fmt(report.wouldAutoApply.precision)} of ${report.wouldAutoApply.judged} judged (target >= 0.95: ${report.wouldAutoApply.meetsTarget ?? 'n/a'})`,
		`  retire ${report.retire.n}, precision ${fmt(report.retire.precision)} of ${report.retire.judged} judged`,
		`  jev ${report.jev.mode}: ${report.jev.requests} requests, cache hits ${report.jev.hits}, misses ${report.jev.misses}, live ${report.jev.liveCalls}, cost $${report.jev.costUsd.toFixed(5)}, latency p50 ${report.jev.latencyMs.p50 ?? 'n/a'}ms p95 ${report.jev.latencyMs.p95 ?? 'n/a'}ms`
	];
	return lines.join('\n');
}

export function formatReadPlan(params: {
	args: BacktestArgs;
	window: { from: string; to: string };
	outDir: string;
	counts?: { users: number; projects: number; turns: number; sessions: number } | null;
}): string {
	const { args } = params;
	const source = args.fixture
		? `fixture ${args.fixture} (local file)`
		: args.dbUrl
			? `database ${safeHost(args.dbUrl)} (read-only proxy)`
			: 'none (dry run: pass --fixture, or --db-url with the opt-in)';
	return [
		'Freshness radar backtest: READ PLAN',
		`  source:   ${source}`,
		`  user:     ${args.userId ?? '(from the fixture)'}`,
		`  window:   ${params.window.from} .. ${params.window.to} (+${args.horizonDays}d label horizon, -7d context lookback)`,
		`  projects: ${args.projectIds.length ? args.projectIds.join(', ') : 'every project with the user’s turns'}`,
		...(params.counts
			? [
					`  counts:   users ${params.counts.users}, projects ${params.counts.projects}, sessions ${params.counts.sessions}, turns ${params.counts.turns}`
				]
			: []),
		`  reads:    ${args.fixture ? 'the fixture file only' : BACKTEST_READ_TABLES.join('; ')}${args.ledger ? '; freshness_flags' : ''}`,
		'  writes:   none (insert/update/upsert/delete and every rpc throw)',
		`  jev:      ${args.jev} (${args.model})`,
		`  output:   ${params.outDir} (${args.includeText ? 'WITH message text' : 'text redacted'})`
	].join('\n');
}

function safeHost(url: string): string {
	try {
		return new URL(url).host;
	} catch {
		return '(invalid url)';
	}
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export type CliIo = {
	log: (line: string) => void;
	now: () => Date;
	/** Test seam: the database client factory (never called in dry runs). */
	createDb?: (url: string, key: string) => Promise<ReadDb>;
};

async function defaultCreateDb(url: string, key: string): Promise<ReadDb> {
	const { createClient } = await import('@supabase/supabase-js');
	return createClient(url, key, {
		auth: { persistSession: false, autoRefreshToken: false }
	}) as unknown as ReadDb;
}

function writeOutputs(outDir: string, files: Record<string, string>) {
	mkdirSync(outDir, { recursive: true });
	for (const [name, content] of Object.entries(files)) writeFileSync(join(outDir, name), content);
}

/** Returns the exit code: 0 ok, 2 usage, 3 refused. */
export async function runBacktestCli(
	argv: readonly string[],
	env: Record<string, string | undefined>,
	io: CliIo = { log: (line) => console.log(line), now: () => new Date() }
): Promise<number> {
	const args = parseBacktestArgs(argv, env);
	if (args.errors.length) {
		if (!args.errors.includes('help')) io.log(`Error: ${args.errors.join('; ')}`);
		io.log(BACKTEST_USAGE);
		return 2;
	}
	const now = io.now();
	const today = localToday(now);
	const stamp = now.toISOString().replace(/[:.]/g, '-');
	const outDir = resolve(args.outDir ?? join(REPO_ROOT, 'tmp/freshness-backtest', stamp));
	const cacheDir = resolve(args.cacheDir ?? join(REPO_ROOT, 'tmp/freshness-backtest/jev-cache'));
	const window = {
		from: args.from ?? new Date(now.getTime() - 14 * DAY_MS).toISOString(),
		to: args.to ?? now.toISOString()
	};
	const needsOptIn = Boolean(args.dbUrl) || args.jev === 'live';

	let dataset: BacktestDataset;
	if (args.fixture) {
		if (needsOptIn) {
			const optIn = checkOptIn(args, env, today);
			if (!optIn.ok) {
				io.log(`Refused: --jev live needs ${optIn.missing.join(', ')}.`);
				return 3;
			}
		}
		dataset = parseDataset(JSON.parse(readFileSync(resolve(args.fixture), 'utf8')));
		io.log(
			formatReadPlan({
				args: { ...args, userId: dataset.userId },
				window: dataset.window,
				outDir,
				counts: {
					users: 1,
					projects: dataset.projects.length,
					sessions: dataset.sessions.length,
					turns: dataset.turns.length
				}
			})
		);
	} else {
		io.log(formatReadPlan({ args, window, outDir }));
		if (!args.execute) {
			io.log(
				`\nDRY RUN: nothing was read and no model was called. A database run needs FRESHNESS_BACKTEST_DJ_OK=yes, --confirm DJ-OK:${today}, --execute, --db-url and --user.`
			);
			return 0;
		}
		const optIn = checkOptIn(args, env, today);
		if (!optIn.ok) {
			io.log(`Refused: missing ${optIn.missing.join(', ')}.`);
			return 3;
		}
		const key = env.FRESHNESS_BACKTEST_SUPABASE_KEY;
		if (!args.dbUrl || !key || !args.userId) {
			io.log(
				'Refused: a database run needs --db-url, --user and FRESHNESS_BACKTEST_SUPABASE_KEY.'
			);
			return 3;
		}
		const db = readOnlyClient(await (io.createDb ?? defaultCreateDb)(args.dbUrl, key));
		const turns = await countTurns(db, args.userId, window.from, window.to);
		io.log(`  turns in window: ${turns}`);
		dataset = await loadDatasetFromDb(db, {
			userId: args.userId,
			from: window.from,
			to: window.to,
			projectIds: args.projectIds,
			ledger: args.ledger,
			now
		});
	}

	if (args.ledger) {
		const report = buildLedgerReport(dataset);
		writeOutputs(outDir, { 'ledger-report.json': `${JSON.stringify(report, null, 2)}\n` });
		io.log(`\n${JSON.stringify(report, null, 2)}\nWrote ${outDir}`);
		return 0;
	}

	const live =
		args.jev === 'live' && env.PRIVATE_OPENROUTER_API_KEY
			? new JevClient({
					apiKey: env.PRIVATE_OPENROUTER_API_KEY,
					model: args.model,
					timeoutMs: FRESHNESS_POLICY_V1.jev.timeoutMs,
					maxRequestBytes: FRESHNESS_POLICY_V1.jev.maxRequestBytes,
					retryOnce: true,
					title: 'BuildOS Freshness Radar Backtest'
				})
			: null;
	if (args.jev === 'live' && !live) {
		io.log('Refused: --jev live needs PRIVATE_OPENROUTER_API_KEY.');
		return 3;
	}
	const jev = new BacktestJev({
		mode: args.jev,
		model: args.model,
		cacheDir,
		inline: dataset.jevCache,
		live,
		timeoutMs: FRESHNESS_POLICY_V1.jev.timeoutMs
	});
	const replay = await replayDataset({
		dataset,
		jev,
		model: args.model,
		projectFilter: args.projectIds
	});
	const report = buildReplayReport({
		dataset,
		signals: replay.signals,
		scans: replay.scans,
		horizonDays: args.horizonDays,
		jev: { mode: args.jev, hits: jev.hits, misses: jev.misses, liveCalls: jev.liveCalls }
	});
	writeOutputs(outDir, {
		'report.json': `${JSON.stringify(report, null, 2)}\n`,
		'report.txt': `${formatReplayReport(report)}\n`,
		'scans.jsonl': replay.scans
			.map((scan) => JSON.stringify(redactScan(scan, args.includeText)))
			.join('\n')
			.concat('\n')
	});
	io.log(`\n${formatReplayReport(report)}\nWrote ${outDir}`);
	return 0;
}

if (require.main === module) {
	runBacktestCli(process.argv.slice(2), process.env).then(
		(code) => {
			process.exitCode = code;
		},
		(error) => {
			console.error(error instanceof Error ? error.stack : error);
			process.exitCode = 1;
		}
	);
}
