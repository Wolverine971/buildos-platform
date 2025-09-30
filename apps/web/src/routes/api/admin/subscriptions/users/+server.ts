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
		let query = supabase.from('users').select(
			`
				*,
				customer_subscriptions (
					*,
					subscription_plans (
						name,
						price,
						interval
					),
					payment_methods (
						type,
						last4,
						brand
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

		// Filter by subscription status if needed
		let filteredUsers = users || [];
		if (status !== 'all') {
			filteredUsers = filteredUsers.filter((user) => {
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
		const { action, userId, subscriptionId, reason } = await request.json();

		switch (action) {
			case 'cancel':
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
					user_id,
					activity_type: 'admin_subscription_cancel',
					metadata: {
						admin_id: user.id,
						subscription_id: subscriptionId,
						reason
					}
				});

				break;

			case 'extend_trial':
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
					user_id,
					activity_type: 'admin_trial_extended',
					metadata: {
						admin_id: user.id,
						subscription_id: subscriptionId
					}
				});

				break;

			case 'add_discount':
				// Add discount to user
				const { discountCode } = await request.json();

				// Apply discount logic here
				await supabase.from('user_activity_logs').insert({
					user_id,
					activity_type: 'admin_discount_applied',
					metadata: {
						admin_id: user.id,
						subscription_id: subscriptionId,
						discount_code: discountCode
					}
				});

				break;

			default:
				return ApiResponse.badRequest('Invalid action');
		}

		return ApiResponse.success(null, 'Action completed successfully');
	} catch (error) {
		return ApiResponse.internalError(error, 'Failed to perform action');
	}
};
