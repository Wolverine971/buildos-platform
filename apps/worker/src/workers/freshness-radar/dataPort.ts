// apps/worker/src/workers/freshness-radar/dataPort.ts
//
// Every READ the context stage needs, behind one port. The live scanner uses
// SupabaseFreshnessDataPort; the backtest supplies an as-of implementation that
// reverses later activity logs, so live and backtest run the SAME pure stages
// (plan section 7, "Replay"). Writes never go through this port.
//
// Only a narrow PostgREST subset is used (select/eq/in/is/gt/gte/lte/order/
// limit/maybeSingle) so the disposable-Postgres test shim can serve it.

type FreshnessDbResult = {
	data: unknown;
	error: { message: string; code?: string } | null;
};

type FreshnessQuery = PromiseLike<FreshnessDbResult> & {
	select(columns: string): FreshnessQuery;
	insert(value: unknown): FreshnessQuery;
	upsert(value: unknown, options?: { onConflict?: string }): FreshnessQuery;
	update(value: Record<string, unknown>): FreshnessQuery;
	eq(column: string, value: unknown): FreshnessQuery;
	neq(column: string, value: unknown): FreshnessQuery;
	gt(column: string, value: unknown): FreshnessQuery;
	gte(column: string, value: unknown): FreshnessQuery;
	lt(column: string, value: unknown): FreshnessQuery;
	lte(column: string, value: unknown): FreshnessQuery;
	in(column: string, values: readonly unknown[]): FreshnessQuery;
	is(column: string, value: null): FreshnessQuery;
	not(column: string, operator: string, value: unknown): FreshnessQuery;
	or(filters: string): FreshnessQuery;
	order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): FreshnessQuery;
	limit(count: number): FreshnessQuery;
	single(): PromiseLike<FreshnessDbResult>;
	maybeSingle(): PromiseLike<FreshnessDbResult>;
};

export type FreshnessDb = {
	from(table: string): FreshnessQuery;
	rpc(fn: string, args?: Record<string, unknown>): PromiseLike<FreshnessDbResult>;
};

export type FreshnessTaskRow = {
	id: string;
	project_id: string;
	title: string;
	description: string | null;
	state_key: string;
	start_at: string | null;
	due_at: string | null;
	props: Record<string, unknown> | null;
	created_at: string;
	updated_at: string | null;
	archived_at: string | null;
	deleted_at: string | null;
	completed_at: string | null;
};

export type FreshnessGoalRow = {
	id: string;
	project_id: string;
	name: string;
	description: string | null;
	goal: string | null;
	state_key: string;
	target_date: string | null;
	props: Record<string, unknown> | null;
	created_at: string;
	updated_at: string | null;
	archived_at: string | null;
	deleted_at: string | null;
	completed_at: string | null;
};

export type FreshnessMilestoneRow = {
	id: string;
	project_id: string;
	title: string;
	description: string | null;
	milestone: string | null;
	state_key: string;
	due_at: string | null;
	props: Record<string, unknown> | null;
	created_at: string;
	updated_at: string | null;
	archived_at: string | null;
	deleted_at: string | null;
	completed_at: string | null;
};

export type FreshnessDocumentRow = {
	id: string;
	project_id: string;
	title: string;
	description: string | null;
	state_key: string;
	type_key: string | null;
	props: Record<string, unknown> | null;
	created_at: string;
	updated_at: string | null;
	archived_at: string | null;
	deleted_at: string | null;
};

export type FreshnessEdgeRow = {
	src_kind: string;
	src_id: string;
	dst_kind: string;
	dst_id: string;
	rel: string;
};

export type FreshnessLogRow = {
	entity_type: string;
	entity_id: string;
	action: string;
	chat_session_id: string | null;
	changed_by: string | null;
	change_source: string | null;
	created_at: string;
	before_data: Record<string, unknown> | null;
	after_data: Record<string, unknown> | null;
};

export type FreshnessMessageRow = {
	id: string;
	session_id: string;
	role: string;
	content: string;
	created_at: string;
	metadata: Record<string, unknown> | null;
};

export type FreshnessTurnRow = {
	id: string;
	session_id: string;
	user_message_id: string | null;
	status: string;
	created_at: string;
};

export type FreshnessProjectRow = {
	id: string;
	name: string;
	description: string | null;
	deleted_at: string | null;
	archived_at: string | null;
};

