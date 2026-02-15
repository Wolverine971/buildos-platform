// apps/web/src/routes/api/analytics/briefs/+server.ts
import { ApiResponse } from '$lib/utils/api-response';
import type { RequestHandler } from './$types';
import type { BriefAnalytics } from '$lib/types/daily-brief';

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized('Unauthorized');
	}

	const userId = user.id;
	const timeframe = url.searchParams.get('timeframe') || 'month';

	try {
		const now = new Date();
		let startDate: Date;

		switch (timeframe) {
			case 'week':
				startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
				break;
			case 'quarter':
				startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
				break;
			case 'month':
			default:
				startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
				break;
		}

		const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
		const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

		const [generationFreq, engagementMetrics, templateUsage] = await Promise.all([
			getGenerationFrequency(supabase, userId, weekAgo, monthAgo),
			getEngagementMetrics(supabase, userId, startDate),
			getTemplateUsage(supabase, userId, startDate)
		]);

		const analytics: BriefAnalytics = {
			generation_frequency: generationFreq,
			engagement_metrics: engagementMetrics,
			template_usage: templateUsage
		};

		return ApiResponse.success(analytics);
	} catch (error) {
		console.error('Error generating analytics:', error);
		return ApiResponse.internalError(error, 'Failed to generate analytics');
	}
};

async function getGenerationFrequency(
	supabase: any,
	userId: string,
	weekAgo: Date,
	monthAgo: Date
) {
	try {
		const { data: rows, error } = await supabase
			.from('ontology_daily_briefs')
			.select('brief_date, generation_status')
			.eq('user_id', userId);

		if (error) {
			throw error;
		}

		const completedDates = Array.from(
			new Set(
				(rows || [])
					.filter((row: any) => row.generation_status === 'completed')
					.map((row: any) => row.brief_date)
			)
		);

		const weekAgoDate = weekAgo.toISOString().split('T')[0]!;
		const monthAgoDate = monthAgo.toISOString().split('T')[0]!;

		const streakDays = calculateStreakFromDates(completedDates);

		return {
			total_briefs: completedDates.length,
			briefs_this_week: completedDates.filter((date) => date >= weekAgoDate).length,
			briefs_this_month: completedDates.filter((date) => date >= monthAgoDate).length,
			streak_days: streakDays
		};
	} catch (error) {
		console.error('Error in getGenerationFrequency:', error);
		return {
			total_briefs: 0,
			briefs_this_week: 0,
			briefs_this_month: 0,
			streak_days: 0
		};
	}
}

function calculateStreakFromDates(dates: string[]): number {
	if (!dates.length) return 0;

	const dateSet = new Set(dates);
	const today = new Date();
	today.setHours(0, 0, 0, 0);

	let streak = 0;
	let check = new Date(today);

	while (true) {
		const key = check.toISOString().split('T')[0]!;
		if (!dateSet.has(key)) break;
		streak += 1;
		check.setDate(check.getDate() - 1);
	}

	return streak;
}

async function getEngagementMetrics(supabase: any, userId: string, startDate: Date) {
	try {
		const [{ data: briefs, error: briefsError }, { data: projectBriefs, error: projectError }] =
			await Promise.all([
				supabase
					.from('ontology_daily_briefs')
					.select('executive_summary, llm_analysis, priority_actions')
					.eq('user_id', userId)
					.eq('generation_status', 'completed')
					.gte('created_at', startDate.toISOString()),
				supabase
					.from('ontology_project_briefs')
					.select(
						`project_id, project:onto_projects(name), daily_brief:ontology_daily_briefs!inner(user_id)`
					)
					.eq('daily_brief.user_id', userId)
					.gte('created_at', startDate.toISOString())
			]);

		if (briefsError) {
			console.error('Error fetching ontology briefs for engagement:', briefsError);
		}
		if (projectError) {
			console.error('Error fetching ontology project briefs:', projectError);
		}

		const avgBriefLength =
			briefs && briefs.length > 0
				? briefs.reduce((sum: number, brief: any) => {
						const content = brief.executive_summary || brief.llm_analysis || '';
						const wordCount = content
							.split(/\s+/)
							.filter((word: string) => word.length > 0).length;
						return sum + wordCount;
					}, 0) / briefs.length
				: 0;

		const avgPriorityActions =
			briefs && briefs.length > 0
				? briefs.reduce(
						(sum: number, brief: any) => sum + (brief.priority_actions?.length || 0),
						0
					) / briefs.length
				: 0;

		const projectCounts: Record<string, { name: string; count: number }> = {};
		(projectBriefs || []).forEach((brief: any) => {
			const projectId = brief.project_id;
			if (!projectId) return;
			const projectName = brief.project?.name || 'Unknown Project';
			if (!projectCounts[projectId]) {
				projectCounts[projectId] = { name: projectName, count: 0 };
			}
			projectCounts[projectId].count += 1;
		});

		const mostActiveProjects = Object.entries(projectCounts)
			.map(([project_id, info]) => ({
				project_id,
				project_name: info.name,
				brief_count: info.count
			}))
			.sort((a, b) => b.brief_count - a.brief_count);

		return {
			avg_brief_length: avgBriefLength,
			avg_priority_actions: avgPriorityActions,
			most_active_projects: mostActiveProjects,
			most_active_goals: []
		};
	} catch (error) {
		console.error('Error in getEngagementMetrics:', error);
		return {
			avg_brief_length: 0,
			avg_priority_actions: 0,
			most_active_projects: [],
			most_active_goals: []
		};
	}
}

async function getTemplateUsage(supabase: any, userId: string, startDate: Date) {
	try {
		const { data: projectBriefs, error } = await supabase
			.from('ontology_project_briefs')
			.select('metadata, daily_brief:ontology_daily_briefs!inner(user_id)')
			.eq('daily_brief.user_id', userId)
			.gte('created_at', startDate.toISOString());

		if (error) {
			console.error('Error fetching template usage:', error);
		}

		const templateCounts: Record<string, number> = {};
		(projectBriefs || []).forEach((brief: any) => {
			const metadata = (brief.metadata || {}) as Record<string, unknown>;
			const templateName =
				typeof metadata.template_name === 'string'
					? metadata.template_name
					: typeof metadata.template === 'string'
						? metadata.template
						: 'Default';
			templateCounts[templateName] = (templateCounts[templateName] || 0) + 1;
		});

		const mostUsedProjectTemplate =
			Object.entries(templateCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';

		return {
			most_used_project_template: mostUsedProjectTemplate,
			most_used_goal_template: '',
			custom_template_count: 0
		};
	} catch (error) {
		console.error('Error in getTemplateUsage:', error);
		return {
			most_used_project_template: '',
			most_used_goal_template: '',
			custom_template_count: 0
		};
	}
}
