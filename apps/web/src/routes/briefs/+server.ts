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
	const briefIdParam = url.searchParams.get('brief_id')?.trim() || null;
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
			const dailyBriefResult = await loadDailyBrief(supabase, user.id, {
				date: currentDate,
				briefId: briefIdParam
			});
			const dailyBrief = dailyBriefResult.brief;
			const resolvedDate = dailyBriefResult.resolvedDate;
			const activeBriefId = dailyBrief?.chat_brief_id || dailyBrief?.id || null;
			const projectBriefs = activeBriefId
				? await loadProjectBriefsForBriefId(
						supabase,
						user.id,
						activeBriefId,
						resolvedDate,
						dailyBrief?.generation_status
					)
				: [];

			return ApiResponse.success({
				currentDate: resolvedDate,
				selectedView,
				dailyBrief,
				projectBriefs,
				briefHistory: [],
				activeBriefId,
				timezone: userTimezone,
				isToday: isTodayInTimezone(resolvedDate, userTimezone)
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
				activeBriefId: null,
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
			activeBriefId: null,
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
	params: { date: string; briefId?: string | null }
): Promise<{ brief: DailyBrief | null; resolvedDate: string }> {
	const { date, briefId } = params;
	if (briefId) {
		const { data: briefById, error: briefByIdError } = await supabase
			.from('ontology_daily_briefs')
			.select('*')
			.eq('id', briefId)
			.eq('user_id', userId)
			.maybeSingle();

		if (briefByIdError && briefByIdError.code !== 'PGRST116') {
			throw briefByIdError;
		}

		if (briefById) {
			return {
				brief: mapOntologyDailyBriefRow(briefById),
				resolvedDate: briefById.brief_date
			};
		}
	}

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
		if (error.code === 'PGRST116') {
			return { brief: null, resolvedDate: date };
		}
		throw error;
	}

	return {
		brief: data ? mapOntologyDailyBriefRow(data) : null,
		resolvedDate: data?.brief_date || date
	};
}

async function loadProjectBriefsForBriefId(
	supabase: any,
	userId: string,
	briefId: string,
	briefDate: string,
	generationStatus?: string
): Promise<ProjectDailyBrief[]> {
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
		.eq('daily_brief_id', briefId)
		.order('created_at', { ascending: true });

	if (error) {
		return [];
	}

	return (data || []).map((row: any) =>
		mapOntologyProjectBriefRow({
			row,
			userId,
			briefDate,
			project: row.project,
			generationStatus
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