export type FreshnessInboxRow = {
	id: string;
	source_type: string;
	source_ref_id: string;
	source_status: string | null;
	project_id: string | null;
	user_id: string | null;
	audience: string;
	status: string;
	title: string;
	summary: string | null;
	risk_tier: number | null;
	snoozed_until: string | null;
	expires_at: string | null;
	created_at: string;
	updated_at: string;
	freshness_state: string | null;
	freshness_flag_id: string | null;
};

export type FreshnessSuggestionRow = {
	id: string;
	kind: string;
	status: string;
	operations: unknown;
	title: string;
};

export type FreshnessPriorFlagRow = {
	id: string;
	subject_kind: string;
	subject_id: string;
	subject_updated_at: string | null;
	subject_snapshot: Record<string, unknown> | null;
	disposition: string;
	status: string;
	outcome_source: string | null;
	outcome_at: string | null;
	proposed_operation: Record<string, unknown> | null;
	applied_at: string | null;
	undone_at: string | null;
	created_at: string;
};

export type FreshnessOpenEntities = {
	tasks: FreshnessTaskRow[];
	goals: FreshnessGoalRow[];
	milestones: FreshnessMilestoneRow[];
	documents: FreshnessDocumentRow[];
};

export interface FreshnessDataPort {
	loadUserTimezone(userId: string): Promise<string | null>;
	loadUserActorId(userId: string): Promise<string | null>;
	loadProject(projectId: string): Promise<FreshnessProjectRow | null>;
	/** info_cursor_at of the newest completed scan of (project, user), or null. */
	loadLastScanCursor(projectId: string, userId: string): Promise<string | null>;
	/** The user's sessions whose context is the project. */
	loadProjectContextSessionIds(projectId: string, userId: string): Promise<string[]>;
	/** Which of these session ids belong to the user. */
	filterUserSessionIds(sessionIds: readonly string[], userId: string): Promise<string[]>;
	/** Activity logs for the project created after `since` (newest first, capped). */
	loadProjectLogs(projectId: string, since: string): Promise<FreshnessLogRow[]>;
	/** role='user' messages in the sessions, created in (since, until], newest first. */
	loadUserMessages(
		sessionIds: readonly string[],
		since: string,
		until: string
	): Promise<FreshnessMessageRow[]>;
	/** Turns of these sessions created after `since`, plus which are workflow turns. */
	loadTurns(
		sessionIds: readonly string[],
		since: string
	): Promise<{ turns: FreshnessTurnRow[]; workflowTurnIds: Set<string> }>;
	/** Open-and-closed tasks (facts need done tasks), goals, milestones, documents. */
	loadProjectEntities(projectId: string): Promise<FreshnessOpenEntities>;
	loadDocumentContentHeads(
		documentIds: readonly string[],
		chars: number
	): Promise<Map<string, string>>;
	/** Full markdown bodies (clipped at `maxChars`), for the section dig and roll-up checks. */
	loadDocumentBodies(
		documentIds: readonly string[],
		maxChars: number
	): Promise<Map<string, string>>;
	loadEdges(projectId: string): Promise<FreshnessEdgeRow[]>;
	/** task ids among `taskIds` with a legacy task_calendar_events row. */
	loadCalendarEventTaskIds(taskIds: readonly string[]): Promise<Set<string>>;
	/** task id -> assignee actor ids. */
	loadTaskAssignees(taskIds: readonly string[]): Promise<Map<string, string[]>>;
	/** This user's recent ledger rows for the project (created after `since`). */
	loadPriorFlags(
		projectId: string,
		userId: string,
		since: string
	): Promise<FreshnessPriorFlagRow[]>;
	/** Auto-applied flags for the project applied after `since` (any user). */
	countAutoApplied(projectId: string, since: string): Promise<number>;
	/** pending/deferred project_members inbox items for the project. */
	/** Project-wide items plus the scanning user's own private (`audience: 'user'`) items. */
	loadInboxItems(projectId: string, userId: string): Promise<FreshnessInboxRow[]>;
	loadSuggestions(ids: readonly string[]): Promise<Map<string, FreshnessSuggestionRow>>;
	/** Latest gauge per subject id from this user's previous track scores. */
	loadPreviousGauges(
		projectId: string,
		userId: string,
		subjectIds: readonly string[]
	): Promise<Map<string, string>>;
}

