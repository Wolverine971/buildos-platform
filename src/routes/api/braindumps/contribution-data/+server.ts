// src/routes/api/braindumps/contribution-data/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();

	if (!user) {
		return ApiResponse.unauthorized();
	}

	try {
		const year = url.searchParams.get('year') || new Date().getFullYear().toString();
		const searchQuery = url.searchParams.get('search');

		// Get the date range for the year
		const startOfYear = `${year}-01-01T00:00:00.000Z`;
		const endOfYear = `${year}-12-31T23:59:59.999Z`;

		// First, get the first braindump date for this user to know the range
		const { data: firstBraindump } = await supabase
			.from('brain_dumps')
			.select('created_at')
			.eq('user_id', user.id)
			.order('created_at', { ascending: true })
			.limit(1);

		const firstBraindumpDate = firstBraindump?.[0]?.created_at
			? new Date(firstBraindump[0].created_at)
			: new Date();

		// Build the contribution query
		let query = supabase
			.from('brain_dumps')
			.select('created_at')
			.eq('user_id', user.id)
			.gte('created_at', startOfYear)
			.lte('created_at', endOfYear);

		// Apply search filter if provided
		if (searchQuery) {
			query = query.or(`
				title.ilike.%${searchQuery}%,
				content.ilike.%${searchQuery}%,
				ai_summary.ilike.%${searchQuery}%,
				ai_insights.ilike.%${searchQuery}%
			`);
		}

		const { data: braindumps, error } = await query;

		if (error) {
			console.error('Error fetching contribution data:', error);
			return ApiResponse.internalError(error, 'Failed to fetch contribution data');
		}

		// Create a map of date -> count
		const contributionMap: Record<string, number> = {};

		// Initialize all days of the year with 0
		const startDate = new Date(startOfYear);
		const endDate = new Date(endOfYear);

		for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
			const dateStr = d.toISOString().split('T')[0];
			contributionMap[dateStr] = 0;
		}

		// Count braindumps per day
		braindumps?.forEach((braindump) => {
			const date = new Date(braindump.created_at);
			const dateStr = date.toISOString().split('T')[0];
			contributionMap[dateStr] = (contributionMap[dateStr] || 0) + 1;
		});

		// Convert to array format for the frontend
		const contributions = Object.entries(contributionMap).map(([date, count]) => ({
			date,
			count,
			level: getContributionLevel(count) // 0-4 like GitHub
		}));

		// Get some stats
		const totalBraindumps = braindumps?.length || 0;
		const daysWithActivity = contributions.filter((c) => c.count > 0).length;
		const maxDailyCount = Math.max(...contributions.map((c) => c.count));
		const avgDailyCount = totalBraindumps / 365; // Approximate

		return ApiResponse.success({
			contributions,
			stats: {
				year: parseInt(year),
				totalBraindumps,
				daysWithActivity,
				maxDailyCount,
				avgDailyCount: Math.round(avgDailyCount * 100) / 100,
				firstBraindumpDate: firstBraindumpDate.toISOString(),
				searchQuery
			}
		});
	} catch (error) {
		console.error('Error in contribution data API:', error);
		return ApiResponse.internalError(error, 'Internal server error');
	}
};

// Helper function to determine contribution level (0-4) like GitHub
function getContributionLevel(count: number): number {
	if (count === 0) return 0;
	if (count === 1) return 1;
	if (count <= 3) return 2;
	if (count <= 6) return 3;
	return 4; // 7+ braindumps
}
