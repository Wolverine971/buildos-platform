// apps/web/src/routes/api/onto/projects/[id]/recent-chats/+server.ts
/**
 * GET /api/onto/projects/[id]/recent-chats
 * Fetch recent chat sessions scoped to a project for the project detail page.
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { validatePaginationCustom, verifyProjectAccess } from '$lib/utils/api-helpers';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import { logOntologyApiError } from '../../../shared/error-logging';
import type { Database } from '@buildos/shared-types';

type ChatSessionRow = Pick<
	Database['public']['Tables']['chat_sessions']['Row'],
	| 'id'
	| 'title'
	| 'auto_title'
	| 'summary'
	| 'chat_topics'
	| 'context_type'
	| 'entity_id'
	| 'message_count'
	| 'status'
	| 'agent_metadata'
	| 'created_at'
	| 'updated_at'
	| 'last_message_at'
>;

type ProjectFocusMetadata = {
	focusType?: string | null;
	focusEntityName?: string | null;
	projectId?: string | null;
	projectName?: string | null;
};

const SESSION_SELECT = `
	id,
	title,
	auto_title,
	summary,
	chat_topics,
	context_type,
	entity_id,
	message_count,
	status,
	agent_metadata,
	created_at,
	updated_at,
	last_message_at
`;

const DEFAULT_CHAT_TITLES = new Set(
	[
		'Agent Session',
		'Project Assistant',
		'Task Assistant',
		'Calendar Assistant',
		'General Assistant',
		'New Project Creation',
		'Project Audit',
		'Project Forecast',
		'Task Update',
		'Daily Brief Settings',
		'Chat session',
		'Untitled Chat',
		'New Chat'
	].map((title) => title.toLowerCase())
);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function normalizeText(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const normalized = value.replace(/\s+/g, ' ').trim();
	return normalized.length > 0 ? normalized : null;
}

function isPlaceholderTitle(value: string | null): boolean {
	return !value || DEFAULT_CHAT_TITLES.has(value.toLowerCase());
}

function readProjectFocus(agentMetadata: unknown): ProjectFocusMetadata | null {
	if (!isRecord(agentMetadata) || !isRecord(agentMetadata.focus)) return null;
	const focus = agentMetadata.focus;
	return {
		focusType: normalizeText(focus.focusType),
		focusEntityName: normalizeText(focus.focusEntityName),
		projectId: normalizeText(focus.projectId),
		projectName: normalizeText(focus.projectName)
	};
}

function latestTimestampMs(session: ChatSessionRow): number {
	const timestamps = [session.last_message_at, session.updated_at, session.created_at];
	let latest = 0;
	for (const timestamp of timestamps) {
		if (!timestamp) continue;
		const parsed = Date.parse(timestamp);
		if (!Number.isNaN(parsed) && parsed > latest) {
			latest = parsed;
		}
	}
	return latest;
}

function resolveDisplayTitle(session: ChatSessionRow): string {
	const title = normalizeText(session.title);
	if (title && !isPlaceholderTitle(title)) return title;

	const autoTitle = normalizeText(session.auto_title);
	if (autoTitle) return autoTitle;

	return title ?? 'Recent chat';
}

function resolveFocusLabel(focus: ProjectFocusMetadata | null): string | null {
	if (!focus?.focusType || focus.focusType === 'project-wide') return null;
	if (focus.focusEntityName) return focus.focusEntityName;
	return focus.focusType.replace(/-/g, ' ');
}

function toSummary(session: ChatSessionRow) {
	const focus = readProjectFocus(session.agent_metadata);
	return {
		id: session.id,
		title: resolveDisplayTitle(session),
		summary: normalizeText(session.summary),
		chat_topics: Array.isArray(session.chat_topics)
			? session.chat_topics
					.map(normalizeText)
					.filter((topic): topic is string => Boolean(topic))
			: [],
		context_type: session.context_type,
		entity_id: session.entity_id,
		message_count: session.message_count ?? 0,
		status: session.status,
		focus_label: resolveFocusLabel(focus),
		focus_type: focus?.focusType ?? null,
		created_at: session.created_at,
		updated_at: session.updated_at,
		last_message_at: session.last_message_at,
		last_activity_at: session.last_message_at ?? session.updated_at ?? session.created_at
	};
}

function mergeSessions(sessionGroups: ChatSessionRow[][]): ChatSessionRow[] {
	const byId = new Map<string, ChatSessionRow>();
	for (const group of sessionGroups) {
		for (const session of group) {
			byId.set(session.id, session);
		}
	}

	return Array.from(byId.values()).sort((a, b) => latestTimestampMs(b) - latestTimestampMs(a));
}

async function fetchLinkedSessionIds(
	supabase: App.Locals['supabase'],
	projectId: string,
	limit: number
): Promise<string[]> {
	const { data, error } = await (supabase as any)
		.from('chat_sessions_projects')
		.select('chat_session_id')
		.eq('project_id', projectId)
		.order('linked_at', { ascending: false, nullsFirst: false })
		.limit(limit);

	if (error) {
		console.warn('[Project Recent Chats API] Failed to fetch linked chat sessions:', error);
		return [];
	}

	return Array.from(
		new Set(
			(data ?? [])
				.map((row: { chat_session_id?: string | null }) => row.chat_session_id)
				.filter((id: string | null | undefined): id is string => Boolean(id))
		)
	);
}

async function fetchTurnRunSessionIds(
	supabase: App.Locals['supabase'],
	userId: string,
	projectId: string,
	limit: number
): Promise<string[]> {
	const { data, error } = await supabase
		.from('chat_turn_runs')
		.select('session_id')
		.eq('user_id', userId)
		.eq('project_id', projectId)
		.order('created_at', { ascending: false })
		.limit(limit);

	if (error) {
		console.warn('[Project Recent Chats API] Failed to fetch chat turn runs:', error);
		return [];
	}

	return Array.from(
		new Set(
			(data ?? [])
				.map((row) => row.session_id)
				.filter((id: string | null | undefined): id is string => Boolean(id))
		)
	);
}

async function fetchSessionsByIds(
	supabase: App.Locals['supabase'],
	userId: string,
	sessionIds: string[]
): Promise<ChatSessionRow[]> {
	if (sessionIds.length === 0) return [];

	const { data, error } = await supabase
		.from('chat_sessions')
		.select(SESSION_SELECT)
		.eq('user_id', userId)
		.neq('status', 'archived')
		.or('message_count.gte.1,summary.not.is.null,last_message_at.not.is.null')
		.in('id', sessionIds);

	if (error) {
		console.warn('[Project Recent Chats API] Failed to fetch linked chat session rows:', error);
		return [];
	}

	return (data ?? []) as ChatSessionRow[];
}

export const GET: RequestHandler = async ({ params, url, locals }) => {
	try {
		const { user } = await locals.safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const { id: projectId } = params;
		if (!projectId) {
			return ApiResponse.badRequest('Project ID required');
		}
		if (!isValidUUID(projectId)) {
			return ApiResponse.badRequest('Invalid project ID');
		}

		const { limit, offset } = validatePaginationCustom(
			{
				limit: url.searchParams.get('limit'),
				offset: url.searchParams.get('offset')
			},
			{ defaultLimit: 10, maxLimit: 25 }
		);

		const supabase = locals.supabase;
		const authResult = await verifyProjectAccess(supabase, projectId, user.id);
		if (!authResult.authorized) {
			return authResult.error!;
		}

		const fetchWindow = Math.min(offset + limit + 1, 75);

		const [directResult, metadataResult, linkedIds, turnRunIds] = await Promise.all([
			supabase
				.from('chat_sessions')
				.select(SESSION_SELECT)
				.eq('user_id', user.id)
				.neq('status', 'archived')
				.eq('context_type', 'project')
				.eq('entity_id', projectId)
				.or('message_count.gte.1,summary.not.is.null,last_message_at.not.is.null')
				.order('last_message_at', { ascending: false, nullsFirst: false })
				.order('updated_at', { ascending: false, nullsFirst: false })
				.order('created_at', { ascending: false, nullsFirst: false })
				.limit(fetchWindow),
			supabase
				.from('chat_sessions')
				.select(SESSION_SELECT)
				.eq('user_id', user.id)
				.neq('status', 'archived')
				.filter('agent_metadata->focus->>projectId', 'eq', projectId)
				.or('message_count.gte.1,summary.not.is.null,last_message_at.not.is.null')
				.order('last_message_at', { ascending: false, nullsFirst: false })
				.order('updated_at', { ascending: false, nullsFirst: false })
				.order('created_at', { ascending: false, nullsFirst: false })
				.limit(fetchWindow),
			fetchLinkedSessionIds(supabase, projectId, fetchWindow),
			fetchTurnRunSessionIds(supabase, user.id, projectId, fetchWindow * 2)
		]);

		if (directResult.error) {
			console.error(
				'[Project Recent Chats API] Failed to fetch direct sessions:',
				directResult.error
			);
			await logOntologyApiError({
				supabase,
				error: directResult.error,
				endpoint: `/api/onto/projects/${projectId}/recent-chats`,
				method: 'GET',
				userId: user.id,
				projectId,
				entityType: 'project',
				operation: 'project_recent_chats_fetch',
				tableName: 'chat_sessions'
			});
			return ApiResponse.databaseError(directResult.error);
		}

		if (metadataResult.error) {
			console.warn(
				'[Project Recent Chats API] Failed to fetch metadata-scoped sessions:',
				metadataResult.error
			);
		}

		const linkedAndTurnRunIds = Array.from(new Set([...linkedIds, ...turnRunIds]));
		const linkedSessions = await fetchSessionsByIds(supabase, user.id, linkedAndTurnRunIds);

		const merged = mergeSessions([
			(directResult.data ?? []) as ChatSessionRow[],
			metadataResult.error ? [] : ((metadataResult.data ?? []) as ChatSessionRow[]),
			linkedSessions
		]);

		const pageSessions = merged.slice(offset, offset + limit);
		const hasMore = merged.length > offset + limit;

		return ApiResponse.success({
			chats: pageSessions.map(toSummary),
			total: merged.length,
			hasMore
		});
	} catch (err) {
		console.error('[Project Recent Chats API] Unexpected error:', err);
		await logOntologyApiError({
			supabase: locals.supabase,
			error: err,
			endpoint: `/api/onto/projects/${params.id ?? ''}/recent-chats`,
			method: 'GET',
			userId: (await locals.safeGetSession()).user?.id,
			projectId: params.id,
			entityType: 'project',
			operation: 'project_recent_chats_fetch'
		});
		return ApiResponse.internalError(err, 'An unexpected error occurred');
	}
};
