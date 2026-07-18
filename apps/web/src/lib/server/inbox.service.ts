// apps/web/src/lib/server/inbox.service.ts
import {
	applyProjectAttentionBudget,
	expireInboxItemsForProject,
	PROJECT_ATTENTION_BUDGET,
	PROJECT_DELETED_INBOX_REASON,
	syncInboxItemForSource,
	type InboxIndexRow,
	type InboxItemStatus,
	type InboxSourceType
} from '@buildos/shared-agent-ops/inbox-index';
import type { ServerTiming } from '$lib/server/server-timing';

type AnySupabase = any;

function measure<T>(timing: ServerTiming | null | undefined, name: string, fn: () => Promise<T>) {
	return timing ? timing.measure(name, fn) : fn();
}

export type InboxGroupFilter = 'account' | 'project';

export type InboxProjectMeta = {
	id: string;
	name: string | null;
};

export type InboxDecisionCapability = {
	can_decide: boolean;
	decision_disabled_reason: string | null;
};

export type InboxProjectLoopRunContext = {
	id: string;
	project_id: string | null;
	trigger_reason: string | null;
	status: string | null;
	summary: string | null;
	brief: Record<string, unknown> | null;
	suggestion_count: number | null;
	created_at: string | null;
	finished_at: string | null;
};

export type InboxProjectAuditContext = {
	id: string;
	project_id: string | null;
	status: string | null;
	trigger_reason: string | null;
	delivery_confidence: string | null;
	summary: string | null;
	role: string | null;
	generated_suggestion_count: number | null;
	unresolved_suggestion_count: number | null;
	created_at: string | null;
	finished_at: string | null;
};

export type InboxSourceContext = {
	project_loop_run?: InboxProjectLoopRunContext | null;
	project_audit?: InboxProjectAuditContext | null;
};

export type InboxItemWithPayload = InboxIndexRow & {
	project?: InboxProjectMeta | null;
	can_decide?: boolean;
	decision_disabled_reason?: string | null;
	source_payload?: Record<string, unknown> | null;
	source_context?: InboxSourceContext | null;
};

export type ListInboxItemsResult = {
	items: InboxItemWithPayload[];
	total: number;
	repairedCount: number;
	backfilledCount: number;
};

export type InboxCountResult = {
	total: number;
	by_status: Record<string, number>;
	by_source_type: Record<string, number>;
	by_project: Record<string, number>;
	account: number;
	truncated: boolean;
	repairedCount: number;
	backfilledCount: number;
};

type InboxCountFilters = {
	status?: InboxItemStatus | null;
	projectId?: string | null;
	sourceType?: InboxSourceType | null;
	group?: InboxGroupFilter | null;
};

type InboxCountBreakdownRow = Pick<InboxIndexRow, 'status' | 'source_type' | 'project_id'>;

const INBOX_SOURCE_TYPES = new Set<InboxSourceType>([
	'agent_run',
	'project_suggestion',
	'project_audit',
	'calendar_suggestion',
	'profile_fragment',
	'contact_merge_candidate'
]);

const SUPPORTED_SOURCE_TYPES = new Set<InboxSourceType>([
	'agent_run',
	'project_suggestion',
	'project_audit',
	'calendar_suggestion'
]);

const INBOX_STATUSES = new Set<InboxItemStatus>([
	'pending',
	'deciding',
	'decided',
	'blocked',
	'expired',
	'snoozed'
]);

function sourceKey(sourceType: string, sourceRefId: string): string {
	return `${sourceType}:${sourceRefId}`;
}

