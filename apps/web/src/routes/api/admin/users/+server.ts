// apps/web/src/routes/api/admin/users/+server.ts
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { ApiResponse } from '$lib/utils/api-response';
import { parseJsonRequest } from '$lib/utils/request-validation';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const METRIC_PAGE_SIZE = 1000;

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

const adminUserUpdatesSchema = z
	.object({
		name: z.string().trim().min(1).nullable().optional(),
		bio: z.string().nullable().optional(),
		is_admin: z.boolean().optional(),
		onboarding_completed_at: z.string().datetime().nullable().optional()
	})
	.strict();

const adminUserPatchSchema = z.object({
	userId: z.string().uuid(),
	updates: adminUserUpdatesSchema
});

type ChatSessionMetricRow = {
	id: string;
	user_id: string;
	message_count: number | null;
};

type ChatMessageMetricRow = {
	session_id: string;
	user_id: string;
};

type AgentChatSessionMetricRow = {
	id: string;
	user_id: string;
	message_count: number | null;
};

type AgentChatMessageMetricRow = {
	agent_session_id: string;
	user_id: string;
};

const fetchAllRows = async <T>(createQuery: () => any): Promise<T[]> => {
	const rows: T[] = [];

	for (let from = 0; ; from += METRIC_PAGE_SIZE) {
		const { data, error } = await createQuery().range(from, from + METRIC_PAGE_SIZE - 1);
		if (error) throw error;

		const page = (data || []) as T[];
		rows.push(...page);
		if (page.length < METRIC_PAGE_SIZE) break;
	}

	return rows;
};

