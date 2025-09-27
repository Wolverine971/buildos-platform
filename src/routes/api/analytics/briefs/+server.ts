// src/routes/api/analytics/briefs/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { BriefAnalytics } from '$lib/types/daily-brief';

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const userId = user.id;
	const timeframe = url.searchParams.get('timeframe') || 'month';

	try {
		// Calculate date ranges based on timeframe
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

		// Run analytics queries in parallel for better performance
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

		return json(analytics);
	} catch (error) {
		console.error('Error generating analytics:', error);
		return json({ error: 'Failed to generate analytics' }, { status: 500 });
	}
};

async function getGenerationFrequency(
	supabase: any,
	userId: string,
	weekAgo: Date,
	monthAgo: Date
) {
	try {
		// Use Promise.all for parallel queries
		const [totalResult, weekResult, monthResult] = await Promise.all([
			// Total briefs
			supabase
				.from('daily_briefs')
				.select('*', { count: 'exact', head: true })
				.eq('user_id', userId),

			// Briefs this week
			supabase
				.from('daily_briefs')
				.select('*', { count: 'exact', head: true })
				.eq('user_id', userId)
				.gte('brief_date', weekAgo.toISOString().split('T')[0]),

			// Briefs this month
			supabase
				.from('daily_briefs')
				.select('*', { count: 'exact', head: true })
				.eq('user_id', userId)
				.gte('brief_date', monthAgo.toISOString().split('T')[0])
		]);

		// Calculate streak
		const streakDays = await calculateStreak(supabase, userId);

		return {
			total_briefs: totalResult.count || 0,
			briefs_this_week: weekResult.count || 0,
			briefs_this_month: monthResult.count || 0,
			streak_days: streakDays
		};
	} catch (error) {
		console.error('Error in getGenerationFrequency:', error);
		// Return default values on error
		return {
			total_briefs: 0,
			briefs_this_week: 0,
			briefs_this_month: 0,
			streak_days: 0
		};
	}
}

async function calculateStreak(supabase: any, userId: string): Promise<number> {
	try {
		const { data: recentBriefs, error } = await supabase
			.from('daily_briefs')
			.select('brief_date')
			.eq('user_id', userId)
			.order('brief_date', { ascending: false })
			.limit(365); // Look back up to a year

		if (error || !recentBriefs || recentBriefs.length === 0) {
			return 0;
		}

		let streak = 0;
		let currentDate = new Date();
		currentDate.setHours(0, 0, 0, 0);

		// Convert brief dates to Date objects and sort
		const briefDates = recentBriefs
			.map((brief) => new Date(brief.brief_date + 'T00:00:00'))
			.sort((a, b) => b.getTime() - a.getTime());

		// Check if there's a brief for today or yesterday (to handle late night generation)
		const today = new Date(currentDate);
		const yesterday = new Date(currentDate.getTime() - 24 * 60 * 60 * 1000);

		// Start from today if there's a recent brief, else no streak
		let checkDate = briefDates.length > 0 && briefDates[0] >= yesterday ? today : new Date(0);

		while (checkDate.getTime() > 0) {
			const dateString = checkDate.toISOString().split('T')[0];
			const hasBrief = briefDates.some(
				(date) => date.toISOString().split('T')[0] === dateString
			);

			if (hasBrief) {
				streak++;
				checkDate.setDate(checkDate.getDate() - 1);
			} else {
				break;
			}
		}

		return streak;
	} catch (error) {
		console.error('Error calculating streak:', error);
		return 0;
	}
}

