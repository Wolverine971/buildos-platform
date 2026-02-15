// apps/web/src/routes/briefs/+server.ts
import type { RequestHandler } from './$types';
import type { DailyBrief, ProjectDailyBrief } from '$lib/types/daily-brief';
import { ApiResponse } from '$lib/utils/api-response';
import {
	mapOntologyDailyBriefRow,
	mapOntologyProjectBriefRow
} from '$lib/services/dailyBrief/ontology-mappers';

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();

	if (!user) {
		return ApiResponse.unauthorized();
	}

	const dateParam = url.searchParams.get('date');
	const viewParam = url.searchParams.get('view');
	const timezone = url.searchParams.get('timezone');
	const userTimezone = timezone || 'UTC';

	const getCurrentDateInTimezone = (tz: string = userTimezone): string => {
		try {
			const now = new Date();
			const formatter = new Intl.DateTimeFormat('en-CA', {
				timeZone: tz,
				year: 'numeric',
				month: '2-digit',
				day: '2-digit'
			});
			return formatter.format(now);
		} catch {
			return new Date().toISOString().split('T')[0]!;
		}
	};

	const isTodayInTimezone = (dateString: string, tz: string = userTimezone): boolean => {
		const todayInTz = getCurrentDateInTimezone(tz);
		return dateString === todayInTz;
	};

	const currentDate = dateParam || getCurrentDateInTimezone();
	const selectedView = (viewParam as 'single' | 'list' | 'analytics') || 'single';

	try {
		if (selectedView === 'single') {
			const [dailyBriefResult, projectBriefsResult] = await Promise.allSettled([
				loadDailyBrief(supabase, user.id, currentDate),
				loadProjectBriefs(supabase, user.id, currentDate)
			]);

			const dailyBrief =
				dailyBriefResult.status === 'fulfilled' ? dailyBriefResult.value : null;
			const projectBriefs =
				projectBriefsResult.status === 'fulfilled' ? projectBriefsResult.value : [];

			return ApiResponse.success({
				currentDate,
				selectedView,
				dailyBrief,
				projectBriefs,
				briefHistory: [],
				timezone: userTimezone,
				isToday: isTodayInTimezone(currentDate, userTimezone)
			});
		}

		if (selectedView === 'list') {
			const briefHistory = await loadBriefHistory(supabase, user.id);

			return ApiResponse.success({
				currentDate,
				selectedView,
				dailyBrief: null,
				projectBriefs: [],
				briefHistory,
				timezone: userTimezone,
				isToday: false
			});
		}

		return ApiResponse.success({
			currentDate,
			selectedView,
			dailyBrief: null,
			projectBriefs: [],
			briefHistory: [],
			timezone: userTimezone,
			isToday: false
		});
	} catch (err) {
		return ApiResponse.internalError(err, 'Failed to load brief data');
	}
};

async function loadDailyBrief(
	supabase: any,
	userId: string,
	date: string
): Promise<DailyBrief | null> {
	const { data, error } = await supabase
		.from('ontology_daily_briefs')
		.select('*')
		.eq('user_id', userId)
		.eq('brief_date', date)
		.order('created_at', { ascending: false })
		.order('id', { ascending: false })
		.limit(1)
		.maybeSingle();

	if (error) {
		if (error.code === 'PGRST116') return null;
		throw error;
	}

	return data ? mapOntologyDailyBriefRow(data) : null;
}

async function loadProjectBriefs(
	supabase: any,
	userId: string,
	date: string
): Promise<ProjectDailyBrief[]> {
	const { data: briefRow, error: briefError } = await supabase
		.from('ontology_daily_briefs')
		.select('id, brief_date, user_id, generation_status')
		.eq('user_id', userId)
		.eq('brief_date', date)
		.order('created_at', { ascending: false })
		.order('id', { ascending: false })
		.limit(1)
		.maybeSingle();

	if (briefError || !briefRow?.id) {
		return [];
	}

	const { data, error } = await supabase
		.from('ontology_project_briefs')
		.select(
			`
			id,
			daily_brief_id,
			project_id,
			brief_content,
			metadata,
			created_at,
			updated_at,
			project:onto_projects (
				id,
				name,
				description
			)
		`
		)
		.eq('daily_brief_id', briefRow.id)
		.order('created_at', { ascending: true });

	if (error) {
		return [];
	}

	return (data || []).map((row: any) =>
		mapOntologyProjectBriefRow({
			row,
			userId,
			briefDate: briefRow.brief_date,
			project: row.project,
			generationStatus: briefRow.generation_status
		})
	);
}

async function loadBriefHistory(
	supabase: any,
	userId: string,
	limit: number = 50
): Promise<DailyBrief[]> {
	const { data, error } = await supabase
		.from('ontology_daily_briefs')
		.select('*')
		.eq('user_id', userId)
		.eq('generation_status', 'completed')
		.order('brief_date', { ascending: false })
		.order('created_at', { ascending: false })
		.limit(limit);

	if (error) {
		return [];
	}

	return (data || []).map((row: any) => mapOntologyDailyBriefRow(row));
}
