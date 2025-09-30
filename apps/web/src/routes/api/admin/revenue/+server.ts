// apps/web/src/routes/api/admin/revenue/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
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

	const period = url.searchParams.get('period') || 'month';
	const year = parseInt(url.searchParams.get('year') || new Date().getFullYear().toString());
	const month = parseInt(url.searchParams.get('month') || (new Date().getMonth() + 1).toString());

	try {
		// Calculate date ranges
		let startDate: Date;
		let endDate: Date;
		let previousStartDate: Date;
		let previousEndDate: Date;

		if (period === 'month') {
			startDate = new Date(year, month - 1, 1);
			endDate = new Date(year, month, 0);
			previousStartDate = new Date(year, month - 2, 1);
			previousEndDate = new Date(year, month - 1, 0);
		} else if (period === 'quarter') {
			const quarter = Math.floor((month - 1) / 3);
			startDate = new Date(year, quarter * 3, 1);
			endDate = new Date(year, quarter * 3 + 3, 0);
			previousStartDate = new Date(year, quarter * 3 - 3, 1);
			previousEndDate = new Date(year, quarter * 3, 0);
		} else {
			startDate = new Date(year, 0, 1);
			endDate = new Date(year, 11, 31);
			previousStartDate = new Date(year - 1, 0, 1);
			previousEndDate = new Date(year - 1, 11, 31);
		}

		// Get recognized revenue
		const { data: currentRevenue } = await supabase
			.from('invoices')
			.select('amount_paid')
			.eq('status', 'paid')
			.gte('created_at', startDate.toISOString())
			.lte('created_at', endDate.toISOString());

		const { data: previousRevenue } = await supabase
			.from('invoices')
			.select('amount_paid')
			.eq('status', 'paid')
			.gte('created_at', previousStartDate.toISOString())
			.lte('created_at', previousEndDate.toISOString());

		const { data: yearRevenue } = await supabase
			.from('invoices')
			.select('amount_paid')
			.eq('status', 'paid')
			.gte('created_at', new Date(year, 0, 1).toISOString())
			.lte('created_at', endDate.toISOString());

		const { data: allTimeRevenue } = await supabase
			.from('invoices')
			.select('amount_paid')
			.eq('status', 'paid');

		// Get refunds
		const { data: currentRefunds } = await supabase
			.from('invoices')
			.select('amount_refunded, metadata')
			.gt('amount_refunded', 0)
			.gte('created_at', startDate.toISOString())
			.lte('created_at', endDate.toISOString());

		const { data: previousRefunds } = await supabase
			.from('invoices')
			.select('amount_refunded')
			.gt('amount_refunded', 0)
			.gte('created_at', previousStartDate.toISOString())
			.lte('created_at', previousEndDate.toISOString());

		// Get active subscriptions for deferred revenue
		const { data: activeSubscriptions } = await supabase
			.from('customer_subscriptions')
			.select(
				`
        *,
        subscription_plans (
          price_cents,
          billing_interval,
          interval_count
        )
      `
			)
			.eq('status', 'active');

		// Calculate deferred revenue
		let deferredTotal = 0;
		let deferredNextMonth = 0;
		let deferredNextQuarter = 0;
		const deferredBreakdown: any[] = [];

		activeSubscriptions?.forEach((sub) => {
			if (!sub.subscription_plans) return;

			const periodEnd = new Date(sub.current_period_end);
			const now = new Date();
			const daysRemaining = Math.max(
				0,
				(periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
			);
			const monthlyPrice =
				sub.subscription_plans.price_cents /
				(sub.subscription_plans.billing_interval === 'year' ? 12 : 1);
			const dailyRate = monthlyPrice / 30;
			const deferredAmount = dailyRate * daysRemaining;

			deferredTotal += deferredAmount;

			if (daysRemaining <= 30) {
				deferredNextMonth += deferredAmount;
			}
			if (daysRemaining <= 90) {
				deferredNextQuarter += deferredAmount;
			}
		});

		// Get prorations (simplified - look for subscription changes)
		const { data: upgrades } = await supabase
			.from('invoices')
			.select('amount_paid, metadata')
			.eq('status', 'paid')
			.gte('created_at', startDate.toISOString())
			.lte('created_at', endDate.toISOString());

		const { data: downgrades } = await supabase
			.from('invoices')
			.select('amount_refunded, metadata')
			.gt('amount_refunded', 0)
			.gte('created_at', startDate.toISOString())
			.lte('created_at', endDate.toISOString());

		// Get chargebacks (would need separate tracking)
		const chargebacks = {
			current_period: 0,
			total: 0,
			count: 0,
			rate: 0
		};

		// Calculate metrics
		const { data: revenueMetrics } = await supabase.rpc('get_revenue_metrics');

		// Build response
		const recognized = {
			current_period:
				currentRevenue?.reduce((sum, inv) => sum + (inv.amount_paid || 0), 0) || 0,
			previous_period:
				previousRevenue?.reduce((sum, inv) => sum + (inv.amount_paid || 0), 0) || 0,
			year_to_date: yearRevenue?.reduce((sum, inv) => sum + (inv.amount_paid || 0), 0) || 0,
			all_time: allTimeRevenue?.reduce((sum, inv) => sum + (inv.amount_paid || 0), 0) || 0
		};

		const refunds = {
			current_period:
				currentRefunds?.reduce((sum, inv) => sum + (inv.amount_refunded || 0), 0) || 0,
			previous_period:
				previousRefunds?.reduce((sum, inv) => sum + (inv.amount_refunded || 0), 0) || 0,
			total_count: currentRefunds?.length || 0
		};

		const prorations = {
			upgrades: upgrades?.reduce((sum, inv) => sum + (inv.amount_paid || 0), 0) || 0,
			downgrades: downgrades?.reduce((sum, inv) => sum + (inv.amount_refunded || 0), 0) || 0,
			net: 0
		};
		prorations.net = prorations.upgrades - prorations.downgrades;

		// Build deferred breakdown for next 6 months
		for (let i = 0; i < 6; i++) {
			const periodDate = new Date(year, month - 1 + i, 1);
			const periodName = periodDate.toLocaleString('default', {
				month: 'long',
				year: 'numeric'
			});

			// Calculate deferred revenue for this period
			let periodAmount = 0;
			let periodCount = 0;

			activeSubscriptions?.forEach((sub) => {
				const periodEnd = new Date(sub.current_period_end);
				if (
					periodEnd.getMonth() === periodDate.getMonth() &&
					periodEnd.getFullYear() === periodDate.getFullYear()
				) {
					periodAmount += sub.subscription_plans?.price_cents || 0;
					periodCount++;
				}
			});

			if (periodAmount > 0) {
				deferredBreakdown.push({
					period: periodName,
					amount: periodAmount,
					count: periodCount
				});
			}
		}

		return ApiResponse.success({
			recognized,
			deferred: {
				total: Math.round(deferredTotal),
				next_month: Math.round(deferredNextMonth),
				next_quarter: Math.round(deferredNextQuarter),
				breakdown: deferredBreakdown
			},
			prorations,
			refunds,
			chargebacks,
			metrics: revenueMetrics
				? {
						mrr: Math.round((revenueMetrics.current_mrr || 0) * 100),
						arr: Math.round((revenueMetrics.current_mrr || 0) * 12 * 100),
						average_revenue_per_user: Math.round(
							(revenueMetrics.average_revenue_per_user || 0) * 100
						),
						lifetime_value: Math.round((revenueMetrics.lifetime_value || 0) * 100),
						gross_margin: 85 // Default to 85% gross margin for SaaS
					}
				: {
						mrr: 0,
						arr: 0,
						average_revenue_per_user: 0,
						lifetime_value: 0,
						gross_margin: 85
					}
		});
	} catch (error) {
		return ApiResponse.internalError(error, 'Failed to load revenue data');
	}
};