async function getEngagementMetrics(supabase: any, userId: string, startDate: Date) {
	try {
		// Get brief engagement data
		const { data: briefs, error: briefsError } = await supabase
			.from('daily_briefs')
			.select('summary_content, priority_actions')
			.eq('user_id', userId)
			.gte('created_at', startDate.toISOString());

		if (briefsError) {
			console.error('Error fetching briefs for engagement:', briefsError);
		}

		const avgBriefLength =
			briefs?.length > 0
				? briefs.reduce((sum: number, brief: any) => {
						const content = brief.summary_content || '';
						const wordCount = content
							.split(/\s+/)
							.filter((word) => word.length > 0).length;
						return sum + wordCount;
					}, 0) / briefs.length
				: 0;

		const avgPriorityActions =
			briefs?.length > 0
				? briefs.reduce(
						(sum: number, brief: any) => sum + (brief.priority_actions?.length || 0),
						0
					) / briefs.length
				: 0;

		// Get most active projects
		const { data: projectBriefs, error: projectError } = await supabase
			.from('project_daily_briefs')
			.select(
				`
				project_id,
				projects (
					name
				)
			`
			)
			.eq('user_id', userId)
			.gte('created_at', startDate.toISOString());

		if (projectError) {
			console.error('Error fetching project briefs:', projectError);
		}

		const projectCounts: Record<string, { name: string; count: number }> = {};
		projectBriefs?.forEach((brief: any) => {
			const projectId = brief.project_id;
			const projectName = brief.projects?.name || 'Unknown Project';

			if (!projectCounts[projectId]) {
				projectCounts[projectId] = { name: projectName, count: 0 };
			}
			projectCounts[projectId].count++;
		});

		const mostActiveProjects = Object.entries(projectCounts)
			.map(([project_id, data]) => ({
				project_id,
				project_name: data.name,
				brief_count: data.count
			}))
			.sort((a, b) => b.brief_count - a.brief_count);

		// Get most active goals (if you have a life_goals table)
		let mostActiveGoals = [];
		try {
			const { data: goalBriefs } = await supabase
				.from('life_goal_daily_briefs')
				.select(
					`
					goal_id,
					life_goals (
						name
					)
				`
				)
				.eq('user_id', userId)
				.gte('created_at', startDate.toISOString());

			const goalCounts: Record<string, { name: string; count: number }> = {};
			goalBriefs?.forEach((brief: any) => {
				const goalId = brief.goal_id;
				const goalName = brief.life_goals?.name || 'Unknown Goal';

				if (!goalCounts[goalId]) {
					goalCounts[goalId] = { name: goalName, count: 0 };
				}
				goalCounts[goalId].count++;
			});

			mostActiveGoals = Object.entries(goalCounts)
				.map(([goal_id, data]) => ({
					goal_id,
					goal_name: data.name,
					brief_count: data.count
				}))
				.sort((a, b) => b.brief_count - a.brief_count);
		} catch (error) {
			console.log('Life goals table not available, skipping goal analytics');
		}

		return {
			avg_brief_length: avgBriefLength,
			avg_priority_actions: avgPriorityActions,
			most_active_projects: mostActiveProjects,
			most_active_goals: mostActiveGoals
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
		// Get most used project template
		const { data: projectTemplateUsage, error: projectError } = await supabase
			.from('project_daily_briefs')
			.select(
				`
				template_id,
				project_brief_templates (
					name
				)
			`
			)
			.eq('user_id', userId)
			.gte('created_at', startDate.toISOString());

		if (projectError) {
			console.error('Error fetching project template usage:', projectError);
		}

		const projectTemplateCounts: Record<string, { name: string; count: number }> = {};
		projectTemplateUsage?.forEach((brief: any) => {
			const templateId = brief.template_id || 'default';
			const templateName = brief.project_brief_templates?.name || 'Default';

			if (!projectTemplateCounts[templateId]) {
				projectTemplateCounts[templateId] = { name: templateName, count: 0 };
			}
			projectTemplateCounts[templateId].count++;
		});

		const mostUsedProjectTemplate =
			Object.values(projectTemplateCounts).sort((a, b) => b.count - a.count)[0]?.name || null;

		// Get most used goal template (if available)
		let mostUsedGoalTemplate = null;
		try {
			const { data: goalTemplateUsage } = await supabase
				.from('life_goal_daily_briefs')
				.select(
					`
					template_id,
					life_goal_brief_templates (
						name
					)
				`
				)
				.eq('user_id', userId)
				.gte('created_at', startDate.toISOString());

			const goalTemplateCounts: Record<string, { name: string; count: number }> = {};
			goalTemplateUsage?.forEach((brief: any) => {
				const templateId = brief.template_id || 'default';
				const templateName = brief.life_goal_brief_templates?.name || 'Default';

				if (!goalTemplateCounts[templateId]) {
					goalTemplateCounts[templateId] = { name: templateName, count: 0 };
				}
				goalTemplateCounts[templateId].count++;
			});

			mostUsedGoalTemplate =
				Object.values(goalTemplateCounts).sort((a, b) => b.count - a.count)[0]?.name ||
				null;
		} catch (error) {
			console.log('Goal templates not available, using default');
		}

		// Count custom templates
		const { count: customProjectTemplates } = await supabase
			.from('project_brief_templates')
			.select('*', { count: 'exact', head: true })
			.eq('user_id', userId)
			.eq('is_default', false);

		return {
			most_used_project_template: mostUsedProjectTemplate,
			most_used_goal_template: mostUsedGoalTemplate,
			custom_template_count: customProjectTemplates || 0
		};
	} catch (error) {
		console.error('Error in getTemplateUsage:', error);
		return {
			most_used_project_template: null,
			most_used_goal_template: null,
			custom_template_count: 0
		};
	}
}
