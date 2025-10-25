// apps/web/src/routes/api/daily-briefs/stats/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	const userId = user.id;

	try {
		const now = new Date();
		const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
		const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

		// Get basic statistics
		const [totalBriefs, weeklyBriefs, monthlyBriefs, recentBrief] = await Promise.all([
			supabase
				.from('daily_briefs')
				.select('*', { count: 'exact', head: true })
				.eq('user_id', userId),

			supabase
				.from('daily_briefs')
				.select('*', { count: 'exact', head: true })
				.eq('user_id', userId)
				.gte('brief_date', weekAgo.toISOString().split('T')[0]),

			supabase
				.from('daily_briefs')
				.select('*', { count: 'exact', head: true })
				.eq('user_id', userId)
				.gte('brief_date', monthAgo.toISOString().split('T')[0]),

			supabase
				.from('daily_briefs')
				.select('brief_date, created_at')
				.eq('user_id', userId)
				.order('brief_date', { ascending: false })
				.limit(1)
				.single()
		]);

		// Calculate streak
		const { data: recentBriefs } = await supabase
			.from('daily_briefs')
			.select('brief_date')
			.eq('user_id', userId)
			.order('brief_date', { ascending: false })
			.limit(100);

		let currentStreak = 0;
		if (recentBriefs && recentBriefs.length > 0) {
			const briefDates = recentBriefs.map((b) => new Date(b.brief_date));
			const today = new Date();
			today.setHours(0, 0, 0, 0);

			let checkDate = new Date(today);
			for (const briefDate of briefDates) {
				const briefDateOnly = new Date(briefDate);
				briefDateOnly.setHours(0, 0, 0, 0);

				if (briefDateOnly.getTime() === checkDate.getTime()) {
					currentStreak++;
					checkDate.setDate(checkDate.getDate() - 1);
				} else if (briefDateOnly.getTime() < checkDate.getTime()) {
					break;
				}
			}
		}

		return ApiResponse.success({
			total_briefs: totalBriefs.count || 0,
			briefs_this_week: weeklyBriefs.count || 0,
			briefs_this_month: monthlyBriefs.count || 0,
			current_streak: currentStreak,
			last_brief_date: recentBrief.data?.brief_date || null,
			last_brief_created: recentBrief.data?.created_at || null
		});
	} catch (error) {
		console.error('Error fetching brief stats:', error);
		return ApiResponse.internalError(error, 'Failed to fetch brief statistics');
	}
};
