// apps/web/src/routes/api/inbox/+server.ts
import type { RequestHandler } from './$types';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { ApiResponse } from '$lib/utils/api-response';
import {
	isInboxItemStatus,
	isInboxSourceType,
	listInboxItems,
	parseInboxLimit,
	type InboxGroupFilter
} from '$lib/server/inbox.service';

function parseGroup(value: string | null): InboxGroupFilter | null {
	if (value === 'account' || value === 'project') return value;
	return null;
}

export const GET: RequestHandler = async ({ url, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();
	if (!user) return ApiResponse.unauthorized();

	const statusParam = url.searchParams.get('status') ?? 'pending';
	if (statusParam !== 'all' && !isInboxItemStatus(statusParam)) {
		return ApiResponse.badRequest('Invalid status filter');
	}
	const status = statusParam === 'all' || !isInboxItemStatus(statusParam) ? null : statusParam;

	const sourceParam = url.searchParams.get('source_type');
	if (sourceParam && !isInboxSourceType(sourceParam)) {
		return ApiResponse.badRequest('Invalid source_type filter');
	}
	const sourceType = sourceParam && isInboxSourceType(sourceParam) ? sourceParam : null;

	const groupParam = url.searchParams.get('group');
	const group = parseGroup(groupParam);
	if (groupParam && !group) {
		return ApiResponse.badRequest("group must be 'account' or 'project'");
	}

	const admin = createAdminSupabaseClient();
	const result = await listInboxItems({
		supabase: supabase as any,
		admin: admin as any,
		userId: user.id,
		status,
		projectId: url.searchParams.get('project_id'),
		sourceType,
		group,
		limit: parseInboxLimit(url.searchParams.get('limit')),
		includePayload:
			url.searchParams.get('include_payload') === 'true' ||
			url.searchParams.get('include_payload') === '1'
	});

	return ApiResponse.success(result);
};
