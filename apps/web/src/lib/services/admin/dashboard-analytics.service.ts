// apps/web/src/lib/services/admin/dashboard-analytics.service.ts
/**
 * Shared data access for admin dashboard analytics.
 */

import type { TypedSupabaseClient } from '@buildos/supabase-client';
import { StripeService } from '$lib/services/stripe-service';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';

export type AnalyticsTimeframe = '7d' | '30d' | '90d';

interface DateRange {
	startDate: string;
	endDate: string;
}

const DEFAULT_SYSTEM_OVERVIEW = {
	total_users: 0,
	active_users_7d: 0,
	active_users_30d: 0,
	total_briefs: 0,
	avg_brief_length: 0,
	top_active_users: []
};

const DEFAULT_VISITOR_OVERVIEW = {
	total_visitors: 0,
	visitors_7d: 0,
	visitors_30d: 0,
	unique_visitors_today: 0
};

const DEFAULT_FEEDBACK_OVERVIEW = {
	overview: {
		total_feedback: 0,
		recent_24h: 0,
		unresolved_count: 0,
		average_rating: 0
	},
	category_breakdown: {} as Record<string, number>,
	status_breakdown: {} as Record<string, number>,
	recent_feedback: [] as Array<{
		id: string;
		category: string;
		feedback_text: string | null;
		rating: number | null;
		status: string | null;
		user_email: string | null;
		created_at: string;
	}>
};

type BetaRecentActivity =
	| {
			type: 'signup';
			user?: string | null;
			status?: string | null;
			created_at: string;
	  }
	| {
			type: 'feedback';
			feedback_type?: string | null;
			status?: string | null;
			created_at: string | null;
	  };

const DEFAULT_BETA_OVERVIEW = {
	signups: {
		total: 0,
		pending: 0,
		approved: 0,
		declined: 0,
		waitlist: 0,
		recent_24h: 0
	},
	members: {
		total: 0,
		active_30d: 0,
		tier_breakdown: {} as Record<string, number>,
		total_feedback: 0
	},
	recent_activity: [] as BetaRecentActivity[]
};

const DEFAULT_COMPREHENSIVE_ANALYTICS = {
	userMetrics: {
		totalUsers: 0,
		totalBetaUsers: 0,
		newUsersLast24h: 0,
		newBetaSignupsLast24h: 0
	},
	brainDumpMetrics: {
		total: 0,
		averageLength: 0,
		uniqueUsers: 0
	},
	projectMetrics: {
		newProjects: 0,
		updatedProjects: 0,
		uniqueUsers: 0
	},
	calendarConnections: 0,
	leaderboards: {
		brainDumps: [] as Array<{ email: string; count: number }>,
		projectUpdates: [] as Array<{ email: string; count: number }>,
		tasksCreated: [] as Array<{ email: string; count: number }>,
		tasksScheduled: [] as Array<{ email: string; count: number }>,
		phasesCreated: [] as Array<{ email: string; count: number }>
	}
};

const DEFAULT_ERROR_SUMMARY = {
	total_errors: 0,
	unresolved_errors: 0,
	critical_errors: 0,
	recent_errors_24h: 0,
	error_trend: 0
};

const DEFAULT_AGENT_CHAT_USAGE = {
	totalSessions: 0,
	totalMessages: 0,
	totalTokens: 0,
	avgMessagesPerSession: 0,
	avgTokensPerSession: 0,
	plannerSessions: 0,
	executorSessions: 0,
	failedSessions: 0,
	failureRate: 0
};

const DEFAULT_BRIEF_DELIVERY = {
	briefsGenerated: 0,
	ontologyBriefs: 0,
	legacyBriefs: 0,
	emailOptIn: 0,
	smsOptIn: 0,
	emailSent: 0,
	emailDelivered: 0,
	smsSent: 0,
	smsDelivered: 0
};

const DEFAULT_SYSTEM_HEALTH = {
	llmLatencyMs: {} as Record<string, number>,
	queueDepth: 0,
	oldestJobSeconds: 0,
	failedJobs24h: 0,
	agentFailureRate: 0,
	errorCount24h: 0,
	lastUpdated: null as string | null
};

const DEFAULT_SUBSCRIPTION_OVERVIEW = {
	overview: {
		total_subscribers: 0,
		active_subscriptions: 0,
		trial_subscriptions: 0,
		canceled_subscriptions: 0,
		paused_subscriptions: 0,
		mrr: 0,
		arr: 0
	},
	revenue: {
		current_mrr: 0,
		previous_mrr: 0,
		mrr_growth: 0,
		total_revenue: 0,
		average_revenue_per_user: 0,
		churn_rate: 0,
		lifetime_value: 0
	},
	recentChanges: [] as any[],
	failedPayments: [] as any[],
	discountUsage: [] as any[],
	stripeEnabled: StripeService.isEnabled()
};

