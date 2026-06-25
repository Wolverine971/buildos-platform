// apps/web/src/lib/server/inbox.service.ts
import {
	syncInboxItemForSource,
	type InboxIndexRow,
	type InboxItemStatus,
	type InboxSourceType
} from '@buildos/shared-agent-ops/inbox-index';

type AnySupabase = any;

export type InboxGroupFilter = 'account' | 'project';

export type InboxProjectMeta = {
	id: string;
	name: string | null;
};

export type InboxDecisionCapability = {
	can_decide: boolean;
	decision_disabled_reason: string | null;
};

export type InboxItemWithPayload = InboxIndexRow & {
	project?: InboxProjectMeta | null;
	can_decide?: boolean;
	decision_disabled_reason?: string | null;
	source_payload?: Record<string, unknown> | null;
};

export type ListInboxItemsResult = {
	items: InboxItemWithPayload[];
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

const INBOX_SOURCE_TYPES = new Set<InboxSourceType>([
	'agent_run',
	'project_suggestion',
	'calendar_suggestion',
	'profile_fragment',
	'contact_merge_candidate'
]);

const SUPPORTED_SOURCE_TYPES = new Set<InboxSourceType>([
	'agent_run',
	'project_suggestion',
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

function shouldReconcile(row: InboxIndexRow): boolean {
	return SUPPORTED_SOURCE_TYPES.has(row.source_type);
}

function parseTimestamp(value: string | null | undefined): number | null {
	if (!value) return null;
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function shouldExpire(row: InboxIndexRow, nowMs: number): boolean {
	const expiresAt = parseTimestamp(row.expires_at);
	if (expiresAt === null || expiresAt > nowMs) return false;
	return row.status === 'pending' || row.status === 'deciding' || row.status === 'snoozed';
}

function shouldUnsnooze(row: InboxIndexRow, nowMs: number): boolean {
	if (row.status !== 'snoozed') return false;
	const snoozedUntil = parseTimestamp(row.snoozed_until);
	return snoozedUntil !== null && snoozedUntil <= nowMs;
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

	for (const row of params.rows) {
		if (!shouldReconcile(row)) {
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

	for (const row of params.rows) {
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
		calendar_suggestion: 'calendar_project_suggestions'
	};

	for (const [sourceType, ids] of idsBySource) {
		const table = tableBySource[sourceType];
		if (!table) continue;
		const rows = await loadRowsById({ admin: params.admin, table, ids });
		for (const row of rows) {
			if (typeof row.id === 'string') {
				payloads.set(sourceKey(sourceType, row.id), row);
			}
		}
	}

	return payloads;
}

async function loadProjectMetadata(params: {
	supabase: AnySupabase;
	rows: InboxIndexRow[];
}): Promise<Map<string, InboxProjectMeta>> {
	const projectIds = [
		...new Set(params.rows.map((row) => row.project_id).filter((id): id is string => !!id))
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

async function loadDecisionCapabilities(params: {
	supabase: AnySupabase;
	rows: InboxIndexRow[];
	userId: string;
}): Promise<Map<string, InboxDecisionCapability>> {
	const capabilities = new Map<string, InboxDecisionCapability>();
	const projectWriteAccess = new Map<string, boolean>();

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

		if (row.source_type === 'project_suggestion') {
			if (!row.project_id) {
				capabilities.set(rowKey(row), {
					can_decide: false,
					decision_disabled_reason: 'Missing project'
				});
				continue;
			}

			if (!projectWriteAccess.has(row.project_id)) {
				const { data, error } = await params.supabase.rpc(
					'current_actor_has_project_member_access',
					{
						p_project_id: row.project_id,
						p_required_access: 'write'
					}
				);
				if (error) throw error;
				projectWriteAccess.set(row.project_id, Boolean(data));
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
			.in('status', ['pending', 'approved'])
			.order('created_at', { ascending: false })
			.limit(limit);
		if (params.projectId) query = query.eq('project_id', params.projectId);
		const { data, error } = await query;
		if (error) throw error;
		synced += await syncRows({
			admin: params.admin,
			sourceType: 'project_suggestion',
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
}): Promise<ListInboxItemsResult> {
	const requestedStatus = params.status ?? null;
	const backfilledCount = await backfillVisibleSourceRows(params);
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

	const { data, error } = await query;
	if (error) throw error;

	const initialRows = (data ?? []) as InboxIndexRow[];
	const { rows: reconciledRows, repairedCount } = await reconcileInboxRows({
		admin: params.admin,
		rows: initialRows
	});
	const { rows: lifecycleRows, repairedCount: lifecycleRepairedCount } =
		await reconcileInboxLifecycle({
			admin: params.admin,
			rows: reconciledRows
		});

	const visibleRows = requestedStatus
		? lifecycleRows.filter((row) => row.status === requestedStatus).slice(0, requestedLimit)
		: lifecycleRows.slice(0, requestedLimit);
	const totalRepairedCount = repairedCount + lifecycleRepairedCount;

	if (!params.includePayload) {
		return {
			items: visibleRows,
			repairedCount: totalRepairedCount,
			backfilledCount
		};
	}

	const projects = await loadProjectMetadata({ supabase: params.supabase, rows: visibleRows });
	const capabilities = await loadDecisionCapabilities({
		supabase: params.supabase,
		rows: visibleRows,
		userId: params.userId
	});
	const payloads = await loadSourcePayloads({ admin: params.admin, rows: visibleRows });
	return {
		items: visibleRows.map((row) => ({
			...row,
			project: row.project_id ? (projects.get(row.project_id) ?? null) : null,
			can_decide: capabilities.get(rowKey(row))?.can_decide ?? false,
			decision_disabled_reason:
				capabilities.get(rowKey(row))?.decision_disabled_reason ??
				'Unsupported inbox source',
			source_payload: payloads.get(sourceKey(row.source_type, row.source_ref_id)) ?? null
		})),
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
}): Promise<InboxCountResult> {
	const limit = params.limit ?? 1000;
	const { items, repairedCount, backfilledCount } = await listInboxItems({
		...params,
		limit,
		includePayload: false
	});

	const byStatus: Record<string, number> = {};
	const bySourceType: Record<string, number> = {};
	const byProject: Record<string, number> = {};
	let account = 0;

	for (const item of items) {
		byStatus[item.status] = (byStatus[item.status] ?? 0) + 1;
		bySourceType[item.source_type] = (bySourceType[item.source_type] ?? 0) + 1;
		if (item.project_id) {
			byProject[item.project_id] = (byProject[item.project_id] ?? 0) + 1;
		} else {
			account += 1;
		}
	}

	return {
		total: items.length,
		by_status: byStatus,
		by_source_type: bySourceType,
		by_project: byProject,
		account,
		truncated: items.length >= limit,
		repairedCount,
		backfilledCount
	};
}
