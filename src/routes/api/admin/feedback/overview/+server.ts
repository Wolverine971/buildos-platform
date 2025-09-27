// src/routes/api/admin/feedback/overview/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();

	if (!user?.is_admin) {
		return json({ error: 'Admin access required' }, { status: 403 });
	}

	try {
		// Get feedback overview stats
		const { data: overviewData, error: overviewError } = await supabase
			.from('feedback')
			.select('category, status, rating, created_at')
			.order('created_at', { ascending: false });

		if (overviewError) throw overviewError;

		// Get recent feedback (last 5)
		const { data: recentFeedback, error: recentError } = await supabase
			.from('feedback')
			.select('id, category, feedback_text, rating, status, user_email, created_at')
			.order('created_at', { ascending: false })
			.limit(5);

		if (recentError) throw recentError;

		// Calculate stats
		const totalFeedback = overviewData?.length || 0;
		const recentFeedback24h =
			overviewData?.filter(
				(item) => new Date(item.created_at) > new Date(Date.now() - 24 * 60 * 60 * 1000)
			).length || 0;

		// Category breakdown
		const categoryBreakdown =
			overviewData?.reduce(
				(acc, item) => {
					acc[item.category] = (acc[item.category] || 0) + 1;
					return acc;
				},
				{} as Record<string, number>
			) || {};

		// Status breakdown
		const statusBreakdown =
			overviewData?.reduce(
				(acc, item) => {
					acc[item.status || 'new'] = (acc[item.status || 'new'] || 0) + 1;
					return acc;
				},
				{} as Record<string, number>
			) || {};

		// Average rating
		const ratingsOnly = overviewData?.filter((item) => item.rating !== null);
		const averageRating = ratingsOnly?.length
			? ratingsOnly.reduce((sum, item) => sum + (item.rating || 0), 0) / ratingsOnly.length
			: 0;

		return json({
			overview: {
				total_feedback: totalFeedback,
				recent_24h: recentFeedback24h,
				unresolved_count: statusBreakdown.new || 0,
				average_rating: Math.round(averageRating * 10) / 10
			},
			category_breakdown: categoryBreakdown,
			status_breakdown: statusBreakdown,
			recent_feedback: recentFeedback || []
		});
	} catch (error) {
		console.error('Error fetching feedback overview:', error);
		return json({ error: 'Failed to fetch feedback overview' }, { status: 500 });
	}
};