const TASK_COLUMNS =
	'id, project_id, title, description, state_key, start_at, due_at, props, created_at, updated_at, archived_at, deleted_at, completed_at';
const GOAL_COLUMNS =
	'id, project_id, name, description, goal, state_key, target_date, props, created_at, updated_at, archived_at, deleted_at, completed_at';
const MILESTONE_COLUMNS =
	'id, project_id, title, description, milestone, state_key, due_at, props, created_at, updated_at, archived_at, deleted_at, completed_at';
const DOCUMENT_COLUMNS =
	'id, project_id, title, description, state_key, type_key, props, created_at, updated_at, archived_at, deleted_at';

const ENTITY_ROW_CAP = 1_000;
const LOG_ROW_CAP = 500;
const MESSAGE_ROW_CAP = 200;

function unwrap<T>(result: FreshnessDbResult, what: string): T {
	if (result.error)
		throw new Error(`freshness radar read failed (${what}): ${result.error.message}`);
	return (result.data ?? ([] as unknown)) as T;
}

function uniq(values: readonly string[]): string[] {
	return [...new Set(values.filter(Boolean))];
}

export class SupabaseFreshnessDataPort implements FreshnessDataPort {
	constructor(private readonly db: FreshnessDb) {}

	async loadUserTimezone(userId: string): Promise<string | null> {
		const result = await this.db
			.from('users')
			.select('timezone')
			.eq('id', userId)
			.maybeSingle();
		if (result.error) return null;
		const timezone = (result.data as { timezone?: unknown } | null)?.timezone;
		return typeof timezone === 'string' && timezone.trim() ? timezone.trim() : null;
	}

	async loadUserActorId(userId: string): Promise<string | null> {
		const rows = unwrap<Array<{ id: string }>>(
			await this.db
				.from('onto_actors')
				.select('id, created_at')
				.eq('user_id', userId)
				.order('created_at', { ascending: true })
				.limit(1),
			'onto_actors'
		);
		return rows[0]?.id ?? null;
	}

	async loadProject(projectId: string): Promise<FreshnessProjectRow | null> {
		const result = await this.db
			.from('onto_projects')
			.select('id, name, description, deleted_at, archived_at')
			.eq('id', projectId)
			.maybeSingle();
		if (result.error)
			throw new Error(`freshness radar read failed (onto_projects): ${result.error.message}`);
		return (result.data ?? null) as FreshnessProjectRow | null;
	}

	async loadLastScanCursor(projectId: string, userId: string): Promise<string | null> {
		const rows = unwrap<Array<{ info_cursor_at: string | null }>>(
			await this.db
				.from('freshness_scans')
				.select('info_cursor_at, created_at')
				.eq('project_id', projectId)
				.eq('user_id', userId)
				.eq('status', 'completed')
				.order('created_at', { ascending: false })
				.limit(1),
			'freshness_scans'
		);
		return rows[0]?.info_cursor_at ?? null;
	}

	async loadProjectContextSessionIds(projectId: string, userId: string): Promise<string[]> {
		const rows = unwrap<Array<{ id: string }>>(
			await this.db
				.from('chat_sessions')
				.select('id, updated_at')
				.eq('user_id', userId)
				.eq('context_type', 'project')
				.eq('entity_id', projectId)
				.order('updated_at', { ascending: false })
				.limit(20),
			'chat_sessions'
		);
		return rows.map((row) => row.id);
	}

	async filterUserSessionIds(sessionIds: readonly string[], userId: string): Promise<string[]> {
		const ids = uniq(sessionIds);
		if (!ids.length) return [];
		const rows = unwrap<Array<{ id: string }>>(
			await this.db.from('chat_sessions').select('id').eq('user_id', userId).in('id', ids),
			'chat_sessions'
		);
		return rows.map((row) => row.id);
	}

	async loadProjectLogs(projectId: string, since: string): Promise<FreshnessLogRow[]> {
		return unwrap<FreshnessLogRow[]>(
			await this.db
				.from('onto_project_logs')
				.select(
					'entity_type, entity_id, action, chat_session_id, changed_by, change_source, created_at, before_data, after_data'
				)
				.eq('project_id', projectId)
				.gt('created_at', since)
				.order('created_at', { ascending: false })
				.limit(LOG_ROW_CAP),
			'onto_project_logs'
		);
	}

