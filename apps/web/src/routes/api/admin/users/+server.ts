// apps/web/src/routes/api/admin/users/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

type OntologyCounts = {
	tasks: number;
	goals: number;
	plans: number;
	documents: number;
	milestones: number;
	risks: number;
	requirements: number;
};

const EMPTY_ONTOLOGY_COUNTS: OntologyCounts = {
	tasks: 0,
	goals: 0,
	plans: 0,
	documents: 0,
	milestones: 0,
	risks: 0,
	requirements: 0
};

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
                onboarding_completed_at,
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
			query = query.not('onboarding_completed_at', 'is', null);
		} else if (onboardingFilter === 'pending') {
			query = query.is('onboarding_completed_at', null);
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

		if (!users || users.length === 0) {
			return ApiResponse.success({
				users: [],
				pagination: {
					page,
					limit,
					total: count || 0,
					totalPages: Math.ceil((count || 0) / limit)
				}
			});
		}

		// Get additional metrics for each user
		const userIds = users?.map((u) => u.id) || [];

		// Resolve ontology actors for these users (needed because ontology tables use actor ids)
		const { data: actors, error: actorError } = await supabase
			.from('onto_actors')
			.select('id, user_id')
			.in('user_id', userIds);

		if (actorError) throw actorError;

		const actorIds = actors?.map((a) => a.id).filter(Boolean) || [];
		const userIdByActor =
			actors?.reduce(
				(acc, row) => {
					if (row.id && row.user_id) acc[row.id] = row.user_id;
					return acc;
				},
				{} as Record<string, string>
			) || {};

		// Get all metrics in parallel for better performance
		const [
			{ data: projectCounts },
			{ data: calendarTokens },
			{ data: agentSessions },
			{ data: userBriefPrefs },
			{ data: dailyBriefs },
			{ data: ontoTasks },
			{ data: ontoGoals },
			{ data: ontoPlans },
			{ data: ontoDocuments },
			{ data: ontoMilestones },
			{ data: ontoRisks },
			{ data: ontoRequirements },
			{ data: smsPreferences }
		] = await Promise.all([
			actorIds.length
				? supabase
						.from('onto_projects')
						.select('created_by')
						.in('created_by', actorIds)
						.is('deleted_at', null)
				: Promise.resolve({ data: [], error: null }),
			supabase.from('user_calendar_tokens').select('user_id').in('user_id', userIds),
			supabase
				.from('agent_chat_sessions')
				.select('user_id, message_count')
				.in('user_id', userIds),
			supabase
				.from('user_brief_preferences')
				.select('user_id, is_active')
				.in('user_id', userIds),
			supabase.from('ontology_daily_briefs').select('user_id').in('user_id', userIds),
			actorIds.length
				? supabase
						.from('onto_tasks')
						.select('created_by')
						.in('created_by', actorIds)
						.is('deleted_at', null)
				: Promise.resolve({ data: [], error: null }),
			actorIds.length
				? supabase
						.from('onto_goals')
						.select('created_by')
						.in('created_by', actorIds)
						.is('deleted_at', null)
				: Promise.resolve({ data: [], error: null }),
			actorIds.length
				? supabase
						.from('onto_plans')
						.select('created_by')
						.in('created_by', actorIds)
						.is('deleted_at', null)
				: Promise.resolve({ data: [], error: null }),
			actorIds.length
				? supabase
						.from('onto_documents')
						.select('created_by')
						.in('created_by', actorIds)
						.is('deleted_at', null)
				: Promise.resolve({ data: [], error: null }),
			actorIds.length
				? supabase
						.from('onto_milestones')
						.select('created_by')
						.in('created_by', actorIds)
						.is('deleted_at', null)
				: Promise.resolve({ data: [], error: null }),
			actorIds.length
				? supabase
						.from('onto_risks')
						.select('created_by')
						.in('created_by', actorIds)
						.is('deleted_at', null)
				: Promise.resolve({ data: [], error: null }),
			actorIds.length
				? supabase
						.from('onto_requirements')
						.select('created_by')
						.in('created_by', actorIds)
						.is('deleted_at', null)
				: Promise.resolve({ data: [], error: null }),
			supabase
				.from('user_sms_preferences')
				.select(
					'user_id, daily_sms_count, daily_sms_limit, event_reminders_enabled, phone_verified'
				)
				.in('user_id', userIds)
		]);

		// Create count maps
		const projectCountMap =
			projectCounts?.reduce(
				(acc, project) => {
					const uid = userIdByActor[project.created_by];
					if (!uid) return acc;
					acc[uid] = (acc[uid] || 0) + 1;
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

		// Agentic chat/session metrics
		const agenticSessionCountMap =
			agentSessions?.reduce(
				(acc, session) => {
					acc[session.user_id] = (acc[session.user_id] || 0) + 1;
					return acc;
				},
				{} as Record<string, number>
			) || {};

		const agenticMessageCountMap =
			agentSessions?.reduce(
				(acc, session) => {
					acc[session.user_id] =
						(acc[session.user_id] || 0) + (session.message_count || 0);
					return acc;
				},
				{} as Record<string, number>
			) || {};

		// Daily brief preferences and counts
		const dailyBriefPreferenceMap =
			userBriefPrefs?.reduce(
				(acc, pref) => {
					const isOptedIn = Boolean(pref.is_active);
					acc[pref.user_id] = acc[pref.user_id] || isOptedIn;
					return acc;
				},
				{} as Record<string, boolean>
			) || {};

		const dailyBriefCountMap =
			dailyBriefs?.reduce(
				(acc, brief) => {
					acc[brief.user_id] = (acc[brief.user_id] || 0) + 1;
					return acc;
				},
				{} as Record<string, number>
			) || {};

		// Ontology entity counts
		const ontologyCountsMap: Record<string, OntologyCounts> = {};
		const bump = (actorId: string, key: keyof OntologyCounts) => {
			const userId = userIdByActor[actorId];
			if (!userId) return;
			if (!ontologyCountsMap[userId]) {
				ontologyCountsMap[userId] = { ...EMPTY_ONTOLOGY_COUNTS };
			}
			ontologyCountsMap[userId][key] = (ontologyCountsMap[userId][key] || 0) + 1;
		};

		ontoTasks?.forEach((row) => bump(row.created_by, 'tasks'));
		ontoGoals?.forEach((row) => bump(row.created_by, 'goals'));
		ontoPlans?.forEach((row) => bump(row.created_by, 'plans'));
		ontoDocuments?.forEach((row) => bump(row.created_by, 'documents'));
		ontoMilestones?.forEach((row) => bump(row.created_by, 'milestones'));
		ontoRisks?.forEach((row) => bump(row.created_by, 'risks'));
		ontoRequirements?.forEach((row) => bump(row.created_by, 'requirements'));

		// Create SMS preferences map
		const smsPreferencesMap =
			smsPreferences?.reduce(
				(acc, pref) => {
					acc[pref.user_id] = {
						daily_sms_count: pref.daily_sms_count || 0,
						daily_sms_limit: pref.daily_sms_limit || 10,
						event_reminders_enabled: pref.event_reminders_enabled || false,
						phone_verified: pref.phone_verified || false
					};
					return acc;
				},
				{} as Record<
					string,
					{
						daily_sms_count: number;
						daily_sms_limit: number;
						event_reminders_enabled: boolean;
						phone_verified: boolean;
					}
				>
			) || {};

		// Enrich user data
		const enrichedUsers = users?.map((user) => {
			const ontologyCounts = ontologyCountsMap[user.id]
				? { ...ontologyCountsMap[user.id] }
				: { ...EMPTY_ONTOLOGY_COUNTS };

			const ontologyEntityTotal = Object.values(ontologyCounts).reduce(
				(total, value) => total + value,
				0
			);

			return {
				...user,
				project_count: projectCountMap[user.id] || 0,
				calendar_connected: calendarConnectedMap[user.id] || false,
				agentic_session_count: agenticSessionCountMap[user.id] || 0,
				agentic_message_count: agenticMessageCountMap[user.id] || 0,
				daily_brief_opt_in: dailyBriefPreferenceMap[user.id] || false,
				daily_brief_count: dailyBriefCountMap[user.id] || 0,
				ontology_counts: ontologyCounts,
				ontology_entity_total: ontologyEntityTotal,
				sms_preferences: smsPreferencesMap[user.id] || null
			};
		});

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
		const ALLOWED_FIELDS = ['name', 'bio', 'is_admin', 'onboarding_completed_at'];
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
