// apps/worker/tests/freshnessRadarWorker.test.ts
//
// Tasker 88 Lane B: the side-effect stages and the queue job, against an
// in-memory PostgREST-subset fake with the frozen unique indexes and ledger
// CHECK constraints. No network, no hosted database, no live model: Jev is a
// scripted JevDecider.
import type { JevDecider, JevDecisionResult, JevQuestionSet } from '@buildos/smart-llm';
import { parseFreshnessCardPayloadV1 } from '@buildos/shared-types';
import { describe, expect, it, vi } from 'vitest';
import {
	reconcileClaimedAutoApplies,
	runAutoApply,
	type AutoApplyCandidate
} from '../src/workers/freshness-radar/autoApply';
import { deliverFreshnessCard, isFreshnessCardRow } from '../src/workers/freshness-radar/card';
import { buildFreshnessScanContext } from '../src/workers/freshness-radar/context';
import { SupabaseFreshnessDataPort } from '../src/workers/freshness-radar/dataPort';
import { FRESHNESS_POLICY_V1 } from '../src/workers/freshness-radar/freshnessPolicy';
import {
	processFreshnessRadarScanJob,
	type FreshnessRadarDeps
} from '../src/workers/freshness-radar/signalJob';

// ---------------------------------------------------------------------------
// In-memory PostgREST subset
// ---------------------------------------------------------------------------

type Row = Record<string, any>;
type Filter = (row: Row) => boolean;
type Result = { data: any; error: { code: string; message: string } | null };

const NOW = new Date('2026-09-18T15:00:00.000Z');

function cmp(a: unknown, b: unknown): number {
	if (typeof a === 'string' && typeof b === 'string') {
		const left = Date.parse(a);
		const right = Date.parse(b);
		if (
			/^\d{4}-\d{2}-\d{2}/.test(a) &&
			/^\d{4}-\d{2}-\d{2}/.test(b) &&
			Number.isFinite(left) &&
			Number.isFinite(right)
		) {
			return left - right;
		}
		return a.localeCompare(b);
	}
	return Number(a) - Number(b);
}

type Unique = { name: string; key: (row: Row) => string | null };

class MemoryDb {
	tables = new Map<string, Row[]>();
	rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
	private seq = 0;
	private uniques: Record<string, Unique[]> = {
		freshness_scans: [
			{
				name: 'freshness_scans_signal_project',
				key: (r) => (r.signal_id ? `${r.signal_id}:${r.project_id}` : null)
			},
			{
				name: 'freshness_scans_one_running',
				key: (r) => (r.status === 'running' ? r.project_id : null)
			}
		],
		project_suggestions: [
			{
				name: 'project_suggestions_one_pending_freshness',
				key: (r) =>
					r.kind === 'freshness_update' && r.status === 'pending' ? r.project_id : null
			}
		],
		chat_messages: [
			{
				name: 'uq_chat_messages_session_idempotency_key',
				key: (r) =>
					r.metadata?.idempotency_key
						? `${r.session_id}:${r.metadata.idempotency_key}`
						: null
			}
		],
		freshness_radar_signals: [
			{ name: 'pending_session', key: (r) => (r.status === 'pending' ? r.session_id : null) }
		]
	};

	constructor(private readonly clock: () => Date = () => NOW) {}

	table(name: string): Row[] {
		if (!this.tables.has(name)) this.tables.set(name, []);
		return this.tables.get(name)!;
	}

	seed(name: string, rows: Row[]) {
		for (const row of rows) this.table(name).push(this.withDefaults(row));
	}

	private withDefaults(row: Row): Row {
		const now = this.clock().toISOString();
		return {
			id: row.id ?? `00000000-0000-4000-8000-${String(++this.seq).padStart(12, '0')}`,
			created_at: now,
			updated_at: now,
			...row
		};
	}

	private check(table: string, row: Row): string | null {
		if (
			table === 'chat_messages' &&
			row.message_type !== undefined &&
			![
				'user_message',
				'assistant_message',
				'system_notification',
				'operation_summary',
				'phase_update'
			].includes(row.message_type)
		) {
			return 'chat_messages_message_type_check'; // the production CHECK
		}
		if (table === 'freshness_flags') {
			if (
				row.disposition === 'auto_applied' &&
				!(
					row.applied_via === 'auto' &&
					row.applied_at &&
					row.undo_operation &&
					row.applied_after_updated_at
				)
			) {
				return 'freshness_flags_auto_has_undo';
			}
			if (row.disposition === 'retired' && !row.undo_operation)
				return 'freshness_flags_retired_has_undo';
			if (
				![
					'evaluated',
					'surfaced',
					'drafted',
					'auto_apply_pending',
					'auto_applied',
					'auto_apply_skipped',
					'retired',
					'marked_possibly_stale',
					'suppressed'
				].includes(row.disposition)
			) {
				return 'freshness_flags_disposition_check';
			}
		}
		if (
			table === 'project_suggestions' &&
			(row.kind === 'freshness_update') !== Boolean(row.freshness_scan_id)
		) {
			return 'project_suggestions_freshness_parent_check';
		}
		return null;
	}

	private conflict(table: string, candidate: Row, ignore: Row | null): string | null {
		for (const unique of this.uniques[table] ?? []) {
			const key = unique.key(candidate);
			if (key === null) continue;
			if (this.table(table).some((row) => row !== ignore && unique.key(row) === key))
				return unique.name;
		}
		return null;
	}

	rpc = async (name: string, args: Record<string, unknown> = {}): Promise<Result> => {
		this.rpcCalls.push({ name, args });
		if (name === 'add_queue_job') {
			this.seed('queue_jobs', [
				{
					job_type: args.p_job_type,
					dedup_key: args.p_dedup_key,
					scheduled_for: args.p_scheduled_for,
					metadata: args.p_metadata
				}
			]);
			return { data: 'job', error: null };
		}
		return { data: null, error: { code: 'PGRST202', message: `no rpc ${name}` } };
	};