const clone = <T>(value: T): T =>
	typeof structuredClone === 'function'
		? structuredClone(value)
		: JSON.parse(JSON.stringify(value));

const coerceNumber = (value: unknown, fallback: number = 0): number => {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return value;
	}
	if (typeof value === 'string') {
		const parsed = Number.parseFloat(value);
		return Number.isFinite(parsed) ? parsed : fallback;
	}
	if (typeof value === 'bigint') {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : fallback;
	}
	return fallback;
};

const normalizeNumericRecord = <T extends Record<string, number>>(
	defaults: T,
	value: unknown
): T => {
	const source = Array.isArray(value) ? value?.[0] : value;
	const result = { ...defaults };

	if (!source || typeof source !== 'object') {
		return result;
	}

	for (const key of Object.keys(result)) {
		const typedKey = key as keyof T;
		const fallback = defaults[typedKey] ?? 0;
		result[typedKey] = coerceNumber(
			(source as Record<string, unknown>)[key],
			fallback
		) as T[keyof T];
	}

	return result;
};

function resolveDateRange(timeframe: AnalyticsTimeframe): DateRange {
	const days = timeframe === '7d' ? 7 : timeframe === '90d' ? 90 : 30;
	const endDate = new Date();
	const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

	const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);

	return {
		startDate: toIsoDate(startDate),
		endDate: toIsoDate(endDate)
	};
}

function buildDateTimeRange(range: DateRange) {
	return {
		startDateTime: `${range.startDate}T00:00:00Z`,
		endDateTime: `${range.endDate}T23:59:59Z`
	};
}

export async function getSystemOverview(
	client: TypedSupabaseClient
): Promise<typeof DEFAULT_SYSTEM_OVERVIEW> {
	const { data, error } = await client.rpc('get_user_engagement_metrics');

	if (error) {
		throw new Error(error.message);
	}

	return (data?.[0] as typeof DEFAULT_SYSTEM_OVERVIEW | undefined) ?? DEFAULT_SYSTEM_OVERVIEW;
}

export async function getVisitorOverview(
	client: TypedSupabaseClient
): Promise<typeof DEFAULT_VISITOR_OVERVIEW> {
	const { data, error } = await client.rpc('get_visitor_overview');

	if (error) {
		throw new Error(error.message);
	}

	const overview = data?.[0] ?? DEFAULT_VISITOR_OVERVIEW;

	return {
		total_visitors: coerceNumber(overview.total_visitors),
		visitors_7d: coerceNumber(overview.visitors_7d),
		visitors_30d: coerceNumber(overview.visitors_30d),
		unique_visitors_today: coerceNumber(overview.unique_visitors_today)
	};
}

export async function getDailyVisitors(client: TypedSupabaseClient, timeframe: AnalyticsTimeframe) {
	const { startDate, endDate } = resolveDateRange(timeframe);
	const { data, error } = await client.rpc('get_daily_visitors', {
		start_date: startDate,
		end_date: endDate
	});

	if (error) {
		throw new Error(error.message);
	}

	return (data || []).map((row: any) => ({
		date: row.date,
		visitor_count: coerceNumber(row.visitor_count)
	}));
}

export async function getDailySignups(client: TypedSupabaseClient, timeframe: AnalyticsTimeframe) {
	const { startDate, endDate } = resolveDateRange(timeframe);
	const { data, error } = await client
		.from('users')
		.select('created_at')
		.gte('created_at', new Date(startDate).toISOString())
		.lte('created_at', new Date(endDate + 'T23:59:59Z').toISOString())
		.order('created_at', { ascending: true });

	if (error) {
		throw new Error(error.message);
	}

	const signupsByDay: Record<string, number> = {};
	const cursor = new Date(startDate);
	const end = new Date(endDate);

	while (cursor <= end) {
		const dateStr = cursor.toISOString().slice(0, 10);
		signupsByDay[dateStr] = 0;
		cursor.setDate(cursor.getDate() + 1);
	}

	(data || []).forEach((user) => {
		const date = new Date(user.created_at).toISOString().slice(0, 10);
		if (signupsByDay[date] !== undefined) {
			signupsByDay[date]++;
		}
	});

	return Object.entries(signupsByDay)
		.map(([date, count]) => ({
			date,
			signup_count: count
		}))
		.sort((a, b) => a.date.localeCompare(b.date));
}