export const GET: RequestHandler = async ({ url, locals: { safeGetSession } }) => {
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
		const adminSupabase = createAdminSupabaseClient();
		let query = adminSupabase.from('users').select(
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
			{ count: 'estimated' }
		);

		// Apply filters
		if (search) {
			// Sanitize search input to prevent SQL injection
			// Escape special characters: %, _, \
			const trimmedSearch = search.trim();
			if (trimmedSearch.length > 0) {
				const sanitizedSearch = trimmedSearch.replace(/[\\%_]/g, '\\$&');
				const searchFilters = [
					`email.ilike.%${sanitizedSearch}%`,
					`name.ilike.%${sanitizedSearch}%`
				];
				if (UUID_PATTERN.test(trimmedSearch)) {
					searchFilters.unshift(`id.eq.${trimmedSearch}`);
				}
				query = query.or(searchFilters.join(','));
			}
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
		const { data: actors, error: actorError } = await adminSupabase
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
			chatSessions,
			chatMessages,
			agentSessions,
			agentMessages,
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
				? adminSupabase
						.from('onto_projects')
						.select('created_by')
						.in('created_by', actorIds)
						.is('deleted_at', null)
				: Promise.resolve({ data: [], error: null }),
			adminSupabase.from('user_calendar_tokens').select('user_id').in('user_id', userIds),
			fetchAllRows<ChatSessionMetricRow>(() =>
				adminSupabase
					.from('chat_sessions')
					.select('id, user_id, message_count')
					.in('user_id', userIds)
			),
			fetchAllRows<ChatMessageMetricRow>(() =>
				adminSupabase
					.from('chat_messages')
					.select('session_id, user_id')
					.in('user_id', userIds)
			),
			fetchAllRows<AgentChatSessionMetricRow>(() =>
				adminSupabase
					.from('agent_chat_sessions')
					.select('id, user_id, message_count')
					.in('user_id', userIds)
			),
			fetchAllRows<AgentChatMessageMetricRow>(() =>
				adminSupabase
					.from('agent_chat_messages')
					.select('agent_session_id, user_id')
					.in('user_id', userIds)
			),
			adminSupabase
				.from('user_brief_preferences')
				.select('user_id, is_active')
				.in('user_id', userIds),
			adminSupabase.from('ontology_daily_briefs').select('user_id').in('user_id', userIds),
			actorIds.length
				? adminSupabase
						.from('onto_tasks')
						.select('created_by')
						.in('created_by', actorIds)
						.is('deleted_at', null)
				: Promise.resolve({ data: [], error: null }),
			actorIds.length
				? adminSupabase
						.from('onto_goals')
						.select('created_by')
						.in('created_by', actorIds)
						.is('deleted_at', null)
				: Promise.resolve({ data: [], error: null }),
			actorIds.length
				? adminSupabase
						.from('onto_plans')
						.select('created_by')
						.in('created_by', actorIds)
						.is('deleted_at', null)
				: Promise.resolve({ data: [], error: null }),
			actorIds.length
				? adminSupabase
						.from('onto_documents')
						.select('created_by')
						.in('created_by', actorIds)
						.is('deleted_at', null)
				: Promise.resolve({ data: [], error: null }),
			actorIds.length
				? adminSupabase
						.from('onto_milestones')
						.select('created_by')
						.in('created_by', actorIds)
						.is('deleted_at', null)
				: Promise.resolve({ data: [], error: null }),
			actorIds.length
				? adminSupabase
						.from('onto_risks')
						.select('created_by')
						.in('created_by', actorIds)
						.is('deleted_at', null)
				: Promise.resolve({ data: [], error: null }),
			actorIds.length
				? adminSupabase
						.from('onto_requirements')
						.select('created_by')
						.in('created_by', actorIds)
						.is('deleted_at', null)
				: Promise.resolve({ data: [], error: null }),
			adminSupabase
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

		// Chat metrics combine the current user-facing chat tables with legacy
		// agent chat tables. Message rows are authoritative when present, with
		// session.message_count kept as a fallback for older/stale records.
		const currentMessageRowsBySession = new Map<string, number>();
		for (const message of chatMessages) {
			currentMessageRowsBySession.set(
				message.session_id,
				(currentMessageRowsBySession.get(message.session_id) || 0) + 1
			);
		}

		const legacyMessageRowsBySession = new Map<string, number>();
		for (const message of agentMessages) {
			legacyMessageRowsBySession.set(
				message.agent_session_id,
				(legacyMessageRowsBySession.get(message.agent_session_id) || 0) + 1
			);
		}

		const chatSessionCountMap: Record<string, number> = {};
		const chatMessageCountMap: Record<string, number> = {};

		for (const session of chatSessions) {
			chatSessionCountMap[session.user_id] = (chatSessionCountMap[session.user_id] || 0) + 1;
			chatMessageCountMap[session.user_id] =
				(chatMessageCountMap[session.user_id] || 0) +
				Math.max(
					session.message_count || 0,
					currentMessageRowsBySession.get(session.id) || 0
				);
		}

		for (const session of agentSessions) {
			chatSessionCountMap[session.user_id] = (chatSessionCountMap[session.user_id] || 0) + 1;
			chatMessageCountMap[session.user_id] =
				(chatMessageCountMap[session.user_id] || 0) +
				Math.max(
					session.message_count || 0,
					legacyMessageRowsBySession.get(session.id) || 0
				);
		}

		const knownCurrentSessionIds = new Set(chatSessions.map((session) => session.id));
		for (const message of chatMessages) {
			if (knownCurrentSessionIds.has(message.session_id)) continue;
			chatMessageCountMap[message.user_id] = (chatMessageCountMap[message.user_id] || 0) + 1;
		}

		const knownLegacySessionIds = new Set(agentSessions.map((session) => session.id));
		for (const message of agentMessages) {
			if (knownLegacySessionIds.has(message.agent_session_id)) continue;
			chatMessageCountMap[message.user_id] = (chatMessageCountMap[message.user_id] || 0) + 1;
		}

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
				chat_session_count: chatSessionCountMap[user.id] || 0,
				chat_message_count: chatMessageCountMap[user.id] || 0,
				// Legacy aliases for older admin clients. New code should use chat_*.
				agentic_session_count: chatSessionCountMap[user.id] || 0,
				agentic_message_count: chatMessageCountMap[user.id] || 0,
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
		const parsed = await parseJsonRequest(request, adminUserPatchSchema);
		if (!parsed.ok) return parsed.response;
		const { userId, updates } = parsed.data;

		const sanitizedUpdates = updates;

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