	from = (table: string) => {
		const db = this;
		const filters: Filter[] = [];
		let op: 'select' | 'insert' | 'update' = 'select';
		let payload: Row | Row[] | null = null;
		let returning = false;
		let order: { column: string; ascending: boolean } | null = null;
		let limit: number | null = null;

		const run = async (mode: 'many' | 'single' | 'maybe'): Promise<Result> => {
			let rows: Row[];
			if (op === 'insert') {
				const inputs = (Array.isArray(payload) ? payload : [payload!]).map((row) =>
					db.withDefaults(row)
				);
				for (const row of inputs) {
					const failed = db.check(table, row);
					if (failed) return { data: null, error: { code: '23514', message: failed } };
					const conflict = db.conflict(table, row, null);
					if (conflict)
						return { data: null, error: { code: '23505', message: conflict } };
					db.table(table).push(row);
				}
				rows = inputs;
			} else {
				rows = db.table(table).filter((row) => filters.every((filter) => filter(row)));
				if (op === 'update') {
					for (const row of rows) {
						const next: Row = { ...row, ...payload };
						if ('updated_at' in row && !(payload && 'updated_at' in payload)) {
							next.updated_at = db.clock().toISOString();
						}
						const failed = db.check(table, next);
						if (failed)
							return { data: null, error: { code: '23514', message: failed } };
						const conflict = db.conflict(table, next, row);
						if (conflict)
							return { data: null, error: { code: '23505', message: conflict } };
					}
					for (const row of rows) {
						const next: Row = { ...payload };
						if ('updated_at' in row && !(payload && 'updated_at' in payload)) {
							next.updated_at = db.clock().toISOString();
						}
						Object.assign(row, next);
					}
				}
				if (order) {
					const { column, ascending } = order;
					rows = [...rows].sort(
						(a, b) => (ascending ? 1 : -1) * cmp(a[column], b[column])
					);
				}
				if (limit !== null) rows = rows.slice(0, limit);
			}
			const data = rows.map((row) => structuredClone(row));
			if (op !== 'select' && !returning) return { data: null, error: null };
			if (mode === 'many') return { data, error: null };
			if (data.length > 1)
				return { data: null, error: { code: 'PGRST116', message: 'multiple rows' } };
			if (mode === 'single' && data.length === 0) {
				return { data: null, error: { code: 'PGRST116', message: 'no rows' } };
			}
			return { data: data[0] ?? null, error: null };
		};

		const chain: any = {
			select() {
				if (op !== 'select') returning = true;
				return chain;
			},
			insert(rows: Row | Row[]) {
				op = 'insert';
				payload = rows;
				return chain;
			},
			update(patch: Row) {
				op = 'update';
				payload = patch;
				return chain;
			},
			eq(column: string, value: unknown) {
				filters.push((row) => value !== null && row[column] === value);
				return chain;
			},
			neq(column: string, value: unknown) {
				filters.push((row) => row[column] !== null && row[column] !== value);
				return chain;
			},
			in(column: string, values: unknown[]) {
				filters.push((row) => values.includes(row[column]));
				return chain;
			},
			or(expression: string) {
				filters.push((row) => matchesPostgrestOr(row, expression));
				return chain;
			},
			is(column: string, value: null) {
				filters.push((row) => (row[column] ?? null) === value);
				return chain;
			},
			gt(column: string, value: unknown) {
				filters.push(
					(row) =>
						row[column] !== null &&
						row[column] !== undefined &&
						cmp(row[column], value) > 0
				);
				return chain;
			},
			gte(column: string, value: unknown) {
				filters.push(
					(row) =>
						row[column] !== null &&
						row[column] !== undefined &&
						cmp(row[column], value) >= 0
				);
				return chain;
			},
			lt(column: string, value: unknown) {
				filters.push(
					(row) =>
						row[column] !== null &&
						row[column] !== undefined &&
						cmp(row[column], value) < 0
				);
				return chain;
			},
			lte(column: string, value: unknown) {
				filters.push(
					(row) =>
						row[column] !== null &&
						row[column] !== undefined &&
						cmp(row[column], value) <= 0
				);
				return chain;
			},
			order(column: string, options: { ascending?: boolean } = {}) {
				order = { column, ascending: options.ascending !== false };
				return chain;
			},
			limit(value: number) {
				limit = value;
				return chain;
			},
			single: () => run('single'),
			maybeSingle: () => run('maybe'),
			then(resolve: (value: Result) => unknown, reject?: (reason: unknown) => unknown) {
				return run('many').then(resolve, reject);
			}
		};
		return chain;
	};
}

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

// Just enough PostgREST `or=(...)` grammar for the data port: `col.eq.value` terms and `and(...)`.
function splitPostgrestTerms(expression: string): string[] {
	const terms: string[] = [];
	let depth = 0;
	let current = '';
	for (const char of expression) {
		if (char === '(') depth += 1;
		if (char === ')') depth -= 1;
		if (char === ',' && depth === 0) {
			terms.push(current);
			current = '';
		} else current += char;
	}
	return current ? [...terms, current] : terms;
}

function matchesPostgrestTerm(row: Row, term: string): boolean {
	if (term.startsWith('and(') && term.endsWith(')')) {
		return splitPostgrestTerms(term.slice(4, -1)).every((part) =>
			matchesPostgrestTerm(row, part)
		);
	}
	const [column, operator, ...value] = term.split('.');
	if (operator !== 'eq') throw new Error(`MemoryDb.or does not support "${term}"`);
	return row[column!] !== null && String(row[column!]) === value.join('.');
}

function matchesPostgrestOr(row: Row, expression: string): boolean {
	return splitPostgrestTerms(expression).some((term) => matchesPostgrestTerm(row, term));
}

const USER = '11111111-1111-4111-8111-111111111111';
const ACTOR = '22222222-2222-4222-8222-222222222222';
const OTHER_ACTOR = '22222222-2222-4222-8222-999999999999';
const PROJECT = '33333333-3333-4333-8333-333333333333';
const SESSION = '44444444-4444-4444-8444-444444444444';
const SIGNAL = '55555555-5555-4555-8555-555555555555';
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

const DUMP =
	'Quick update on the store. The investor deck is done and sent to Jen. The venue contract is now due Oct 3. Still waiting on the caterer quote.';

function seedStore(db: MemoryDb, options: { flags?: string[]; dueAt?: string } = {}) {
	db.seed('users', [{ id: USER, timezone: 'America/New_York' }]);
	db.seed('onto_actors', [{ id: ACTOR, user_id: USER, created_at: '2026-01-01T00:00:00.000Z' }]);
	db.seed('onto_projects', [
		{
			id: PROJECT,
			name: 'Pop-up store',
			description: 'Open the pop-up store',
			deleted_at: null,
			archived_at: null
		}
	]);
	db.seed(
		'feature_flags',
		(
			options.flags ?? [
				'freshness_radar',
				'freshness_radar.surfaces',
				'freshness_radar.auto_apply',
				'freshness_radar.inbox_cleanup'
			]
		).map((feature_name) => ({ user_id: USER, feature_name, enabled: true }))
	);
	db.seed('chat_sessions', [
		{
			id: SESSION,
			user_id: USER,
			context_type: 'project',
			entity_id: PROJECT,
			updated_at: '2026-09-18T14:55:00.000Z'
		}
	]);
	db.seed('chat_messages', [
		{
			id: 'm-dump',
			session_id: SESSION,
			user_id: USER,
			role: 'user',
			content: DUMP,
			metadata: {},
			created_at: '2026-09-18T14:50:00.000Z'
		},
		{
			id: 'm-ack',
			session_id: SESSION,
			user_id: USER,
			role: 'user',
			content: 'ok thanks',
			metadata: {},
			created_at: '2026-09-18T14:52:00.000Z'
		},
		{
			id: 'm-asst',
			session_id: SESSION,
			user_id: USER,
			role: 'assistant',
			content: 'The deck is done, noted.',
			metadata: {},
			created_at: '2026-09-18T14:51:00.000Z'
		}
	]);
	db.seed('chat_turn_runs', [
		{
			id: 'turn-1',
			session_id: SESSION,
			user_message_id: 'm-dump',
			status: 'completed',
			created_at: '2026-09-18T14:50:00.000Z'
		}
	]);
	const old = '2026-09-01T12:00:00.000Z';
	const task = (id: string, title: string, extra: Row = {}) => ({
		id,
		project_id: PROJECT,
		title,
		description: null,
		state_key: 'todo',
		start_at: null,
		due_at: null,
		props: {},
		created_at: old,
		updated_at: old,
		archived_at: null,
		deleted_at: null,
		completed_at: null,
		...extra
	});
	db.seed('onto_tasks', [
		task(T_DECK, 'Investor deck', { state_key: 'in_progress' }),
		task(T_VENUE, 'Venue contract', { due_at: options.dueAt ?? '2026-10-01T03:59:59.000Z' }),
		task(T_CATERING, 'Caterer quote')
	]);
	db.seed('onto_goals', [
		{
			id: G_OPEN,
			project_id: PROJECT,
			name: 'Open the store',
			description: null,
			goal: null,
			state_key: 'active',
			target_date: '2026-10-31',
			props: {},
			created_at: old,
			updated_at: old,
			archived_at: null,
			deleted_at: null,
			completed_at: null
		}
	]);
	db.seed('onto_milestones', [
		{
			id: M_SOFT,
			project_id: PROJECT,
			title: 'Soft opening',
			description: null,
			milestone: null,
			state_key: 'pending',
			due_at: '2026-10-10T03:59:59.000Z',
			props: {},
			created_at: old,
			updated_at: old,
			archived_at: null,
			deleted_at: null,
			completed_at: null
		}
	]);
	db.seed('onto_documents', [
		{
			id: D_PLAN,
			project_id: PROJECT,
			title: 'Launch plan',
			description: 'Venue, catering and the investor deck timeline',
			state_key: 'draft',
			type_key: 'document.plan',
			props: {},
			created_at: old,
			updated_at: old,
			archived_at: null,
			deleted_at: null,
			content: 'Plan body'
		},
		{
			id: D_START,
			project_id: PROJECT,
			title: 'Start here',
			description: 'Investor deck venue contract',
			state_key: 'draft',
			type_key: 'document.context.project',
			props: {},
			created_at: old,
			updated_at: old,
			archived_at: null,
			deleted_at: null
		}
	]);
	db.seed('onto_edges', [
		{
			project_id: PROJECT,
			src_kind: 'goal',
			src_id: G_OPEN,
			dst_kind: 'task',
			dst_id: T_DECK,
			rel: 'has_task'
		},
		{
			project_id: PROJECT,
			src_kind: 'goal',
			src_id: G_OPEN,
			dst_kind: 'task',
			dst_id: T_VENUE,
			rel: 'has_task'
		},
		{
			project_id: PROJECT,
			src_kind: 'goal',
			src_id: G_OPEN,
			dst_kind: 'milestone',
			dst_id: M_SOFT,
			rel: 'has_milestone'
		}
	]);
	db.seed('project_suggestions', [
		{
			id: S_OLD,
			project_id: PROJECT,
			kind: 'task_conflict',
			status: 'pending',
			title: 'Resolve the investor deck overlap',
			operations: [{ tool: 'update_onto_task', args: { task_id: T_DECK, props: { x: 1 } } }],
			created_at: '2026-09-10T12:00:00.000Z'
		}
	]);
	db.seed('inbox_items', [
		{
			id: INBOX_OLD,
			source_type: 'project_suggestion',
			source_ref_id: S_OLD,
			source_status: 'pending',
			project_id: PROJECT,
			audience: 'project_members',
			status: 'pending',
			title: 'Resolve the investor deck overlap',
			summary: null,
			risk_tier: 2,
			snoozed_until: null,
			expires_at: null,
			freshness_state: 'fresh',
			freshness_flag_id: null,
			created_at: '2026-09-10T12:00:00.000Z',
			updated_at: '2026-09-10T12:00:00.000Z'
		}
	]);
	db.seed('freshness_radar_signals', [
		{
			id: SIGNAL,
			session_id: SESSION,
			user_id: USER,
			status: 'pending',
			project_id_hints: [PROJECT],
			first_turn_at: '2026-09-18T14:50:00.000Z',
			last_turn_at: '2026-09-18T14:50:00.000Z',
			due_at: '2026-09-18T14:59:00.000Z',
			queue_job_id: JOB_ROW
		}
	]);
}