export async function getDailyActiveUsers(
	client: TypedSupabaseClient,
	timeframe: AnalyticsTimeframe
) {
	const { startDate, endDate } = resolveDateRange(timeframe);
	const { data, error } = await client.rpc('get_daily_active_users', {
		start_date: startDate,
		end_date: endDate
	});

	if (error) {
		throw new Error(error.message);
	}

	return data ?? [];
}

export async function getBriefGenerationStats(
	client: TypedSupabaseClient,
	timeframe: AnalyticsTimeframe
) {
	const { startDate, endDate } = resolveDateRange(timeframe);
	const { data, error } = await client.rpc('get_brief_generation_stats', {
		start_date: startDate,
		end_date: endDate
	});

	if (error) {
		throw new Error(error.message);
	}

	return data ?? [];
}

export async function getSystemMetrics(client: TypedSupabaseClient) {
	const { data, error } = await client
		.from('system_metrics')
		.select('*')
		.order('recorded_at', { ascending: false })
		.limit(10);

	if (error) {
		throw new Error(error.message);
	}

	return data ?? [];
}

export async function getRecentActivity(client: TypedSupabaseClient) {
	const { data, error } = await client
		.from('user_activity_logs')
		.select(
			`
				activity_type,
				activity_data,
				created_at,
				users (
					email
				)
			`
		)
		.order('created_at', { ascending: false })
		.limit(50);

	if (error) {
		throw new Error(error.message);
	}

	return (data || []).map((activity) => ({
		activity_type: activity.activity_type,
		user_email: activity.users?.email || 'Unknown',
		created_at: activity.created_at,
		activity_data: activity.activity_data
	}));
}

export async function getFeedbackOverview(
	client: TypedSupabaseClient
): Promise<typeof DEFAULT_FEEDBACK_OVERVIEW> {
	const { data: overviewData, error: overviewError } = await client
		.from('feedback')
		.select('category, status, rating, created_at')
		.order('created_at', { ascending: false });

	if (overviewError) {
		throw new Error(overviewError.message);
	}

	const { data: recentFeedback, error: recentError } = await client
		.from('feedback')
		.select('id, category, feedback_text, rating, status, user_email, created_at')
		.order('created_at', { ascending: false })
		.limit(5);

	if (recentError) {
		throw new Error(recentError.message);
	}

	const totalFeedback = overviewData?.length || 0;
	const recentFeedback24h =
		overviewData?.filter(
			(item) => new Date(item.created_at) > new Date(Date.now() - 24 * 60 * 60 * 1000)
		).length || 0;

	const categoryBreakdown =
		overviewData?.reduce(
			(acc, item) => {
				acc[item.category] = (acc[item.category] || 0) + 1;
				return acc;
			},
			{} as Record<string, number>
		) || {};

	const statusBreakdown =
		overviewData?.reduce(
			(acc, item) => {
				const status = item.status || 'new';
				acc[status] = (acc[status] || 0) + 1;
				return acc;
			},
			{} as Record<string, number>
		) || {};

	const ratingsOnly = overviewData?.filter((item) => item.rating !== null);
	const averageRating = ratingsOnly?.length
		? ratingsOnly.reduce((sum, item) => sum + (item.rating || 0), 0) / ratingsOnly.length
		: 0;

	return {
		overview: {
			total_feedback: totalFeedback,
			recent_24h: recentFeedback24h,
			unresolved_count: statusBreakdown.new || 0,
			average_rating: Math.round(averageRating * 10) / 10
		},
		category_breakdown: categoryBreakdown,
		status_breakdown: statusBreakdown,
		recent_feedback: (recentFeedback ||
			[]) as (typeof DEFAULT_FEEDBACK_OVERVIEW)['recent_feedback']
	};
}

