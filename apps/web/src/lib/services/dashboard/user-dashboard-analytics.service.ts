// apps/web/src/lib/services/dashboard/user-dashboard-analytics.service.ts
/**
 * Builds dashboard analytics payload for authenticated users.
 * Focus: project activity + recent entity updates + chat session context.
 */

import type { TypedSupabaseClient } from '@buildos/supabase-client';
import type { ChatSession, Database } from '@buildos/shared-types';
import type { ServerTiming } from '$lib/server/server-timing';
import {
	ensureActorId,
	fetchProjectSummaries,
	type OntologyProjectSummary
} from '$lib/services/ontology/ontology-projects.service';
import type {
	UserDashboardAnalytics,
	DashboardChatSessionActivity
} from '$lib/types/dashboard-analytics';
import { createEmptyUserDashboardAnalytics } from '$lib/types/dashboard-analytics';

type TaskRow = Pick<
	Database['public']['Tables']['onto_tasks']['Row'],
	'id' | 'project_id' | 'title' | 'description' | 'state_key' | 'updated_at' | 'due_at'
>;

type DocumentRow = Pick<
	Database['public']['Tables']['onto_documents']['Row'],
	'id' | 'project_id' | 'title' | 'description' | 'state_key' | 'updated_at'
>;

type GoalRow = Pick<
	Database['public']['Tables']['onto_goals']['Row'],
	'id' | 'project_id' | 'name' | 'description' | 'state_key' | 'updated_at' | 'target_date'
>;

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_LIST_LIMIT = 12;
const TERMINAL_PROJECT_STATES = new Set([
	'done',
	'completed',
	'canceled',
	'cancelled',
	'closed',
	'archived',
	'abandoned'
]);

function toNonNegativeInt(value: unknown): number {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return Math.max(0, Math.floor(value));
	}
	if (typeof value === 'string') {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) {
			return Math.max(0, Math.floor(parsed));
		}
	}
	return 0;
}

function normalizeDashboardAnalyticsPayload(raw: unknown): UserDashboardAnalytics {
	const empty = createEmptyUserDashboardAnalytics();
	const payload = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
	const snapshot =
		typeof payload.snapshot === 'object' && payload.snapshot !== null
			? (payload.snapshot as Record<string, unknown>)
			: {};
	const attention =
		typeof payload.attention === 'object' && payload.attention !== null
			? (payload.attention as Record<string, unknown>)
			: {};
	const recent =
		typeof payload.recent === 'object' && payload.recent !== null
			? (payload.recent as Record<string, unknown>)
			: {};

	const projects = Array.isArray(recent.projects)
		? (recent.projects as UserDashboardAnalytics['recent']['projects'])
		: empty.recent.projects;
	const tasks = Array.isArray(recent.tasks)
		? (recent.tasks as UserDashboardAnalytics['recent']['tasks'])
		: empty.recent.tasks;
	const documents = Array.isArray(recent.documents)
		? (recent.documents as UserDashboardAnalytics['recent']['documents'])
		: empty.recent.documents;
	const goals = Array.isArray(recent.goals)
		? (recent.goals as UserDashboardAnalytics['recent']['goals'])
		: empty.recent.goals;
	const chatSessions = Array.isArray(recent.chatSessions)
		? (recent.chatSessions as UserDashboardAnalytics['recent']['chatSessions'])
		: empty.recent.chatSessions;

	return {
		snapshot: {
			totalProjects: toNonNegativeInt(snapshot.totalProjects),
			activeProjects: toNonNegativeInt(snapshot.activeProjects),
			totalTasks: toNonNegativeInt(snapshot.totalTasks),
			totalGoals: toNonNegativeInt(snapshot.totalGoals),
			totalDocuments: toNonNegativeInt(snapshot.totalDocuments),
			tasksUpdated24h: toNonNegativeInt(snapshot.tasksUpdated24h),
			tasksUpdated7d: toNonNegativeInt(snapshot.tasksUpdated7d),
			documentsUpdated24h: toNonNegativeInt(snapshot.documentsUpdated24h),
			documentsUpdated7d: toNonNegativeInt(snapshot.documentsUpdated7d),
			goalsUpdated24h: toNonNegativeInt(snapshot.goalsUpdated24h),
			goalsUpdated7d: toNonNegativeInt(snapshot.goalsUpdated7d),
			chatSessions24h: toNonNegativeInt(snapshot.chatSessions24h),
			chatSessions7d: toNonNegativeInt(snapshot.chatSessions7d)
		},
		attention: {
			overdueTasks: toNonNegativeInt(attention.overdueTasks),
			staleProjects7d: toNonNegativeInt(attention.staleProjects7d),
			staleProjects30d: toNonNegativeInt(attention.staleProjects30d)
		},
		recent: {
			projects,
			tasks,
			documents,
			goals,
			chatSessions
		}
	};
}

