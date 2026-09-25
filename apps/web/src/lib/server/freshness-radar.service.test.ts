// apps/web/src/lib/server/freshness-radar.service.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	verifyProjectSuggestionIntegrity: vi.fn(),
	computeProjectSuggestionFreshnessFingerprint: vi.fn(),
	syncInboxItemForProjectSuggestion: vi.fn(),
	applyProjectAttentionBudget: vi.fn(),
	quarantineProjectSuggestionInboxItem: vi.fn(),
	syncInboxItemForProjectAudit: vi.fn(),
	runGatewayWriteOp: vi.fn(),
	createAdminSupabaseClient: vi.fn(),
	isProjectSuggestionFresh: vi.fn(),
	finalizeProjectLoopRunIfComplete: vi.fn(),
	captureServerEvent: vi.fn()
}));

vi.mock('@buildos/shared-agent-ops', () => ({
	verifyProjectSuggestionIntegrity: mocks.verifyProjectSuggestionIntegrity,
	computeProjectSuggestionFreshnessFingerprint:
		mocks.computeProjectSuggestionFreshnessFingerprint,
	syncInboxItemForProjectSuggestion: mocks.syncInboxItemForProjectSuggestion,
	applyProjectAttentionBudget: mocks.applyProjectAttentionBudget,
	quarantineProjectSuggestionInboxItem: mocks.quarantineProjectSuggestionInboxItem,
	syncInboxItemForProjectAudit: mocks.syncInboxItemForProjectAudit,
	readProjectSuggestionStructuralFingerprint: vi.fn(function () {
		return null;
	})
}));
vi.mock('@buildos/shared-agent-ops/gateway/op-execution-gateway', () => ({
	runGatewayWriteOp: mocks.runGatewayWriteOp
}));
vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: mocks.createAdminSupabaseClient
}));
vi.mock('$lib/server/project-loop-snapshot.service', () => ({
	isProjectSuggestionFresh: mocks.isProjectSuggestionFresh
}));
vi.mock('$lib/server/project-loop-run.service', () => ({
	finalizeProjectLoopRunIfComplete: mocks.finalizeProjectLoopRunIfComplete
}));
vi.mock('$lib/server/posthog', () => ({ captureServerEvent: mocks.captureServerEvent }));

import {
	FRESHNESS_UNDO_WINDOW_MS,
	isFreshnessFlagUndoable,
	loadFreshnessBadges,
	loadFreshnessScanStatus,
	markFreshnessFlagNotStale,
	recordFreshnessBundleOutcome,
	undoFreshnessFlags
} from './freshness-radar.service';
import { decideProjectSuggestion } from './project-suggestion-actions.service';

// ---------------------------------------------------------------------------
// In-memory Supabase fake: enough PostgREST surface for conditional writes.
// ---------------------------------------------------------------------------

type Row = Record<string, any>;

class FakeDb {
	tables: Record<string, Row[]> = {};
	/** Tables that do not exist yet (a deploy that runs before its migration). */
	missing = new Set<string>();
	nextId = 0;
	constructor(seed: Record<string, Row[]> = {}) {
		for (const [table, rows] of Object.entries(seed)) {
			this.tables[table] = rows.map((row) => ({ ...row }));
		}
	}
	rows(table: string): Row[] {
		return (this.tables[table] ??= []);
	}
	find(table: string, id: string): Row | undefined {
		return this.rows(table).find((row) => row.id === id);
	}
	from(table: string) {
		return new FakeQuery(this, table);
	}
}