	async loadUserMessages(
		sessionIds: readonly string[],
		since: string,
		until: string
	): Promise<FreshnessMessageRow[]> {
		const ids = uniq(sessionIds);
		if (!ids.length) return [];
		return unwrap<FreshnessMessageRow[]>(
			await this.db
				.from('chat_messages')
				.select('id, session_id, role, content, created_at, metadata')
				.in('session_id', ids)
				.eq('role', 'user')
				.gt('created_at', since)
				.lte('created_at', until)
				.order('created_at', { ascending: false })
				.limit(MESSAGE_ROW_CAP),
			'chat_messages'
		);
	}

	async loadTurns(
		sessionIds: readonly string[],
		since: string
	): Promise<{ turns: FreshnessTurnRow[]; workflowTurnIds: Set<string> }> {
		const ids = uniq(sessionIds);
		if (!ids.length) return { turns: [], workflowTurnIds: new Set() };
		const turns = unwrap<FreshnessTurnRow[]>(
			await this.db
				.from('chat_turn_runs')
				.select('id, session_id, user_message_id, status, created_at')
				.in('session_id', ids)
				.gte('created_at', since)
				.order('created_at', { ascending: false })
				.limit(MESSAGE_ROW_CAP),
			'chat_turn_runs'
		);
		const workflow = unwrap<Array<{ turn_run_id: string }>>(
			await this.db
				.from('chat_turn_workflow_runs')
				.select('turn_run_id')
				.in('session_id', ids)
				.limit(MESSAGE_ROW_CAP),
			'chat_turn_workflow_runs'
		);
		return { turns, workflowTurnIds: new Set(workflow.map((row) => row.turn_run_id)) };
	}

	async loadProjectEntities(projectId: string): Promise<FreshnessOpenEntities> {
		const [tasks, goals, milestones, documents] = await Promise.all([
			this.db
				.from('onto_tasks')
				.select(TASK_COLUMNS)
				.eq('project_id', projectId)
				.is('deleted_at', null)
				.order('updated_at', { ascending: false })
				.limit(ENTITY_ROW_CAP),
			this.db
				.from('onto_goals')
				.select(GOAL_COLUMNS)
				.eq('project_id', projectId)
				.is('deleted_at', null)
				.limit(ENTITY_ROW_CAP),
			this.db
				.from('onto_milestones')
				.select(MILESTONE_COLUMNS)
				.eq('project_id', projectId)
				.is('deleted_at', null)
				.limit(ENTITY_ROW_CAP),
			this.db
				.from('onto_documents')
				.select(DOCUMENT_COLUMNS)
				.eq('project_id', projectId)
				.is('deleted_at', null)
				.is('archived_at', null)
				.order('updated_at', { ascending: false })
				.limit(ENTITY_ROW_CAP)
		]);
		return {
			tasks: unwrap<FreshnessTaskRow[]>(tasks, 'onto_tasks'),
			goals: unwrap<FreshnessGoalRow[]>(goals, 'onto_goals'),
			milestones: unwrap<FreshnessMilestoneRow[]>(milestones, 'onto_milestones'),
			documents: unwrap<FreshnessDocumentRow[]>(documents, 'onto_documents')
		};
	}

	async loadDocumentContentHeads(
		documentIds: readonly string[],
		chars: number
	): Promise<Map<string, string>> {
		const ids = uniq(documentIds);
		const heads = new Map<string, string>();
		if (!ids.length) return heads;
		const rows = unwrap<Array<{ id: string; content: string | null }>>(
			await this.db.from('onto_documents').select('id, content').in('id', ids),
			'onto_documents'
		);
		for (const row of rows) {
			const text = (row.content ?? '').replace(/\s+/g, ' ').trim();
			if (text) heads.set(row.id, text.slice(0, chars));
		}
		return heads;
	}

	async loadDocumentBodies(
		documentIds: readonly string[],
		maxChars: number
	): Promise<Map<string, string>> {
		const ids = uniq(documentIds);
		const bodies = new Map<string, string>();
		if (!ids.length) return bodies;
		const rows = unwrap<Array<{ id: string; content: string | null }>>(
			await this.db.from('onto_documents').select('id, content').in('id', ids),
			'onto_documents'
		);
		for (const row of rows) {
			if (row.content) bodies.set(row.id, row.content.slice(0, maxChars));
		}
		return bodies;
	}

