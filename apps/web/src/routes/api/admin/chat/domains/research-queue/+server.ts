// apps/web/src/routes/api/admin/chat/domains/research-queue/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import type {
	DomainResearchQueueKind,
	DomainResearchQueuePriority,
	DomainResearchQueueStatus,
	DomainResearchQueueStoredRow
} from '$lib/services/agentic-chat/tools/domains/domain-research-queue';

type QueueStatusFilter = DomainResearchQueueStatus | 'all';
type QueueKindFilter = DomainResearchQueueKind | 'all';
type QueuePriorityFilter = DomainResearchQueuePriority | 'all';

const MAX_QUEUE_ROWS = 200;

const QUEUE_STATUSES = new Set<QueueStatusFilter>([
	'all',
	'queued',
	'researching',
	'draft_ready',
	'reviewing',
	'approved',
	'rejected',
	'archived'
]);
const QUEUE_KINDS = new Set<QueueKindFilter>([
	'all',
	'domain',
	'work_capability',
	'skill',
	'micro_skill',
	'resource'
]);
const QUEUE_PRIORITIES = new Set<QueuePriorityFilter>(['all', 'high', 'medium', 'low']);

function parseLimit(value: string | null): number {
	const parsed = Number.parseInt(value ?? '', 10);
	if (!Number.isFinite(parsed) || parsed <= 0) return 50;
	return Math.min(parsed, MAX_QUEUE_ROWS);
}

function parseStatus(value: string | null): QueueStatusFilter {
	return QUEUE_STATUSES.has(value as QueueStatusFilter) ? (value as QueueStatusFilter) : 'all';
}

function parseKind(value: string | null): QueueKindFilter {
	return QUEUE_KINDS.has(value as QueueKindFilter) ? (value as QueueKindFilter) : 'all';
}

function parsePriority(value: string | null): QueuePriorityFilter {
	return QUEUE_PRIORITIES.has(value as QueuePriorityFilter)
		? (value as QueuePriorityFilter)
		: 'all';
}

function normalizeSearchForFilter(value: string): string {
	return value
		.replace(/[%*,()]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function escapeForIlike(value: string): string {
	return value.replace(/[\\_]/g, (char) => `\\${char}`);
}

function statusCounts(
	rows: DomainResearchQueueStoredRow[]
): Record<DomainResearchQueueStatus, number> {
	const counts: Record<DomainResearchQueueStatus, number> = {
		queued: 0,
		researching: 0,
		draft_ready: 0,
		reviewing: 0,
		approved: 0,
		rejected: 0,
		archived: 0
	};
	for (const row of rows) {
		counts[row.status] += 1;
	}
	return counts;
}

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user?.id) {
		return ApiResponse.unauthorized();
	}

	const { data: adminUser, error: adminError } = await supabase
		.from('admin_users')
		.select('user_id')
		.eq('user_id', user.id)
		.single();

	if (adminError || !adminUser) {
		return ApiResponse.forbidden('Admin access required');
	}

	const status = parseStatus(url.searchParams.get('status'));
	const kind = parseKind(url.searchParams.get('kind'));
	const priority = parsePriority(url.searchParams.get('priority'));
	const search = normalizeSearchForFilter(url.searchParams.get('search') ?? '');
	const limit = parseLimit(url.searchParams.get('limit'));
	const db = supabase as unknown as { from: (table: string) => any };

	try {
		let query = db
			.from('domain_research_queue')
			.select(
				[
					'id',
					'queue_key',
					'kind',
					'status',
					'priority',
					'domain_ids',
					'work_capability_id',
					'parent_skill_id',
					'missing_skill_id',
					'missing_resource_id',
					'user_need',
					'summary',
					'evidence',
					'source_session_ids',
					'source_user_count',
					'occurrences',
					'first_seen_at',
					'last_seen_at',
					'claimed_at',
					'claimed_by',
					'completed_at',
					'budget',
					'result',
					'created_at',
					'updated_at'
				].join(', '),
				{ count: 'exact' }
			);

		if (status !== 'all') query = query.eq('status', status);
		if (kind !== 'all') query = query.eq('kind', kind);
		if (priority !== 'all') query = query.eq('priority', priority);
		if (search) {
			const escapedSearch = escapeForIlike(search);
			query = query.or(
				`queue_key.ilike.%${escapedSearch}%,user_need.ilike.%${escapedSearch}%,summary.ilike.%${escapedSearch}%`
			);
		}

		const { data, error, count } = await query
			.order('last_seen_at', { ascending: false })
			.order('occurrences', { ascending: false })
			.range(0, limit - 1);

		if (error) throw error;

		const rows = (data ?? []) as Array<DomainResearchQueueStoredRow & Record<string, unknown>>;
		return ApiResponse.success({
			filters: {
				status,
				kind,
				priority,
				search,
				limit
			},
			overview: {
				total_matching_rows: count ?? rows.length,
				returned_rows: rows.length,
				status_counts: statusCounts(rows as DomainResearchQueueStoredRow[])
			},
			rows
		});
	} catch (error) {
		return ApiResponse.internalError(error, 'Failed to load domain research queue');
	}
};