type AnswerOverrides = Record<string, unknown>;

/** Answers every question in a request: defaults are calm "nothing changed". */
function scriptedJev(overrides: AnswerOverrides, options: { fail?: string } = {}) {
	const calls: Array<{ state: any; questions: JevQuestionSet }> = [];
	const decider: JevDecider = {
		decide: async <Qs extends JevQuestionSet>(req: { state: unknown; questions: Qs }) => {
			calls.push({ state: req.state, questions: req.questions });
			const receipt = {
				modelRequested: 'typesafe/jev-1.13',
				modelUsed: 'typesafe/jev-1.13-20260917',
				requestId: 'gen-1',
				inputTokens: 1_000,
				outputTokens: 100,
				costUsd: 0.0002,
				durationMs: 420,
				requestBytes: 1,
				questionCount: Object.keys(req.questions).length,
				attempts: 1
			};
			if (options.fail)
				return {
					ok: false,
					error: options.fail,
					receipt
				} as unknown as JevDecisionResult<Qs>;
			const answers: Record<string, unknown> = {};
			for (const [key, question] of Object.entries(req.questions)) {
				if (key in overrides) {
					answers[key] = overrides[key];
					continue;
				}
				if (question.type === 'noul') answers[key] = { type: 'noul', noul: 0.05 };
				else if (question.type === 'choice') {
					const options = Object.keys(question.criteria);
					const chosen = options.includes('no_change_needed')
						? 'no_change_needed'
						: options.includes('none')
							? 'none'
							: options[0]!;
					answers[key] = {
						type: 'choice',
						choice: chosen,
						confidence: 0.9,
						probabilities: Object.fromEntries(
							options.map((option) => [
								option,
								option === chosen ? 0.9 : 0.1 / (options.length - 1)
							])
						)
					};
				} else {
					answers[key] = {
						type: 'score',
						score: 2,
						confidence: 0.8,
						probabilities: { '0': 0, '1': 0, '2': 1, '3': 0 }
					};
				}
			}
			return {
				ok: true,
				answers,
				receipt,
				rawResponse: { answers }
			} as unknown as JevDecisionResult<Qs>;
		}
	};
	return { decider, calls };
}

function entityIndex(calls: Array<{ state: any }>, title: string): number {
	const r1 = calls.find((call) => Array.isArray(call.state.entities));
	return r1!.state.entities.findIndex((entity: { title: string }) => entity.title === title);
}

const choice = (chosen: string, probability: number, rest: Record<string, number> = {}) => ({
	type: 'choice',
	choice: chosen,
	confidence: probability,
	probabilities: { [chosen]: probability, ...rest }
});

function makeDeps(
	db: MemoryDb,
	jev: JevDecider | null,
	overrides: Partial<FreshnessRadarDeps> = {}
) {
	const gatewayCalls: Array<Record<string, unknown>> = [];
	const deps: FreshnessRadarDeps = {
		db,
		port: new SupabaseFreshnessDataPort(db),
		jev,
		mode: 'live',
		model: 'typesafe/jev-1.13',
		policy: FRESHNESS_POLICY_V1,
		now: () => NOW,
		runGateway: vi.fn(async (params) => {
			gatewayCalls.push(params as unknown as Record<string, unknown>);
			const args = params.args as Record<string, unknown>;
			const task = db.table('onto_tasks').find((row) => row.id === args.task_id)!;
			if (typeof args.state_key === 'string') task.state_key = args.state_key;
			if (typeof args.due_at === 'string') task.due_at = `${args.due_at}T03:59:59.000Z`;
			task.updated_at = '2026-09-18T15:00:01.000Z';
			return { ok: true, data: { task: { ...task } } };
		}) as unknown as FreshnessRadarDeps['runGateway'],
		draftDeps: {
			verify: vi.fn(async (_db, input) => ({
				ok: true as const,
				summary: { operation_count: input.operations.length }
			})),
			fingerprint: vi.fn(async () => 'fp-1'),
			syncInbox: vi.fn(async () => undefined),
			applyBudget: vi.fn(async () => ({ promotedIds: [], deferredIds: [] }))
		},
		inboxOps: {
			retire: vi.fn(async (params) => {
				const suggestion = db
					.table('project_suggestions')
					.find((row) => row.id === params.suggestionId)!;
				if (suggestion.status !== 'pending') return { ok: false };
				suggestion.status = 'superseded';
				const inbox = db.table('inbox_items').find((row) => row.id === params.inboxItemId)!;
				const previous = inbox.status;
				inbox.status = 'expired';
				inbox.source_status = 'freshness_retired';
				return { ok: true, previousInboxStatus: previous };
			}),
			mark: vi.fn(async (params) => {
				const inbox = db.table('inbox_items').find((row) => row.id === params.inboxItemId)!;
				inbox.freshness_state = params.state;
				return true;
			})
		},
		...overrides
	};
	return { deps, gatewayCalls };
}

function job(overrides: Record<string, unknown> = {}) {
	return {
		id: 'freshness_radar_scan_x',
		queueRowId: JOB_ROW,
		processingToken: null,
		correlationId: null,
		userId: USER,
		data: { signalId: SIGNAL, sessionId: SESSION, userId: USER },
		attempts: 1,
		signal: new AbortController().signal,
		updateProgress: async () => undefined,
		log: async () => undefined,
		...overrides
	} as never;
}

