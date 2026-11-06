// apps/web/src/routes/api/inbox/done-for-you/+server.ts
//
// GET /api/inbox/done-for-you
//   -> { items: [{ ...ProjectCleanupAutoApplied, project_id, project_name, undo_url? }] }
// Changes applied without asking in the last week, across every project the user can read:
//   * the review pass's auto-applied suggestions (RLS on project_suggestions; tasker 149)
//   * edits made in a project's Google Calendar (calendar_ingest_changes; tasker 154).
//     These carry undo_url. First-time copies (origin backfill) are listed too, so a
//     calendar that brought in more than expected can be undone event by event.
import type { RequestHandler } from './$types';
import {
	AUTO_APPLIED_SELECT,
	AUTO_APPLIED_VISIBLE_DAYS,
	autoAppliedFromRow
} from '@buildos/shared-agent-ops/project-cleanup';
import { CALENDAR_INGEST_VISIBLE_DAYS } from '@buildos/shared-agent-ops/calendar/calendar-change-ingest';
import { PROJECT_LOOPS_ENABLED } from '$lib/config/project-loops';
import { ApiResponse } from '$lib/utils/api-response';

type Entry = {
	item_id: string;
	suggestion_id: string;
	title: string;
	applied_at: string;
	reason: string | null;
	undoable: boolean;
	project_id: string;
	project_name: string | null;
	undo_url?: string;
};

function projectName(row: Record<string, unknown>): string | null {
	const project = row.project as { name?: unknown } | null;
	return typeof project?.name === 'string' ? project.name : null;
}

export const GET: RequestHandler = async ({ locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user?.id) return ApiResponse.unauthorized('Authentication required');
	const supabase = locals.supabase as any;

	const cleanupSince = new Date(
		Date.now() - AUTO_APPLIED_VISIBLE_DAYS * 86_400_000
	).toISOString();
	const calendarSince = new Date(
		Date.now() - CALENDAR_INGEST_VISIBLE_DAYS * 86_400_000
	).toISOString();

	const [cleanup, calendar] = await Promise.all([
		PROJECT_LOOPS_ENABLED
			? supabase
					.from('project_suggestions')
					.select(`${AUTO_APPLIED_SELECT}, project_id, project:onto_projects(name)`)
					.eq('status', 'applied')
					.eq('result->>applied_via', 'auto')
					.gte('applied_at', cleanupSince)
					.order('applied_at', { ascending: false })
					.limit(50)
			: Promise.resolve({ data: [], error: null }),
		supabase
			.from('calendar_ingest_changes')
			.select('id, project_id, title, applied_at, project:onto_projects(name)')
			.eq('user_id', user.id)
			.eq('status', 'applied')
			.gte('applied_at', calendarSince)
			.order('applied_at', { ascending: false })
			.limit(50)
	]);
	if (cleanup.error) return ApiResponse.databaseError(cleanup.error);
	// The calendar list is additive; the cleanup list still renders without it.
	if (calendar.error) console.warn('[Done for you] Calendar changes failed:', calendar.error);

	const items: Entry[] = ((cleanup.data ?? []) as Array<Record<string, unknown>>).flatMap(
		(row) => {
			const entry = autoAppliedFromRow(row);
			if (!entry || typeof row.project_id !== 'string') return [];
			return [{ ...entry, project_id: row.project_id, project_name: projectName(row) }];
		}
	);
	for (const row of (calendar.data ?? []) as Array<Record<string, unknown>>) {
		if (typeof row.project_id !== 'string' || typeof row.id !== 'string') continue;
		items.push({
			item_id: row.id,
			suggestion_id: row.id,
			title: String(row.title ?? ''),
			applied_at: String(row.applied_at ?? ''),
			reason: 'From Google Calendar',
			undoable: true,
			project_id: row.project_id,
			project_name: projectName(row),
			undo_url: `/api/calendar/changes/${encodeURIComponent(row.id)}/undo`
		});
	}
	items.sort((a, b) => Date.parse(b.applied_at) - Date.parse(a.applied_at));
	return ApiResponse.success({ items });
};