function normalizeStateKey(stateKey: string | null | undefined): string {
	return (stateKey ?? '').trim().toLowerCase();
}

function isActiveProjectState(stateKey: string | null | undefined): boolean {
	const normalized = normalizeStateKey(stateKey);
	if (!normalized) return true;
	return !TERMINAL_PROJECT_STATES.has(normalized);
}

function isoDaysAgo(days: number): string {
	return new Date(Date.now() - days * DAY_MS).toISOString();
}

function safeTimeMs(timestamp: string | null | undefined): number {
	if (!timestamp) return 0;
	const ms = Date.parse(timestamp);
	return Number.isNaN(ms) ? 0 : ms;
}

function normalizeTimestamp(...timestamps: Array<string | null | undefined>): string {
	for (const timestamp of timestamps) {
		if (timestamp && !Number.isNaN(Date.parse(timestamp))) {
			return timestamp;
		}
	}
	return new Date(0).toISOString();
}

function resolveChatTitle(session: ChatSession): string {
	const title = session.title?.trim();
	if (title) return title;
	const autoTitle = session.auto_title?.trim();
	if (autoTitle) return autoTitle;
	return 'Untitled chat session';
}

function toContextLabel(
	contextType: string | null,
	entityId: string | null,
	projectById: Map<string, OntologyProjectSummary>
): {
	contextLabel: string;
	projectId: string | null;
	projectName: string | null;
} {
	const normalized = (contextType ?? 'global').toLowerCase();
	const project = entityId ? projectById.get(entityId) : undefined;
	const projectName = project?.name ?? null;
	const projectId = project?.id ?? null;

	if (normalized === 'project' || normalized.startsWith('project_')) {
		if (projectName) {
			return {
				contextLabel: `Chat session about project: ${projectName}`,
				projectId,
				projectName
			};
		}

		if (normalized === 'project_create') {
			return {
				contextLabel: 'Chat session about creating a project',
				projectId: null,
				projectName: null
			};
		}

		return {
			contextLabel: 'Chat session about a project',
			projectId: null,
			projectName: null
		};
	}

	const contextLabels: Record<string, string> = {
		global: 'Chat session in global context',
		general: 'Chat session in assistant context',
		calendar: 'Chat session about calendar',
		brain_dump: 'Chat session about brain dump',
		ontology: 'Chat session about ontology',
		daily_brief_update: 'Chat session about daily brief updates'
	};

	return {
		contextLabel:
			contextLabels[normalized] ?? `Chat session in ${normalized.replace(/_/g, ' ')}`,
		projectId: null,
		projectName: null
	};
}