function rowKey(row: InboxIndexRow): string {
	return row.id ?? sourceKey(row.source_type, row.source_ref_id);
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function asString(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readTerminalAgentRunStatus(value: unknown): string | null {
	const status = asString(value);
	return status === 'completed' ||
		status === 'partial' ||
		status === 'failed' ||
		status === 'cancelled'
		? status
		: null;
}

export function isInboxSourceType(value: string | null): value is InboxSourceType {
	return !!value && INBOX_SOURCE_TYPES.has(value as InboxSourceType);
}

export function isInboxItemStatus(value: string | null): value is InboxItemStatus {
	return !!value && INBOX_STATUSES.has(value as InboxItemStatus);
}

export function parseInboxLimit(value: string | null, defaultLimit = 50, maxLimit = 200): number {
	const parsed = Number.parseInt(value ?? '', 10);
	if (!Number.isFinite(parsed) || parsed <= 0) return defaultLimit;
	return Math.min(parsed, maxLimit);
}

function applyInboxFilters<TQuery>(query: TQuery, filters: InboxCountFilters): TQuery {
	let next = query as any;
	if (filters.status) {
		next = next.eq('status', filters.status);
	}
	if (filters.projectId) {
		next = next.eq('project_id', filters.projectId);
	}
	if (filters.sourceType) {
		next = next.eq('source_type', filters.sourceType);
	}
	if (filters.group === 'account') {
		next = next.is('project_id', null);
	} else if (filters.group === 'project') {
		next = next.not('project_id', 'is', null);
	}
	return next as TQuery;
}

async function countInboxRows(params: {
	supabase: AnySupabase;
	status?: InboxItemStatus | null;
	projectId?: string | null;
	sourceType?: InboxSourceType | null;
	group?: InboxGroupFilter | null;
}): Promise<number> {
	const query = applyInboxFilters(
		params.supabase.from('inbox_items').select('id', { count: 'exact', head: true }),
		params
	);
	const { count, error } = await query;
	if (error) throw error;
	return Number(count ?? 0);
}

async function loadInboxCountBreakdownRows(params: {
	supabase: AnySupabase;
	status?: InboxItemStatus | null;
	projectId?: string | null;
	sourceType?: InboxSourceType | null;
	group?: InboxGroupFilter | null;
	limit: number;
}): Promise<InboxCountBreakdownRow[]> {
	if (params.limit <= 0) return [];
	const query = applyInboxFilters(
		params.supabase
			.from('inbox_items')
			.select('status, source_type, project_id')
			.order('created_at', { ascending: false })
			.limit(params.limit),
		params
	);
	const { data, error } = await query;
	if (error) throw error;
	return (data ?? []) as InboxCountBreakdownRow[];
}

function shouldReconcile(row: InboxIndexRow): boolean {
	return SUPPORTED_SOURCE_TYPES.has(row.source_type);
}

function parseTimestamp(value: string | null | undefined): number | null {
	if (!value) return null;
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function statusReviewRank(status: InboxItemStatus): number {
	switch (status) {
		case 'pending':
			return 0;
		case 'deciding':
			return 1;
		case 'blocked':
			return 2;
		case 'snoozed':
			return 3;
		case 'expired':
			return 4;
		case 'decided':
			return 5;
		default:
			return 6;
	}
}

function reviewRiskTier(row: InboxIndexRow): number {
	return typeof row.risk_tier === 'number' && row.risk_tier >= 1 && row.risk_tier <= 3
		? row.risk_tier
		: 2;
}

export function sortInboxRowsForReview<T extends InboxIndexRow>(rows: T[]): T[] {
	return [...rows].sort((left, right) => {
		const statusDiff = statusReviewRank(left.status) - statusReviewRank(right.status);
		if (statusDiff !== 0) return statusDiff;

		const riskDiff = reviewRiskTier(right) - reviewRiskTier(left);
		if (riskDiff !== 0) return riskDiff;

		const leftCreated = parseTimestamp(left.created_at) ?? 0;
		const rightCreated = parseTimestamp(right.created_at) ?? 0;
		if (leftCreated !== rightCreated) return rightCreated - leftCreated;

		return rowKey(left).localeCompare(rowKey(right));
	});
}

function shouldExpire(row: InboxIndexRow, nowMs: number): boolean {
	const expiresAt = parseTimestamp(row.expires_at);
	if (expiresAt === null || expiresAt > nowMs) return false;
	return (
		row.status === 'pending' ||
		row.status === 'deciding' ||
		row.status === 'snoozed' ||
		row.status === 'deferred'
	);
}

function shouldUnsnooze(row: InboxIndexRow, nowMs: number): boolean {
	if (row.status !== 'snoozed') return false;
	const snoozedUntil = parseTimestamp(row.snoozed_until);
	return snoozedUntil !== null && snoozedUntil <= nowMs;
}

function hasActiveSnooze(row: InboxIndexRow, nowMs: number): boolean {
	if (row.status !== 'snoozed') return false;
	const snoozedUntil = parseTimestamp(row.snoozed_until);
	return snoozedUntil !== null && snoozedUntil > nowMs;
}

function hasActiveProjectReviewStatus(row: InboxIndexRow): boolean {
	return (
		Boolean(row.project_id) &&
		(row.status === 'pending' ||
			row.status === 'deciding' ||
			row.status === 'snoozed' ||
			row.status === 'blocked' ||
			row.status === 'deferred')
	);
}

async function loadDeletedOrMissingProjectIds(params: {
	admin: AnySupabase;
	rows: InboxIndexRow[];
}): Promise<Set<string>> {
	const projectIds = [
		...new Set(
			params.rows
				.filter(hasActiveProjectReviewStatus)
				.map((row) => row.project_id)
				.filter((id): id is string => Boolean(id))
		)
	];
	if (projectIds.length === 0) return new Set();

	const { data, error } = await params.admin
		.from('onto_projects')
		.select('id, deleted_at')
		.in('id', projectIds);
	if (error) throw error;

	const activeIds = new Set(
		((data ?? []) as Array<{ id?: unknown; deleted_at?: unknown }>)
			.filter((project) => typeof project.id === 'string' && project.deleted_at == null)
			.map((project) => project.id as string)
	);
	return new Set(projectIds.filter((projectId) => !activeIds.has(projectId)));
}

async function updateInboxRow(params: {
	admin: AnySupabase;
	row: InboxIndexRow;
	patch: Partial<InboxIndexRow>;
}): Promise<InboxIndexRow> {
	let query = params.admin.from('inbox_items').update(params.patch);
	if (params.row.id) {
		query = query.eq('id', params.row.id);
	} else {
		query = query
			.eq('source_type', params.row.source_type)
			.eq('source_ref_id', params.row.source_ref_id);
	}

	const { data, error } = await query.select('*').maybeSingle();
	if (error) throw error;
	return ((data ?? { ...params.row, ...params.patch }) as InboxIndexRow) ?? params.row;
}

async function reconcileInboxRows(params: {
	admin: AnySupabase;
	rows: InboxIndexRow[];
}): Promise<{ rows: InboxIndexRow[]; repairedCount: number }> {
	const repairedRows: InboxIndexRow[] = [];
	let repairedCount = 0;
	const nowMs = Date.now();

	for (const row of params.rows) {
		if (!shouldReconcile(row)) {
			repairedRows.push(row);
			continue;
		}
		if (hasActiveSnooze(row, nowMs)) {
			repairedRows.push(row);
			continue;
		}

		const repaired = await syncInboxItemForSource({
			supabase: params.admin,
			sourceType: row.source_type,
			sourceRefId: row.source_ref_id
		});

		if (repaired) {
			repairedRows.push(repaired);
			if (
				repaired.status !== row.status ||
				repaired.source_status !== row.source_status ||
				repaired.decided_at !== row.decided_at
			) {
				repairedCount += 1;
			}
		} else {
			repairedRows.push(row);
		}
	}

	return { rows: repairedRows, repairedCount };
}

async function reconcileInboxLifecycle(params: {
	admin: AnySupabase;
	rows: InboxIndexRow[];
	now?: Date;
}): Promise<{ rows: InboxIndexRow[]; repairedCount: number }> {
	const repairedRows: InboxIndexRow[] = [];
	let repairedCount = 0;
	const now = params.now ?? new Date();
	const nowMs = now.getTime();
	const nowIso = now.toISOString();
	const deletedProjectIds = await loadDeletedOrMissingProjectIds({
		admin: params.admin,
		rows: params.rows
	});

	await Promise.all(
		[...deletedProjectIds].map((projectId) =>
			expireInboxItemsForProject({
				supabase: params.admin,
				projectId
			})
		)
	);

	for (const row of params.rows) {
		if (
			row.project_id &&
			deletedProjectIds.has(row.project_id) &&
			hasActiveProjectReviewStatus(row)
		) {
			repairedRows.push({
				...row,
				status: 'expired',
				source_status: 'project_deleted',
				decided_at: nowIso,
				blocked_reason: PROJECT_DELETED_INBOX_REASON,
				snoozed_until: null
			});
			repairedCount += 1;
			continue;
		}

		if (shouldExpire(row, nowMs)) {
			const repaired = await updateInboxRow({
				admin: params.admin,
				row,
				patch: {
					status: 'expired',
					decided_at: nowIso,
					blocked_reason: row.blocked_reason ?? 'Review item expired'
				}
			});
			repairedRows.push(repaired);
			repairedCount += 1;
			continue;
		}

		if (shouldUnsnooze(row, nowMs)) {
			const repaired = await updateInboxRow({
				admin: params.admin,
				row,
				patch: {
					status: 'pending',
					snoozed_until: null
				}
			});
			repairedRows.push(repaired);
			repairedCount += 1;
			continue;
		}

		repairedRows.push(row);
	}

	return { rows: repairedRows, repairedCount };
}

/**
 * Read-time enforcement of the per-project attention budget (tasker/28 WP-4).
 * Covers projects visible in this read plus any project holding deferred rows,
 * so a decided/expired item frees a slot and the top parked item is promoted on
 * the next badge poll or list read — mirroring what the worker does after each
 * loop run. Returns the affected ids so callers can patch already-loaded rows.
 */
async function applyAttentionBudgetForProjects(params: {
	supabase: AnySupabase;
	admin: AnySupabase;
	rows: InboxIndexRow[];
	projectId?: string | null;
}): Promise<{ deferredIds: Set<string>; promotedIds: Set<string> }> {
	// Only touch projects that can actually change: over budget in this read's
	// rows, or holding parked rows that a freed slot could promote. Keeps the
	// steady-state cost of frequent badge polls to one extra query.
	const pendingCountByProject = new Map<string, number>();
	for (const row of params.rows) {
		if (row.project_id && row.audience === 'project_members' && row.status === 'pending') {
			pendingCountByProject.set(
				row.project_id,
				(pendingCountByProject.get(row.project_id) ?? 0) + 1
			);
		}
	}
	const projectIds = new Set<string>();
	for (const [projectId, count] of pendingCountByProject) {
		if (count > PROJECT_ATTENTION_BUDGET) projectIds.add(projectId);
	}

	let deferredQuery = params.supabase
		.from('inbox_items')
		.select('project_id')
		.eq('status', 'deferred')
		.not('project_id', 'is', null)
		.limit(200);
	if (params.projectId) deferredQuery = deferredQuery.eq('project_id', params.projectId);
	const { data: deferredRows, error: deferredError } = await deferredQuery;
	if (deferredError) {
		console.warn(
			'[AI Inbox] Failed to load deferred projects for attention budget:',
			deferredError.message ?? deferredError
		);
	} else {
		for (const row of (deferredRows ?? []) as Array<{ project_id?: unknown }>) {
			if (typeof row.project_id === 'string') projectIds.add(row.project_id);
		}
	}

	const deferredIds = new Set<string>();
	const promotedIds = new Set<string>();
	for (const projectId of [...projectIds].slice(0, 25)) {
		try {
			const result = await applyProjectAttentionBudget({
				supabase: params.admin,
				projectId
			});
			result.deferredIds.forEach((id) => deferredIds.add(id));
			result.promotedIds.forEach((id) => promotedIds.add(id));
		} catch (budgetError) {
			console.warn(
				`[AI Inbox] Failed to apply attention budget for project ${projectId}:`,
				budgetError instanceof Error ? budgetError.message : budgetError
			);
		}
	}
	return { deferredIds, promotedIds };
}

async function reconcileVisibleInboxLifecycle(params: {
	supabase: AnySupabase;
	admin: AnySupabase;
	projectId?: string | null;
	sourceType?: InboxSourceType | null;
	group?: InboxGroupFilter | null;
	limit: number;
}): Promise<number> {
	let query = params.supabase
		.from('inbox_items')
		.select('*')
		.in('status', ['pending', 'snoozed'])
		.order('created_at', { ascending: false })
		.limit(Math.min(params.limit, 200));

	if (params.projectId) query = query.eq('project_id', params.projectId);
	if (params.sourceType) query = query.eq('source_type', params.sourceType);
	if (params.group === 'account') {
		query = query.is('project_id', null);
	} else if (params.group === 'project') {
		query = query.not('project_id', 'is', null);
	}

	const { data, error } = await query;
	if (error) throw error;
	const { rows: lifecycleRows, repairedCount } = await reconcileInboxLifecycle({
		admin: params.admin,
		rows: (data ?? []) as InboxIndexRow[]
	});
	const budget = await applyAttentionBudgetForProjects({
		supabase: params.supabase,
		admin: params.admin,
		rows: lifecycleRows,
		projectId: params.projectId
	});
	return repairedCount + budget.deferredIds.size + budget.promotedIds.size;
}

async function loadRowsById(params: {
	admin: AnySupabase;
	table: string;
	ids: string[];
}): Promise<Record<string, unknown>[]> {
	if (params.ids.length === 0) return [];
	const { data, error } = await params.admin.from(params.table).select('*').in('id', params.ids);
	if (error) throw error;
	return (data ?? []) as Record<string, unknown>[];
}

async function loadSourcePayloads(params: {
	admin: AnySupabase;
	rows: InboxIndexRow[];
}): Promise<Map<string, Record<string, unknown>>> {
	const payloads = new Map<string, Record<string, unknown>>();
	const idsBySource = new Map<InboxSourceType, string[]>();

	for (const row of params.rows) {
		if (!SUPPORTED_SOURCE_TYPES.has(row.source_type)) continue;
		const ids = idsBySource.get(row.source_type) ?? [];
		ids.push(row.source_ref_id);
		idsBySource.set(row.source_type, ids);
	}

	const tableBySource: Partial<Record<InboxSourceType, string>> = {
		agent_run: 'agent_runs',
		project_suggestion: 'project_suggestions',
		project_audit: 'project_audits',
		calendar_suggestion: 'calendar_project_suggestions'
	};

	const sourceRows = await Promise.all(
		[...idsBySource].map(async ([sourceType, ids]) => {
			const table = tableBySource[sourceType];
			if (!table) return { sourceType, rows: [] as Record<string, unknown>[] };
			return {
				sourceType,
				rows: await loadRowsById({ admin: params.admin, table, ids })
			};
		})
	);
	for (const { sourceType, rows } of sourceRows) {
		for (const row of rows) {
			if (typeof row.id === 'string') payloads.set(sourceKey(sourceType, row.id), row);
		}
	}

	return payloads;
}

function mapProjectLoopRunContext(row: Record<string, unknown>): InboxProjectLoopRunContext | null {
	const id = asString(row.id);
	if (!id) return null;
	return {
		id,
		project_id: asString(row.project_id),
		trigger_reason: asString(row.trigger_reason),
		status: asString(row.status),
		summary: asString(row.summary),
		brief: asRecord(row.brief),
		suggestion_count: asNumber(row.suggestion_count),
		created_at: asString(row.created_at),
		finished_at: asString(row.finished_at)
	};
}

function mapProjectAuditContext(
	row: Record<string, unknown>,
	role: string | null
): InboxProjectAuditContext | null {
	const id = asString(row.id);
	if (!id) return null;
	return {
		id,
		project_id: asString(row.project_id),
		status: asString(row.status),
		trigger_reason: asString(row.trigger_reason),
		delivery_confidence: asString(row.delivery_confidence),
		summary: asString(row.summary),
		role,
		generated_suggestion_count: asNumber(row.generated_suggestion_count),
		unresolved_suggestion_count: asNumber(row.unresolved_suggestion_count),
		created_at: asString(row.created_at),
		finished_at: asString(row.finished_at)
	};
}

async function loadSourceContexts(params: {
	admin: AnySupabase;
	rows: InboxIndexRow[];
	payloads: Map<string, Record<string, unknown>>;
}): Promise<Map<string, InboxSourceContext>> {
	const runIds = new Set<string>();
	const suggestionIds = new Set<string>();
	const directAuditIds = new Set<string>();

	for (const row of params.rows) {
		const payload = params.payloads.get(sourceKey(row.source_type, row.source_ref_id));
		if (row.source_type === 'project_suggestion') {
			suggestionIds.add(row.source_ref_id);
			const runId = asString(payload?.run_id);
			if (runId) runIds.add(runId);
		} else if (row.source_type === 'project_audit') {
			directAuditIds.add(row.source_ref_id);
			const runId = asString(payload?.loop_run_id);
			if (runId) runIds.add(runId);
		}
	}

	const contexts = new Map<string, InboxSourceContext>();
	if (runIds.size === 0 && suggestionIds.size === 0 && directAuditIds.size === 0) {
		return contexts;
	}

	const runsById = new Map<string, InboxProjectLoopRunContext>();
	if (runIds.size > 0) {
		const { data, error } = await params.admin
			.from('project_loop_runs')
			.select(
				'id, project_id, trigger_reason, status, summary, brief, suggestion_count, created_at, finished_at'
			)
			.in('id', [...runIds]);
		if (error) throw error;

		for (const row of (data ?? []) as Record<string, unknown>[]) {
			const context = mapProjectLoopRunContext(row);
			if (context) runsById.set(context.id, context);
		}
	}

	const auditLinkBySuggestionId = new Map<string, { auditId: string; role: string | null }>();
	if (suggestionIds.size > 0) {
		const { data, error } = await params.admin
			.from('project_audit_suggestions')
			.select('audit_id, suggestion_id, role')
			.in('suggestion_id', [...suggestionIds]);
		if (error) throw error;
		for (const row of (data ?? []) as Record<string, unknown>[]) {
			const suggestionId = asString(row.suggestion_id);
			const auditId = asString(row.audit_id);
			if (!suggestionId || !auditId) continue;
			auditLinkBySuggestionId.set(suggestionId, {
				auditId,
				role: asString(row.role)
			});
		}
	}

	const auditIds = [
		...new Set([
			...directAuditIds,
			...[...auditLinkBySuggestionId.values()].map((link) => link.auditId)
		])
	];
	const auditsById = new Map<string, Record<string, unknown>>();
	if (auditIds.length > 0) {
		const { data, error } = await params.admin
			.from('project_audits')
			.select(
				'id, project_id, loop_run_id, status, trigger_reason, delivery_confidence, summary, generated_suggestion_count, unresolved_suggestion_count, created_at, finished_at'
			)
			.in('id', auditIds);
		if (error) throw error;
		for (const row of (data ?? []) as Record<string, unknown>[]) {
			const auditId = asString(row.id);
			if (auditId) auditsById.set(auditId, row);
		}
	}

	for (const row of params.rows) {
		if (row.source_type !== 'project_suggestion') continue;
		const payload = params.payloads.get(sourceKey(row.source_type, row.source_ref_id));
		const runId = asString(payload?.run_id);
		const auditLink = auditLinkBySuggestionId.get(row.source_ref_id);
		const auditRow = auditLink ? auditsById.get(auditLink.auditId) : null;
		contexts.set(sourceKey(row.source_type, row.source_ref_id), {
			project_loop_run: runId ? (runsById.get(runId) ?? null) : null,
			project_audit: auditRow
				? mapProjectAuditContext(auditRow, auditLink?.role ?? null)
				: null
		});
	}

	for (const row of params.rows) {
		if (row.source_type !== 'project_audit') continue;
		const auditRow =
			auditsById.get(row.source_ref_id) ??
			params.payloads.get(sourceKey(row.source_type, row.source_ref_id));
		const runId = asString(auditRow?.loop_run_id);
		contexts.set(sourceKey(row.source_type, row.source_ref_id), {
			project_loop_run: runId ? (runsById.get(runId) ?? null) : null,
			project_audit: auditRow ? mapProjectAuditContext(auditRow, null) : null
		});
	}

	return contexts;
}

async function loadProjectMetadata(params: {
	supabase: AnySupabase;
	rows: InboxIndexRow[];
	payloads?: Map<string, Record<string, unknown>>;
	contexts?: Map<string, InboxSourceContext>;
}): Promise<Map<string, InboxProjectMeta>> {
	const projectIds = [
		...new Set(
			params.rows
				.map((row) =>
					resolveInboxItemProjectId({
						row,
						payload: params.payloads?.get(
							sourceKey(row.source_type, row.source_ref_id)
						),
						context: params.contexts?.get(sourceKey(row.source_type, row.source_ref_id))
					})
				)
				.filter((id): id is string => !!id)
		)
	];
	const projects = new Map<string, InboxProjectMeta>();
	if (projectIds.length === 0) return projects;

	const { data, error } = await params.supabase
		.from('onto_projects')
		.select('id, name')
		.in('id', projectIds);
	if (error) throw error;

	for (const project of (data ?? []) as Array<{ id?: unknown; name?: unknown }>) {
		if (typeof project.id !== 'string') continue;
		projects.set(project.id, {
			id: project.id,
			name: typeof project.name === 'string' ? project.name : null
		});
	}

	return projects;
}

function resolveProjectIdFromPayload(
	sourceType: InboxSourceType,
	payload: Record<string, unknown> | null | undefined
): string | null {
	if (!payload) return null;
	if (sourceType === 'calendar_suggestion') {
		return asString(payload.created_project_id) ?? asString(payload.project_id);
	}
	return asString(payload.project_id);
}

function resolveInboxItemProjectId(params: {
	row: InboxIndexRow;
	payload?: Record<string, unknown> | null;
	context?: InboxSourceContext | null;
}): string | null {
	return (
		asString(params.row.project_id) ??
		resolveProjectIdFromPayload(params.row.source_type, params.payload) ??
		params.context?.project_audit?.project_id ??
		params.context?.project_loop_run?.project_id ??
		null
	);
}

async function loadDecisionCapabilities(params: {
	supabase: AnySupabase;
	rows: InboxIndexRow[];
	userId: string;
}): Promise<Map<string, InboxDecisionCapability>> {
	const capabilities = new Map<string, InboxDecisionCapability>();
	const projectWriteAccess = new Map<string, boolean>();
	const projectIds = [
		...new Set(
			params.rows
				.filter(
					(row) =>
						row.status === 'pending' &&
						row.source_type === 'project_suggestion' &&
						Boolean(row.project_id)
				)
				.map((row) => row.project_id as string)
		)
	];

	const projectAccessResults = await Promise.all(
		projectIds.map(async (projectId) => {
			const { data, error } = await params.supabase.rpc(
				'current_actor_has_project_member_access',
				{
					p_project_id: projectId,
					p_required_access: 'write'
				}
			);
			if (error) throw error;
			return [projectId, Boolean(data)] as const;
		})
	);
	for (const [projectId, canWrite] of projectAccessResults) {
		projectWriteAccess.set(projectId, canWrite);
	}

	for (const row of params.rows) {
		if (row.status !== 'pending') {
			capabilities.set(rowKey(row), {
				can_decide: false,
				decision_disabled_reason:
					row.status === 'deciding' ? 'Decision in progress' : 'Already handled'
			});
			continue;
		}

		if (row.source_type === 'agent_run' || row.source_type === 'calendar_suggestion') {
			const canDecide = row.user_id === params.userId;
			capabilities.set(rowKey(row), {
				can_decide: canDecide,
				decision_disabled_reason: canDecide ? null : 'Owned by another user'
			});
			continue;
		}

		if (row.source_type === 'project_audit') {
			capabilities.set(rowKey(row), {
				can_decide: false,
				decision_disabled_reason: 'Open the audit packet to review recommendations'
			});
			continue;
		}

		if (row.source_type === 'project_suggestion') {
			if (!row.project_id) {
				capabilities.set(rowKey(row), {
					can_decide: false,
					decision_disabled_reason: 'Missing project'
				});
				continue;
			}

			const canDecide = projectWriteAccess.get(row.project_id) === true;
			capabilities.set(rowKey(row), {
				can_decide: canDecide,
				decision_disabled_reason: canDecide ? null : 'View-only project access'
			});
			continue;
		}

		capabilities.set(rowKey(row), {
			can_decide: false,
			decision_disabled_reason: 'Unsupported inbox source'
		});
	}

	return capabilities;
}

async function syncRows(params: {
	admin: AnySupabase;
	sourceType: InboxSourceType;
	rows: Record<string, unknown>[];
}): Promise<number> {
	let synced = 0;
	for (const row of params.rows) {
		if (typeof row.id !== 'string') continue;
		const syncedRow = await syncInboxItemForSource({
			supabase: params.admin,
			sourceType: params.sourceType,
			sourceRefId: row.id
		});
		if (syncedRow) synced += 1;
	}
	return synced;
}

function buildClarifiedSuggestionRepairResult(params: {
	run: Record<string, unknown>;
	finalStatus: string;
	sourceDecision: 'approve' | 'dismiss';
}): Record<string, unknown> {
	const runResult = asRecord(params.run.result);
	const summary = asString(runResult?.summary);
	const answer = asString(runResult?.answer);
	const ok = params.finalStatus === 'completed';
	const entitiesTouched = Array.isArray(runResult?.entities_touched)
		? runResult.entities_touched.length
		: 0;
	const error =
		asString(runResult?.error) ??
		(params.finalStatus === 'cancelled'
			? 'Clarified decision run was cancelled.'
			: params.finalStatus === 'partial'
				? 'Clarified decision run finished partially.'
				: 'Clarified decision run failed.');

	return {
		ok,
		applied_operations: ok ? entitiesTouched : 0,
		agent_run_id: asString(params.run.id),
		agent_run_status: params.finalStatus,
		source_decision: params.sourceDecision,
		repaired_by: 'ai_inbox_backfill',
		...(summary ? { summary } : {}),
		...(answer ? { answer } : {}),
		...(!ok && error ? { errors: [{ tool: 'agent_run', error }] } : {})
	};
}

async function repairDelegatedProjectSuggestions(params: {
	admin: AnySupabase;
	rows: Record<string, unknown>[];
	now?: Date;
}): Promise<Record<string, unknown>[]> {
	const delegatedRows = params.rows.filter(
		(row) => asString(row.status) === 'delegated' && asString(row.agent_run_id)
	);
	if (delegatedRows.length === 0) return params.rows;

	const runIds = [
		...new Set(
			delegatedRows
				.map((row) => asString(row.agent_run_id))
				.filter((id): id is string => !!id)
		)
	];
	if (runIds.length === 0) return params.rows;

	const { data: runRows, error } = await params.admin
		.from('agent_runs')
		.select('id, status, source_decision, result, completed_at, updated_at')
		.in('id', runIds);
	if (error) throw error;

	const runsById = new Map<string, Record<string, unknown>>();
	for (const run of (runRows ?? []) as Record<string, unknown>[]) {
		const id = asString(run.id);
		if (id) runsById.set(id, run);
	}

	const repairedById = new Map<string, Record<string, unknown>>();
	const nowIso = (params.now ?? new Date()).toISOString();
	for (const row of delegatedRows) {
		const rowId = asString(row.id);
		const runId = asString(row.agent_run_id);
		if (!rowId || !runId) continue;
		const run = runsById.get(runId);
		const finalStatus = readTerminalAgentRunStatus(run?.status);
		const sourceDecision = asString(run?.source_decision);
		if (
			!run ||
			!finalStatus ||
			(sourceDecision !== 'approve' && sourceDecision !== 'dismiss')
		) {
			continue;
		}

		const succeeded = finalStatus === 'completed';
		const nextStatus = succeeded
			? sourceDecision === 'approve'
				? 'applied'
				: 'rejected'
			: 'failed';
		const completedAt = asString(run.completed_at) ?? asString(run.updated_at) ?? nowIso;
		const patch: Record<string, unknown> = {
			status: nextStatus,
			result: buildClarifiedSuggestionRepairResult({
				run,
				finalStatus,
				sourceDecision
			}),
			agent_run_id: runId,
			updated_at: completedAt
		};
		if (succeeded && sourceDecision === 'approve') {
			patch.applied_at = completedAt;
		}

		const { data: updated, error: updateError } = await params.admin
			.from('project_suggestions')
			.update(patch)
			.eq('id', rowId)
			.eq('status', 'delegated')
			.select('*')
			.maybeSingle();
		if (updateError) throw updateError;
		if (updated) repairedById.set(rowId, updated as Record<string, unknown>);
	}

	if (repairedById.size === 0) return params.rows;
	return params.rows.map((row) => {
		const id = asString(row.id);
		return id ? (repairedById.get(id) ?? row) : row;
	});
}

async function backfillVisibleSourceRows(params: {
	supabase: AnySupabase;
	admin: AnySupabase;
	userId: string;
	status?: InboxItemStatus | null;
	projectId?: string | null;
	sourceType?: InboxSourceType | null;
	group?: InboxGroupFilter | null;
	limit?: number;
}): Promise<number> {
	const status = params.status ?? null;
	if (status && status !== 'pending' && status !== 'deciding') return 0;

	const limit = Math.min(params.limit ?? 200, 200);
	let synced = 0;

	if (!params.sourceType || params.sourceType === 'agent_run') {
		let query = params.supabase
			.from('agent_runs')
			.select('*')
			.eq('user_id', params.userId)
			.in('status', ['proposal_ready', 'running'])
			.order('created_at', { ascending: false })
			.limit(limit);
		if (params.projectId) query = query.eq('project_id', params.projectId);
		if (params.group === 'account') query = query.is('project_id', null);
		else if (params.group === 'project') query = query.not('project_id', 'is', null);
		const { data, error } = await query;
		if (error) throw error;
		synced += await syncRows({
			admin: params.admin,
			sourceType: 'agent_run',
			rows: (data ?? []) as Record<string, unknown>[]
		});
	}

	if (
		(!params.sourceType || params.sourceType === 'project_suggestion') &&
		params.group !== 'account'
	) {
		let query = params.supabase
			.from('project_suggestions')
			.select('*')
			.in('status', ['pending', 'approved', 'delegated'])
			.order('created_at', { ascending: false })
			.limit(limit);
		if (params.projectId) query = query.eq('project_id', params.projectId);
		const { data, error } = await query;
		if (error) throw error;
		const rows = await repairDelegatedProjectSuggestions({
			admin: params.admin,
			rows: (data ?? []) as Record<string, unknown>[]
		});
		synced += await syncRows({
			admin: params.admin,
			sourceType: 'project_suggestion',
			rows
		});
	}

	if (
		(!params.sourceType || params.sourceType === 'project_audit') &&
		params.group !== 'account'
	) {
		let query = params.supabase
			.from('project_audits')
			.select('*')
			.in('status', ['queued', 'running', 'ready'])
			.order('created_at', { ascending: false })
			.limit(limit);
		if (params.projectId) query = query.eq('project_id', params.projectId);
		const { data, error } = await query;
		if (error) throw error;
		synced += await syncRows({
			admin: params.admin,
			sourceType: 'project_audit',
			rows: (data ?? []) as Record<string, unknown>[]
		});
	}

	if (
		(!params.sourceType || params.sourceType === 'calendar_suggestion') &&
		!params.projectId &&
		params.group !== 'project'
	) {
		const { data, error } = await params.supabase
			.from('calendar_project_suggestions')
			.select('*')
			.eq('user_id', params.userId)
			.in('status', ['pending', 'processing'])
			.order('created_at', { ascending: false })
			.limit(limit);
		if (error) throw error;
		synced += await syncRows({
			admin: params.admin,
			sourceType: 'calendar_suggestion',
			rows: (data ?? []) as Record<string, unknown>[]
		});
	}

	return synced;
}

export async function listInboxItems(params: {
	supabase: AnySupabase;
	admin: AnySupabase;
	userId: string;
	status?: InboxItemStatus | null;
	projectId?: string | null;
	sourceType?: InboxSourceType | null;
	group?: InboxGroupFilter | null;
	limit?: number;
	includePayload?: boolean;
	repair?: boolean;
	timing?: ServerTiming | null;
}): Promise<ListInboxItemsResult> {
	const requestedStatus = params.status ?? null;
	const shouldRepairSources = params.repair !== false;
	const backfilledCount = shouldRepairSources
		? await measure(params.timing, 'inbox.backfill', () => backfillVisibleSourceRows(params))
		: 0;
	const requestedLimit = params.limit ?? 50;
	const queryLimit =
		requestedStatus === 'pending' ? Math.min(requestedLimit * 3, 10000) : requestedLimit;
	let query = params.supabase
		.from('inbox_items')
		.select('*')
		.order('created_at', { ascending: false })
		.limit(queryLimit);

	if (requestedStatus === 'pending') {
		query = query.in('status', ['pending', 'snoozed']);
	} else if (requestedStatus) {
		query = query.eq('status', requestedStatus);
	}
	if (params.projectId) {
		query = query.eq('project_id', params.projectId);
	}
	if (params.sourceType) {
		query = query.eq('source_type', params.sourceType);
	}
	if (params.group === 'account') {
		query = query.is('project_id', null);
	} else if (params.group === 'project') {
		query = query.not('project_id', 'is', null);
	}

	const { data, error } = await measure<{ data: unknown[] | null; error: unknown }>(
		params.timing,
		'inbox.index',
		async () => await query
	);
	if (error) throw error;

	const initialRows = (data ?? []) as InboxIndexRow[];
	const { rows: reconciledRows, repairedCount } = shouldRepairSources
		? await measure(params.timing, 'inbox.source_reconcile', () =>
				reconcileInboxRows({
					admin: params.admin,
					rows: initialRows
				})
			)
		: { rows: initialRows, repairedCount: 0 };
	const { rows: lifecycleRows, repairedCount: lifecycleRepairedCount } = await measure(
		params.timing,
		'inbox.lifecycle',
		() =>
			reconcileInboxLifecycle({
				admin: params.admin,
				rows: reconciledRows
			})
	);

	// Rows this pass just deferred are patched in place so they drop out of the
	// current render; rows it promoted surface on the next poll (they were not
	// part of this pending/snoozed read).
	const budget = shouldRepairSources
		? await measure(params.timing, 'inbox.attention_budget', () =>
				applyAttentionBudgetForProjects({
					supabase: params.supabase,
					admin: params.admin,
					rows: lifecycleRows,
					projectId: params.projectId
				})
			)
		: { deferredIds: new Set<string>(), promotedIds: new Set<string>() };
	const budgetedRows = budget.deferredIds.size
		? lifecycleRows.map((row) =>
				row.id && budget.deferredIds.has(row.id)
					? { ...row, status: 'deferred' as InboxItemStatus }
					: row
			)
		: lifecycleRows;

	const orderedRows = sortInboxRowsForReview(budgetedRows);
	const visibleRows = requestedStatus
		? orderedRows.filter((row) => row.status === requestedStatus).slice(0, requestedLimit)
		: orderedRows.slice(0, requestedLimit);
	const totalRepairedCount = repairedCount + lifecycleRepairedCount;

	if (!params.includePayload) {
		const total = await measure(params.timing, 'inbox.total', () => countInboxRows(params));
		return {
			items: visibleRows,
			total,
			repairedCount: totalRepairedCount,
			backfilledCount
		};
	}

	const [total, capabilities, payloads] = await measure(params.timing, 'inbox.hydrate_base', () =>
		Promise.all([
			countInboxRows(params),
			loadDecisionCapabilities({
				supabase: params.supabase,
				rows: visibleRows,
				userId: params.userId
			}),
			loadSourcePayloads({ admin: params.admin, rows: visibleRows })
		])
	);
	const contexts = await measure(params.timing, 'inbox.contexts', () =>
		loadSourceContexts({
			admin: params.admin,
			rows: visibleRows,
			payloads
		})
	);
	const projects = await measure(params.timing, 'inbox.projects', () =>
		loadProjectMetadata({
			supabase: params.supabase,
			rows: visibleRows,
			payloads,
			contexts
		})
	);
	return {
		items: visibleRows.map((row) => {
			const key = sourceKey(row.source_type, row.source_ref_id);
			const payload = payloads.get(key) ?? null;
			const context = contexts.get(key) ?? null;
			const projectId = resolveInboxItemProjectId({ row, payload, context });
			const project = projectId
				? (projects.get(projectId) ?? { id: projectId, name: null })
				: null;
			return {
				...row,
				project_id: projectId,
				project,
				can_decide: capabilities.get(rowKey(row))?.can_decide ?? false,
				decision_disabled_reason:
					capabilities.get(rowKey(row))?.decision_disabled_reason ??
					'Unsupported inbox source',
				source_payload: payload,
				source_context: context
			};
		}),
		total,
		repairedCount: totalRepairedCount,
		backfilledCount
	};
}

export async function countInboxItems(params: {
	supabase: AnySupabase;
	admin: AnySupabase;
	userId: string;
	status?: InboxItemStatus | null;
	projectId?: string | null;
	sourceType?: InboxSourceType | null;
	group?: InboxGroupFilter | null;
	limit?: number;
	repair?: boolean;
	timing?: ServerTiming | null;
}): Promise<InboxCountResult> {
	const limit = params.limit ?? 1000;
	const shouldRepairSources = params.repair !== false;
	const backfilledCount = shouldRepairSources
		? await measure(params.timing, 'inbox_count.backfill', () =>
				backfillVisibleSourceRows({
					...params,
					limit
				})
			)
		: 0;
	const repairedCount = await measure(params.timing, 'inbox_count.lifecycle', () =>
		reconcileVisibleInboxLifecycle({
			supabase: params.supabase,
			admin: params.admin,
			projectId: params.projectId,
			sourceType: params.sourceType,
			group: params.group,
			limit
		})
	);
	const requestedStatus = params.status ?? null;
	const [total, account, rows] = await measure(params.timing, 'inbox_count.index', () => {
		const totalPromise = countInboxRows(params);
		const accountPromise =
			params.projectId || params.group === 'project'
				? Promise.resolve(0)
				: params.group === 'account'
					? totalPromise
					: countInboxRows({ ...params, group: 'account' });

		return Promise.all([
			totalPromise,
			accountPromise,
			loadInboxCountBreakdownRows({ ...params, limit })
		]);
	});

	const byStatus: Record<string, number> = {};
	const bySourceType: Record<string, number> = {};
	const byProject: Record<string, number> = {};

	if (requestedStatus) {
		byStatus[requestedStatus] = total;
	}
	if (params.sourceType) {
		bySourceType[params.sourceType] = total;
	}
	if (params.projectId && total > 0) {
		byProject[params.projectId] = total;
	}

	for (const row of rows) {
		if (!requestedStatus) {
			byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
		}
		if (!params.sourceType) {
			bySourceType[row.source_type] = (bySourceType[row.source_type] ?? 0) + 1;
		}
		if (!params.projectId && row.project_id) {
			byProject[row.project_id] = (byProject[row.project_id] ?? 0) + 1;
		}
	}

	return {
		total,
		by_status: byStatus,
		by_source_type: bySourceType,
		by_project: byProject,
		account,
		truncated: rows.length < total,
		repairedCount,
		backfilledCount
	};
}