export async function getBetaOverview(
	client: TypedSupabaseClient
): Promise<typeof DEFAULT_BETA_OVERVIEW> {
	const { data: signups, error: signupsError } = await client
		.from('beta_signups')
		.select('id, signup_status, created_at, full_name, email');

	if (signupsError) {
		throw new Error(signupsError.message);
	}

	const { data: members, error: membersError } = await client.from('beta_members').select(`
		id,
		is_active,
		joined_at,
		last_active_at,
		total_feedback_submitted,
		beta_tier,
		full_name,
		email
	`);

	if (membersError) {
		throw new Error(membersError.message);
	}

	const { data: betaFeedback, error: feedbackError } = await client
		.from('beta_feedback')
		.select('id, feedback_type, feedback_status, created_at');

	if (feedbackError) {
		throw new Error(feedbackError.message);
	}

	const signupStats =
		signups?.reduce(
			(acc, signup) => {
				const status = signup.signup_status ?? 'unknown';
				acc[status] = (acc[status] || 0) + 1;
				return acc;
			},
			{} as Record<string, number>
		) || {};

	const recentSignups =
		signups?.filter(
			(signup) => new Date(signup.created_at) > new Date(Date.now() - 24 * 60 * 60 * 1000)
		).length || 0;

	const activeMembers =
		members?.filter(
			(member) =>
				member.is_active &&
				member.last_active_at &&
				new Date(member.last_active_at) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
		).length || 0;

	const tierBreakdown =
		members?.reduce(
			(acc, member) => {
				if (member.is_active) {
					const tier = member.beta_tier ?? 'unassigned';
					acc[tier] = (acc[tier] || 0) + 1;
				}
				return acc;
			},
			{} as Record<string, number>
		) || {};

	const recentActivity: BetaRecentActivity[] = [
		...(signups?.slice(0, 3).map((signup) => ({
			type: 'signup' as const,
			user: signup.full_name || signup.email,
			status: signup.signup_status,
			created_at: signup.created_at
		})) || []),
		...(betaFeedback?.slice(0, 3).map((feedback) => ({
			type: 'feedback' as const,
			feedback_type: feedback.feedback_type,
			status: feedback.feedback_status,
			created_at: feedback.created_at
		})) || [])
	]
		.sort((a, b) => {
			const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
			const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
			return bTime - aTime;
		})
		.slice(0, 5);

	return {
		signups: {
			total: signups?.length || 0,
			pending: signupStats.pending || 0,
			approved: signupStats.approved || 0,
			declined: signupStats.declined || 0,
			waitlist: signupStats.waitlist || 0,
			recent_24h: recentSignups
		},
		members: {
			total: members?.filter((m) => m.is_active).length || 0,
			active_30d: activeMembers,
			tier_breakdown: tierBreakdown,
			total_feedback: betaFeedback?.length || 0
		},
		recent_activity: recentActivity
	};
}

export async function getSubscriptionOverview(client: TypedSupabaseClient) {
	const { data: rawOverview, error: overviewError } = await client.rpc(
		'get_subscription_overview'
	);
	if (overviewError) {
		throw new Error(overviewError.message);
	}

	const { data: rawRevenue, error: revenueError } = await client.rpc('get_revenue_metrics');
	if (revenueError) {
		throw new Error(revenueError.message);
	}

	const { data: recentChanges } = await client
		.from('customer_subscriptions')
		.select(
			`
				*,
				users (
					email,
					name
				),
				subscription_plans (
					name,
					price,
					interval
				)
			`
		)
		.order('updated_at', { ascending: false })
		.limit(10);

	const { data: failedPayments } = await client
		.from('invoices')
		.select(
			`
				*,
				customer_subscriptions (
					users (
						email,
						name
					)
				)
			`
		)
		.eq('status', 'failed')
		.order('created_at', { ascending: false })
		.limit(10);

	const { data: discountUsage } = await client
		.from('discount_codes')
		.select(
			`
				*,
				customer_subscriptions (
					id
				)
			`
		)
		.order('usage_count', { ascending: false })
		.limit(10);

	const overview = normalizeNumericRecord(DEFAULT_SUBSCRIPTION_OVERVIEW.overview, rawOverview);
	const revenue = normalizeNumericRecord(DEFAULT_SUBSCRIPTION_OVERVIEW.revenue, rawRevenue);

	return {
		overview,
		revenue,
		recentChanges: recentChanges || [],
		failedPayments: failedPayments || [],
		discountUsage: discountUsage || [],
		stripeEnabled: StripeService.isEnabled()
	};
}

