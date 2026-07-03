// apps/web/src/routes/api/admin/beta/members/+server.ts
import { ApiResponse } from '$lib/utils/api-response';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { parseJsonRequest } from '$lib/utils/request-validation';

const betaMemberUpdatesSchema = z
	.object({
		access_level: z.string().nullable().optional(),
		beta_tier: z.string().nullable().optional(),
		company_name: z.string().nullable().optional(),
		deactivated_at: z.string().nullable().optional(),
		deactivation_reason: z.string().nullable().optional(),
		discount_percentage: z.number().nullable().optional(),
		early_access_features: z.array(z.string()).nullable().optional(),
		email: z.string().email().optional(),
		full_name: z.string().min(1).optional(),
		has_lifetime_pricing: z.boolean().nullable().optional(),
		is_active: z.boolean().nullable().optional(),
		job_title: z.string().nullable().optional(),
		last_active_at: z.string().nullable().optional(),
		total_calls_attended: z.number().int().nullable().optional(),
		total_features_requested: z.number().int().nullable().optional(),
		total_feedback_submitted: z.number().int().nullable().optional(),
		updated_at: z.string().nullable().optional(),
		user_id: z.string().nullable().optional(),
		user_timezone: z.string().nullable().optional(),
		wants_community_access: z.boolean().nullable().optional(),
		wants_feature_updates: z.boolean().nullable().optional(),
		wants_weekly_calls: z.boolean().nullable().optional()
	})
	.strict()
	.refine((updates) => Object.keys(updates).length > 0, {
		message: 'At least one update field is required'
	});

const betaMemberPatchSchema = z
	.object({
		member_id: z.string().min(1),
		updates: betaMemberUpdatesSchema
	})
	.strict();

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();

	if (!user?.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	try {
		const page = parseInt(url.searchParams.get('page') || '1');
		const limit = parseInt(url.searchParams.get('limit') || '20');
		const tier = url.searchParams.get('tier');
		const active_only = url.searchParams.get('active_only') === 'true';
		const search = url.searchParams.get('search');
		const sortBy = url.searchParams.get('sort_by') || 'joined_at';
		const sortOrder = url.searchParams.get('sort_order') || 'desc';

		const offset = (page - 1) * limit;

		// Build query - join with beta_signups to get original responses
		let query = supabase.from('beta_members').select(
			`
			*,
			beta_signups!beta_members_signup_id_fkey (
				why_interested,
				biggest_challenge,
				productivity_tools,
				referral_source,
				wants_weekly_calls,
				wants_community_access
			)
		`,
			{ count: 'exact' }
		);

		// Apply filters
		if (tier && tier !== 'all') {
			query = query.eq('beta_tier', tier);
		}

		if (active_only) {
			query = query.eq('is_active', true);
		}

		if (search) {
			query = query.or(
				`full_name.ilike.%${search}%,email.ilike.%${search}%,company_name.ilike.%${search}%`
			);
		}

		// Apply sorting and pagination
		query = query
			.order(sortBy, { ascending: sortOrder === 'asc' })
			.range(offset, offset + limit - 1);

		const { data: members, error, count } = await query;

		if (error) throw error;

		const totalPages = Math.ceil((count || 0) / limit);

		return ApiResponse.success({
			members: members || [],
			pagination: {
				current_page: page,
				total_pages: totalPages,
				total_items: count || 0,
				items_per_page: limit
			}
		});
	} catch (error) {
		console.error('Error fetching beta members:', error);
		return ApiResponse.internalError(error, 'Failed to fetch beta members');
	}
};

export const PATCH: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();

	if (!user?.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	try {
		const parsed = await parseJsonRequest(request, betaMemberPatchSchema);
		if (!parsed.ok) return parsed.response;
		const { member_id, updates } = parsed.data;

		if (!member_id) {
			return ApiResponse.badRequest('Member ID is required');
		}

		// If deactivating member, set deactivated_at
		if (updates.is_active === false && !updates.deactivated_at) {
			updates.deactivated_at = new Date().toISOString();
		}

		// If reactivating member, clear deactivated fields
		if (updates.is_active === true) {
			updates.deactivated_at = null;
			updates.deactivation_reason = null;
		}

		const { data, error } = await supabase
			.from('beta_members')
			.update(updates)
			.eq('id', member_id)
			.select()
			.single();

		if (error) throw error;

		return ApiResponse.success({ member: data }, 'Member updated');
	} catch (error) {
		console.error('Error updating beta member:', error);
		return ApiResponse.internalError(error, 'Failed to update beta member');
	}
};
