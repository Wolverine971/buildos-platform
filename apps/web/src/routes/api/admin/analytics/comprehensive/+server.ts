// apps/web/src/routes/api/admin/analytics/comprehensive/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ locals: { supabase, safeGetSession }, url }) => {
	try {
		const { user } = await safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized();
		}

		if (!user.is_admin) {
			return ApiResponse.forbidden('Admin access required');
		}

		// Get timeframe from query params
		const timeframe = url.searchParams.get('timeframe') || '7d';

		// Calculate date range
		const endDate = new Date();
		const startDate = new Date();
		switch (timeframe) {
			case '7d':
				startDate.setDate(startDate.getDate() - 7);
				break;
			case '30d':
				startDate.setDate(startDate.getDate() - 30);
				break;
			case '90d':
				startDate.setDate(startDate.getDate() - 90);
				break;
			default:
				startDate.setDate(startDate.getDate() - 7);
		}

		// Calculate 24 hour ago timestamp
		const twentyFourHoursAgo = new Date();
		twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

		// Fetch all metrics in parallel
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
			// Total user count
			supabase.from('users').select('id', { count: 'exact', head: true }),

			// Beta user counts (approved status)
			supabase
				.from('beta_signups')
				.select('id', { count: 'exact', head: true })
				.eq('signup_status', 'approved'),

			// New users in last 24 hours
			supabase
				.from('users')
				.select('id', { count: 'exact', head: true })
				.gte('created_at', twentyFourHoursAgo.toISOString()),

			// New beta signups in last 24 hours
			supabase
				.from('beta_signups')
				.select('id', { count: 'exact', head: true })
				.gte('created_at', twentyFourHoursAgo.toISOString()),

			// Brain dump statistics for timeframe
			supabase
				.from('brain_dumps')
				.select('id, content, created_at, user_id')
				.gte('created_at', startDate.toISOString())
				.lte('created_at', endDate.toISOString()),

			// Project statistics for timeframe
			supabase
				.from('projects')
				.select('id, created_at, updated_at, user_id')
				.gte('created_at', startDate.toISOString())
				.lte('created_at', endDate.toISOString()),

			// Calendar connections (users with calendar tokens)
			supabase
				.from('user_calendar_tokens')
				.select('user_id', { count: 'exact', head: true })
				.not('access_token', 'is', null),

			// Brain dump leaderboard data
			supabase
				.from('brain_dumps')
				.select('user_id, users!inner(email)')
				.gte('created_at', startDate.toISOString())
				.lte('created_at', endDate.toISOString()),

			// Project updates leaderboard data
			supabase
				.from('projects')
				.select('user_id, updated_at, users!inner(email)')
				.gte('updated_at', startDate.toISOString())
				.lte('updated_at', endDate.toISOString())
				.not('updated_at', 'is', null),

			// Tasks created leaderboard data
			supabase
				.from('tasks')
				.select('user_id, users!inner(email)')
				.gte('created_at', startDate.toISOString())
				.lte('created_at', endDate.toISOString()),

			// Tasks scheduled (with calendar events) leaderboard data
			supabase
				.from('task_calendar_events')
				.select('user_id, users!inner(email)')
				.gte('created_at', startDate.toISOString())
				.lte('created_at', endDate.toISOString()),

			// Phases created leaderboard data
			supabase
				.from('phases')
				.select('user_id, users!inner(email)')
				.gte('created_at', startDate.toISOString())
				.lte('created_at', endDate.toISOString())
		]);

		// Calculate brain dump metrics
		let brainDumpMetrics = {
			total: 0,
			averageLength: 0,
			uniqueUsers: 0
		};

		if (brainDumpStats.data) {
			brainDumpMetrics.total = brainDumpStats.data.length;
			if (brainDumpMetrics.total > 0) {
				const totalLength = brainDumpStats.data.reduce(
					(sum, dump) => sum + (dump.content?.length || 0),
					0
				);
				brainDumpMetrics.averageLength = Math.round(totalLength / brainDumpMetrics.total);

				const uniqueUserIds = new Set(brainDumpStats.data.map((d) => d.user_id));
				brainDumpMetrics.uniqueUsers = uniqueUserIds.size;
			}
		}

		// Calculate project metrics
		let projectMetrics = {
			newProjects: 0,
			updatedProjects: 0,
			uniqueUsers: 0
		};

		if (projectStats.data) {
			projectMetrics.newProjects = projectStats.data.length;

			// Count projects that were updated (updated_at different from created_at)
			projectMetrics.updatedProjects = projectStats.data.filter(
				(p) => p.updated_at && p.created_at && p.updated_at !== p.created_at
			).length;

			const uniqueUserIds = new Set(projectStats.data.map((p) => p.user_id));
			projectMetrics.uniqueUsers = uniqueUserIds.size;
		}

		// Process leaderboard data
		let leaderboards = {
			brainDumps: [] as Array<{ email: string; count: number }>,
			projectUpdates: [] as Array<{ email: string; count: number }>,
			tasksCreated: [] as Array<{ email: string; count: number }>,
			tasksScheduled: [] as Array<{ email: string; count: number }>,
			phasesCreated: [] as Array<{ email: string; count: number }>
		};

		// Brain dumps leaderboard
		if (brainDumpUsers.data) {
			const userCounts = brainDumpUsers.data.reduce(
				(acc: Record<string, number>, item: any) => {
					const email = item.users?.email || 'Unknown';
					acc[email] = (acc[email] || 0) + 1;
					return acc;
				},
				{} as Record<string, number>
			);

			leaderboards.brainDumps = Object.entries(userCounts)
				.map(([email, count]) => ({ email, count }))
				.sort((a, b) => b.count - a.count)
				.slice(0, 10);
		}

		// Project updates leaderboard
		if (projectUpdateUsers.data) {
			const userCounts = projectUpdateUsers.data.reduce(
				(acc: Record<string, number>, item: any) => {
					const email = item.users?.email || 'Unknown';
					acc[email] = (acc[email] || 0) + 1;
					return acc;
				},
				{} as Record<string, number>
			);

			leaderboards.projectUpdates = Object.entries(userCounts)
				.map(([email, count]) => ({ email, count }))
				.sort((a, b) => b.count - a.count)
				.slice(0, 10);
		}

		// Tasks created leaderboard
		if (taskCreators.data) {
			const userCounts = taskCreators.data.reduce(
				(acc: Record<string, number>, item: any) => {
					const email = item.users?.email || 'Unknown';
					acc[email] = (acc[email] || 0) + 1;
					return acc;
				},
				{} as Record<string, number>
			);

			leaderboards.tasksCreated = Object.entries(userCounts)
				.map(([email, count]) => ({ email, count }))
				.sort((a, b) => b.count - a.count)
				.slice(0, 10);
		}

		// Tasks scheduled leaderboard
		if (scheduledTaskUsers.data) {
			const userCounts = scheduledTaskUsers.data.reduce(
				(acc: Record<string, number>, item: any) => {
					const email = item.users?.email || 'Unknown';
					acc[email] = (acc[email] || 0) + 1;
					return acc;
				},
				{} as Record<string, number>
			);

			leaderboards.tasksScheduled = Object.entries(userCounts)
				.map(([email, count]) => ({ email, count }))
				.sort((a, b) => b.count - a.count)
				.slice(0, 10);
		}

		// Phases created leaderboard
		if (phaseCreators.data) {
			const userCounts = phaseCreators.data.reduce(
				(acc: Record<string, number>, item: any) => {
					const email = item.users?.email || 'Unknown';
					acc[email] = (acc[email] || 0) + 1;
					return acc;
				},
				{} as Record<string, number>
			);

			leaderboards.phasesCreated = Object.entries(userCounts)
				.map(([email, count]) => ({ email, count }))
				.sort((a, b) => b.count - a.count)
				.slice(0, 10);
		}

		// Prepare response
		const analyticsData = {
			userMetrics: {
				totalUsers: userCounts.count || 0,
				totalBetaUsers: betaUserCounts.count || 0,
				newUsersLast24h: newUsersLast24h.count || 0,
				newBetaSignupsLast24h: newBetaSignupsLast24h.count || 0
			},
			brainDumpMetrics,
			projectMetrics,
			calendarConnections: calendarConnections.count || 0,
			leaderboards,
			timeframe,
			dateRange: {
				start: startDate.toISOString(),
				end: endDate.toISOString()
			}
		};

		return ApiResponse.success(analyticsData);
	} catch (error) {
		console.error('Error fetching comprehensive analytics:', error);
		return ApiResponse.internalError(error, 'Failed to fetch comprehensive analytics');
	}
};