export async function getComprehensiveAnalytics(
	client: TypedSupabaseClient,
	timeframe: AnalyticsTimeframe
) {
	const endDate = new Date();
	const startDate = new Date();
	switch (timeframe) {
		case '7d':
			startDate.setDate(startDate.getDate() - 7);
			break;
		case '90d':
			startDate.setDate(startDate.getDate() - 90);
			break;
		default:
			startDate.setDate(startDate.getDate() - 30);
	}

	const twentyFourHoursAgo = new Date();
	twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

	const [
		userCounts,
		betaUserCounts,
		newUsersLast24h,
		newBetaSignupsLast24h,
		brainDumpStats,
		projectStats,
		calendarConnections,
		brainDumpUsers,
		projectUpdateUsers,
		taskCreators,
		scheduledTaskUsers,
		phaseCreators
	] = await Promise.all([
		client.from('users').select('id', { count: 'exact', head: true }),
		client
			.from('beta_signups')
			.select('id', { count: 'exact', head: true })
			.eq('signup_status', 'approved'),
		client
			.from('users')
			.select('id', { count: 'exact', head: true })
			.gte('created_at', twentyFourHoursAgo.toISOString()),
		client
			.from('beta_signups')
			.select('id', { count: 'exact', head: true })
			.gte('created_at', twentyFourHoursAgo.toISOString()),
		client
			.from('brain_dumps')
			.select('id, content, created_at, user_id')
			.gte('created_at', startDate.toISOString())
			.lte('created_at', endDate.toISOString()),
		client
			.from('projects')
			.select('id, created_at, updated_at, user_id')
			.gte('created_at', startDate.toISOString())
			.lte('created_at', endDate.toISOString()),
		client
			.from('user_calendar_tokens')
			.select('user_id', { count: 'exact', head: true })
			.not('access_token', 'is', null),
		client
			.from('brain_dumps')
			.select('user_id, users!inner(email)')
			.gte('created_at', startDate.toISOString())
			.lte('created_at', endDate.toISOString()),
		client
			.from('projects')
			.select('user_id, updated_at, users!inner(email)')
			.gte('updated_at', startDate.toISOString())
			.lte('updated_at', endDate.toISOString())
			.not('updated_at', 'is', null),
		client
			.from('tasks')
			.select('user_id, users!inner(email)')
			.gte('created_at', startDate.toISOString())
			.lte('created_at', endDate.toISOString()),
		client
			.from('task_calendar_events')
			.select('user_id, users!inner(email)')
			.gte('created_at', startDate.toISOString())
			.lte('created_at', endDate.toISOString()),
		client
			.from('phases')
			.select('user_id, users!inner(email)')
			.gte('created_at', startDate.toISOString())
			.lte('created_at', endDate.toISOString())
	]);

	if (
		userCounts.error ||
		betaUserCounts.error ||
		newUsersLast24h.error ||
		newBetaSignupsLast24h.error ||
		brainDumpStats.error ||
		projectStats.error ||
		calendarConnections.error ||
		brainDumpUsers.error ||
		projectUpdateUsers.error ||
		taskCreators.error ||
		scheduledTaskUsers.error ||
		phaseCreators.error
	) {
		const errorSource =
			userCounts.error ||
			betaUserCounts.error ||
			newUsersLast24h.error ||
			newBetaSignupsLast24h.error ||
			brainDumpStats.error ||
			projectStats.error ||
			calendarConnections.error ||
			brainDumpUsers.error ||
			projectUpdateUsers.error ||
			taskCreators.error ||
			scheduledTaskUsers.error ||
			phaseCreators.error;
		throw new Error(errorSource?.message || 'Failed to load comprehensive analytics');
	}

	const formatLeaderboard = (rows: any[], key: string) => {
		const counts: Record<string, { email: string; count: number }> = {};
		rows.forEach((row) => {
			const userId = row[key];
			const email = row.users?.email || 'Unknown';
			if (!counts[userId]) {
				counts[userId] = { email, count: 0 };
			}
			counts[userId].count++;
		});
		return Object.values(counts)
			.sort((a, b) => b.count - a.count)
			.slice(0, 10);
	};

	return {
		userMetrics: {
			totalUsers: userCounts.count || 0,
			totalBetaUsers: betaUserCounts.count || 0,
			newUsersLast24h: newUsersLast24h.count || 0,
			newBetaSignupsLast24h: newBetaSignupsLast24h.count || 0
		},
		brainDumpMetrics: {
			total: brainDumpStats.data?.length || 0,
			averageLength: brainDumpStats.data
				? Math.round(
						brainDumpStats.data.reduce(
							(sum, dump) => sum + (dump.content?.length || 0),
							0
						) / brainDumpStats.data.length
					)
				: 0,
			uniqueUsers: new Set(brainDumpStats.data?.map((dump) => dump.user_id) ?? []).size
		},
		projectMetrics: {
			newProjects: projectStats.data?.length || 0,
			updatedProjects:
				projectStats.data?.filter(
					(project) => project.updated_at && project.updated_at !== project.created_at
				).length || 0,
			uniqueUsers: new Set(projectStats.data?.map((project) => project.user_id) ?? []).size
		},
		calendarConnections: calendarConnections.count || 0,
		leaderboards: {
			brainDumps: formatLeaderboard(brainDumpUsers.data ?? [], 'user_id'),
			projectUpdates: formatLeaderboard(projectUpdateUsers.data ?? [], 'user_id'),
			tasksCreated: formatLeaderboard(taskCreators.data ?? [], 'user_id'),
			tasksScheduled: formatLeaderboard(scheduledTaskUsers.data ?? [], 'user_id'),
			phasesCreated: formatLeaderboard(phaseCreators.data ?? [], 'user_id')
		}
	};
}

