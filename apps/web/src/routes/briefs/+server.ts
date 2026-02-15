// apps/web/src/routes/briefs/+server.ts
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
			return new Date().toISOString().split('T')[0]!;
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
	// Prefer ontology snapshot (latest for date) so Brief Chat uses canonical brief_id.
	const { data: ontologyBrief, error: ontologyError } = await supabase
		.from('ontology_daily_briefs')
		.select(
			'id, user_id, brief_date, executive_summary, llm_analysis, priority_actions, metadata, generation_status, generation_error, generation_started_at, generation_completed_at, created_at, updated_at'
		)
		.eq('user_id', userId)
		.eq('brief_date', date)
		.eq('generation_status', 'completed')
		.order('created_at', { ascending: false })
		.order('id', { ascending: false })
		.limit(1)
		.maybeSingle();

	if (!ontologyError && ontologyBrief) {
		return {
			id: ontologyBrief.id,
			chat_brief_id: ontologyBrief.id,
			user_id: ontologyBrief.user_id,
			brief_date: ontologyBrief.brief_date,
			summary_content: ontologyBrief.executive_summary || '',
			executive_summary: ontologyBrief.executive_summary || '',
			llm_analysis: ontologyBrief.llm_analysis,
			priority_actions: ontologyBrief.priority_actions || [],
			generation_status: ontologyBrief.generation_status,
			generation_error: ontologyBrief.generation_error,
			generation_started_at: ontologyBrief.generation_started_at,
			generation_completed_at: ontologyBrief.generation_completed_at,
			metadata: ontologyBrief.metadata || {},
			created_at: ontologyBrief.created_at,
			updated_at: ontologyBrief.updated_at
		};
	}

	const { data, error: briefError } = await supabase
		.from('daily_briefs')
		.select('*')
		.eq('user_id', userId)
		.eq('brief_date', date)
		.maybeSingle();

	if (briefError) {
		if (briefError.code === 'PGRST116') {
			// No rows returned - this is expected when no brief exists
			return null;
		}
		throw briefError;
	}

	// Fallback legacy brief (no ontology brief id available)
	return data ? ({ ...data, chat_brief_id: data.id } as DailyBrief) : null;
}

async function loadProjectBriefs(
	supabase: any,
	userId: string,
	date: string
): Promise<ProjectDailyBrief[]> {
	// Prefer ontology project briefs bound to the latest completed ontology daily brief for this date.
	const { data: ontologyBrief, error: ontologyBriefError } = await supabase
		.from('ontology_daily_briefs')
		.select('id')
		.eq('user_id', userId)
		.eq('brief_date', date)
		.eq('generation_status', 'completed')
		.order('created_at', { ascending: false })
		.order('id', { ascending: false })
		.limit(1)
		.maybeSingle();

	if (!ontologyBriefError && ontologyBrief?.id) {
		const { data: ontologyProjectBriefs, error: ontologyProjectError } = await supabase
			.from('ontology_project_briefs')
			.select(
				`
				id,
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
			.eq('daily_brief_id', ontologyBrief.id)
			.order('created_at', { ascending: true });

		if (!ontologyProjectError && Array.isArray(ontologyProjectBriefs)) {
			const slugify = (value: string): string =>
				value
					.toLowerCase()
					.trim()
					.replace(/[^a-z0-9\s-]/g, '')
					.replace(/\s+/g, '-')
					.replace(/-+/g, '-');

			return ontologyProjectBriefs.map((brief: any) => ({
				id: brief.id,
				user_id: userId,
				project_id: brief.project_id,
				brief_content: brief.brief_content,
				brief_date: date,
				generation_status: 'completed',
				metadata: brief.metadata,
				created_at: brief.created_at,
				updated_at: brief.updated_at,
				projects: {
					id: brief.project?.id,
					name: brief.project?.name || 'Project',
					description: brief.project?.description || undefined,
					slug: brief.project?.name ? slugify(brief.project.name) : brief.project_id
				}
			}));
		}
	}

	// Legacy fallback
	const { data, error: projectError } = await supabase
		.from('project_daily_briefs')
		.select(
			`
			*,
			projects (
				id,
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
