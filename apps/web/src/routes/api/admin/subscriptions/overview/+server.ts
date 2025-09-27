// src/routes/api/admin/subscriptions/overview/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { StripeService } from '$lib/services/stripe-service';

export const GET: RequestHandler = async ({ locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	// Check admin status
	const { data: adminCheck } = await supabase
		.from('users')
		.select('is_admin')
		.eq('id', user.id)
		.single();

	if (!adminCheck?.is_admin) {
		return ApiResponse.forbidden();
	}

	try {
		// Get subscription overview
		const { data: overview, error: overviewError } = await supabase.rpc(
			'get_subscription_overview'
		);

		if (overviewError) throw overviewError;

		// Get revenue metrics
		const { data: revenue, error: revenueError } = await supabase.rpc('get_revenue_metrics');

		if (revenueError) throw revenueError;

		// Get recent subscription changes
		const { data: recentChanges } = await supabase
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

		// Get failed payments
		const { data: failedPayments } = await supabase
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

		// Get discount code usage
		const { data: discountUsage } = await supabase
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

		return ApiResponse.success({
			overview: overview || {
				total_subscribers: 0,
				active_subscriptions: 0,
				trial_subscriptions: 0,
				canceled_subscriptions: 0,
				paused_subscriptions: 0,
				mrr: 0,
				arr: 0
			},
			revenue: revenue || {
				current_mrr: 0,
				previous_mrr: 0,
				mrr_growth: 0,
				total_revenue: 0,
				average_revenue_per_user: 0
			},
			recentChanges: recentChanges || [],
			failedPayments: failedPayments || [],
			discountUsage: discountUsage || [],
			stripeEnabled: StripeService.isEnabled()
		});
	} catch (error) {
		return ApiResponse.internalError(error, 'Failed to load subscription data');
	}
};
