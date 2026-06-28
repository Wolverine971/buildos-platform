// apps/web/src/routes/api/admin/users/[userId]/activity/+server.ts
//
// Admin endpoint: Retrieve comprehensive user activity data.
//
// This payload powers the `/admin/users` activity modal, so it keeps the
// project drill-down, BuildOS chat sessions, and user-specific error logs in
// one server response.

import type { RequestHandler } from './$types';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { ApiResponse } from '$lib/utils/api-response';

type ProjectTaskRow = {
	id: string;
	project_id: string;
	title: string;
	state_key: string | null;
	created_at: string;
	updated_at: string;
	due_at: string | null;
	completed_at: string | null;
};

type ProjectDocumentRow = {
	id: string;
	project_id: string;
	title: string;
	type_key: string;
	state_key: string | null;
	created_at: string;
	updated_at: string;
};

type ProjectLogRow = {
	project_id: string | null;
	entity_id: string;
	entity_type: string;
	action: string;
	before_data: unknown | null;
	after_data: unknown | null;
	created_at: string;
};

type ChatSessionRow = {
	id: string;
	title: string | null;
	auto_title: string | null;
	summary: string | null;
	status: string | null;
	context_type: string | null;
	entity_id: string | null;
	message_count: number | null;
	tool_call_count: number | null;
	total_tokens_used: number | null;
	created_at: string | null;
	updated_at: string | null;
	last_message_at: string | null;
};

const asTime = (value: string | null | undefined): number => {
	if (!value) return 0;
	const parsed = new Date(value).getTime();
	return Number.isFinite(parsed) ? parsed : 0;
};

const sortByTimestampDesc = <T>(
	items: T[],
	getTimestamp: (item: T) => string | null | undefined
): T[] => [...items].sort((a, b) => asTime(getTimestamp(b)) - asTime(getTimestamp(a)));

const buildChatSessionTitle = (session: ChatSessionRow): string => {
	const explicitTitle = session.title?.trim() || session.auto_title?.trim();
	if (explicitTitle) return explicitTitle;
	if (session.summary?.trim()) return session.summary.trim().slice(0, 120);
	const contextType = (session.context_type ?? 'global').replaceAll('_', ' ');
	return `BuildOS Chat (${contextType})`;
};

const getChatSessionLastActivityAt = (session: ChatSessionRow): string | null =>
	session.last_message_at ?? session.updated_at ?? session.created_at ?? null;

const ACTIVITY_LABEL_FIELDS = [
	'title',
	'name',
	'rel',
	'text',
	'uri',
	'description',
	'summary',
	'event_title'
] as const;

const ACTIVITY_DETAIL_FIELDS = [
	'description',
	'state_key',
	'type_key',
	'impact',
	'status',
	'text',
	'uri'
] as const;

const ENTITY_LOOKUP_CONFIG: Record<
	string,
	{
		table: string;
		select: string;
		labelFields: readonly string[];
	}
> = {
	project: { table: 'onto_projects', select: 'id, name', labelFields: ['name'] },
	task: { table: 'onto_tasks', select: 'id, title, project_id', labelFields: ['title'] },
	document: {
		table: 'onto_documents',
		select: 'id, title, project_id',
		labelFields: ['title']
	},
	note: { table: 'onto_documents', select: 'id, title, project_id', labelFields: ['title'] },
	goal: { table: 'onto_goals', select: 'id, name, project_id', labelFields: ['name'] },
	milestone: {
		table: 'onto_milestones',
		select: 'id, title, project_id',
		labelFields: ['title']
	},
	risk: { table: 'onto_risks', select: 'id, title, project_id', labelFields: ['title'] },
	plan: { table: 'onto_plans', select: 'id, name, project_id', labelFields: ['name'] },
	event: { table: 'onto_events', select: 'id, title, project_id', labelFields: ['title'] },
	requirement: {
		table: 'onto_requirements',
		select: 'id, text, project_id',
		labelFields: ['text']
	},
	metric: { table: 'onto_metrics', select: 'id, name, project_id', labelFields: ['name'] },
	source: { table: 'onto_sources', select: 'id, uri, project_id', labelFields: ['uri'] },
	edge: { table: 'onto_edges', select: 'id, rel, project_id', labelFields: ['rel'] }
};

