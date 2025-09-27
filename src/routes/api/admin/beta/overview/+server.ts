// src/routes/api/admin/beta/overview/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();

	if (!user) {
		return ApiResponse.unauthorized();
	}

	if (!user.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	try {
		// Get beta signups overview
		const { data: signups, error: signupsError } = await supabase
			.from('beta_signups')
			.select('id, signup_status, created_at, full_name, email');

		if (signupsError) {
			return ApiResponse.databaseError(signupsError);
		}

		// Get beta members overview
		const { data: members, error: membersError } = await supabase.from('beta_members').select(`
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
			return ApiResponse.databaseError(membersError);
		}

		// Get beta feedback overview
		const { data: betaFeedback, error: feedbackError } = await supabase
			.from('beta_feedback')
			.select('id, feedback_type, feedback_status, created_at');

		if (feedbackError) {
			return ApiResponse.databaseError(feedbackError);
		}

		// Calculate signup stats
		const signupStats =
			signups?.reduce(
				(acc, signup) => {
					acc[signup.signup_status] = (acc[signup.signup_status] || 0) + 1;
					return acc;
				},
				{} as Record<string, number>
			) || {};

		// Recent signups (last 24h)
		const recentSignups =
			signups?.filter(
				(signup) => new Date(signup.created_at) > new Date(Date.now() - 24 * 60 * 60 * 1000)
			).length || 0;

		// Active members (active in last 30 days)
		const activeMembers =
			members?.filter(
				(member) =>
					member.is_active &&
					member.last_active_at &&
					new Date(member.last_active_at) >
						new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
			).length || 0;

		// Member tier breakdown
		const tierBreakdown =
			members?.reduce(
				(acc, member) => {
					if (member.is_active) {
						acc[member.beta_tier] = (acc[member.beta_tier] || 0) + 1;
					}
					return acc;
				},
				{} as Record<string, number>
			) || {};

		// Recent beta activity (recent signups and feedback)
		const recentActivity = [
			...(signups?.slice(0, 3).map((signup) => ({
				type: 'signup',
				user: signup.full_name || signup.email,
				status: signup.signup_status,
				created_at: signup.created_at
			})) || []),
			...(betaFeedback?.slice(0, 3).map((feedback) => ({
				type: 'feedback',
				feedback_type: feedback.feedback_type,
				status: feedback.feedback_status,
				created_at: feedback.created_at
			})) || [])
		]
			.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
			.slice(0, 5);

		return ApiResponse.success({
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
		});
	} catch (error) {
		console.error('Error fetching beta overview:', error);
		return ApiResponse.internalError(error, 'Failed to fetch beta overview');
	}
};