class FakeQuery {
	private op: 'select' | 'update' | 'insert' = 'select';
	private patch: Row = {};
	private insertRows: Row[] = [];
	private filters: Array<(row: Row) => boolean> = [];
	private sort: { column: string; ascending: boolean } | null = null;
	private max: number | null = null;
	private returning = false;
	constructor(
		private db: FakeDb,
		private table: string
	) {}
	select() {
		if (this.op !== 'select') this.returning = true;
		return this;
	}
	update(patch: Row) {
		this.op = 'update';
		this.patch = patch;
		return this;
	}
	insert(rows: Row | Row[]) {
		this.op = 'insert';
		this.insertRows = Array.isArray(rows) ? rows : [rows];
		return this;
	}
	eq(column: string, value: unknown) {
		this.filters.push((row) => row[column] === value);
		return this;
	}
	neq(column: string, value: unknown) {
		this.filters.push((row) => row[column] !== value);
		return this;
	}
	in(column: string, values: unknown[]) {
		this.filters.push((row) => values.includes(row[column]));
		return this;
	}
	is(column: string, value: unknown) {
		this.filters.push((row) => (value === null ? row[column] == null : row[column] === value));
		return this;
	}
	gte(column: string, value: string) {
		this.filters.push((row) => String(row[column]) >= value);
		return this;
	}
	order(column: string, options?: { ascending?: boolean }) {
		this.sort = { column, ascending: options?.ascending ?? true };
		return this;
	}
	limit(count: number) {
		this.max = count;
		return this;
	}
	private run(): { data: Row[] | null; error: { message: string; code?: string } | null } {
		if (this.db.missing.has(this.table)) {
			return {
				data: null,
				error: { message: `relation ${this.table} does not exist`, code: '42P01' }
			};
		}
		const matches = () =>
			this.db.rows(this.table).filter((row) => this.filters.every((f) => f(row)));
		if (this.op === 'insert') {
			const inserted: Row[] = [];
			for (const raw of this.insertRows) {
				const row: Row = {
					id: raw.id ?? `gen-${++this.db.nextId}`,
					created_at: raw.created_at ?? '2026-09-18T18:00:00.000Z',
					...raw
				};
				if (
					this.table === 'project_suggestions' &&
					row.kind === 'freshness_update' &&
					row.status === 'pending' &&
					this.db
						.rows(this.table)
						.some(
							(other) =>
								other.project_id === row.project_id &&
								other.kind === 'freshness_update' &&
								other.status === 'pending'
						)
				) {
					return { data: null, error: { message: 'duplicate', code: '23505' } };
				}
				this.db.rows(this.table).push(row);
				inserted.push({ ...row });
			}
			return { data: inserted, error: null };
		}
		if (this.op === 'update') {
			const rows = matches();
			for (const row of rows) Object.assign(row, this.patch);
			return { data: this.returning ? rows.map((row) => ({ ...row })) : null, error: null };
		}
		let rows = matches().map((row) => ({ ...row }));
		if (this.sort) {
			const { column, ascending } = this.sort;
			rows.sort((a, b) =>
				String(a[column]) < String(b[column])
					? ascending
						? -1
						: 1
					: String(a[column]) > String(b[column])
						? ascending
							? 1
							: -1
						: 0
			);
		}
		if (this.max !== null) rows = rows.slice(0, this.max);
		return { data: rows, error: null };
	}
	async maybeSingle() {
		const result = this.run();
		return { data: result.data?.[0] ?? null, error: result.error };
	}
	async single() {
		const result = this.run();
		if (result.error) return { data: null, error: result.error };
		const row = result.data?.[0] ?? null;
		return row ? { data: row, error: null } : { data: null, error: { message: 'no rows' } };
	}
	then<T>(resolve: (value: ReturnType<FakeQuery['run']>) => T, reject?: (e: unknown) => T) {
		return Promise.resolve(this.run()).then(resolve, reject);
	}
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const USER = 'user-1';
const PROJECT = 'project-1';
const NOW = Date.parse('2026-09-18T18:00:00.000Z');
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

function flagRow(overrides: Row = {}): Row {
	return {
		id: 'flag-1',
		scan_id: 'scan-1',
		project_id: PROJECT,
		user_id: USER,
		subject_kind: 'task',
		subject_id: 'task-1',
		subject_title: 'Send investor deck',
		subject_updated_at: '2026-09-10T00:00:00.000Z',
		subject_snapshot: {},
		probability: '0.8700',
		change_kind: 'mark_done',
		change_kind_probability: '0.9100',
		date_choice: null,
		date_choice_probability: null,
		disposition: 'drafted',
		status: 'open',
		evidence: { excerpt: 'sent the deck to Maya' },
		suggestion_id: 'bundle-1',
		created_at: iso(-60 * 60 * 1000),
		applied_at: null,
		applied_after_updated_at: null,
		undone_at: null,
		undo_operation: null,
		outcome: null,
		outcome_source: null,
		outcome_at: null,
		...overrides
	};
}

const taskOp = (id: string, state = 'done') => ({
	tool: 'update_onto_task',
	args: { task_id: id, state_key: state },
	label: `Mark "${id}" ${state}`
});
const milestoneOp = (id: string) => ({
	tool: 'update_onto_milestone',
	args: { milestone_id: id, due_at: '2026-10-03' },
	label: `Move "${id}"`
});

function bundleRow(overrides: Row = {}): Row {
	return {
		id: 'bundle-1',
		run_id: null,
		freshness_scan_id: 'scan-1',
		project_id: PROJECT,
		chat_session_id: 'session-1',
		agent_run_id: null,
		kind: 'freshness_update',
		risk_tier: 1,
		status: 'pending',
		title: 'Update 2 out-of-date items',
		why_now: 'From your update on 2026-09-18 · 1 task, 1 milestone',
		rationale: null,
		confidence: 0.87,
		preview: { kind: 'generic', summary: 'Update 2 out-of-date items' },
		operations: [taskOp('task-1'), milestoneOp('ms-1')],
		undo_operations: [taskOp('task-1', 'todo'), milestoneOp('ms-1')],
		evidence_refs: [
			{ entity_type: 'task', entity_id: 'task-1', title: 'Send investor deck' },
			{ entity_type: 'milestone', entity_id: 'ms-1', title: 'Pricing page live' }
		],
		reversible: true,
		source_fingerprint: 'fp-old',
		freshness_state: 'fresh',
		sort_order: 0,
		depends_on: null,
		created_at: iso(-60 * 60 * 1000),
		updated_at: iso(-60 * 60 * 1000),
		decided_at: null,
		applied_at: null,
		result: null,
		user_feedback: null,
		...overrides
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.verifyProjectSuggestionIntegrity.mockResolvedValue({
		ok: true,
		summary: { operation_count: 1 }
	});
	mocks.computeProjectSuggestionFreshnessFingerprint.mockResolvedValue('fp-new');
	mocks.syncInboxItemForProjectSuggestion.mockResolvedValue(null);
	mocks.applyProjectAttentionBudget.mockResolvedValue({ promotedIds: [], deferredIds: [] });
});

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

describe('loadFreshnessBadges', () => {
	function seed() {
		return new FakeDb({
			freshness_scans: [
				{
					id: 'scan-1',
					project_id: PROJECT,
					user_id: USER,
					mode: 'live',
					status: 'completed',
					created_at: iso(-2 * 3600e3),
					finished_at: iso(-2 * 3600e3 + 5000)
				},
				{
					id: 'scan-shadow',
					project_id: PROJECT,
					user_id: USER,
					mode: 'shadow',
					status: 'completed',
					created_at: iso(-3600e3),
					finished_at: iso(-3600e3)
				},
				{
					id: 'scan-other-user',
					project_id: PROJECT,
					user_id: 'user-2',
					mode: 'live',
					status: 'completed',
					created_at: iso(-3600e3),
					finished_at: iso(-3600e3)
				}
			],
			freshness_flags: [
				flagRow({ id: 'f-unchanged', subject_id: 'task-1', scan_id: 'scan-1' }),
				flagRow({ id: 'f-changed', subject_id: 'task-2', scan_id: 'scan-1' }),
				flagRow({
					id: 'f-deleted',
					subject_kind: 'document',
					subject_id: 'doc-1',
					disposition: 'surfaced',
					scan_id: 'scan-1'
				}),
				flagRow({
					id: 'f-dismissed',
					subject_id: 'task-3',
					status: 'dismissed',
					scan_id: 'scan-1'
				}),
				flagRow({
					id: 'f-evaluated',
					subject_id: 'task-3',
					disposition: 'evaluated',
					scan_id: 'scan-1'
				}),
				flagRow({
					id: 'f-auto',
					subject_id: 'task-4',
					disposition: 'auto_applied',
					status: 'applied',
					applied_at: iso(-3600e3),
					applied_after_updated_at: '2026-09-18T17:00:00.000Z',
					undo_operation: {
						kind: 'entity_field',
						operation: taskOp('task-4', 'todo'),
						expectAfterUpdatedAt: '2026-09-18T17:00:00.000Z'
					},
					scan_id: 'scan-1'
				}),
				flagRow({ id: 'f-shadow', subject_id: 'task-5', scan_id: 'scan-shadow' }),
				flagRow({
					id: 'f-other-user',
					subject_id: 'task-5',
					scan_id: 'scan-other-user',
					user_id: 'user-2'
				})
			],
			freshness_track_scores: [
				{
					scan_id: 'scan-1',
					user_id: USER,
					subject_kind: 'milestone',
					subject_id: 'ms-1',
					gauge: 'at_risk',
					score: '1.100',
					created_at: iso(-2 * 3600e3)
				}
			],
			onto_tasks: [
				{
					id: 'task-1',
					project_id: PROJECT,
					updated_at: '2026-09-10T00:00:00.000Z',
					deleted_at: null
				},
				{
					id: 'task-2',
					project_id: PROJECT,
					updated_at: '2026-09-18T17:30:00.000Z',
					deleted_at: null
				},
				{
					id: 'task-4',
					project_id: PROJECT,
					updated_at: '2026-09-18T17:00:00.000Z',
					deleted_at: null
				},
				{
					id: 'task-5',
					project_id: PROJECT,
					updated_at: '2026-09-10T00:00:00.000Z',
					deleted_at: null
				}
			],
			onto_documents: [
				{
					id: 'doc-1',
					project_id: PROJECT,
					updated_at: '2026-09-10T00:00:00.000Z',
					deleted_at: '2026-09-18T00:00:00.000Z'
				}
			]
		});
	}

	it('returns the caller’s live flags, omitting entities changed or deleted since the flag', async () => {
		// Before the roll-up migration: per-scan flags back the "may be out of date" badges.
		const db = seed();
		db.missing.add('freshness_concerns');
		const read = await loadFreshnessBadges({
			supabase: db,
			projectId: PROJECT,
			userId: USER,
			now: NOW
		});
		expect(read.version).toBe('freshness_badges_v1');
		expect(read.scannedAt).toBe(iso(-2 * 3600e3 + 5000));
		expect(read.flags.map((flag) => flag.flagId).sort()).toEqual(['f-auto', 'f-unchanged']);
		expect(read.flags.find((flag) => flag.flagId === 'f-unchanged')).toMatchObject({
			entity: { kind: 'task', id: 'task-1' },
			probability: 0.87,
			label: 'may_be_out_of_date',
			evidenceExcerpt: 'sent the deck to Maya',
			suggestionId: 'bundle-1',
			undoableUntil: null
		});
		expect(read.flags.find((flag) => flag.flagId === 'f-auto')).toMatchObject({
			label: 'updated_automatically',
			undoableUntil: new Date(NOW - 3600e3 + FRESHNESS_UNDO_WINDOW_MS).toISOString()
		});
		expect(read.gauges).toEqual([
			{
				entity: { kind: 'milestone', id: 'ms-1' },
				gauge: 'at_risk',
				score: 1.1,
				scoredAt: iso(-2 * 3600e3),
				scanId: 'scan-1'
			}
		]);
	});

	it('reads "may be out of date" from surfaced roll-up concerns once they exist', async () => {
		const db = seed();
		db.tables.freshness_concerns = [
			{
				id: 'concern-1',
				project_id: PROJECT,
				user_id: USER,
				subject_kind: 'document',
				subject_id: 'doc-2',
				status: 'open',
				score: '0.8600',
				last_flag_id: 'f-doc',
				surfaced_at: iso(-3600e3),
				surfaced_scan_id: 'scan-1',
				first_seen_at: iso(-3600e3),
				evidence_count: 1,
				evidence: [{ scanId: 'scan-1', probability: 0.86 }],
				detail: {
					sections: [
						{ anchor: 'open-questions', heading: 'Open questions', probability: 0.86 }
					],
					decisions: [{ text: 'Venue picked', recorded: '2026-09-18' }],
					evidenceExcerpt: null,
					fixInChatPrompt: 'In "Plan": update "Open questions".'
				}
			},
			{
				// Still accruing evidence: not shown.
				id: 'concern-2',
				project_id: PROJECT,
				user_id: USER,
				subject_kind: 'task',
				subject_id: 'task-5',
				status: 'open',
				score: '0.4000',
				last_flag_id: 'f-quiet',
				surfaced_at: null,
				evidence: [],
				detail: {}
			}
		];
		const read = await loadFreshnessBadges({
			supabase: db,
			projectId: PROJECT,
			userId: USER,
			now: NOW
		});
		// Per-scan open flags no longer badge on their own; automatic updates still do.
		expect(read.flags.map((flag) => flag.flagId).sort()).toEqual(['f-auto', 'f-doc']);
		expect(read.flags.find((flag) => flag.flagId === 'f-doc')).toMatchObject({
			entity: { kind: 'document', id: 'doc-2' },
			probability: 0.86,
			label: 'may_be_out_of_date',
			scanId: 'scan-1',
			reason: 'Older than decisions you recorded since: “Open questions”.',
			fixInChatPrompt: 'In "Plan": update "Open questions".'
		});
	});

	it('lets an automatic-update badge fade once its undo window closes', async () => {
		const read = await loadFreshnessBadges({
			supabase: seed(),
			projectId: PROJECT,
			userId: USER,
			now: NOW + FRESHNESS_UNDO_WINDOW_MS
		});
		expect(read.flags.map((flag) => flag.flagId)).not.toContain('f-auto');
	});

	it('is empty without live scans', async () => {
		const read = await loadFreshnessBadges({
			supabase: new FakeDb(),
			projectId: PROJECT,
			userId: USER,
			now: NOW
		});
		expect(read).toEqual({
			version: 'freshness_badges_v1',
			projectId: PROJECT,
			scannedAt: null,
			flags: [],
			gauges: []
		});
	});
});

// ---------------------------------------------------------------------------
// Scan status
// ---------------------------------------------------------------------------

describe('loadFreshnessScanStatus', () => {
	it('reports each card flag with undoability and the scan’s newest bundle', async () => {
		const db = new FakeDb({
			freshness_scans: [{ id: 'scan-1', project_id: PROJECT, user_id: USER }],
			freshness_flags: [
				flagRow({ id: 'f-draft' }),
				flagRow({
					id: 'f-auto',
					disposition: 'auto_applied',
					status: 'applied',
					applied_at: iso(-3600e3),
					undo_operation: {
						kind: 'entity_field',
						operation: taskOp('task-4', 'todo'),
						expectAfterUpdatedAt: iso(-3600e3)
					}
				}),
				flagRow({ id: 'f-evaluated', disposition: 'evaluated' })
			],
			project_suggestions: [
				bundleRow({ id: 'bundle-old', status: 'superseded', created_at: iso(-7200e3) }),
				bundleRow({ id: 'bundle-new', status: 'pending', created_at: iso(-3600e3) })
			]
		});
		const status = await loadFreshnessScanStatus({
			supabase: db,
			projectId: PROJECT,
			scanId: 'scan-1',
			userId: USER,
			now: NOW
		});
		expect(status).toEqual({
			version: 'freshness_scan_status_v1',
			scanId: 'scan-1',
			flags: {
				'f-draft': { status: 'open', disposition: 'drafted', undoable: false },
				'f-auto': { status: 'applied', disposition: 'auto_applied', undoable: true }
			},
			bundle: { suggestionId: 'bundle-new', status: 'pending' }
		});
	});

	it('returns null for another user’s scan', async () => {
		const db = new FakeDb({
			freshness_scans: [{ id: 'scan-1', project_id: PROJECT, user_id: 'user-2' }]
		});
		expect(
			await loadFreshnessScanStatus({
				supabase: db,
				projectId: PROJECT,
				scanId: 'scan-1',
				userId: USER
			})
		).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Undo
// ---------------------------------------------------------------------------

describe('undoFreshnessFlags', () => {
	function autoFlag(overrides: Row = {}): Row {
		return flagRow({
			id: 'f-auto',
			subject_id: 'task-4',
			disposition: 'auto_applied',
			status: 'applied',
			applied_via: 'auto',
			applied_at: iso(-3600e3),
			applied_after_updated_at: '2026-09-18T17:00:00.000Z',
			undo_operation: {
				kind: 'entity_field',
				operation: {
					tool: 'update_onto_task',
					args: { task_id: 'task-4', state_key: 'todo', calendar_sync: 'none' }
				},
				expectAfterUpdatedAt: '2026-09-18T17:00:00.000Z'
			},
			...overrides
		});
	}
	function retiredFlag(overrides: Row = {}): Row {
		return flagRow({
			id: 'f-retired',
			subject_kind: 'inbox_item',
			subject_id: 'inbox-1',
			disposition: 'retired',
			status: 'applied',
			applied_at: iso(-3600e3),
			undo_operation: {
				kind: 'inbox_retire',
				suggestionId: 'old-sugg',
				inboxItemId: 'inbox-1',
				previousSuggestionStatus: 'pending',
				previousInboxStatus: 'pending'
			},
			...overrides
		});
	}
	function seed(flags: Row[], taskUpdatedAt = '2026-09-18T17:00:00.000Z') {
		return new FakeDb({
			freshness_scans: [
				{
					id: 'scan-1',
					project_id: PROJECT,
					user_id: USER,
					trigger_session_id: 'session-1'
				}
			],
			freshness_flags: flags,
			onto_tasks: [
				{ id: 'task-4', project_id: PROJECT, updated_at: taskUpdatedAt, deleted_at: null }
			]
		});
	}

	it('replays the stored reverse operation and records the undo', async () => {
		const db = seed([autoFlag()]);
		const replay = vi.fn().mockResolvedValue({ appliedCount: 1, errors: [] });
		const result = await undoFreshnessFlags({
			supabase: db,
			admin: db,
			userId: USER,
			projectId: PROJECT,
			scanId: 'scan-1',
			flagIds: ['f-auto'],
			replay,
			now: NOW
		});
		expect(result).toEqual({ version: 'freshness_undo_v1', undone: ['f-auto'], skipped: [] });
		expect(replay).toHaveBeenCalledWith({
			operations: [
				{
					tool: 'update_onto_task',
					args: { task_id: 'task-4', state_key: 'todo', calendar_sync: 'none' }
				}
			],
			operationId: 'freshness_undo:f-auto',
			chatSessionId: 'session-1'
		});
		expect(db.find('freshness_flags', 'f-auto')).toMatchObject({
			status: 'undone',
			undone_by: USER,
			outcome_source: 'user_undid',
			undone_at: new Date(NOW).toISOString()
		});
	});

	it('leaves a task that changed since the automatic update alone', async () => {
		const db = seed([autoFlag()], '2026-09-18T17:45:00.000Z');
		const replay = vi.fn();
		const result = await undoFreshnessFlags({
			supabase: db,
			admin: db,
			userId: USER,
			projectId: PROJECT,
			scanId: 'scan-1',
			flagIds: ['f-auto'],
			replay,
			now: NOW
		});
		expect(result?.skipped).toEqual([{ flagId: 'f-auto', reason: 'changed_since' }]);
		expect(replay).not.toHaveBeenCalled();
		expect(db.find('freshness_flags', 'f-auto')).toMatchObject({
			status: 'applied',
			undone_at: null,
			outcome_source: null
		});
	});

	it('refuses after the 72-hour window and reports repeats as already undone', async () => {
		const db = seed([
			autoFlag(),
			autoFlag({ id: 'f-done', status: 'undone', undone_at: iso(-60e3) })
		]);
		const replay = vi.fn();
		const result = await undoFreshnessFlags({
			supabase: db,
			admin: db,
			userId: USER,
			projectId: PROJECT,
			scanId: 'scan-1',
			flagIds: ['f-auto', 'f-done'],
			replay,
			now: NOW + FRESHNESS_UNDO_WINDOW_MS
		});
		expect(result?.skipped).toEqual([
			{ flagId: 'f-auto', reason: 'window_expired' },
			{ flagId: 'f-done', reason: 'already_undone' }
		]);
		expect(replay).not.toHaveBeenCalled();
	});

	it('releases the claim when the write path refuses the reverse operation', async () => {
		const db = seed([autoFlag()]);
		const replay = vi.fn().mockResolvedValue({
			appliedCount: 0,
			errors: [{ tool: 'update_onto_task', error: 'Forbidden' }]
		});
		const result = await undoFreshnessFlags({
			supabase: db,
			admin: db,
			userId: USER,
			projectId: PROJECT,
			scanId: 'scan-1',
			flagIds: ['f-auto'],
			replay,
			now: NOW
		});
		expect(result?.skipped).toEqual([
			{ flagId: 'f-auto', reason: 'execution_failed', message: 'Forbidden' }
		]);
		expect(db.find('freshness_flags', 'f-auto')).toMatchObject({
			status: 'applied',
			undone_at: null
		});
	});

	it('defaults to every undoable flag in the scan and restores retired inbox items', async () => {
		const db = seed([autoFlag(), retiredFlag(), flagRow({ id: 'f-draft' })]);
		const replay = vi.fn().mockResolvedValue({ appliedCount: 1, errors: [] });
		const restoreInbox = vi.fn().mockResolvedValue({ ok: true });
		const result = await undoFreshnessFlags({
			supabase: db,
			admin: db,
			userId: USER,
			projectId: PROJECT,
			scanId: 'scan-1',
			replay,
			restoreInbox,
			now: NOW
		});
		expect(result?.undone.sort()).toEqual(['f-auto', 'f-retired']);
		expect(restoreInbox).toHaveBeenCalledWith({
			projectId: PROJECT,
			flagId: 'f-retired',
			payload: expect.objectContaining({ kind: 'inbox_retire', suggestionId: 'old-sugg' })
		});
		expect(db.find('freshness_flags', 'f-draft')?.status).toBe('open');
	});

	it('fails closed for inbox restores until the restore helper is wired, and hides foreign flags', async () => {
		const db = seed([retiredFlag(), autoFlag({ id: 'f-foreign', user_id: 'user-2' })]);
		const result = await undoFreshnessFlags({
			supabase: db,
			admin: db,
			userId: USER,
			projectId: PROJECT,
			scanId: 'scan-1',
			flagIds: ['f-retired', 'f-foreign'],
			replay: vi.fn(),
			now: NOW
		});
		expect(result?.skipped).toEqual([
			{
				flagId: 'f-retired',
				reason: 'execution_failed',
				message: 'Inbox restore is not available yet'
			},
			{ flagId: 'f-foreign', reason: 'forbidden' }
		]);
		expect(db.find('freshness_flags', 'f-retired')?.status).toBe('applied');
	});

	it('returns null for a scan the caller does not own', async () => {
		const db = seed([autoFlag()]);
		db.rows('freshness_scans')[0]!.user_id = 'user-2';
		expect(
			await undoFreshnessFlags({
				supabase: db,
				admin: db,
				userId: USER,
				projectId: PROJECT,
				scanId: 'scan-1',
				replay: vi.fn(),
				now: NOW
			})
		).toBeNull();
	});

	it('treats only open, in-window auto-applied and retired flags as undoable', () => {
		expect(isFreshnessFlagUndoable(autoFlag(), NOW)).toBe(true);
		expect(isFreshnessFlagUndoable(autoFlag({ undo_operation: null }), NOW)).toBe(false);
		expect(isFreshnessFlagUndoable(flagRow(), NOW)).toBe(false);
		expect(isFreshnessFlagUndoable(retiredFlag({ status: 'undone' }), NOW)).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Not out of date
// ---------------------------------------------------------------------------

describe('markFreshnessFlagNotStale', () => {
	function seed(bundle = bundleRow()) {
		return new FakeDb({
			freshness_flags: [
				flagRow({ id: 'f-task', subject_id: 'task-1', suggestion_id: bundle.id }),
				flagRow({
					id: 'f-ms',
					subject_kind: 'milestone',
					subject_id: 'ms-1',
					suggestion_id: bundle.id
				}),
				flagRow({
					id: 'f-doc',
					subject_kind: 'document',
					subject_id: 'doc-1',
					disposition: 'surfaced',
					suggestion_id: null
				})
			],
			project_suggestions: [bundle]
		});
	}

	it('records the outcome and rebuilds the bundle without that change', async () => {
		const db = seed();
		const outcome = await markFreshnessFlagNotStale({
			supabase: db,
			admin: db,
			userId: USER,
			projectId: PROJECT,
			flagId: 'f-task',
			now: NOW
		});
		expect(outcome.ok).toBe(true);
		if (!outcome.ok) return;
		expect(outcome.flag).toMatchObject({
			id: 'f-task',
			status: 'dismissed',
			outcome: 'not_stale',
			outcome_source: 'user_marked_not_stale',
			probability: 0.87
		});

		expect(db.find('project_suggestions', 'bundle-1')?.status).toBe('superseded');
		const rebuilt = db.find('project_suggestions', outcome.suggestionId!)!;
		expect(rebuilt).toMatchObject({
			status: 'pending',
			kind: 'freshness_update',
			run_id: null,
			freshness_scan_id: 'scan-1',
			chat_session_id: 'session-1',
			title: '1 thing looks out of date',
			why_now: 'From your update on 2026-09-18 · 1 milestone',
			operations: [milestoneOp('ms-1')],
			undo_operations: [milestoneOp('ms-1')],
			evidence_refs: [
				{ entity_type: 'milestone', entity_id: 'ms-1', title: 'Pricing page live' }
			],
			source_fingerprint: 'fp-new'
		});
		expect(mocks.verifyProjectSuggestionIntegrity).toHaveBeenCalledWith(
			db,
			expect.objectContaining({
				projectId: PROJECT,
				operations: [milestoneOp('ms-1')],
				title: '1 thing looks out of date',
				checkModelAlignment: true
			})
		);
		expect(db.find('freshness_flags', 'f-ms')?.suggestion_id).toBe(outcome.suggestionId);
		expect(mocks.syncInboxItemForProjectSuggestion).toHaveBeenCalledTimes(2);
		expect(mocks.applyProjectAttentionBudget).toHaveBeenCalledWith({
			supabase: db,
			projectId: PROJECT
		});
	});

	it('closes the bundle when its last change is marked current', async () => {
		const db = seed(
			bundleRow({
				operations: [taskOp('task-1')],
				undo_operations: [taskOp('task-1', 'todo')]
			})
		);
		const outcome = await markFreshnessFlagNotStale({
			supabase: db,
			admin: db,
			userId: USER,
			projectId: PROJECT,
			flagId: 'f-task',
			now: NOW
		});
		expect(outcome).toMatchObject({ ok: true, suggestionId: null });
		expect(db.find('project_suggestions', 'bundle-1')?.status).toBe('superseded');
		expect(db.rows('project_suggestions')).toHaveLength(1);
	});

	it('keeps the original bundle pending when the rebuilt one fails verification', async () => {
		mocks.verifyProjectSuggestionIntegrity.mockResolvedValueOnce({
			ok: false,
			diagnostic: { code: 'UNSUPPORTED_OPERATION', message: 'nope' }
		});
		const db = seed();
		const outcome = await markFreshnessFlagNotStale({
			supabase: db,
			admin: db,
			userId: USER,
			projectId: PROJECT,
			flagId: 'f-task',
			now: NOW
		});
		expect(outcome).toMatchObject({ ok: true, suggestionId: 'bundle-1' });
		expect(db.find('project_suggestions', 'bundle-1')?.status).toBe('pending');
		expect(db.find('freshness_flags', 'f-task')?.status).toBe('dismissed');
	});

	it('leaves the bundle alone for a surfaced item and is idempotent', async () => {
		const db = seed();
		const first = await markFreshnessFlagNotStale({
			supabase: db,
			admin: db,
			userId: USER,
			projectId: PROJECT,
			flagId: 'f-doc',
			now: NOW
		});
		expect(first).toMatchObject({ ok: true, suggestionId: 'bundle-1' });
		expect(db.find('project_suggestions', 'bundle-1')?.status).toBe('pending');
		const second = await markFreshnessFlagNotStale({
			supabase: db,
			admin: db,
			userId: USER,
			projectId: PROJECT,
			flagId: 'f-doc',
			now: NOW
		});
		expect(second).toMatchObject({ ok: true, flag: { status: 'dismissed' } });
	});

	it('closes the roll-up concern and drops its review item from the inbox item', async () => {
		const reviewItem = {
			concern_id: 'concern-doc',
			entity_type: 'document',
			entity_id: 'doc-1',
			title: 'Launch plan',
			reason: 'A section looks out of date: “Open questions”.',
			fix_in_chat_prompt: 'In "Launch plan": update "Open questions".'
		};
		const db = seed(
			bundleRow({
				preview: {
					kind: 'generic',
					summary: '3 things look out of date',
					review_items: [reviewItem]
				}
			})
		);
		db.tables.freshness_concerns = [
			{
				id: 'concern-doc',
				project_id: PROJECT,
				user_id: USER,
				subject_kind: 'document',
				subject_id: 'doc-1',
				status: 'open',
				last_flag_id: 'f-doc'
			}
		];
		const outcome = await markFreshnessFlagNotStale({
			supabase: db,
			admin: db,
			userId: USER,
			projectId: PROJECT,
			flagId: 'f-doc',
			now: NOW
		});
		expect(outcome.ok).toBe(true);
		if (!outcome.ok) return;
		expect(db.find('freshness_concerns', 'concern-doc')).toMatchObject({
			status: 'dismissed',
			close_reason: 'user_marked_not_stale',
			closed_at: new Date(NOW).toISOString()
		});
		expect(db.find('project_suggestions', 'bundle-1')?.status).toBe('superseded');
		const rebuilt = db.find('project_suggestions', outcome.suggestionId!)!;
		expect(rebuilt).toMatchObject({
			status: 'pending',
			title: '2 things look out of date',
			operations: [taskOp('task-1'), milestoneOp('ms-1')]
		});
		expect(rebuilt.preview.review_items).toBeUndefined();
	});

	it('returns 404 for another user’s flag', async () => {
		const db = seed();
		db.find('freshness_flags', 'f-task')!.user_id = 'user-2';
		expect(
			await markFreshnessFlagNotStale({
				supabase: db,
				admin: db,
				userId: USER,
				projectId: PROJECT,
				flagId: 'f-task',
				now: NOW
			})
		).toEqual({ ok: false, status: 404, message: 'Flag not found' });
	});
});

// ---------------------------------------------------------------------------
// Decide-path hook and null run_id
// ---------------------------------------------------------------------------

describe('recordFreshnessBundleOutcome', () => {
	it('marks only the flags whose operation applied', async () => {
		const db = new FakeDb({
			freshness_flags: [
				flagRow({ id: 'f-task', subject_id: 'task-1' }),
				flagRow({ id: 'f-ms', subject_kind: 'milestone', subject_id: 'ms-1' })
			]
		});
		await recordFreshnessBundleOutcome({
			admin: db,
			suggestion: bundleRow({ status: 'failed' }),
			action: 'approve',
			result: { ok: false, applied_operations: 1 },
			operationOutcomes: [true, false],
			now: NOW
		});
		expect(db.find('freshness_flags', 'f-task')).toMatchObject({
			status: 'applied',
			applied_via: 'bundle_approval',
			outcome: 'stale',
			outcome_source: 'user_approved'
		});
		expect(db.find('freshness_flags', 'f-ms')?.status).toBe('open');
	});

	it('closes open flags on dismissal and ignores other suggestion kinds', async () => {
		const db = new FakeDb({ freshness_flags: [flagRow({ id: 'f-task' })] });
		await recordFreshnessBundleOutcome({
			admin: db,
			suggestion: bundleRow({ kind: 'doc_org' }),
			action: 'dismiss',
			now: NOW
		});
		expect(db.find('freshness_flags', 'f-task')?.status).toBe('open');
		await recordFreshnessBundleOutcome({
			admin: db,
			suggestion: bundleRow(),
			action: 'dismiss',
			now: NOW
		});
		expect(db.find('freshness_flags', 'f-task')).toMatchObject({
			status: 'dismissed',
			outcome: 'unknown',
			outcome_source: 'user_dismissed'
		});
	});
});

describe('roll-up concerns on bundle decisions (tasker 106)', () => {
	function seedConcerns() {
		return new FakeDb({
			freshness_flags: [
				flagRow({ id: 'f-task', subject_id: 'task-1' }),
				flagRow({
					id: 'f-doc',
					subject_kind: 'document',
					subject_id: 'doc-1',
					disposition: 'surfaced',
					suggestion_id: null
				})
			],
			freshness_concerns: [
				{
					id: 'concern-task',
					project_id: PROJECT,
					user_id: USER,
					subject_kind: 'task',
					subject_id: 'task-1',
					status: 'open',
					last_flag_id: 'f-task'
				},
				{
					id: 'concern-doc',
					project_id: PROJECT,
					user_id: USER,
					subject_kind: 'document',
					subject_id: 'doc-1',
					status: 'open',
					last_flag_id: 'f-doc'
				}
			]
		});
	}
	const withReview = () =>
		bundleRow({
			preview: {
				kind: 'generic',
				summary: '3 things look out of date',
				review_items: [
					{
						concern_id: 'concern-doc',
						entity_type: 'document',
						entity_id: 'doc-1',
						title: 'Launch plan',
						reason: 'x',
						fix_in_chat_prompt: 'y'
					}
				]
			}
		});

	it('handled or dismissed: closes every concern in the item and labels its last flag', async () => {
		const db = seedConcerns();
		await recordFreshnessBundleOutcome({
			admin: db,
			suggestion: withReview(),
			action: 'address',
			now: NOW
		});
		for (const id of ['concern-task', 'concern-doc']) {
			expect(db.find('freshness_concerns', id)).toMatchObject({
				status: 'dismissed',
				close_reason: 'user_dismissed'
			});
		}
		// The doc's flag was never in the bundle: it is labeled through its concern.
		expect(db.find('freshness_flags', 'f-doc')).toMatchObject({
			status: 'dismissed',
			outcome: 'unknown',
			outcome_source: 'user_dismissed'
		});
	});

	it('approve: closes only the concerns whose operation applied', async () => {
		const db = seedConcerns();
		await recordFreshnessBundleOutcome({
			admin: db,
			suggestion: withReview(),
			action: 'approve',
			result: { ok: false, applied_operations: 1 },
			operationOutcomes: [true, false],
			now: NOW
		});
		expect(db.find('freshness_concerns', 'concern-task')).toMatchObject({
			status: 'applied',
			close_reason: 'applied'
		});
		expect(db.find('freshness_concerns', 'concern-doc')?.status).toBe('open');
	});
});

describe('decideProjectSuggestion with a freshness bundle', () => {
	it('replays in the bundle’s own chat session (no loop run) and labels the applied flags', async () => {
		const db = new FakeDb({
			project_suggestions: [bundleRow()],
			freshness_flags: [
				flagRow({ id: 'f-task', subject_id: 'task-1' }),
				flagRow({ id: 'f-ms', subject_kind: 'milestone', subject_id: 'ms-1' })
			],
			inbox_items: []
		});
		mocks.createAdminSupabaseClient.mockReturnValue(db);
		mocks.verifyProjectSuggestionIntegrity.mockResolvedValue({
			ok: true,
			summary: { operation_count: 2 }
		});
		mocks.isProjectSuggestionFresh.mockResolvedValue(true);
		mocks.runGatewayWriteOp.mockResolvedValue({ ok: true, data: {} });

		const outcome = await decideProjectSuggestion({
			supabase: db,
			userId: USER,
			projectId: PROJECT,
			suggestionId: 'bundle-1',
			action: 'approve',
			fetchFn: vi.fn() as unknown as typeof fetch
		});

		expect(outcome).toMatchObject({ ok: true, result: { ok: true, applied_operations: 2 } });
		expect(mocks.runGatewayWriteOp.mock.calls.map(([call]) => call.op)).toEqual([
			'onto.task.update',
			'onto.milestone.update'
		]);
		expect(mocks.runGatewayWriteOp.mock.calls[0]![0].chatSessionId).toBe('session-1');
		expect(db.find('project_suggestions', 'bundle-1')?.status).toBe('applied');
		expect(db.find('freshness_flags', 'f-task')?.status).toBe('applied');
		expect(db.find('freshness_flags', 'f-ms')?.status).toBe('applied');
		expect(mocks.finalizeProjectLoopRunIfComplete).toHaveBeenCalledWith(db, null);
	});

	it('records a dismissal on the bundle’s flags', async () => {
		const db = new FakeDb({
			project_suggestions: [bundleRow()],
			freshness_flags: [flagRow({ id: 'f-task' })]
		});
		mocks.createAdminSupabaseClient.mockReturnValue(db);
		const outcome = await decideProjectSuggestion({
			supabase: db,
			userId: USER,
			projectId: PROJECT,
			suggestionId: 'bundle-1',
			action: 'dismiss'
		});
		expect(outcome.ok).toBe(true);
		expect(db.find('freshness_flags', 'f-task')).toMatchObject({
			status: 'dismissed',
			outcome_source: 'user_dismissed'
		});
	});
});