export async function getErrorSummary(client: TypedSupabaseClient) {
	const errorLogger = ErrorLoggerService.getInstance(client);
	const summary = await errorLogger.getErrorSummary();
	const first = summary?.[0];

	return {
		total_errors: first?.total_errors || 0,
		unresolved_errors: first?.unresolved_errors || 0,
		critical_errors: first?.critical_errors || 0,
		recent_errors_24h: first?.errors_last_24h || 0,
		error_trend: first?.error_trend || 0
	};
}

export async function getAgentChatUsage(
	client: TypedSupabaseClient,
	timeframe: AnalyticsTimeframe
): Promise<typeof DEFAULT_AGENT_CHAT_USAGE> {
	// Align filtering with existing admin chat analytics endpoints
	const endDate = new Date();
	const startDate = new Date();
	switch (timeframe) {
		case '7d':
			startDate.setDate(startDate.getDate() - 7);
			break;
		case '90d':
			startDate.setDate(startDate.getDate() - 90);
			break;
		default:
			startDate.setDate(startDate.getDate() - 30);
	}

	const thirtyDaysAgo = new Date();
	thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
	const thirtyDaysAgoISO = thirtyDaysAgo.toISOString();

	const { data: sessions, error: sessionsError } = await client
		.from('agent_chat_sessions')
		.select('id, session_type, status, message_count, created_at')
		.gte('created_at', startDate);
	// .lte('created_at', endDate.toISOString());

	if (sessionsError) {
		throw new Error(sessionsError.message);
	}

	const sessionIds = sessions?.map((s) => s.id) ?? [];

	const { data: messages, error: messagesError } =
		sessionIds.length > 0
			? await client
					.from('agent_chat_messages')
					.select('agent_session_id, tokens_used')
					.in('agent_session_id', sessionIds)
			: { data: [], error: null };

	if (messagesError) {
		throw new Error(messagesError.message);
	}

	const totalSessions = sessions?.length || 0;
	const totalMessages = messages?.length || 0;
	const totalTokens =
		messages?.reduce((sum, message) => sum + coerceNumber(message.tokens_used, 0), 0) || 0;

	const plannerSessions =
		sessions?.filter((s) => (s.session_type || '').includes('planner')).length || 0;
	const executorSessions =
		sessions?.filter((s) => (s.session_type || '').includes('executor')).length || 0;
	const failedSessions =
		sessions?.filter((s) => (s.status || '').toLowerCase() === 'failed').length || 0;

	const avgMessagesPerSession =
		totalSessions > 0 ? Math.round((totalMessages / totalSessions) * 100) / 100 : 0;
	const avgTokensPerSession =
		totalSessions > 0 ? Math.round((totalTokens / totalSessions) * 100) / 100 : 0;
	const failureRate = totalSessions > 0 ? (failedSessions / totalSessions) * 100 : 0;

	return {
		totalSessions,
		totalMessages,
		totalTokens,
		avgMessagesPerSession,
		avgTokensPerSession,
		plannerSessions,
		executorSessions,
		failedSessions,
		failureRate
	};
}

export async function getBriefDeliveryStats(
	client: TypedSupabaseClient,
	timeframe: AnalyticsTimeframe
): Promise<typeof DEFAULT_BRIEF_DELIVERY> {
	const dateRange = resolveDateRange(timeframe);
	const { startDateTime, endDateTime } = buildDateTimeRange(dateRange);

	const [
		{ data: ontologyBriefs, error: ontologyBriefsError },
		{ data: legacyBriefs, error: legacyBriefsError }
	] = await Promise.all([
		client
			.from('ontology_daily_briefs')
			.select('id, created_at')
			.gte('created_at', startDateTime)
			.lte('created_at', endDateTime),
		client
			.from('daily_briefs')
			.select('id, created_at')
			.gte('created_at', startDateTime)
			.lte('created_at', endDateTime)
	]);

	if (ontologyBriefsError || legacyBriefsError) {
		throw new Error(ontologyBriefsError?.message || legacyBriefsError?.message);
	}

	const { data: notificationPrefs, error: prefsError } = await client
		.from('user_notification_preferences')
		.select('should_email_daily_brief, should_sms_daily_brief');

	if (prefsError) {
		throw new Error(prefsError.message);
	}

	const emailOptIn =
		notificationPrefs?.filter((pref) => pref.should_email_daily_brief === true).length || 0;
	const smsOptIn =
		notificationPrefs?.filter((pref) => pref.should_sms_daily_brief === true).length || 0;

	const { data: emailRecipients, error: emailRecipientsError } = await client
		.from('email_recipients')
		.select(
			`
			sent_at,
			delivered_at,
			status,
			emails!inner(category)
		`
		)
		.eq('emails.category', 'daily_brief')
		.gte('sent_at', startDateTime)
		.lte('sent_at', endDateTime);

	if (emailRecipientsError) {
		throw new Error(emailRecipientsError.message);
	}

	const emailSent = emailRecipients?.length || 0;
	const emailDelivered =
		emailRecipients?.filter((rec) => rec.delivered_at || rec.status === 'delivered').length ||
		0;

	const { data: smsMessages, error: smsError } = await client
		.from('sms_messages')
		.select('sent_at, delivered_at, metadata')
		.contains('metadata', { type: 'daily_brief' })
		.gte('created_at', startDateTime)
		.lte('created_at', endDateTime);

	if (smsError) {
		throw new Error(smsError.message);
	}

	const smsSent =
		smsMessages?.filter((sms) => sms.sent_at || sms.metadata)?.length ||
		smsMessages?.length ||
		0;
	const smsDelivered =
		smsMessages?.filter((sms) => sms.delivered_at !== null && sms.delivered_at !== undefined)
			.length || 0;

	const ontologyCount = ontologyBriefs?.length || 0;
	const legacyCount = legacyBriefs?.length || 0;

	return {
		briefsGenerated: ontologyCount + legacyCount,
		ontologyBriefs: ontologyCount,
		legacyBriefs: legacyCount,
		emailOptIn,
		smsOptIn,
		emailSent,
		emailDelivered,
		smsSent,
		smsDelivered
	};
}

