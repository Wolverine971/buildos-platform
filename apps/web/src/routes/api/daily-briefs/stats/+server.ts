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
		const weekAgoDate = weekAgo.toISOString().split('T')[0]!;
		const monthAgoDate = monthAgo.toISOString().split('T')[0]!;

		const [allRowsResult, recentBriefResult] = await Promise.all([
			supabase
				.from('ontology_daily_briefs')
				.select('brief_date, generation_status')
				.eq('user_id', userId),
			supabase
				.from('ontology_daily_briefs')
				.select('brief_date, created_at')
				.eq('user_id', userId)
				.eq('generation_status', 'completed')
				.order('brief_date', { ascending: false })
				.order('created_at', { ascending: false })
				.limit(1)
				.maybeSingle()
		]);

		if (allRowsResult.error) {
			throw allRowsResult.error;
		}

		const rows = allRowsResult.data || [];
		const completedDates = new Set(
			rows.filter((row) => row.generation_status === 'completed').map((row) => row.brief_date)
		);

		const uniqueCompletedDates = Array.from(completedDates).sort((a, b) =>
			a < b ? 1 : a > b ? -1 : 0
		);

		const totalBriefs = uniqueCompletedDates.length;
		const weeklyBriefs = uniqueCompletedDates.filter((date) => date >= weekAgoDate).length;
		const monthlyBriefs = uniqueCompletedDates.filter((date) => date >= monthAgoDate).length;

		let currentStreak = 0;
		if (uniqueCompletedDates.length > 0) {
			const briefDateSet = new Set(uniqueCompletedDates);
			const today = new Date();
			today.setHours(0, 0, 0, 0);

			let checkDate = new Date(today);
			while (true) {
				const checkString = checkDate.toISOString().split('T')[0]!;
				if (!briefDateSet.has(checkString)) {
					break;
				}
				currentStreak += 1;
				checkDate.setDate(checkDate.getDate() - 1);
			}
		}

		return ApiResponse.success({
			total_briefs: totalBriefs,
			briefs_this_week: weeklyBriefs,
			briefs_this_month: monthlyBriefs,
			current_streak: currentStreak,
			last_brief_date: recentBriefResult.data?.brief_date || null,
			last_brief_created: recentBriefResult.data?.created_at || null
		});
	} catch (error) {
		console.error('Error fetching brief stats:', error);
		return ApiResponse.internalError(error, 'Failed to fetch brief statistics');
	}
};
