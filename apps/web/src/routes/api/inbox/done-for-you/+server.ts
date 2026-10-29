// apps/web/src/routes/api/inbox/done-for-you/+server.ts
//
// GET /api/inbox/done-for-you
//   -> { items: [{ ...ProjectCleanupAutoApplied, project_id, project_name }] }
// Changes the review pass applied without asking in the last week, across every project the
// user can read (RLS on project_suggestions). The AI Inbox lists them with Undo even after a
// project's cleanup card has left the inbox (2026-10-29, tasker 149).
import type { RequestHandler } from './$types';
import {
	AUTO_APPLIED_SELECT,
	AUTO_APPLIED_VISIBLE_DAYS,
	autoAppliedFromRow
} from '@buildos/shared-agent-ops/project-cleanup';
import { PROJECT_LOOPS_ENABLED } from '$lib/config/project-loops';
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ locals }) => {
	if (!PROJECT_LOOPS_ENABLED) return ApiResponse.success({ items: [] });
	const { user } = await locals.safeGetSession();
	if (!user?.id) return ApiResponse.unauthorized('Authentication required');

	const since = new Date(Date.now() - AUTO_APPLIED_VISIBLE_DAYS * 86_400_000).toISOString();
	const { data, error } = await (locals.supabase as any)
		.from('project_suggestions')
		.select(`${AUTO_APPLIED_SELECT}, project_id, project:onto_projects(name)`)
		.eq('status', 'applied')
		.eq('result->>applied_via', 'auto')
		.gte('applied_at', since)
		.order('applied_at', { ascending: false })
		.limit(50);
	if (error) return ApiResponse.databaseError(error);

	const items = ((data ?? []) as Array<Record<string, unknown>>).flatMap((row) => {
		const entry = autoAppliedFromRow(row);
		if (!entry || typeof row.project_id !== 'string') return [];
		const project = row.project as { name?: unknown } | null;
		return [
			{
				...entry,
				project_id: row.project_id,
				project_name: typeof project?.name === 'string' ? project.name : null
			}
		];
	});
	return ApiResponse.success({ items });
};
