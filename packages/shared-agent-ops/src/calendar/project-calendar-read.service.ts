// packages/shared-agent-ops/src/calendar/project-calendar-read.service.ts
// Read-only half of the project-calendar service, shared by web and the worker.
//
// Moved from apps/web/src/lib/services/project-calendar.service.ts. The web
// class returns a `Response` built with `ApiResponse`; that HTTP shaping is
// web-only, so the shared service returns a plain outcome and the web method
// maps it back to the exact same Response it produced before.
import type { Database } from '@buildos/shared-types';
import type { TypedSupabaseClient } from '@buildos/supabase-client';

export type ProjectCalendarRow = Database['public']['Tables']['project_calendars']['Row'];

export type ProjectCalendarSyncMode = 'actor_projection' | 'member_fanout';

export const DEFAULT_PROJECT_CALENDAR_SYNC_MODE: ProjectCalendarSyncMode = 'actor_projection';

export type ProjectCalendarRecord = ProjectCalendarRow & { sync_mode: ProjectCalendarSyncMode };

/**
 * `status: 'error'` carries the query failure the web route reports as a 500
 * without logging; a thrown error stays a thrown error so callers keep their
 * existing catch behavior.
 */
export type ProjectCalendarReadOutcome =
	| { status: 'ok'; calendar: ProjectCalendarRecord | null }
	| { status: 'error'; message: string };

export class ProjectCalendarReadService {
	constructor(protected readonly supabase: TypedSupabaseClient) {}

	parseProjectSyncMode(
		props: Record<string, unknown> | null | undefined
	): ProjectCalendarSyncMode {
		return props?.calendar_sync_mode === 'member_fanout'
			? 'member_fanout'
			: DEFAULT_PROJECT_CALENDAR_SYNC_MODE;
	}

	async getProjectCalendarSyncMode(projectId: string): Promise<ProjectCalendarSyncMode> {
		const { data: project } = await this.supabase
			.from('onto_projects')
			.select('props')
			.eq('id', projectId)
			.is('deleted_at', null)
			.maybeSingle();

		return this.parseProjectSyncMode(
			(project?.props as Record<string, unknown> | null | undefined) ?? null
		);
	}

	/** The user's project-calendar mapping plus the project's sync mode. */
	async readProjectCalendar(
		projectId: string,
		userId: string
	): Promise<ProjectCalendarReadOutcome> {
		const { data, error } = await this.supabase
			.from('project_calendars')
			.select('*')
			.eq('project_id', projectId)
			.eq('user_id', userId)
			.single();

		if (error && error.code !== 'PGRST116') {
			// PGRST116 is "no rows returned"
			return { status: 'error', message: error.message };
		}

		if (!data) {
			return { status: 'ok', calendar: null };
		}

		const syncMode = await this.getProjectCalendarSyncMode(projectId);
		return {
			status: 'ok',
			calendar: { ...(data as ProjectCalendarRow), sync_mode: syncMode }
		};
	}
}