function toChatActivity(
	sessions: ChatSession[],
	projectById: Map<string, OntologyProjectSummary>
): DashboardChatSessionActivity[] {
	return sessions.map((session) => {
		const { contextLabel, projectId, projectName } = toContextLabel(
			session.context_type,
			session.entity_id,
			projectById
		);

		return {
			id: session.id,
			title: resolveChatTitle(session),
			summary: session.summary,
			status: session.status,
			context_type: session.context_type,
			entity_id: session.entity_id,
			context_label: contextLabel,
			project_id: projectId,
			project_name: projectName,
			message_count: session.message_count ?? 0,
			last_activity_at: normalizeTimestamp(
				session.last_message_at,
				session.updated_at,
				session.created_at
			)
		};
	});
}

async function countUpdatedRows(
	client: TypedSupabaseClient,
	table: 'onto_tasks' | 'onto_documents' | 'onto_goals',
	projectIds: string[],
	sinceIso: string
): Promise<number> {
	if (projectIds.length === 0) return 0;

	const { count, error } = await client
		.from(table)
		.select('id', { count: 'exact', head: true })
		.in('project_id', projectIds)
		.is('deleted_at', null)
		.gte('updated_at', sinceIso);

	if (error) {
		console.error(`[Dashboard Analytics] Failed to count ${table} updates:`, error);
		return 0;
	}

	return count ?? 0;
}

async function countRecentChatSessions(
	client: TypedSupabaseClient,
	userId: string,
	sinceIso: string
): Promise<number> {
	const { count, error } = await client
		.from('chat_sessions')
		.select('id', { count: 'exact', head: true })
		.eq('user_id', userId)
		.neq('status', 'archived')
		.gte('message_count', 1)
		.or(
			`last_message_at.gte.${sinceIso},updated_at.gte.${sinceIso},created_at.gte.${sinceIso}`
		);

	if (error) {
		console.error('[Dashboard Analytics] Failed to count recent chat sessions:', error);
		return 0;
	}

	return count ?? 0;
}

async function fetchRecentChatSessions(
	client: TypedSupabaseClient,
	userId: string,
	limit: number
): Promise<ChatSession[]> {
	const { data, error } = await client
		.from('chat_sessions')
		.select(
			'id, title, auto_title, summary, status, context_type, entity_id, message_count, created_at, updated_at, last_message_at'
		)
		.eq('user_id', userId)
		.neq('status', 'archived')
		.gte('message_count', 1)
		.order('last_message_at', { ascending: false, nullsFirst: false })
		.order('updated_at', { ascending: false, nullsFirst: false })
		.order('created_at', { ascending: false, nullsFirst: false })
		.limit(limit);

	if (error) {
		console.error('[Dashboard Analytics] Failed to fetch recent chat sessions:', error);
		return [];
	}

	return (data ?? []) as ChatSession[];
}

