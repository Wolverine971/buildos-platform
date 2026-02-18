// apps/web/src/routes/api/admin/subscriptions/users/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ locals: { supabase, safeGetSession }, url }) => {
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
		const page = parseInt(url.searchParams.get('page') || '1');
		const limit = parseInt(url.searchParams.get('limit') || '50');
		const status = url.searchParams.get('status') || 'all';
		const search = url.searchParams.get('search') || '';
		const offset = (page - 1) * limit;

		// Build query
		let query: any = (supabase as any).from('users').select(
			`
				*,
				payment_methods (
					type,
					card_last4,
					card_brand,
					is_default
				),
				billing_accounts (
					billing_state,
					billing_tier,
					frozen_at,
					frozen_reason,
					updated_at
				),
				customer_subscriptions (
					*,
					subscription_plans!customer_subscriptions_plan_id_fkey (
						name,
						price:price_cents,
						interval:billing_interval,
						interval_count
					)
				)
			`,
			{ count: 'exact' }
		);

		// Apply filters
		if (search) {
			query = query.or(`email.ilike.%${search}%,name.ilike.%${search}%`);
		}

		// Apply status filter via RPC if needed
		if (status !== 'all') {
			// We'll need to filter in JavaScript since Supabase doesn't support
			// complex joins with conditions on related tables easily
		}

		// Apply pagination
		query = query.range(offset, offset + limit - 1).order('created_at', { ascending: false });

		const { data: users, error, count } = await query;

		if (error) throw error;

		const normalizedUsers =
			users?.map((user: any) => {
				const paymentMethods =
					user.payment_methods?.map((method: any) => ({
						...method,
						last4: method.card_last4,
						brand: method.card_brand
					})) ?? [];

				const subscriptions =
					user.customer_subscriptions?.map((subscription: any) => ({
						...subscription,
						payment_methods: paymentMethods
					})) ?? [];
				const billingAccount = Array.isArray(user.billing_accounts)
					? (user.billing_accounts[0] ?? null)
					: (user.billing_accounts ?? null);

				return {
					...user,
					payment_methods: paymentMethods,
					billing_account: billingAccount,
					customer_subscriptions: subscriptions
				};
			}) ?? [];

		// Filter by subscription status if needed
		let filteredUsers: any[] = normalizedUsers;
		if (status !== 'all') {
			filteredUsers = filteredUsers.filter((user: any) => {
				const sub = user.customer_subscriptions?.[0];
				if (!sub) return status === 'none';
				return sub.status === status;
			});
		}

		return ApiResponse.success({
			users: filteredUsers,
			pagination: {
				page,
				limit,
				total: count || 0,
				totalPages: Math.ceil((count || 0) / limit)
			}
		});
	} catch (error) {
		return ApiResponse.internalError(error, 'Failed to load users');
	}
};

// Handle subscription actions (cancel, refund, etc.)
export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
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
		const { action, userId, subscriptionId, reason, discountCode } = await request.json();

		switch (action) {
			case 'cancel': {
				// Cancel subscription
				const { error: cancelError } = await supabase
					.from('customer_subscriptions')
					.update({
						status: 'canceled',
						canceled_at: new Date().toISOString(),
						cancellation_reason: reason
					})
					.eq('id', subscriptionId)
					.eq('user_id', userId);

				if (cancelError) throw cancelError;

				// Log admin action
				await supabase.from('user_activity_logs').insert({
					user_id: userId,
					activity_type: 'admin_subscription_cancel',
					activity_data: {
						admin_id: user.id,
						subscription_id: subscriptionId,
						reason
					}
				});

				break;
			}

			case 'extend_trial': {
				// Extend trial period
				const { error: extendError } = await supabase
					.from('customer_subscriptions')
					.update({
						trial_end: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
					})
					.eq('id', subscriptionId)
					.eq('user_id', userId);

				if (extendError) throw extendError;

				await supabase.from('user_activity_logs').insert({
					user_id: userId,
					activity_type: 'admin_trial_extended',
					activity_data: {
						admin_id: user.id,
						subscription_id: subscriptionId
					}
				});

				break;
			}

			case 'add_discount': {
				if (!discountCode) {
					return ApiResponse.badRequest('discountCode is required');
				}

				// Apply discount logic here
				await supabase.from('user_activity_logs').insert({
					user_id: userId,
					activity_type: 'admin_discount_applied',
					activity_data: {
						admin_id: user.id,
						subscription_id: subscriptionId,
						discount_code: discountCode
					}
				});

				break;
			}

			default:
				return ApiResponse.badRequest('Invalid action');
		}

		return ApiResponse.success(null, 'Action completed successfully');
	} catch (error) {
		return ApiResponse.internalError(error, 'Failed to perform action');
	}
};