export async function getSystemHealth(client: TypedSupabaseClient) {
	const now = new Date();
	const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

	const [queueJobs, failedJobs, agentExecutions, errorLogs, llmMetrics] = await Promise.all([
		client
			.from('queue_jobs')
			.select('created_at, scheduled_for, status')
			.neq('status', 'completed')
			.neq('status', 'failed'),
		client.from('queue_jobs').select('id').eq('status', 'failed').gte('updated_at', last24h),
		client.from('agent_executions').select('id, success').gte('created_at', last24h),
		client
			.from('error_logs')
			.select('id', { count: 'exact', head: true })
			.gte('created_at', last24h),
		client
			.from('system_metrics')
			.select('metric_name, metric_value, recorded_at')
			.ilike('metric_name', 'llm_call_duration_%')
	]);

	if (queueJobs.error) throw new Error(queueJobs.error.message);
	if (failedJobs.error) throw new Error(failedJobs.error.message);
	if (agentExecutions.error) throw new Error(agentExecutions.error.message);
	if (errorLogs.error) throw new Error(errorLogs.error.message);
	if (llmMetrics.error) throw new Error(llmMetrics.error.message);

	const queueItems = queueJobs.data || [];
	const queueDepth = queueItems.length;
	let oldestJobSeconds = 0;
	if (queueItems.length) {
		const earliestTs = queueItems.reduce(
			(earliest: string | null, job) => {
				const ts = job.scheduled_for || job.created_at;
				if (!earliest) return ts;
				return new Date(ts).getTime() < new Date(earliest).getTime() ? ts : earliest;
			},
			queueItems[0]?.scheduled_for || queueItems[0]?.created_at || null
		);

		if (earliestTs) {
			oldestJobSeconds = Math.max(
				0,
				Math.floor((now.getTime() - new Date(earliestTs).getTime()) / 1000)
			);
		}
	}

	const totalExecs = agentExecutions.data?.length || 0;
	const failedExecs = agentExecutions.data?.filter((exec) => exec.success === false).length || 0;
	const agentFailureRate = totalExecs > 0 ? (failedExecs / totalExecs) * 100 : 0;

	const errorCount24h = errorLogs.count || 0;
	const failedJobs24h = failedJobs.data?.length || 0;

	const llmLatencyMs: Record<string, number> = {};
	(llmMetrics.data || []).forEach((metric) => {
		const provider = metric.metric_name.replace('llm_call_duration_', '');
		if (!llmLatencyMs[provider] || new Date(metric.recorded_at).getTime() > 0) {
			llmLatencyMs[provider] = coerceNumber(metric.metric_value, 0);
		}
	});

	return {
		llmLatencyMs,
		queueDepth,
		oldestJobSeconds,
		failedJobs24h,
		agentFailureRate,
		errorCount24h,
		lastUpdated: now.toISOString()
	};
}