	async loadEdges(projectId: string): Promise<FreshnessEdgeRow[]> {
		return unwrap<FreshnessEdgeRow[]>(
			await this.db
				.from('onto_edges')
				.select('src_kind, src_id, dst_kind, dst_id, rel')
				.eq('project_id', projectId)
				.limit(5_000),
			'onto_edges'
		);
	}

	async loadCalendarEventTaskIds(taskIds: readonly string[]): Promise<Set<string>> {
		const ids = uniq(taskIds);
		if (!ids.length) return new Set();
		const rows = unwrap<Array<{ task_id: string }>>(
			await this.db.from('task_calendar_events').select('task_id').in('task_id', ids),
			'task_calendar_events'
		);
		return new Set(rows.map((row) => row.task_id));
	}

	async loadTaskAssignees(taskIds: readonly string[]): Promise<Map<string, string[]>> {
		const ids = uniq(taskIds);
		const map = new Map<string, string[]>();
		if (!ids.length) return map;
		const rows = unwrap<Array<{ task_id: string; assignee_actor_id: string }>>(
			await this.db
				.from('onto_task_assignees')
				.select('task_id, assignee_actor_id')
				.in('task_id', ids),
			'onto_task_assignees'
		);
		for (const row of rows) {
			map.set(row.task_id, [...(map.get(row.task_id) ?? []), row.assignee_actor_id]);
		}
		return map;
	}

	async loadPriorFlags(
		projectId: string,
		userId: string,
		since: string
	): Promise<FreshnessPriorFlagRow[]> {
		return unwrap<FreshnessPriorFlagRow[]>(
			await this.db
				.from('freshness_flags')
				.select(
					'id, subject_kind, subject_id, subject_updated_at, subject_snapshot, disposition, status, outcome_source, outcome_at, proposed_operation, applied_at, undone_at, created_at'
				)
				.eq('project_id', projectId)
				.eq('user_id', userId)
				.gt('created_at', since)
				.order('created_at', { ascending: false })
				.limit(2_000),
			'freshness_flags'
		);
	}

	async countAutoApplied(projectId: string, since: string): Promise<number> {
		const rows = unwrap<Array<{ id: string }>>(
			await this.db
				.from('freshness_flags')
				.select('id')
				.eq('project_id', projectId)
				.eq('disposition', 'auto_applied')
				.gt('applied_at', since)
				.limit(100),
			'freshness_flags'
		);
		return rows.length;
	}

	async loadInboxItems(projectId: string, userId: string): Promise<FreshnessInboxRow[]> {
		return unwrap<FreshnessInboxRow[]>(
			await this.db
				.from('inbox_items')
				.select(
					'id, source_type, source_ref_id, source_status, project_id, user_id, audience, status, title, summary, risk_tier, snoozed_until, expires_at, created_at, updated_at, freshness_state, freshness_flag_id'
				)
				.eq('project_id', projectId)
				// This runs on the admin client: another member's private items must never reach
				// the scanning user's prompt, flags, or decision notes.
				.or(`audience.eq.project_members,and(audience.eq.user,user_id.eq.${userId})`)
				.in('status', ['pending', 'deferred'])
				.order('updated_at', { ascending: false })
				.limit(50),
			'inbox_items'
		);
	}

	async loadSuggestions(ids: readonly string[]): Promise<Map<string, FreshnessSuggestionRow>> {
		const unique = uniq(ids);
		const map = new Map<string, FreshnessSuggestionRow>();
		if (!unique.length) return map;
		const rows = unwrap<FreshnessSuggestionRow[]>(
			await this.db
				.from('project_suggestions')
				.select('id, kind, status, operations, title')
				.in('id', unique),
			'project_suggestions'
		);
		for (const row of rows) map.set(row.id, row);
		return map;
	}

	async loadPreviousGauges(
		projectId: string,
		userId: string,
		subjectIds: readonly string[]
	): Promise<Map<string, string>> {
		const ids = uniq(subjectIds);
		const map = new Map<string, string>();
		if (!ids.length) return map;
		const rows = unwrap<Array<{ subject_id: string; gauge: string }>>(
			await this.db
				.from('freshness_track_scores')
				.select('subject_id, gauge, created_at')
				.eq('project_id', projectId)
				.eq('user_id', userId)
				.in('subject_id', ids)
				.order('created_at', { ascending: false })
				.limit(500),
			'freshness_track_scores'
		);
		for (const row of rows) if (!map.has(row.subject_id)) map.set(row.subject_id, row.gauge);
		return map;
	}
}
