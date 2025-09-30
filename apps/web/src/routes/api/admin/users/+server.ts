// src/routes/api/admin/users/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse, validateRequiredFields } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	if (!user?.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	const page = parseInt(url.searchParams.get('page') || '1');
	const limit = parseInt(url.searchParams.get('limit') || '50');
	const search = url.searchParams.get('search');
	const adminFilter = url.searchParams.get('admin_filter');
	const onboardingFilter = url.searchParams.get('onboarding_filter');
	const sortBy = url.searchParams.get('sort_by') || 'last_visit';
	const sortOrder = url.searchParams.get('sort_order') || 'desc';

	const offset = (page - 1) * limit;

	try {
		let query = supabase.from('users').select(
			`
                id,
                email,
                name,
                is_admin,
                created_at,
                updated_at,
                bio,
                completed_onboarding,
                last_visit
            `,
			{ count: 'exact' }
		);

		// Apply filters
		if (search) {
			// Sanitize search input to prevent SQL injection
			// Escape special characters: %, _, \
			const sanitizedSearch = search.replace(/[\\%_]/g, '\\$&');
			query = query.or(`email.ilike.%${sanitizedSearch}%,name.ilike.%${sanitizedSearch}%`);
		}

		if (adminFilter === 'admin') {
			query = query.eq('is_admin', true);
		} else if (adminFilter === 'regular') {
			query = query.eq('is_admin', false);
		}

		if (onboardingFilter === 'completed') {
			query = query.eq('completed_onboarding', true);
		} else if (onboardingFilter === 'pending') {
			query = query.eq('completed_onboarding', false);
		}

		// Apply sorting - default to last_visit
		const ascending = sortOrder === 'asc';
		if (sortBy === 'last_visit') {
			// Sort null values last when descending, first when ascending
			query = query.order('last_visit', { ascending, nullsFirst: ascending });
		} else {
			query = query.order(sortBy, { ascending });
		}

		const { data: users, error, count } = await query.range(offset, offset + limit - 1);

		if (error) throw error;

		// Get additional metrics for each user
		const userIds = users?.map((u) => u.id) || [];

		// Get all metrics in parallel for better performance
		const [
			{ data: brainDumpCounts },
			{ data: briefCounts },
			{ data: projectCounts },
			{ data: calendarTokens },
			{ data: phaseGenerations }
		] = await Promise.all([
			supabase.from('brain_dumps').select('user_id').in('user_id', userIds),
			supabase.from('daily_briefs').select('user_id').in('user_id', userIds),
			supabase.from('projects').select('user_id').in('user_id', userIds),
			supabase.from('user_calendar_tokens').select('user_id').in('user_id', userIds),
			supabase.from('phases').select('user_id').in('user_id', userIds)
		]);

		// Create count maps
		const brainDumpCountMap =
			brainDumpCounts?.reduce(
				(acc, dump) => {
					acc[dump.user_id] = (acc[dump.user_id] || 0) + 1;
					return acc;
				},
				{} as Record<string, number>
			) || {};

		const briefCountMap =
			briefCounts?.reduce(
				(acc, brief) => {
					acc[brief.user_id] = (acc[brief.user_id] || 0) + 1;
					return acc;
				},
				{} as Record<string, number>
			) || {};

		const projectCountMap =
			projectCounts?.reduce(
				(acc, project) => {
					acc[project.user_id] = (acc[project.user_id] || 0) + 1;
					return acc;
				},
				{} as Record<string, number>
			) || {};

		// Create calendar connection map
		const calendarConnectedMap =
			calendarTokens?.reduce(
				(acc, token) => {
					acc[token.user_id] = true;
					return acc;
				},
				{} as Record<string, boolean>
			) || {};

		// Create phase generation map
		const hasGeneratedPhasesMap =
			phaseGenerations?.reduce(
				(acc, generation) => {
					acc[generation.user_id] = true;
					return acc;
				},
				{} as Record<string, boolean>
			) || {};

		// Enrich user data
		const enrichedUsers = users?.map((user) => ({
			...user,
			brain_dump_count: brainDumpCountMap[user.id] || 0,
			brief_count: briefCountMap[user.id] || 0,
			project_count: projectCountMap[user.id] || 0,
			calendar_connected: calendarConnectedMap[user.id] || false,
			has_generated_phases: hasGeneratedPhasesMap[user.id] || false
		}));

		return ApiResponse.success({
			users: enrichedUsers,
			pagination: {
				page,
				limit,
				total: count || 0,
				totalPages: Math.ceil((count || 0) / limit)
			}
		});
	} catch (error) {
		return ApiResponse.internalError(error, 'Failed to fetch users');
	}
};

export const PATCH: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	if (!user?.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	try {
		const { userId, updates } = await request.json();

		if (!userId) {
			return ApiResponse.badRequest('User ID is required');
		}

		// Whitelist allowed fields to prevent privilege escalation
		const ALLOWED_FIELDS = ['name', 'bio', 'is_admin', 'completed_onboarding'];
		const sanitizedUpdates = Object.keys(updates)
			.filter((key) => ALLOWED_FIELDS.includes(key))
			.reduce((obj, key) => ({ ...obj, [key]: updates[key] }), {});

		// Ensure we have at least one field to update
		if (Object.keys(sanitizedUpdates).length === 0) {
			return ApiResponse.badRequest('No valid fields to update');
		}

		const { data, error } = await supabase
			.from('users')
			.update(sanitizedUpdates)
			.eq('id', userId)
			.select()
			.single();

		if (error) throw error;

		// Update admin_users table if is_admin field was modified
		if ('is_admin' in sanitizedUpdates) {
			if (sanitizedUpdates.is_admin) {
				const { error: insertAdminUserError } = await supabase.from('admin_users').insert({
					user_id: userId,
					granted_by: user.id
				});

				if (insertAdminUserError) {
					if (insertAdminUserError) throw insertAdminUserError;
				}
			} else {
				const { error: deleteAdminUserError } = await supabase
					.from('admin_users')
					.delete()
					.eq('user_id', userId);

				if (deleteAdminUserError) {
					if (deleteAdminUserError) throw deleteAdminUserError;
				}
			}
		}

		return ApiResponse.success({ user: data }, 'User updated successfully');
	} catch (error) {
		return ApiResponse.internalError(error, 'Failed to update user');
	}
};