const normalizeDisplayText = (value: unknown): string | null => {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	const lower = trimmed.toLowerCase();
	if (lower === 'undefined' || lower === 'null' || lower === '[object object]') return null;
	return trimmed;
};

const isPlaceholderDisplayText = (value: string | null | undefined): boolean => {
	if (!value) return true;
	const normalized = value.trim().toLowerCase();
	return (
		normalized === 'untitled' ||
		normalized === 'untitled project' ||
		normalized === 'untitled task' ||
		normalized === 'untitled goal' ||
		normalized === 'untitled document'
	);
};

const chooseDisplayText = (candidates: Array<string | null | undefined>): string => {
	const normalized = candidates
		.map(normalizeDisplayText)
		.filter((value): value is string => Boolean(value));
	return (
		normalized.find((value) => !isPlaceholderDisplayText(value)) ?? normalized[0] ?? 'Untitled'
	);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const firstDisplayText = (
	record: Record<string, unknown> | null | undefined,
	fields: readonly string[]
): string | null => {
	if (!record) return null;
	for (const field of fields) {
		const value = normalizeDisplayText(record[field]);
		if (value) return value;
	}
	return null;
};

const getPayloadCandidates = (payload: unknown): Record<string, unknown>[] => {
	if (!isRecord(payload)) return [];
	const candidates: Record<string, unknown>[] = [payload];
	const nestedKeys = [
		'entity',
		'data',
		'record',
		'row',
		'new',
		'old',
		'payload',
		'result',
		'project',
		'task',
		'document',
		'note',
		'goal',
		'milestone',
		'risk',
		'plan',
		'event',
		'requirement',
		'source',
		'edge'
	];

	for (const key of nestedKeys) {
		const nested = payload[key];
		if (isRecord(nested)) {
			candidates.push(nested);
		}
	}

	return candidates;
};

const getLogPayloadText = (log: ProjectLogRow, fields: readonly string[]): string | null => {
	const payloads = [log.after_data, log.before_data];
	for (const payload of payloads) {
		for (const candidate of getPayloadCandidates(payload)) {
			const value = firstDisplayText(candidate, fields);
			if (value) return value;
		}
	}
	return null;
};

const getEntityKey = (entityType: string, entityId: string | null | undefined): string | null =>
	entityId ? `${entityType}:${entityId}` : null;

const setEntityLabel = (
	entityLabelByKey: Map<string, string>,
	entityType: string,
	entityId: string | null | undefined,
	label: unknown
): void => {
	const key = getEntityKey(entityType, entityId);
	const normalized = normalizeDisplayText(label);
	if (!key || !normalized) return;
	const existing = entityLabelByKey.get(key);
	if (existing && !isPlaceholderDisplayText(existing) && isPlaceholderDisplayText(normalized)) {
		return;
	}
	if (existing && !isPlaceholderDisplayText(existing) && !isPlaceholderDisplayText(normalized)) {
		return;
	}
	entityLabelByKey.set(key, normalized);
};

const hydrateActivityEntityLabels = async ({
	supabase,
	projectIds,
	projectLogs,
	entityLabelByKey
}: {
	supabase: any;
	projectIds: string[];
	projectLogs: ProjectLogRow[];
	entityLabelByKey: Map<string, string>;
}): Promise<void> => {
	if (projectLogs.length === 0) return;

	const idsByType = new Map<string, Set<string>>();
	for (const log of projectLogs) {
		const key = getEntityKey(log.entity_type, log.entity_id);
		const existing = key ? entityLabelByKey.get(key) : null;
		if (!key || (existing && !isPlaceholderDisplayText(existing))) continue;

		const ids = idsByType.get(log.entity_type) ?? new Set<string>();
		ids.add(log.entity_id);
		idsByType.set(log.entity_type, ids);
	}

	await Promise.all(
		Array.from(idsByType.entries()).map(async ([entityType, ids]) => {
			const config = ENTITY_LOOKUP_CONFIG[entityType];
			if (!config || ids.size === 0) return;

			let query = supabase.from(config.table).select(config.select).in('id', Array.from(ids));
			if (projectIds.length > 0 && config.table !== 'onto_projects') {
				query = query.in('project_id', projectIds);
			}

			const { data, error } = await query;
			if (error) {
				console.warn('[AdminUserActivity] Failed to hydrate entity labels:', {
					entityType,
					error
				});
				return;
			}

			for (const row of data || []) {
				if (!isRecord(row)) continue;
				setEntityLabel(
					entityLabelByKey,
					entityType,
					normalizeDisplayText(row.id),
					firstDisplayText(row, config.labelFields)
				);
			}
		})
	);
};

const getProjectLogDetails = (
	log: ProjectLogRow,
	entityLabelByKey: Map<string, string>
): {
	objectName: string;
	details: string | null;
} => {
	const entityKey = getEntityKey(log.entity_type, log.entity_id);
	const projectEntityKey =
		log.entity_type === 'project' && log.project_id
			? getEntityKey('project', log.project_id)
			: null;
	const objectName = chooseDisplayText([
		entityKey ? entityLabelByKey.get(entityKey) : null,
		projectEntityKey ? entityLabelByKey.get(projectEntityKey) : null,
		getLogPayloadText(log, ACTIVITY_LABEL_FIELDS)
	]);
	const details = getLogPayloadText(log, ACTIVITY_DETAIL_FIELDS);

	return { objectName, details };
};

const truncate = (value: string | null | undefined, limit: number): string | null => {
	if (!value) return null;
	if (value.length <= limit) return value;
	return `${value.slice(0, limit).trim()}...`;
};

export const GET: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	if (!user.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	const { userId } = params;

	try {
		const adminSupabase = createAdminSupabaseClient();
		const errorLogger = ErrorLoggerService.getInstance(adminSupabase);

		const [
			{ data: userData, error: userError },
			{ data: userContext },
			{ data: actorId, error: actorError },
			userErrors,
			userErrorSummary
		] = await Promise.all([
			supabase.from('users').select('*').eq('id', userId).single(),
			supabase.from('user_context').select('*').eq('user_id', userId).single(),
			supabase.rpc('ensure_actor_for_user', {
				p_user_id: userId
			}),
			errorLogger.getRecentErrors(12, { userId }),
			errorLogger.getErrorSummary({ userId })
		]);

		if (userError) throw userError;
		if (actorError || !actorId) {
			throw actorError || new Error('Failed to resolve actor');
		}

		const ownerIds = Array.from(
			new Set(
				[actorId, userId].filter(
					(id): id is string => typeof id === 'string' && id.length > 0
				)
			)
		);

		const [
			{ data: memberRows, error: memberError },
			{ data: ownedProjects, error: ownedProjectsError }
		] = await Promise.all([
			supabase
				.from('onto_project_members')
				.select('project_id')
				.eq('actor_id', actorId)
				.is('removed_at', null),
			supabase
				.from('onto_projects')
				.select('*')
				.in('created_by', ownerIds)
				.is('deleted_at', null)
				.order('updated_at', { ascending: false })
		]);
		if (memberError) throw memberError;
		if (ownedProjectsError) throw ownedProjectsError;

		const ownedIds = new Set((ownedProjects || []).map((project) => project.id));
		const sharedProjectIds = (memberRows || [])
			.map((row) => row.project_id)
			.filter((id): id is string => Boolean(id) && !ownedIds.has(id));

		const { data: sharedProjects, error: sharedProjectsError } =
			sharedProjectIds.length > 0
				? await supabase
						.from('onto_projects')
						.select('*')
						.in('id', sharedProjectIds)
						.is('deleted_at', null)
						.order('updated_at', { ascending: false })
				: { data: [], error: null };
		if (sharedProjectsError) throw sharedProjectsError;

		const projects = [...(ownedProjects || []), ...(sharedProjects || [])];
		const projectIds = projects.map((project) => project.id);
		const projectNameById = new Map(projects.map((project) => [project.id, project.name]));

		const [
			tasksResult,
			documentsResult,
			dailyBriefsResult,
			projectLogsResult,
			scheduledBriefsResult,
			chatSessionsResult
		] = await Promise.all([
			projectIds.length
				? supabase
						.from('onto_tasks')
						.select(
							'id, project_id, title, state_key, created_at, updated_at, due_at, completed_at'
						)
						.in('project_id', projectIds)
						.is('deleted_at', null)
				: Promise.resolve({ data: [], error: null }),
			projectIds.length
				? supabase
						.from('onto_documents')
						.select(
							'id, project_id, title, type_key, state_key, created_at, updated_at'
						)
						.in('project_id', projectIds)
						.is('deleted_at', null)
				: Promise.resolve({ data: [], error: null }),
			supabase
				.from('ontology_daily_briefs')
				.select('id, actor_id, brief_date, created_at')
				.eq('actor_id', actorId)
				.order('created_at', { ascending: false })
				.limit(100),
			projectIds.length
				? supabase
						.from('onto_project_logs')
						.select(
							'project_id, entity_id, entity_type, action, before_data, after_data, created_at'
						)
						.in('project_id', projectIds)
						.order('created_at', { ascending: false })
						.limit(300)
				: Promise.resolve({ data: [], error: null }),
			supabase
				.from('task_calendar_events')
				.select('id, user_id, event_title, event_start, created_at')
				.eq('user_id', userId)
				.order('created_at', { ascending: false })
				.limit(100),
			supabase
				.from('chat_sessions')
				.select(
					'id, title, auto_title, summary, status, context_type, entity_id, message_count, tool_call_count, total_tokens_used, created_at, updated_at, last_message_at'
				)
				.eq('user_id', userId)
				.order('updated_at', { ascending: false })
				.limit(100)
		]);

		if (tasksResult.error) throw tasksResult.error;
		if (documentsResult.error) throw documentsResult.error;
		if (dailyBriefsResult.error) throw dailyBriefsResult.error;
		if (projectLogsResult.error) throw projectLogsResult.error;
		if (scheduledBriefsResult.error) throw scheduledBriefsResult.error;
		if (chatSessionsResult.error) throw chatSessionsResult.error;

		const tasks = (tasksResult.data || []) as ProjectTaskRow[];
		const documents = (documentsResult.data || []) as ProjectDocumentRow[];
		const dailyBriefs = dailyBriefsResult.data || [];
		const projectLogs = (projectLogsResult.data || []) as ProjectLogRow[];
		const scheduledBriefs = scheduledBriefsResult.data || [];
		const rawChatSessions = (chatSessionsResult.data || []) as ChatSessionRow[];

		const entityLabelByKey = new Map<string, string>();
		for (const project of projects) {
			setEntityLabel(entityLabelByKey, 'project', project.id, project.name);
		}
		for (const task of tasks) {
			setEntityLabel(entityLabelByKey, 'task', task.id, task.title);
		}
		for (const document of documents) {
			setEntityLabel(entityLabelByKey, 'document', document.id, document.title);
			setEntityLabel(entityLabelByKey, 'note', document.id, document.title);
		}
		for (const log of projectLogs) {
			setEntityLabel(
				entityLabelByKey,
				log.entity_type,
				log.entity_id,
				getLogPayloadText(log, ACTIVITY_LABEL_FIELDS)
			);
		}

		await hydrateActivityEntityLabels({
			supabase,
			projectIds,
			projectLogs,
			entityLabelByKey
		});

		const processedChatSessions = sortByTimestampDesc(
			rawChatSessions.map((session) => ({
				id: session.id,
				title: buildChatSessionTitle(session),
				status: session.status ?? 'active',
				context_type: session.context_type ?? 'global',
				entity_id: session.entity_id ?? null,
				project_id:
					session.context_type === 'project' && session.entity_id
						? session.entity_id
						: null,
				project_name:
					session.context_type === 'project' && session.entity_id
						? projectNameById.get(session.entity_id) || null
						: null,
				message_count: session.message_count || 0,
				tool_call_count: session.tool_call_count || 0,
				total_tokens_used: session.total_tokens_used || 0,
				created_at: session.created_at,
				updated_at: session.updated_at,
				last_message_at: session.last_message_at,
				last_activity_at: getChatSessionLastActivityAt(session),
				admin_url: `/admin/chat/sessions?chat_session_id=${session.id}`
			})),
			(session) => session.last_activity_at
		);

		const tasksByProject = new Map<string, ProjectTaskRow[]>();
		for (const task of tasks) {
			if (!tasksByProject.has(task.project_id)) {
				tasksByProject.set(task.project_id, []);
			}
			tasksByProject.get(task.project_id)?.push(task);
		}

		const documentsByProject = new Map<string, ProjectDocumentRow[]>();
		for (const document of documents) {
			if (!documentsByProject.has(document.project_id)) {
				documentsByProject.set(document.project_id, []);
			}
			documentsByProject.get(document.project_id)?.push(document);
		}

		const logsByProject = new Map<string, ProjectLogRow[]>();
		for (const log of projectLogs) {
			if (!log.project_id) continue;
			if (!logsByProject.has(log.project_id)) {
				logsByProject.set(log.project_id, []);
			}
			logsByProject.get(log.project_id)?.push(log);
		}

		const chatsByProject = new Map<string, typeof processedChatSessions>();
		for (const session of processedChatSessions) {
			if (!session.project_id) continue;
			if (!chatsByProject.has(session.project_id)) {
				chatsByProject.set(session.project_id, []);
			}
			chatsByProject.get(session.project_id)?.push(session);
		}

		const processedProjects = projects
			.map((project) => {
				const projectTasks = sortByTimestampDesc(
					tasksByProject.get(project.id) || [],
					(task) => task.updated_at || task.created_at
				);
				const projectDocuments = sortByTimestampDesc(
					documentsByProject.get(project.id) || [],
					(document) => document.updated_at || document.created_at
				);
				const projectActivityLogs = sortByTimestampDesc(
					logsByProject.get(project.id) || [],
					(log) => log.created_at
				);
				const projectChats = sortByTimestampDesc(
					chatsByProject.get(project.id) || [],
					(session) => session.last_activity_at
				);

				const taskStateCounts = projectTasks.reduce<Record<string, number>>(
					(counts, task) => {
						const key = task.state_key || 'unknown';
						counts[key] = (counts[key] || 0) + 1;
						return counts;
					},
					{}
				);
				const completedTaskCount = taskStateCounts.done || 0;
				const openTaskCount = projectTasks.length - completedTaskCount;
				const chatMessageCount = projectChats.reduce(
					(sum, session) => sum + (session.message_count || 0),
					0
				);
				const lastActivityAt =
					sortByTimestampDesc(
						[
							{ value: project.updated_at },
							{ value: project.created_at },
							{ value: projectTasks[0]?.updated_at || projectTasks[0]?.created_at },
							{
								value:
									projectDocuments[0]?.updated_at ||
									projectDocuments[0]?.created_at
							},
							{ value: projectActivityLogs[0]?.created_at },
							{ value: projectChats[0]?.last_activity_at }
						],
						(entry) => entry.value
					)[0]?.value || project.updated_at;

				return {
					...project,
					status: project.state_key,
					access_type: ownerIds.includes(project.created_by) ? 'owned' : 'shared',
					task_count: projectTasks.length,
					open_task_count: openTaskCount,
					completed_task_count: completedTaskCount,
					document_count: projectDocuments.length,
					notes_count: projectDocuments.length,
					chat_session_count: projectChats.length,
					chat_message_count: chatMessageCount,
					task_state_counts: taskStateCounts,
					last_activity_at: lastActivityAt,
					recent_tasks: projectTasks.slice(0, 4),
					recent_documents: projectDocuments.slice(0, 4).map((document) => ({
						id: document.id,
						title: document.title,
						type_key: document.type_key,
						state_key: document.state_key,
						created_at: document.created_at,
						updated_at: document.updated_at
					})),
					recent_activity: projectActivityLogs.slice(0, 4).map((log) => {
						const details = getProjectLogDetails(log, entityLabelByKey);
						return {
							entity_id: log.entity_id,
							entity_type: log.entity_type,
							action: log.action,
							created_at: log.created_at,
							object_name: details.objectName,
							details: details.details
						};
					}),
					recent_chat_sessions: projectChats.slice(0, 3),
					description_preview:
						truncate(project.description, 180) ||
						truncate(project.next_step_long, 180) ||
						truncate(project.next_step_short, 180)
				};
			})
			.sort((a, b) => asTime(b.last_activity_at) - asTime(a.last_activity_at));

		const activities: Array<{
			entity_id?: string;
			entity_type: string;
			action: string;
			created_at: string;
			object_name: string;
			project_name?: string;
			details?: string | null;
		}> = [];

		for (const log of projectLogs) {
			const details = getProjectLogDetails(log, entityLabelByKey);
			activities.push({
				entity_id: log.entity_id,
				entity_type: log.entity_type,
				action: log.action,
				created_at: log.created_at,
				object_name: details.objectName,
				project_name: log.project_id
					? projectNameById.get(log.project_id) || 'Unassigned'
					: 'Unassigned',
				details: details.details
			});
		}

		for (const brief of dailyBriefs) {
			activities.push({
				entity_type: 'brief',
				action: 'generated',
				created_at: brief.created_at,
				object_name: 'Daily Brief',
				details: brief.brief_date ? `Generated for ${brief.brief_date}` : 'Daily brief'
			});
		}

		for (const scheduled of scheduledBriefs) {
			const createdAt = scheduled.created_at ?? scheduled.event_start;
			if (!createdAt) continue;
			activities.push({
				entity_type: 'calendar',
				action: 'scheduled',
				created_at: createdAt,
				object_name: scheduled.event_title || 'Scheduled Brief',
				details: scheduled.event_start
					? `Scheduled for ${new Date(scheduled.event_start).toLocaleDateString()}`
					: 'Scheduled brief'
			});
		}

		for (const session of processedChatSessions) {
			if (!session.last_activity_at) continue;
			activities.push({
				entity_type: 'chat',
				action: 'chatted',
				created_at: session.last_activity_at,
				object_name: session.title,
				project_name: session.project_name || undefined,
				details: `${session.message_count} messages · ${(session.context_type || 'global').replaceAll('_', ' ')}`
			});
		}

		activities.sort((a, b) => asTime(b.created_at) - asTime(a.created_at));

		const totalTasks = tasks.length;
		const completedTasks = tasks.filter((task) => task.state_key === 'done').length;
		const totalChatMessages = processedChatSessions.reduce(
			(sum, session) => sum + (session.message_count || 0),
			0
		);

		const activityStats = {
			total_projects: processedProjects.length,
			total_tasks: totalTasks,
			open_tasks: totalTasks - completedTasks,
			completed_tasks: completedTasks,
			total_documents: documents.length,
			total_notes: documents.length,
			total_briefs: dailyBriefs.length,
			scheduled_briefs: scheduledBriefs.length,
			total_chat_sessions: processedChatSessions.length,
			total_chat_messages: totalChatMessages,
			total_project_chat_sessions: processedChatSessions.filter(
				(session) => session.context_type === 'project'
			).length,
			total_agentic_sessions: processedChatSessions.length,
			total_agentic_messages: totalChatMessages,
			total_errors: userErrorSummary.total_errors,
			unresolved_errors: userErrorSummary.unresolved_errors
		};

		return ApiResponse.success({
			...userData,
			user_context: userContext,
			projects: processedProjects,
			recent_project: processedProjects[0] ?? null,
			recent_activity: activities.slice(0, 50),
			activity_stats: activityStats,
			tasks,
			documents,
			notes: documents,
			daily_briefs: dailyBriefs,
			scheduled_briefs: scheduledBriefs,
			chat_sessions: processedChatSessions,
			agentic_sessions: processedChatSessions,
			errors: userErrors,
			error_summary: userErrorSummary
		});
	} catch (error) {
		return ApiResponse.internalError(error, 'Failed to fetch user activity');
	}
};