/** Stale deck (done), venue due date (Oct 3), obsolete inbox item. */
function fullAnswers(calls: () => Array<{ state: any }>): AnswerOverrides {
	return new Proxy(
		{},
		{
			has: (_target, key) => typeof key === 'string' && key in resolve(calls()),
			get: (_target, key) => (typeof key === 'string' ? resolve(calls())[key] : undefined)
		}
	);
	function resolve(seen: Array<{ state: any }>): Record<string, unknown> {
		const out: Record<string, unknown> = { status_news: { type: 'noul', noul: 0.97 } };
		if (!seen.length) return out;
		const deck = entityIndex(seen, 'Investor deck');
		const venue = entityIndex(seen, 'Venue contract');
		if (deck >= 0) {
			out[`stale_${deck}`] = { type: 'noul', noul: 0.97 };
			out[`change_${deck}`] = choice('mark_done', 0.96, { no_change_needed: 0.04 });
		}
		if (venue >= 0) {
			out[`stale_${venue}`] = { type: 'noul', noul: 0.8 };
			out[`change_${venue}`] = choice('reschedule_due', 0.85, { no_change_needed: 0.15 });
			out[`date_${venue}`] = choice('d1', 0.9, { none: 0.1 });
		}
		out.obsolete_0 = { type: 'noul', noul: 0.95 };
		out.track_0 = {
			type: 'score',
			score: 0.9,
			confidence: 0.8,
			probabilities: { '0': 0.2, '1': 0.7, '2': 0.1, '3': 0 }
		};
		out.evidence_0 = { type: 'noul', noul: 0.9 };
		return out;
	}
}

function scripted(
	overridesFor: (calls: () => Array<{ state: any }>) => AnswerOverrides,
	options: { fail?: string } = {}
) {
	let seen: Array<{ state: any; questions: JevQuestionSet }> = [];
	const holder = { current: null as ReturnType<typeof scriptedJev> | null };
	const overrides = overridesFor(() => seen);
	holder.current = scriptedJev(overrides, options);
	seen = holder.current.calls;
	return holder.current;
}

// ---------------------------------------------------------------------------
// Queue job
// ---------------------------------------------------------------------------