export async function getUserDashboardAnalytics(
	client: TypedSupabaseClient,
	userId: string,
	timing?: ServerTiming
): Promise<UserDashboardAnalytics> {
	const measure = <T>(name: string, fn: () => Promise<T> | T) =>
		timing ? timing.measure(name, fn) : fn();

	const payload = createEmptyUserDashboardAnalytics();

	try {
		const actorId = await measure('dashboard.db.ensure_actor', () =>
			ensureActorId(client, userId)
		);
		const { data: rpcPayload, error: rpcError } = await measure(
			'dashboard.db.analytics_rpc',
			() =>
				client.rpc('get_user_dashboard_analytics_v1', {
					p_actor_id: actorId,
					p_user_id: userId,
					p_recent_limit: RECENT_LIST_LIMIT
				})
		);

		if (!rpcError && rpcPayload) {
			return normalizeDashboardAnalyticsPayload(rpcPayload);
		}

		if (rpcError) {
			console.warn(
				'[Dashboard Analytics] Falling back to legacy analytics query path:',
				rpcError
			);
		}

		const projectSummaries = await measure('dashboard.db.projects.summary', () =>
			fetchProjectSummaries(client, actorId, timing)
		);
		const projectById = new Map(projectSummaries.map((project) => [project.id, project]));
		const projectIds = projectSummaries.map((project) => project.id);
		const nowMs = Date.now();

		payload.snapshot.totalProjects = projectSummaries.length;
		payload.snapshot.activeProjects = projectSummaries.filter((project) =>
			isActiveProjectState(project.state_key)
		).length;
		payload.snapshot.totalTasks = projectSummaries.reduce(
			(sum, project) => sum + (project.task_count ?? 0),
			0
		);
		payload.snapshot.totalGoals = projectSummaries.reduce(
			(sum, project) => sum + (project.goal_count ?? 0),
			0
		);
		payload.snapshot.totalDocuments = projectSummaries.reduce(
			(sum, project) => sum + (project.document_count ?? 0),
			0
		);

		payload.attention.staleProjects7d = projectSummaries.filter((project) => {
			const updatedAtMs = safeTimeMs(project.updated_at);
			return updatedAtMs > 0 && nowMs - updatedAtMs >= 7 * DAY_MS;
		}).length;
		payload.attention.staleProjects30d = projectSummaries.filter((project) => {
			const updatedAtMs = safeTimeMs(project.updated_at);
			return updatedAtMs > 0 && nowMs - updatedAtMs >= 30 * DAY_MS;
		}).length;

		payload.recent.projects = [...projectSummaries]
			.sort((a, b) => safeTimeMs(b.updated_at) - safeTimeMs(a.updated_at))
			.slice(0, RECENT_LIST_LIMIT)
			.map((project) => ({
				id: project.id,
				name: project.name,
				description: project.description,
				state_key: project.state_key,
				is_shared: project.is_shared,
				updated_at: project.updated_at,
				task_count: project.task_count,
				goal_count: project.goal_count,
				document_count: project.document_count
			}));

		const since24h = isoDaysAgo(1);
		const since7d = isoDaysAgo(7);
		const nowIso = new Date().toISOString();

		const [
			tasksUpdated24h,
			tasksUpdated7d,
			documentsUpdated24h,
			documentsUpdated7d,
			goalsUpdated24h,
			goalsUpdated7d,
			chatSessions24h,
			chatSessions7d,
			overdueTasksCount,
			recentTasksResult,
			recentDocumentsResult,
			recentGoalsResult,
			recentChatSessions
		] = await Promise.all([
			measure('dashboard.db.tasks.updated_24h', () =>
				countUpdatedRows(client, 'onto_tasks', projectIds, since24h)
			),
			measure('dashboard.db.tasks.updated_7d', () =>
				countUpdatedRows(client, 'onto_tasks', projectIds, since7d)
			),
			measure('dashboard.db.documents.updated_24h', () =>
				countUpdatedRows(client, 'onto_documents', projectIds, since24h)
			),
			measure('dashboard.db.documents.updated_7d', () =>
				countUpdatedRows(client, 'onto_documents', projectIds, since7d)
			),
			measure('dashboard.db.goals.updated_24h', () =>
				countUpdatedRows(client, 'onto_goals', projectIds, since24h)
			),
			measure('dashboard.db.goals.updated_7d', () =>
				countUpdatedRows(client, 'onto_goals', projectIds, since7d)
			),
			measure('dashboard.db.chat_sessions.updated_24h', () =>
				countRecentChatSessions(client, userId, since24h)
			),
			measure('dashboard.db.chat_sessions.updated_7d', () =>
				countRecentChatSessions(client, userId, since7d)
			),
			measure('dashboard.db.tasks.overdue', async () => {
				if (projectIds.length === 0) return 0;
				const { count, error } = await client
					.from('onto_tasks')
					.select('id', { count: 'exact', head: true })
					.in('project_id', projectIds)
					.is('deleted_at', null)
					.lt('due_at', nowIso)
					.not('state_key', 'in', '(done,completed,canceled,cancelled,archived)');

				if (error) {
					console.error('[Dashboard Analytics] Failed to count overdue tasks:', error);
					return 0;
				}

				return count ?? 0;
			}),
			measure('dashboard.db.tasks.recent', async () => {
				if (projectIds.length === 0) return [] as TaskRow[];
				const { data, error } = await client
					.from('onto_tasks')
					.select('id, project_id, title, description, state_key, due_at, updated_at')
					.in('project_id', projectIds)
					.is('deleted_at', null)
					.order('updated_at', { ascending: false })
					.limit(RECENT_LIST_LIMIT);

				if (error) {
					console.error('[Dashboard Analytics] Failed to fetch recent tasks:', error);
					return [] as TaskRow[];
				}

				return (data ?? []) as TaskRow[];
			}),
			measure('dashboard.db.documents.recent', async () => {
				if (projectIds.length === 0) return [] as DocumentRow[];
				const { data, error } = await client
					.from('onto_documents')
					.select('id, project_id, title, description, state_key, updated_at')
					.in('project_id', projectIds)
					.is('deleted_at', null)
					.order('updated_at', { ascending: false })
					.limit(RECENT_LIST_LIMIT);

				if (error) {
					console.error('[Dashboard Analytics] Failed to fetch recent documents:', error);
					return [] as DocumentRow[];
				}

				return (data ?? []) as DocumentRow[];
			}),
			measure('dashboard.db.goals.recent', async () => {
				if (projectIds.length === 0) return [] as GoalRow[];
				const { data, error } = await client
					.from('onto_goals')
					.select('id, project_id, name, description, state_key, target_date, updated_at')
					.in('project_id', projectIds)
					.is('deleted_at', null)
					.order('updated_at', { ascending: false, nullsFirst: false })
					.limit(RECENT_LIST_LIMIT);

				if (error) {
					console.error('[Dashboard Analytics] Failed to fetch recent goals:', error);
					return [] as GoalRow[];
				}

				return (data ?? []) as GoalRow[];
			}),
			measure('dashboard.db.chat_sessions.recent', () =>
				fetchRecentChatSessions(client, userId, RECENT_LIST_LIMIT)
			)
		]);

		payload.snapshot.tasksUpdated24h = tasksUpdated24h;
		payload.snapshot.tasksUpdated7d = tasksUpdated7d;
		payload.snapshot.documentsUpdated24h = documentsUpdated24h;
		payload.snapshot.documentsUpdated7d = documentsUpdated7d;
		payload.snapshot.goalsUpdated24h = goalsUpdated24h;
		payload.snapshot.goalsUpdated7d = goalsUpdated7d;
		payload.snapshot.chatSessions24h = chatSessions24h;
		payload.snapshot.chatSessions7d = chatSessions7d;
		payload.attention.overdueTasks = overdueTasksCount;

		payload.recent.tasks = recentTasksResult.map((task) => ({
			id: task.id,
			project_id: task.project_id,
			project_name: projectById.get(task.project_id)?.name ?? 'Unknown project',
			title: task.title,
			description: task.description,
			state_key: task.state_key,
			due_at: task.due_at,
			updated_at: task.updated_at
		}));

		payload.recent.documents = recentDocumentsResult.map((document) => ({
			id: document.id,
			project_id: document.project_id,
			project_name: projectById.get(document.project_id)?.name ?? 'Unknown project',
			title: document.title,
			description: document.description,
			state_key: document.state_key,
			updated_at: document.updated_at
		}));

		payload.recent.goals = recentGoalsResult.map((goal) => ({
			id: goal.id,
			project_id: goal.project_id,
			project_name: projectById.get(goal.project_id)?.name ?? 'Unknown project',
			name: goal.name,
			description: goal.description,
			state_key: goal.state_key,
			target_date: goal.target_date,
			updated_at: goal.updated_at ?? new Date(0).toISOString()
		}));

		payload.recent.chatSessions = toChatActivity(recentChatSessions, projectById);

		return payload;
	} catch (error) {
		console.error('[Dashboard Analytics] Failed to build user analytics payload:', error);
		return payload;
	}
}
