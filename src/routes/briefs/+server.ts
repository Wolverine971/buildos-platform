// src/routes/briefs/+server.ts
import type { RequestHandler } from './$types';
import type { DailyBrief, ProjectDailyBrief } from '$lib/types/daily-brief';
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();

	if (!user) {
		return ApiResponse.unauthorized();
	}

	// Get query parameters
	const dateParam = url.searchParams.get('date');
	const viewParam = url.searchParams.get('view');
	const timezone = url.searchParams.get('timezone');

	// If no timezone provided, default to UTC (will be overridden by client)
	const userTimezone = timezone || 'UTC';

	// Function to get current date in user's timezone
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
		} catch (err) {
			// Error formatting date in timezone
			return new Date().toISOString().split('T')[0];
		}
	};

	// Function to check if a date is today in the given timezone
	const isTodayInTimezone = (dateString: string, tz: string = userTimezone): boolean => {
		const todayInTz = getCurrentDateInTimezone(tz);
		return dateString === todayInTz;
	};

	// Use the date parameter if provided, otherwise use current date in user's timezone
	const currentDate = dateParam || getCurrentDateInTimezone();
	const selectedView = (viewParam as 'single' | 'list' | 'analytics') || 'single';

	try {
		// Load data based on selected view
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
		} else if (selectedView === 'list') {
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
		} else {
			return ApiResponse.success({
				currentDate,
				selectedView,
				dailyBrief: null,
				projectBriefs: [],
				briefHistory: [],
				timezone: userTimezone,
				isToday: false
			});
		}
	} catch (err) {
		// Error loading brief data
		return ApiResponse.internalError(err, 'Failed to load brief data');
	}
};

async function loadDailyBrief(
	supabase: any,
	userId: string,
	date: string
): Promise<DailyBrief | null> {
	const { data, error: briefError } = await supabase
		.from('daily_briefs')
		.select('*')
		.eq('user_id', userId)
		.eq('brief_date', date)
		.single();

	if (briefError) {
		if (briefError.code === 'PGRST116') {
			// No rows returned - this is expected when no brief exists
			return null;
		}
		throw briefError;
	}

	return data;
}

async function loadProjectBriefs(
	supabase: any,
	userId: string,
	date: string
): Promise<ProjectDailyBrief[]> {
	const { data, error: projectError } = await supabase
		.from('project_daily_briefs')
		.select(
			`
			*,
			projects (
				name,
				description,
				slug
			)
		`
		)
		.eq('user_id', userId)
		.eq('brief_date', date)
		.order('created_at', { ascending: true });

	if (projectError) {
		// Error loading project briefs
		return [];
	}

	return data || [];
}

async function loadBriefHistory(
	supabase: any,
	userId: string,
	limit: number = 50
): Promise<DailyBrief[]> {
	const { data, error: historyError } = await supabase
		.from('daily_briefs')
		.select('*')
		.eq('user_id', userId)
		.order('brief_date', { ascending: false })
		.limit(limit);

	if (historyError) {
		// Error loading brief history
		return [];
	}

	return data || [];
}