describe('freshness_radar_scan job', () => {
	it('reschedules itself when the signal is not due yet', async () => {
		const db = new MemoryDb();
		seedStore(db);
		db.table('freshness_radar_signals')[0]!.due_at = '2026-09-18T15:01:30.000Z';
		const { deps } = makeDeps(db, scriptedJev({}).decider);
		const result = await processFreshnessRadarScanJob(job(), deps);
		expect(result).toEqual({ success: true, rescheduled: true });
		expect(db.rpcCalls[0]).toMatchObject({
			name: 'add_queue_job',
			args: {
				p_job_type: 'freshness_radar_scan',
				p_scheduled_for: '2026-09-18T15:01:30.000Z',
				p_dedup_key: `freshness-radar:${SIGNAL}:retry:2026-09-18T15:01`
			}
		});
		expect(db.table('freshness_radar_signals')[0]!.status).toBe('pending');
		expect(db.table('freshness_scans')).toHaveLength(0);
	});

	it('reschedules while a turn in the session is still running', async () => {
		const db = new MemoryDb();
		seedStore(db);
		db.seed('chat_turn_runs', [
			{ id: 'turn-2', session_id: SESSION, status: 'running', user_message_id: null }
		]);
		const { deps } = makeDeps(db, scriptedJev({}).decider);
		expect(await processFreshnessRadarScanJob(job(), deps)).toMatchObject({
			rescheduled: true
		});
		expect(db.rpcCalls[0]!.args.p_scheduled_for).toBe('2026-09-18T15:01:00.000Z');
	});

	it('closes the signal without scanning when the radar is off or the cohort flag is gone', async () => {
		const off = new MemoryDb();
		seedStore(off);
		const offDeps = makeDeps(off, scriptedJev({}).decider, { mode: 'off' }).deps;
		expect(await processFreshnessRadarScanJob(job(), offDeps)).toMatchObject({
			skipped: 'mode_off'
		});
		expect(off.table('freshness_radar_signals')[0]).toMatchObject({
			status: 'completed',
			error_message: 'radar_mode_off'
		});

		const noCohort = new MemoryDb();
		seedStore(noCohort, { flags: ['freshness_radar.surfaces'] });
		const cohortDeps = makeDeps(noCohort, scriptedJev({}).decider).deps;
		expect(await processFreshnessRadarScanJob(job(), cohortDeps)).toMatchObject({
			skipped: 'cohort_flag_off'
		});
		expect(noCohort.table('freshness_scans')).toHaveLength(0);
	});

	it('skips a scan with no window text and records the reason', async () => {
		const db = new MemoryDb();
		seedStore(db);
		db.tables.set(
			'chat_messages',
			db.table('chat_messages').filter((row) => row.id !== 'm-dump')
		);
		const jev = scriptedJev({});
		const { deps } = makeDeps(db, jev.decider);
		const result = await processFreshnessRadarScanJob(job(), deps);
		expect(result.scans).toEqual([
			{
				projectId: PROJECT,
				scanId: expect.any(String),
				status: 'skipped',
				reason: 'no_window_text'
			}
		]);
		expect(db.table('freshness_scans')[0]).toMatchObject({
			status: 'skipped',
			skip_reason: 'no_window_text',
			info_cursor_at: null
		});
		expect(jev.calls).toHaveLength(0);
		expect(db.table('freshness_radar_signals')[0]!.status).toBe('completed');
	});

	it('honours the per-project running-scan lock, and breaks a stale one', async () => {
		const db = new MemoryDb();
		seedStore(db);
		db.seed('freshness_scans', [
			{
				id: 'scan-running',
				project_id: PROJECT,
				user_id: USER,
				signal_id: null,
				status: 'running',
				started_at: '2026-09-18T14:59:00.000Z'
			}
		]);
		const { deps } = makeDeps(db, scripted(fullAnswers).decider);
		const locked = await processFreshnessRadarScanJob(job(), deps);
		expect(locked.scans).toEqual([
			{
				projectId: PROJECT,
				scanId: expect.any(String),
				status: 'skipped',
				reason: 'project_scan_running'
			}
		]);
		expect(db.table('freshness_flags')).toHaveLength(0);

		const stale = new MemoryDb();
		seedStore(stale);
		stale.seed('freshness_scans', [
			{
				id: 'scan-stale',
				project_id: PROJECT,
				user_id: USER,
				signal_id: null,
				status: 'running',
				started_at: '2026-09-18T14:00:00.000Z'
			}
		]);
		const staleDeps = makeDeps(stale, scripted(fullAnswers).decider).deps;
		const unlocked = await processFreshnessRadarScanJob(job(), staleDeps);
		expect(unlocked.scans![0]!.status).toBe('completed');
		expect(stale.table('freshness_scans').find((row) => row.id === 'scan-stale')).toMatchObject(
			{ status: 'failed', error_message: 'stale_running_scan' }
		);
	});

	it('fails closed and silent when Jev fails: no flags, no card, no writes', async () => {
		const db = new MemoryDb();
		seedStore(db);
		const { deps, gatewayCalls } = makeDeps(
			db,
			scripted(fullAnswers, { fail: 'jev_timeout' }).decider
		);
		const result = await processFreshnessRadarScanJob(job(), deps);
		expect(result.scans![0]).toMatchObject({
			status: 'failed',
			reason: expect.stringContaining('jev_timeout')
		});
		expect(db.table('freshness_scans')[0]).toMatchObject({
			status: 'failed',
			info_cursor_at: null,
			jev_requests: 3
		});
		expect(db.table('freshness_flags')).toHaveLength(0);
		expect(db.table('chat_messages').filter(isFreshnessCardRow)).toHaveLength(0);
		expect(
			db.table('project_suggestions').filter((row) => row.kind === 'freshness_update')
		).toHaveLength(0);
		expect(gatewayCalls).toHaveLength(0);
	});

	it('fails closed without an OpenRouter key', async () => {
		const db = new MemoryDb();
		seedStore(db);
		const { deps } = makeDeps(db, null);
		const result = await processFreshnessRadarScanJob(job(), deps);
		expect(result.scans![0]).toMatchObject({ status: 'failed', reason: 'jev_unconfigured' });
	});

	it('shadow mode writes the ledger only', async () => {
		const db = new MemoryDb();
		seedStore(db);
		const { deps, gatewayCalls } = makeDeps(db, scripted(fullAnswers).decider, {
			mode: 'shadow'
		});
		const result = await processFreshnessRadarScanJob(job(), deps);
		expect(result.scans![0]!.status).toBe('completed');
		const scan = db.table('freshness_scans')[0]!;
		expect(scan).toMatchObject({ mode: 'shadow', status: 'completed' });
		expect(scan.card_message_id ?? null).toBeNull();
		expect(scan.info_cursor_at).toBe('2026-09-18T14:50:00.000Z');
		const deck = db.table('freshness_flags').find((row) => row.subject_id === T_DECK)!;
		// The auto-apply rules still ran: the ledger records what live WOULD have applied.
		expect(deck).toMatchObject({
			disposition: 'drafted',
			disposition_reason: 'draft_auto_apply_disabled'
		});
		expect(deck.features.auto_apply_check).toBe('passed');
		const inbox = db.table('freshness_flags').find((row) => row.subject_kind === 'inbox_item')!;
		expect(inbox).toMatchObject({
			disposition: 'evaluated',
			disposition_reason: 'would_retire'
		});
		expect(db.table('freshness_track_scores').length).toBeGreaterThan(0);
		expect(gatewayCalls).toHaveLength(0);
		expect(
			db.table('project_suggestions').filter((row) => row.kind === 'freshness_update')
		).toHaveLength(0);
		expect(db.table('chat_messages').filter(isFreshnessCardRow)).toHaveLength(0);
		expect(db.table('inbox_items')[0]!.status).toBe('pending');
		expect(db.table('onto_tasks').find((row) => row.id === T_DECK)!.state_key).toBe(
			'in_progress'
		);
	});

	it('live: auto-applies, retires, drafts a bundle and delivers one card', async () => {
		const db = new MemoryDb();
		seedStore(db);
		const jev = scripted(fullAnswers);
		const { deps, gatewayCalls } = makeDeps(db, jev.decider);
		const result = await processFreshnessRadarScanJob(job(), deps);
		expect(result.scans![0]!.status).toBe('completed');

		// Auto-apply: the deck was marked done through the gateway, with undo.
		expect(gatewayCalls).toHaveLength(1);
		expect(gatewayCalls[0]).toMatchObject({
			userId: USER,
			op: 'onto.task.update',
			scope: {
				mode: 'read_write',
				project_ids: [PROJECT],
				allowed_ops: ['onto.task.update']
			},
			args: { task_id: T_DECK, state_key: 'done', calendar_sync: 'none' },
			chatSessionId: SESSION
		});
		const deck = db.table('freshness_flags').find((row) => row.subject_id === T_DECK)!;
		expect(deck).toMatchObject({
			disposition: 'auto_applied',
			applied_via: 'auto',
			applied_after_updated_at: '2026-09-18T15:00:01.000Z',
			undo_operation: {
				kind: 'entity_field',
				operation: {
					tool: 'update_onto_task',
					args: { task_id: T_DECK, project_id: PROJECT, state_key: 'in_progress' }
				},
				expectAfterUpdatedAt: '2026-09-18T15:00:01.000Z'
			}
		});

		// Draft bundle: the venue due date, one pending freshness_update row.
		const bundle = db
			.table('project_suggestions')
			.find((row) => row.kind === 'freshness_update')!;
		expect(bundle).toMatchObject({
			run_id: null,
			status: 'pending',
			chat_session_id: SESSION,
			risk_tier: 1,
			reversible: true,
			title: 'Update 1 out-of-date item',
			why_now: 'From your update on 2026-09-18 · 1 task',
			operations: [
				{
					tool: 'update_onto_task',
					args: { task_id: T_VENUE, project_id: PROJECT, due_at: '2026-10-03' }
				}
			],
			undo_operations: [
				{
					tool: 'update_onto_task',
					args: {
						task_id: T_VENUE,
						project_id: PROJECT,
						due_at: '2026-10-01T03:59:59.000Z'
					}
				}
			],
			evidence_refs: [{ entity_type: 'task', entity_id: T_VENUE, title: 'Venue contract' }]
		});
		expect(JSON.stringify(bundle)).not.toContain('Jen'); // never quotes chat
		const venue = db.table('freshness_flags').find((row) => row.subject_id === T_VENUE)!;
		expect(venue).toMatchObject({ disposition: 'drafted', suggestion_id: bundle.id });
		expect(deps.draftDeps.syncInbox).toHaveBeenCalledTimes(1);
		expect(deps.draftDeps.applyBudget).toHaveBeenCalled();

		// Inbox cleanup: the obsolete review suggestion was retired with undo.
		const retired = db
			.table('freshness_flags')
			.find((row) => row.subject_kind === 'inbox_item')!;
		expect(retired).toMatchObject({
			disposition: 'retired',
			undo_operation: {
				kind: 'inbox_retire',
				suggestionId: S_OLD,
				inboxItemId: INBOX_OLD,
				previousSuggestionStatus: 'pending',
				previousInboxStatus: 'pending'
			}
		});

		// Card: one injected assistant row with the frozen idempotency key.
		const cards = db.table('chat_messages').filter(isFreshnessCardRow);
		expect(cards).toHaveLength(1);
		const scan = db.table('freshness_scans')[0]!;
		expect(cards[0]!.metadata).toMatchObject({
			source: 'freshness_radar',
			kind: 'freshness_radar_card',
			freshness_scan_id: scan.id,
			idempotency_key: `freshness-scan:${scan.id}:card`
		});
		const card = parseFreshnessCardPayloadV1(cards[0]!.metadata.card)!;
		expect(card).not.toBeNull();
		expect(card.bundle).toEqual({ suggestionId: bundle.id, operationCount: 1 });
		expect(card.autoApplied).toEqual([
			{
				flagId: deck.id,
				entity: { kind: 'task', id: T_DECK, title: 'Investor deck' },
				summary: 'Mark done',
				undoableUntil: '2026-09-21T15:00:00.000Z'
			}
		]);
		expect(card.items[0]).toMatchObject({
			flagId: venue.id,
			disposition: 'drafted',
			proposal: { field: 'due_at', from: '2026-09-30', to: '2026-10-03' },
			evidenceExcerpt: 'The venue contract is now due Oct 3.'
		});
		expect(card.inboxCleanup.retired).toEqual([
			{ flagId: retired.id, title: 'Resolve the investor deck overlap' }
		]);
		expect(scan).toMatchObject({
			status: 'completed',
			card_message_id: cards[0]!.id,
			mode: 'live'
		});
		expect(scan.counts).toMatchObject({
			auto_applied: 1,
			drafted: 1,
			retired: 1,
			bundle_operations: 1
		});
		// Excluded: the Start Here document never reaches Jev.
		const r1 = jev.calls.find((call) => Array.isArray(call.state.entities))!;
		expect(r1.state.entities.map((entity: { title: string }) => entity.title)).not.toContain(
			'Start here'
		);
	});

	it('fails (not completes) a live scan aborted before its decisions were applied', async () => {
		const db = new MemoryDb();
		seedStore(db);
		const controller = new AbortController();
		const from = db.from;
		// Abort after the ledger is written but before any live side effect runs.
		db.from = (table: string) => {
			const builder = from(table);
			if (table !== 'freshness_track_scores') return builder;
			const insert = builder.insert;
			builder.insert = (...args: Parameters<typeof insert>) => {
				controller.abort();
				return insert(...args);
			};
			return builder;
		};
		const { deps, gatewayCalls } = makeDeps(db, scripted(fullAnswers).decider);
		const result = await processFreshnessRadarScanJob(job({ signal: controller.signal }), deps);
		expect(result.scans![0]).toMatchObject({ status: 'failed', reason: 'aborted' });
		// The cursor stays put so the next signal re-reads this evidence.
		expect(db.table('freshness_scans')[0]).toMatchObject({
			status: 'failed',
			error_message: 'aborted',
			info_cursor_at: null
		});
		expect(gatewayCalls).toHaveLength(0);
		expect(db.table('chat_messages').filter(isFreshnessCardRow)).toHaveLength(0);
	});

	it('retries instead of closing the signal when the feature flag read fails', async () => {
		const db = new MemoryDb();
		seedStore(db);
		const from = db.from;
		db.from = (table: string) => {
			if (table !== 'feature_flags') return from(table);
			const failing: any = {
				select: () => failing,
				eq: () => failing,
				in: () => failing,
				then: (resolve: (value: unknown) => unknown) =>
					Promise.resolve({ data: null, error: { message: 'connection reset' } }).then(
						resolve
					)
			};
			return failing;
		};
		const { deps } = makeDeps(db, scripted(fullAnswers).decider);
		await expect(processFreshnessRadarScanJob(job(), deps)).rejects.toThrow('connection reset');
		expect(db.table('freshness_radar_signals')[0]).toMatchObject({
			status: 'processing',
			queue_job_id: JOB_ROW
		});
	});

	it('a queue retry after a crash closes the interrupted scan and reconciles auto-applies', async () => {
		const db = new MemoryDb();
		seedStore(db);
		db.table('freshness_radar_signals')[0]!.status = 'processing';
		db.seed('freshness_scans', [
			{
				id: 'scan-crashed',
				project_id: PROJECT,
				user_id: USER,
				signal_id: SIGNAL,
				status: 'running',
				mode: 'live',
				started_at: '2026-09-18T14:59:30.000Z'
			}
		]);
		db.table('onto_tasks').find((row) => row.id === T_DECK)!.state_key = 'done';
		db.seed('freshness_flags', [
			{
				id: 'flag-claimed',
				scan_id: 'scan-crashed',
				project_id: PROJECT,
				user_id: USER,
				subject_kind: 'task',
				subject_id: T_DECK,
				subject_title: 'Investor deck',
				subject_snapshot: { state_key: 'in_progress' },
				disposition: 'auto_apply_pending',
				disposition_reason: 'auto_applying',
				proposed_operation: {
					tool: 'update_onto_task',
					args: { task_id: T_DECK, state_key: 'done' }
				},
				status: 'open'
			}
		]);
		const { deps } = makeDeps(db, scripted(fullAnswers).decider);
		const result = await processFreshnessRadarScanJob(job(), deps);
		expect(result.scans![0]).toMatchObject({
			scanId: 'scan-crashed',
			status: 'failed',
			reason: 'interrupted_before_finish'
		});
		expect(db.table('freshness_flags').find((row) => row.id === 'flag-claimed')).toMatchObject({
			disposition: 'auto_applied',
			disposition_reason: 'auto_applied_reconciled',
			undo_operation: {
				operation: {
					args: { task_id: T_DECK, project_id: PROJECT, state_key: 'in_progress' }
				}
			}
		});
		expect(db.table('freshness_radar_signals')[0]!.status).toBe('completed');
	});
});

