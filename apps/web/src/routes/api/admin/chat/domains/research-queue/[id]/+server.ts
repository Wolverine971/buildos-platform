// apps/web/src/routes/api/admin/chat/domains/research-queue/[id]/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import type {
	DomainResearchQueuePriority,
	DomainResearchQueueStatus
} from '$lib/services/agentic-chat/tools/domains/domain-research-queue';

const QUEUE_STATUSES = new Set<DomainResearchQueueStatus>([
	'queued',
	'researching',
	'draft_ready',
	'reviewing',
	'approved',
	'rejected',
	'archived'
]);
const QUEUE_PRIORITIES = new Set<DomainResearchQueuePriority>(['high', 'medium', 'low']);
const TERMINAL_QUEUE_STATUSES = new Set<DomainResearchQueueStatus>([
	'approved',
	'rejected',
	'archived'
]);

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
	const text = await request.text();
	if (!text.trim()) return {};
	try {
		const parsed = JSON.parse(text);
		return isRecord(parsed) ? parsed : {};
	} catch {
		return {};
	}
}

function readStatus(value: unknown): DomainResearchQueueStatus | null {
	return QUEUE_STATUSES.has(value as DomainResearchQueueStatus)
		? (value as DomainResearchQueueStatus)
		: null;
}

function readPriority(value: unknown): DomainResearchQueuePriority | null {
	return QUEUE_PRIORITIES.has(value as DomainResearchQueuePriority)
		? (value as DomainResearchQueuePriority)
		: null;
}

function readNullableText(value: unknown): string | null | undefined {
	if (value === null) return null;
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

export const PATCH: RequestHandler = async ({
	request,
	params,
	locals: { supabase, safeGetSession }
}) => {
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

	const id = params.id;
	const body = await readBody(request);
	const update: Record<string, unknown> = {};
	const status = readStatus(body.status);
	const priority = readPriority(body.priority);
	const claimedBy = readNullableText(body.claimed_by);
	const result = body.result === null ? null : isRecord(body.result) ? body.result : undefined;

	if ('status' in body) {
		if (!status) return ApiResponse.badRequest('Invalid queue status');
		update.status = status;
		if (status === 'researching') {
			update.claimed_at = new Date().toISOString();
			update.claimed_by = claimedBy ?? user.email ?? user.id;
		}
		if (status === 'queued') {
			update.claimed_at = null;
			update.claimed_by = null;
			update.completed_at = null;
		}
		if (TERMINAL_QUEUE_STATUSES.has(status)) {
			update.completed_at = new Date().toISOString();
		}
	}

	if ('priority' in body) {
		if (!priority) return ApiResponse.badRequest('Invalid queue priority');
		update.priority = priority;
	}

	if ('claimed_by' in body && claimedBy !== undefined) {
		update.claimed_by = claimedBy;
	}

	if ('result' in body) {
		if (result === undefined) return ApiResponse.badRequest('Queue result must be an object');
		update.result = result;
	}

	if (Object.keys(update).length === 0) {
		return ApiResponse.badRequest('No queue updates provided');
	}

	const db = supabase as unknown as { from: (table: string) => any };

	try {
		const { data, error } = await db
			.from('domain_research_queue')
			.update(update)
			.eq('id', id)
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
				].join(', ')
			)
			.single();

		if (error) throw error;

		return ApiResponse.success(data);
	} catch (error) {
		if (
			isRecord(error) &&
			(error.code === 'PGRST116' || error.details === 'The result contains 0 rows')
		) {
			return ApiResponse.notFound('Domain research queue item');
		}
		return ApiResponse.internalError(error, 'Failed to update domain research queue item');
	}
};