export interface DashboardAnalyticsPayload {
	systemOverview: Awaited<ReturnType<typeof getSystemOverview>>;
	visitorOverview: Awaited<ReturnType<typeof getVisitorOverview>>;
	dailyVisitors: Awaited<ReturnType<typeof getDailyVisitors>>;
	dailySignups: Awaited<ReturnType<typeof getDailySignups>>;
	dailyActiveUsers: Awaited<ReturnType<typeof getDailyActiveUsers>>;
	briefGenerationStats: Awaited<ReturnType<typeof getBriefGenerationStats>>;
	systemMetrics: Awaited<ReturnType<typeof getSystemMetrics>>;
	recentActivity: Awaited<ReturnType<typeof getRecentActivity>>;
	feedbackOverview: Awaited<ReturnType<typeof getFeedbackOverview>>;
	betaOverview: Awaited<ReturnType<typeof getBetaOverview>>;
	subscriptionData: Awaited<ReturnType<typeof getSubscriptionOverview>> | null;
	comprehensiveAnalytics: Awaited<ReturnType<typeof getComprehensiveAnalytics>>;
	errorsData: Awaited<ReturnType<typeof getErrorSummary>>;
	agentChatUsage: Awaited<ReturnType<typeof getAgentChatUsage>>;
	briefDelivery: Awaited<ReturnType<typeof getBriefDeliveryStats>>;
	systemHealth: Awaited<ReturnType<typeof getSystemHealth>>;
}

async function safeFetch<T>(label: string, fallback: () => T, fn: () => Promise<T>): Promise<T> {
	try {
		return await fn();
	} catch (err) {
		console.error(`[Admin Analytics] ${label} failed`, err);
		return fallback();
	}
}

export async function getDashboardAnalytics(
	client: TypedSupabaseClient,
	timeframe: AnalyticsTimeframe
): Promise<DashboardAnalyticsPayload> {
	const [
		systemOverview,
		visitorOverview,
		dailyVisitors,
		dailySignups,
		dailyActiveUsers,
		briefGenerationStats,
		systemMetrics,
		recentActivity,
		feedbackOverview,
		betaOverview,
		subscriptionData,
		comprehensiveAnalytics,
		errorsData,
		agentChatUsage,
		briefDelivery,
		systemHealth
	] = await Promise.all([
		safeFetch(
			'system overview',
			() => clone(DEFAULT_SYSTEM_OVERVIEW),
			() => getSystemOverview(client)
		),
		safeFetch(
			'visitor overview',
			() => clone(DEFAULT_VISITOR_OVERVIEW),
			() => getVisitorOverview(client)
		),
		safeFetch(
			'daily visitors',
			() => [],
			() => getDailyVisitors(client, timeframe)
		),
		safeFetch(
			'daily signups',
			() => [],
			() => getDailySignups(client, timeframe)
		),
		safeFetch(
			'daily active users',
			() => [],
			() => getDailyActiveUsers(client, timeframe)
		),
		safeFetch(
			'brief stats',
			() => [],
			() => getBriefGenerationStats(client, timeframe)
		),
		safeFetch(
			'system metrics',
			() => [],
			() => getSystemMetrics(client)
		),
		safeFetch(
			'recent activity',
			() => [],
			() => getRecentActivity(client)
		),
		safeFetch(
			'feedback overview',
			() => clone(DEFAULT_FEEDBACK_OVERVIEW),
			() => getFeedbackOverview(client)
		),
		safeFetch(
			'beta overview',
			() => clone(DEFAULT_BETA_OVERVIEW),
			() => getBetaOverview(client)
		),
		safeFetch(
			'subscription overview',
			() => clone(DEFAULT_SUBSCRIPTION_OVERVIEW),
			() => getSubscriptionOverview(client)
		),
		safeFetch(
			'comprehensive analytics',
			() => clone(DEFAULT_COMPREHENSIVE_ANALYTICS),
			() => getComprehensiveAnalytics(client, timeframe)
		),
		safeFetch(
			'error summary',
			() => clone(DEFAULT_ERROR_SUMMARY),
			() => getErrorSummary(client)
		),
		safeFetch(
			'agent chat usage',
			() => clone(DEFAULT_AGENT_CHAT_USAGE),
			() => getAgentChatUsage(client, timeframe)
		),
		safeFetch(
			'brief delivery',
			() => clone(DEFAULT_BRIEF_DELIVERY),
			() => getBriefDeliveryStats(client, timeframe)
		),
		safeFetch(
			'system health',
			() => clone(DEFAULT_SYSTEM_HEALTH),
			() => getSystemHealth(client)
		)
	]);

	return {
		systemOverview,
		visitorOverview,
		dailyVisitors,
		dailySignups,
		dailyActiveUsers,
		briefGenerationStats,
		systemMetrics,
		recentActivity,
		feedbackOverview,
		betaOverview,
		subscriptionData,
		comprehensiveAnalytics,
		errorsData,
		agentChatUsage,
		briefDelivery,
		systemHealth
	};
}