// ---------------------------------------------------------------------------
// Auto-apply
// ---------------------------------------------------------------------------

describe('auto-apply write path', () => {
	function setup(extra: Row = {}) {
		const db = new MemoryDb();
		seedStore(db);
		db.seed('freshness_flags', [
			{
				id: 'flag-deck',
				scan_id: 'scan-1',
				project_id: PROJECT,
				user_id: USER,
				subject_kind: 'task',
				subject_id: T_DECK,
				subject_title: 'Investor deck',
				subject_snapshot: { state_key: 'in_progress' },
				disposition: 'auto_apply_pending',
				disposition_reason: 'auto_apply_ready',
				status: 'open',
				proposed_operation: {
					tool: 'update_onto_task',
					args: { task_id: T_DECK, state_key: 'done' }
				},
				...extra
			}
		]);
		const candidate: AutoApplyCandidate = {
			flagId: 'flag-deck',
			taskId: T_DECK,
			title: 'Investor deck',
			snapshotUpdatedAt: '2026-09-01T12:00:00.000Z',
			field: 'state_key',
			to: 'done',
			previousRaw: 'in_progress',
			summary: 'Mark done'
		};
		const { deps, gatewayCalls } = makeDeps(db, null);
		const run = (candidates = [candidate]) =>
			runAutoApply({
				db,
				userId: USER,
				projectId: PROJECT,
				triggerSessionId: SESSION,
				timeZone: 'America/New_York',
				candidates,
				runGateway: deps.runGateway,
				now: () => NOW
			});
		return { db, run, gatewayCalls, candidate };
	}

	it('claims once: a second run cannot write the same flag', async () => {
		const { db, run, gatewayCalls } = setup();
		expect(await run()).toMatchObject([{ status: 'applied' }]);
		expect(await run()).toEqual([{ flagId: 'flag-deck', status: 'not_claimed' }]);
		expect(gatewayCalls).toHaveLength(1);
		expect(db.table('onto_tasks').find((row) => row.id === T_DECK)!.state_key).toBe('done');
	});

	it('skips (never drafts) when the task changed since the snapshot', async () => {
		const { db, run, gatewayCalls } = setup();
		db.table('onto_tasks').find((row) => row.id === T_DECK)!.updated_at =
			'2026-09-18T14:59:00.000Z';
		expect(await run()).toEqual([
			{ flagId: 'flag-deck', status: 'skipped', reason: 'changed_since_snapshot' }
		]);
		expect(gatewayCalls).toHaveLength(0);
		expect(db.table('freshness_flags')[0]).toMatchObject({
			disposition: 'auto_apply_skipped',
			status: 'resolved_by_change'
		});
	});

	it('demotes every candidate to a draft while a turn is running', async () => {
		const { db, run, gatewayCalls } = setup();
		db.seed('chat_turn_runs', [{ id: 'turn-live', session_id: SESSION, status: 'queued' }]);
		expect(await run()).toEqual([
			{ flagId: 'flag-deck', status: 'demoted', reason: 'turn_running' }
		]);
		expect(gatewayCalls).toHaveLength(0);
		expect(db.table('freshness_flags')[0]).toMatchObject({
			disposition: 'drafted',
			disposition_reason: 'draft_turn_running'
		});
	});

	it('writes the undo payload in the same update as auto_applied (DB check)', async () => {
		const { db, run } = setup();
		await run();
		expect(db.table('freshness_flags')[0]).toMatchObject({
			disposition: 'auto_applied',
			applied_via: 'auto',
			applied_at: NOW.toISOString(),
			undo_operation: {
				kind: 'entity_field',
				operation: {
					tool: 'update_onto_task',
					args: { task_id: T_DECK, project_id: PROJECT, state_key: 'in_progress' },
					label: 'Restore "Investor deck" to in_progress'
				},
				expectAfterUpdatedAt: '2026-09-18T15:00:01.000Z'
			}
		});
	});

	it('restores a due date to its full previous ISO instant (or null)', async () => {
		const { db, run } = setup({ subject_id: T_VENUE });
		const outcomes = await run([
			{
				flagId: 'flag-deck',
				taskId: T_VENUE,
				title: 'Venue contract',
				snapshotUpdatedAt: '2026-09-01T12:00:00.000Z',
				field: 'due_at',
				to: '2026-10-03',
				previousRaw: '2026-10-01T03:59:59.000Z',
				summary: 'Move due date to 2026-10-03'
			}
		]);
		expect(outcomes[0]!.status).toBe('applied');
		expect(db.table('freshness_flags')[0]!.undo_operation.operation.args).toEqual({
			task_id: T_VENUE,
			project_id: PROJECT,
			due_at: '2026-10-01T03:59:59.000Z'
		});
	});

	it('reconciles a crash after the write, and releases one before it', async () => {
		const written = setup({ disposition_reason: 'auto_applying' });
		written.db.table('onto_tasks').find((row) => row.id === T_DECK)!.state_key = 'done';
		expect(
			await reconcileClaimedAutoApplies({
				db: written.db,
				projectId: PROJECT,
				timeZone: 'UTC',
				now: () => NOW
			})
		).toEqual({ reconciled: 1, released: 0 });
		expect(written.db.table('freshness_flags')[0]).toMatchObject({
			disposition: 'auto_applied',
			applied_after_updated_at: '2026-09-01T12:00:00.000Z'
		});

		const unwritten = setup({ disposition_reason: 'auto_applying' });
		expect(
			await reconcileClaimedAutoApplies({
				db: unwritten.db,
				projectId: PROJECT,
				timeZone: 'UTC',
				now: () => NOW
			})
		).toEqual({ reconciled: 0, released: 1 });
		expect(unwritten.db.table('freshness_flags')[0]).toMatchObject({
			disposition: 'auto_apply_skipped',
			disposition_reason: 'interrupted_before_write'
		});
	});
});

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

describe('scan context', () => {
	async function context(db: MemoryDb, extraSessionIds: string[] = [SESSION]) {
		return buildFreshnessScanContext({
			port: new SupabaseFreshnessDataPort(db),
			projectId: PROJECT,
			userId: USER,
			extraSessionIds,
			now: NOW,
			policy: FRESHNESS_POLICY_V1
		});
	}

	it('keeps only substantive user words and excludes workflow and running turns', async () => {
		const db = new MemoryDb();
		seedStore(db);
		db.seed('chat_messages', [
			{
				id: 'm-agent',
				session_id: SESSION,
				role: 'user',
				content: 'Agent run summary injected here',
				metadata: { source: 'agent_run' },
				created_at: '2026-09-18T14:40:00.000Z'
			},
			{
				id: 'm-workflow',
				session_id: SESSION,
				role: 'user',
				content: 'Review the whole project deeply please',
				metadata: {},
				created_at: '2026-09-18T14:41:00.000Z'
			},
			{
				id: 'm-running',
				session_id: SESSION,
				role: 'user',
				content: 'Also the caterer quote came in today',
				metadata: {},
				created_at: '2026-09-18T14:56:00.000Z'
			}
		]);
		db.seed('chat_turn_runs', [
			{
				id: 'turn-wf',
				session_id: SESSION,
				user_message_id: 'm-workflow',
				status: 'completed',
				created_at: '2026-09-18T14:41:00.000Z'
			},
			{
				id: 'turn-run',
				session_id: SESSION,
				user_message_id: 'm-running',
				status: 'running',
				created_at: '2026-09-18T14:56:00.000Z'
			}
		]);
		db.seed('chat_turn_workflow_runs', [{ turn_run_id: 'turn-wf', session_id: SESSION }]);
		const ctx = await context(db);
		expect(ctx.window.messageIds).toEqual(['m-dump']);
		expect(ctx.newInformation).toEqual([{ said: '2026-09-18 (today)', text: DUMP }]);
		expect(ctx.dateMentions.map((mention) => mention.date)).toEqual(['2026-10-03']);
		expect(ctx.skipReason).toBeNull();
	});

	it("never reads another member's private inbox items", async () => {
		const db = new MemoryDb();
		seedStore(db);
		const privateItem = (id: string, userId: string, title: string) => ({
			...db.table('inbox_items')[0]!,
			id,
			source_type: 'agent_run',
			source_ref_id: `run-${id}`,
			audience: 'user',
			user_id: userId,
			title
		});
		db.seed('inbox_items', [
			privateItem('inbox-own', USER, 'My own pending proposal'),
			privateItem(
				'inbox-other',
				'99999999-9999-4999-8999-999999999999',
				'Their private proposal'
			)
		]);
		const ctx = await context(db);
		const titles = ctx.inboxSubjects.map((subject) => subject.row.title);
		expect(titles).toContain('My own pending proposal');
		expect(titles).not.toContain('Their private proposal');
	});

	it('excludes changed, created and just-updated entities, Start Here and terminal states', async () => {
		const db = new MemoryDb();
		seedStore(db);
		db.seed('onto_project_logs', [
			{
				project_id: PROJECT,
				entity_type: 'task',
				entity_id: T_CATERING,
				action: 'updated',
				chat_session_id: SESSION,
				changed_by: USER,
				created_at: '2026-09-18T14:51:00.000Z'
			}
		]);
		db.seed('onto_tasks', [
			{
				id: 'task-new',
				project_id: PROJECT,
				title: 'Investor deck follow-up',
				state_key: 'todo',
				props: {},
				created_at: '2026-09-18T14:00:00.000Z',
				updated_at: '2026-09-18T14:00:00.000Z',
				archived_at: null,
				deleted_at: null
			},
			{
				id: 'task-done',
				project_id: PROJECT,
				title: 'Investor deck draft',
				state_key: 'done',
				props: {},
				created_at: '2026-09-01T00:00:00.000Z',
				updated_at: '2026-09-02T00:00:00.000Z',
				archived_at: null,
				deleted_at: null
			}
		]);
		const ctx = await context(db);
		const titles = ctx.prefiltered.map((entry) => entry.candidate.title);
		expect(titles).toContain('Investor deck');
		expect(titles).toContain('Venue contract');
		for (const excluded of [
			'Caterer quote',
			'Investor deck follow-up',
			'Investor deck draft',
			'Start here'
		]) {
			expect(titles).not.toContain(excluded);
		}
		expect(ctx.changedInWindow.has(`task:${T_CATERING}`)).toBe(true);
	});

	it('computes calendar, assignee and recurrence gate facts', async () => {
		const db = new MemoryDb();
		seedStore(db);
		db.seed('onto_edges', [
			{
				project_id: PROJECT,
				src_kind: 'task',
				src_id: T_DECK,
				dst_kind: 'event',
				dst_id: 'evt-1',
				rel: 'has_event'
			}
		]);
		db.seed('onto_task_assignees', [{ task_id: T_VENUE, assignee_actor_id: OTHER_ACTOR }]);
		db.table('onto_tasks').find((row) => row.id === T_CATERING)!.props = {
			recurrence_rule: 'FREQ=WEEKLY'
		};
		db.table('onto_tasks').find((row) => row.id === T_CATERING)!.title = 'Venue walkthrough';
		const ctx = await context(db);
		expect([...ctx.gate.calendarLinkedTaskIds]).toEqual([T_DECK]);
		expect([...ctx.gate.assignedToOthersTaskIds]).toEqual([T_VENUE]);
		expect([...ctx.gate.recurringTaskIds]).toEqual([T_CATERING]);
	});

	it('suppresses an entity marked not stale while it is unchanged', async () => {
		const db = new MemoryDb();
		seedStore(db);
		const first = await context(db);
		const deck = first.entitiesByKey.get(`task:${T_DECK}`)!;
		const { candidateSnapshot } = await import('../src/workers/freshness-radar/context');
		db.seed('freshness_flags', [
			{
				project_id: PROJECT,
				user_id: USER,
				subject_kind: 'task',
				subject_id: T_DECK,
				subject_snapshot: candidateSnapshot(deck),
				subject_updated_at: deck.updatedAt,
				disposition: 'surfaced',
				status: 'dismissed',
				outcome_source: 'user_marked_not_stale',
				outcome_at: '2026-09-15T00:00:00.000Z',
				created_at: '2026-09-14T00:00:00.000Z'
			}
		]);
		expect((await context(db)).suppressed.get(`task:${T_DECK}`)).toBe('marked_not_stale');
		db.table('onto_tasks').find((row) => row.id === T_DECK)!.title = 'Investor deck v2';
		expect((await context(db)).suppressed.has(`task:${T_DECK}`)).toBe(false);
	});
});

describe('card delivery', () => {
	it('is idempotent per scan: a replay returns the first message', async () => {
		const db = new MemoryDb();
		const card = {
			version: 'freshness_card_v1' as const,
			scanId: 'scan-1',
			projectId: PROJECT,
			projectName: 'Pop-up store',
			createdAt: NOW.toISOString(),
			headline: '1 item may be out of date in Pop-up store',
			moreCount: 0,
			items: [],
			bundle: null,
			autoApplied: [],
			inboxCleanup: { retired: [], possiblyStaleCount: 0 },
			gaugeChanges: []
		};
		const first = await deliverFreshnessCard({ db, sessionId: SESSION, userId: USER, card });
		const second = await deliverFreshnessCard({ db, sessionId: SESSION, userId: USER, card });
		expect(first).toBeTruthy();
		expect(second).toBe(first);
		expect(db.table('chat_messages')).toHaveLength(1);
		expect(db.table('chat_messages')[0]).toMatchObject({
			role: 'assistant',
			message_type: 'assistant_message',
			metadata: { source: 'freshness_radar', kind: 'freshness_radar_card' }
		});
	});
});

describe('draft bundle supersede', () => {
	it('supersedes the pending bundle and carries forward unchanged drafts', async () => {
		const db = new MemoryDb();
		seedStore(db);
		const { candidateSnapshot } = await import('../src/workers/freshness-radar/context');
		const ctx = await buildFreshnessScanContext({
			port: new SupabaseFreshnessDataPort(db),
			projectId: PROJECT,
			userId: USER,
			extraSessionIds: [SESSION],
			now: NOW,
			policy: FRESHNESS_POLICY_V1
		});
		const milestone = ctx.entitiesByKey.get(`milestone:${M_SOFT}`)!;
		const goal = ctx.entitiesByKey.get(`goal:${G_OPEN}`)!;
		db.seed('freshness_scans', [
			{
				id: 'scan-prev',
				project_id: PROJECT,
				user_id: USER,
				signal_id: null,
				status: 'completed'
			}
		]);
		db.seed('project_suggestions', [
			{
				id: 's-prev',
				project_id: PROJECT,
				kind: 'freshness_update',
				freshness_scan_id: 'scan-prev',
				run_id: null,
				status: 'pending',
				title: 'Update 2 out-of-date items',
				operations: []
			}
		]);
		const carriedOp = {
			tool: 'update_onto_milestone',
			args: { milestone_id: M_SOFT, project_id: PROJECT, state_key: 'in_progress' },
			label: 'Mark "Soft opening" in progress'
		};
		db.seed('freshness_flags', [
			{
				id: 'flag-carry',
				scan_id: 'scan-prev',
				project_id: PROJECT,
				user_id: USER,
				subject_kind: 'milestone',
				subject_id: M_SOFT,
				subject_title: 'Soft opening',
				subject_snapshot: candidateSnapshot(milestone),
				probability: 0.7,
				disposition: 'drafted',
				status: 'open',
				suggestion_id: 's-prev',
				proposed_operation: carriedOp,
				features: {
					draft_undo: {
						tool: 'update_onto_milestone',
						args: { milestone_id: M_SOFT, state_key: 'pending' }
					}
				},
				created_at: '2026-09-16T12:00:00.000Z'
			},
			{
				id: 'flag-drop',
				scan_id: 'scan-prev',
				project_id: PROJECT,
				user_id: USER,
				subject_kind: 'goal',
				subject_id: G_OPEN,
				subject_title: 'Open the store',
				subject_snapshot: { ...candidateSnapshot(goal), title_sha256: 'old-title' },
				probability: 0.8,
				disposition: 'drafted',
				status: 'open',
				suggestion_id: 's-prev',
				proposed_operation: {
					tool: 'update_onto_goal',
					args: { goal_id: G_OPEN, state_key: 'achieved' }
				},
				features: {
					draft_undo: {
						tool: 'update_onto_goal',
						args: { goal_id: G_OPEN, state_key: 'active' }
					}
				},
				created_at: '2026-09-16T12:00:00.000Z'
			}
		]);
		const { deps } = makeDeps(db, scripted(fullAnswers).decider);
		await processFreshnessRadarScanJob(job(), deps);

		expect(db.table('project_suggestions').find((row) => row.id === 's-prev')).toMatchObject({
			status: 'superseded'
		});
		const bundles = db
			.table('project_suggestions')
			.filter((row) => row.kind === 'freshness_update' && row.status === 'pending');
		expect(bundles).toHaveLength(1);
		expect(bundles[0]!.operations).toEqual([
			{
				tool: 'update_onto_task',
				args: { task_id: T_VENUE, project_id: PROJECT, due_at: '2026-10-03' },
				label: 'Move the due date of "Venue contract" to 2026-10-03'
			},
			carriedOp
		]);
		expect(bundles[0]!.title).toBe('Update 2 out-of-date items');
		expect(db.table('freshness_flags').find((row) => row.id === 'flag-carry')).toMatchObject({
			suggestion_id: bundles[0]!.id,
			status: 'open'
		});
		expect(db.table('freshness_flags').find((row) => row.id === 'flag-drop')).toMatchObject({
			status: 'superseded'
		});
		expect(deps.draftDeps.syncInbox).toHaveBeenCalledTimes(2);
		const card = db.table('chat_messages').find(isFreshnessCardRow)!.metadata.card;
		expect(card.bundle).toEqual({ suggestionId: bundles[0]!.id, operationCount: 2 });
	});

	it('fails closed when verification rejects the bundle: drafts become surfaced flags', async () => {
		const db = new MemoryDb();
		seedStore(db);
		const { deps } = makeDeps(db, scripted(fullAnswers).decider);
		deps.draftDeps.verify = vi.fn(async () => ({
			ok: false as const,
			diagnostic: { code: 'MODEL_ENTITY_MISMATCH', message: 'x' }
		}));
		await processFreshnessRadarScanJob(job(), deps);
		expect(
			db.table('project_suggestions').filter((row) => row.kind === 'freshness_update')
		).toHaveLength(0);
		expect(db.table('freshness_flags').find((row) => row.subject_id === T_VENUE)).toMatchObject(
			{
				disposition: 'surfaced',
				disposition_reason: 'verify_model_entity_mismatch'
			}
		);
		const card = db.table('chat_messages').find(isFreshnessCardRow)!.metadata.card;
		expect(card.bundle).toBeNull();
		expect(card.items[0]).toMatchObject({ disposition: 'surfaced', proposal: null });
	});
});

describe('bundle verification against the shared verifier', () => {
	it('code-authored scalar drafts pass verifyProjectSuggestionIntegrity and get a fingerprint', async () => {
		const { verifyProjectSuggestionIntegrity } = await import(
			'@buildos/shared-agent-ops/proposal-context'
		);
		const { computeProjectSuggestionFreshnessFingerprint } = await import(
			'@buildos/shared-agent-ops'
		);
		const db = new MemoryDb();
		seedStore(db);
		const { deps } = makeDeps(db, scripted(fullAnswers).decider);
		deps.draftDeps.verify = (client, input) =>
			verifyProjectSuggestionIntegrity(client, input) as never;
		deps.draftDeps.fingerprint = (client, projectId, operations) =>
			computeProjectSuggestionFreshnessFingerprint(client, projectId, operations);
		await processFreshnessRadarScanJob(job(), deps);
		const bundle = db
			.table('project_suggestions')
			.find((row) => row.kind === 'freshness_update');
		expect(
			db.table('freshness_flags').find((row) => row.subject_id === T_VENUE)
				?.disposition_reason
		).toBe('draft_stale_below_auto');
		expect(bundle).toBeDefined();
		expect(bundle!.source_fingerprint).toMatch(/^[0-9a-f]{64}$/);
		const verified = await verifyProjectSuggestionIntegrity(db as never, {
			projectId: PROJECT,
			operations: bundle!.operations,
			title: bundle!.title,
			preview: bundle!.preview,
			checkModelAlignment: true
		});
		expect(verified.ok).toBe(true);
	});
});
